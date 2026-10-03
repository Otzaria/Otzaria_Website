/** Repository CSV is authoritative; Mongo stores reservations, publication intent and sync coordination. */
import { randomUUID } from 'node:crypto'
import BookInfoChangeSet from '../../models/BookInfoChangeSet.js'
import BookInfoSyncState from '../../models/BookInfoSyncState.js'
import { bookInfoStateFromRows, listBookInfo, rowKey } from './csv.js'
import { applyChangeSet, validateChangeSet } from './changes.js'
import { BOOK_INFO_REPO, branchName, createBookInfoClient, loadBookInfoState, openPullForBranch, publishChangeSet, refreshChangeSet } from './fork.js'
import { assertIdentityPrefix, identityPrefixHash, followIdentity, rebaseIdentities } from './identity.js'

const SNAPSHOT_TTL_MS = 60_000
const STALE_PUBLISHING_MS = 10 * 60_000
const LEASE_MS = 5 * 60_000
export const SYNC_BATCH_SIZE = 10
export const ACTIVE_STATUSES = ['publishing', 'open', 'modified', 'conflict']
export class BookInfoInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const cache = (globalThis.__bookInfoSnapshot ??= { snapshot: null, inflight: null, generation: 0 })

/** Mongo's shared source version invalidates snapshots in every worker after cron sees new CSV/identity. */
export async function getBookInfoSnapshot(client = createBookInfoClient()) {
  const shared = await BookInfoSyncState.findById('book-info').lean()
  if (cache.snapshot && Date.now() - cache.snapshot.at < SNAPSHOT_TTL_MS && (!shared?.sourceBlobSha || (shared.sourceBlobSha === cache.snapshot.blobSha && (shared.sourceIdentitySha || null) === cache.snapshot.identitySha))) return cache.snapshot
  const generation = cache.generation || 0
  cache.inflight ??= loadBookInfoState(client).then(async (base) => {
    assertIdentityPrefix(base.identity, shared?.identityRevision || 0, shared?.identityPrefixHash)
    // CAS prevents a slow reader from undoing another worker's cache invalidation.
    try {
      await BookInfoSyncState.updateOne({ _id: 'book-info', ...(shared?.sourceHeadSha ? { sourceHeadSha: shared.sourceHeadSha } : { sourceHeadSha: { $exists: false } }) }, { $set: { sourceHeadSha: base.headSha, sourceBlobSha: base.blobSha, sourceIdentitySha: base.identitySha, identityRevision: base.identity.events.length, identityPrefixHash: identityPrefixHash(base.identity) } }, { upsert: !shared })
    } catch (err) { if (err.code !== 11000) throw err }
    return rememberSnapshot(base, generation)
  }).finally(() => { cache.inflight = null })
  return cache.inflight
}
function rememberSnapshot(base, expectedGeneration) {
  const snapshot = { at: Date.now(), headSha: base.headSha, blobSha: base.blobSha, identitySha: base.identitySha, identity: base.identity, rows: listBookInfo(base.state) }
  if (expectedGeneration === undefined || expectedGeneration === (cache.generation || 0)) {
    cache.snapshot = snapshot
    cache.generation = (cache.generation || 0) + 1
  }
  return snapshot
}
export async function listOpenEdits(snapshot) {
  const docs = await BookInfoChangeSet.find({ status: { $in: ACTIVE_STATUSES } }).select('ops bookKey prNumber prUrl status createdAt lastError').sort({ createdAt: 1 }).lean()
  const snapshotState = snapshot ? bookInfoStateFromRows(snapshot.rows) : null
  return docs.map((d) => {
    let op = d.ops[0]
    let error = d.lastError
    if (snapshot) {
      try {
        [op] = rebaseIdentities(d.ops, { identity: snapshot.identity, state: snapshotState })
        const conflict = applyChangeSet(snapshotState, [op]).results.find((result) => result.status === 'conflict')
        if (conflict) error = conflict.reason
      } catch (err) { error = err.message }
    }
    return ({ id: String(d._id), book: op?.book, author: op?.author, bookKey: op ? rowKey(op.book, op.author) : d.bookKey, changes: op?.changes || {}, prNumber: d.prNumber, prUrl: d.prUrl, status: error && d.status === 'open' ? 'conflict' : d.status, lastError: error })
  })
}

/** Explicitly ensure the reservation index exists even when production autoIndex is disabled.
 * Existing duplicates block publication until reviewed; never discard a human request during migration.
 */
export async function ensureActiveReservationIndex() {
  await BookInfoChangeSet.collection.createIndex({ bookKey: 1 }, { name: 'active_book_unique', unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } })
}
const duplicateMessage = 'יש כבר בקשה פתוחה לספר זה; נא להמתין למיזוגה או לסגירתה'
const clearedIntent = { pendingHeadSha: null, pendingBaseSha: null, pendingBlobSha: null, pendingIdentitySha: null, pendingOps: [], pendingTitle: null, pendingBody: null }

/** Revision-checked updates cannot overwrite another worker's recovered publication. */
function writer(doc, before = async () => {}) {
  let revision = doc.revision || 0
  return async (patch) => {
    await before()
    const res = await BookInfoChangeSet.updateOne({ _id: doc._id, $or: [{ revision }, ...(revision === 0 ? [{ revision: { $exists: false } }] : [])] }, { $set: patch, $inc: { revision: 1 } })
    if (!res.modifiedCount) throw Object.assign(new Error('Publication state changed concurrently'), { code: 'STALE_STATE' })
    revision++
    Object.assign(doc, patch, { revision })
  }
}

export async function submitEdit({ edit, userId = null }, client = createBookInfoClient()) {
  await ensureActiveReservationIndex()
  let reservationOwner
  for (let attempt = 0; attempt < 20 && !reservationOwner; attempt++) {
    reservationOwner = await acquireLease()
    if (!reservationOwner) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!reservationOwner) throw new BookInfoInputError('מתבצע סנכרון מידע הספרים; יש לנסות שוב בעוד רגע')
  let base
  let checked
  let doc
  try {
    base = await loadBookInfoState(client)
    const shared = await BookInfoSyncState.findById('book-info').lean()
    assertIdentityPrefix(base.identity, shared?.identityRevision || 0, shared?.identityPrefixHash)
    await renewLease(reservationOwner)
    await BookInfoSyncState.updateOne({ _id: 'book-info', owner: reservationOwner, ...(shared?.identityRevision != null ? { identityRevision: shared.identityRevision } : { identityRevision: { $exists: false } }) }, { $set: { sourceHeadSha: base.headSha, sourceBlobSha: base.blobSha, sourceIdentitySha: base.identitySha, identityRevision: base.identity.events.length, identityPrefixHash: identityPrefixHash(base.identity) } })
    // Migrate reservations against the same source version used for the new submission.
    const active = await BookInfoChangeSet.find({ status: { $in: ACTIVE_STATUSES } }).lean()
    for (const existing of active) {
      let ops
      try {
        await hydrateOriginalOperation(existing, client, writer(existing, () => renewLease(reservationOwner)))
        ops = rebaseIdentities(existing.ops, base)
      } catch (err) {
        if (['LEASE_LOST', 'STALE_STATE'].includes(err.code)) throw err
        continue
      }
      const key = rowKey(ops[0].book, ops[0].author)
      if (key !== existing.bookKey) {
        try { await writer(existing, () => renewLease(reservationOwner))({ bookKey: key }) } catch (err) {
          if (err.code === 11000) throw new BookInfoInputError('קיימות בקשות עם זהויות מתנגשות אחרי שינוי בספרייה; נדרשת בדיקת מנהל')
          throw err
        }
      }
    }
    let currentEdit = edit
    if (edit.identityRevision != null) {
      let currentOp
      try { [currentOp] = rebaseIdentities([{ book: edit.book, author: edit.author, changes: edit.updates, baseRow: edit.baseRow, identityRevision: edit.identityRevision }], base) } catch (err) { throw new BookInfoInputError(err.message) }
      currentEdit = { ...edit, book: currentOp.book, author: currentOp.author, baseRow: currentOp.baseRow }
    }
    // A fair cron queue must not keep a terminal PR's book or user quota locked at its tail.
    const owned = userId ? active.filter((item) => String(item.submittedBy) === String(userId)) : []
    const targetKey = rowKey(currentEdit.book, currentEdit.author)
    const candidates = active.filter((item) => item.bookKey === targetKey || (owned.length >= 20 && String(item.submittedBy) === String(userId)))
    for (const blocking of candidates) {
      if (!blocking.prNumber) continue
      await renewLease(reservationOwner)
      const pr = await client.getPull(blocking.prNumber)
      const status = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : null
      if (status) await writer(blocking, () => renewLease(reservationOwner))({ status, lastError: null })
    }
    const openCount = owned.filter((item) => ACTIVE_STATUSES.includes(item.status)).length
    if (openCount >= 20) throw new BookInfoInputError(`יש לך כבר ${openCount} בקשות פתוחות; נא להמתין לבדיקתן`, 429)
    checked = validateChangeSet([currentEdit], base.state)
    if (checked.error) throw new BookInfoInputError(checked.error)
    const [op] = checked.ops
    op.identityRevision = base.identity.events.length
    try {
      await renewLease(reservationOwner)
      doc = (await BookInfoChangeSet.create({ ops: [op], bookKey: rowKey(op.book, op.author), submittedBy: userId, status: 'publishing' })).toObject()
    } catch (err) {
      if (err.code === 11000) throw new BookInfoInputError(duplicateMessage)
      throw err
    }
  } finally {
    await BookInfoSyncState.updateOne({ _id: 'book-info', owner: reservationOwner }, { $unset: { owner: 1 }, $set: { expiresAt: new Date(0) } })
  }
  const [op] = checked.ops
  const id = String(doc._id)
  const save = writer(doc)
  try {
    const res = await publishChangeSet(client, { id, ops: [op], persistIntent: save }, base)
    await save({ status: 'open', branch: res.branch, prNumber: res.prNumber, prUrl: res.prUrl, baseSha: res.baseSha, baseBlobSha: res.baseBlobSha, baseIdentitySha: res.baseIdentitySha, headSha: res.headSha, ...clearedIntent })
    return { id, prUrl: res.prUrl, prNumber: res.prNumber }
  } catch (err) {
    const patch = await reconcilePublishing(client, doc, base).catch(() => null)
    await save({ ...(patch || {}), lastError: String(err?.message || err).slice(0, 500) })
    if (patch?.status === 'open') return { id, prUrl: patch.prUrl, prNumber: patch.prNumber }
    if (err?.code === 'NO_EFFECT') {
      await save({ status: 'failed' })
      throw new BookInfoInputError('השינוי כבר קיים בקובץ')
    }
    throw err
  }
}

/** Recovery trusts only a commit persisted before exposing the ref, never an arbitrary current head. */
async function reconcilePublishing(client, doc, base) {
  const [owner] = BOOK_INFO_REPO.split('/')
  const id = String(doc._id)
  const branch = branchName(id)
  const ref = await client.getRef(branch)
  const found = await client.findPullByHead(owner, branch)
  if (!found && !ref) return { status: 'failed', lastError: 'הפרסום לא הושלם' }
  const link = { branch, prNumber: found?.number, prUrl: found?.url }
  if (found?.merged) return { ...link, status: 'merged' }
  if (found?.state === 'closed') return { ...link, status: 'closed' }
  if (!doc.pendingHeadSha || ref?.sha !== doc.pendingHeadSha) return { ...link, status: 'modified', lastError: 'הענף אינו תואם לקומיט שנוצר; נדרשת בדיקה ידנית' }
  const pr = found ? { prNumber: found.number, prUrl: found.url } : await openPullForBranch(client, { id, ops: doc.ops, pendingTitle: doc.pendingTitle, pendingBody: doc.pendingBody }, base)
  return { ...pr, branch, status: 'open', headSha: doc.pendingHeadSha, baseSha: doc.pendingBaseSha, baseBlobSha: doc.pendingBlobSha, baseIdentitySha: doc.pendingIdentitySha, ...clearedIntent }
}

const runner = (globalThis.__bookInfoSyncRunner ??= { running: null, again: false })
export function requestSync(sync = () => syncEdits()) {
  if (runner.running) { runner.again = true; return runner.running }
  runner.running = (async () => {
    try {
      let summary
      do { runner.again = false; summary = await sync() } while (runner.again)
      return summary
    } finally { runner.running = null }
  })()
  return runner.running
}


/** Existing requests get their baseline from their recorded immutable source commit, never today's CSV. */
async function hydrateOriginalOperation(doc, client, save) {
  if (doc.ops.every((op) => op.baseRow && op.identityRevision != null)) return
  if (!doc.baseSha) throw Object.assign(new Error('זהות הצעה ישנה חסרה; נדרשת בדיקה ידנית'), { code: 'CONFLICT' })
  const original = await loadBookInfoState(client, doc.baseSha)
  const ops = doc.ops.map((op) => {
    const row = original.state.rows.get(rowKey(op.book, op.author))
    if (!row) throw Object.assign(new Error('זהות הצעה ישנה אינה בקובץ המקורי; נדרשת בדיקה ידנית'), { code: 'CONFLICT' })
    return { ...op, baseRow: op.baseRow || row, identityRevision: op.identityRevision ?? original.identity.events.length }
  })
  await save({ ops, baseBlobSha: doc.baseBlobSha || original.blobSha, baseIdentitySha: doc.baseIdentitySha || original.identitySha })
}

async function renewLease(owner) {
  const result = await BookInfoSyncState.updateOne({ _id: 'book-info', owner, expiresAt: { $gt: new Date() } }, { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } })
  if (!result.matchedCount) throw Object.assign(new Error('Sync lease expired'), { code: 'LEASE_LOST' })
}

async function acquireLease() {
  const owner = randomUUID()
  try {
    const lease = await BookInfoSyncState.findOneAndUpdate({ _id: 'book-info', $or: [{ expiresAt: { $lte: new Date() } }, { expiresAt: { $exists: false } }] }, { $set: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } }, { upsert: true, returnDocument: 'after' }).lean()
    if (lease.owner === owner) return owner
  } catch (err) { if (err.code !== 11000) throw err }
  return null
}

/** Fair bounded queue and paced writes avoid unbounded GitHub fanout. Options remove delay only in tests. */
export async function syncEdits(rawClient = createBookInfoClient(), now = Date.now(), { mutationDelayMs = 1500, batchSize = SYNC_BATCH_SIZE, maxRunMs = 60_000 } = {}) {
  const summary = { checked: 0, rebuilt: 0, merged: 0, closed: 0, modified: 0, conflict: 0, failed: 0, deferred: 0, locked: 0 }
  const owner = await acquireLease()
  if (!owner) return { ...summary, locked: 1 }
  const renew = () => renewLease(owner)
  let lastMutation = 0
  const mutations = new Set(['createBlob', 'createTree', 'createCommit', 'createRef', 'updateRef', 'createPull', 'updatePull', 'commentOnIssue'])
  const client = new Proxy(rawClient, { get(target, key) {
    if (typeof target[key] !== 'function') return target[key]
    return async (...args) => {
      if (mutations.has(key)) {
        const delay = lastMutation + mutationDelayMs - Date.now()
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
        await renew()
        lastMutation = Date.now()
        await BookInfoSyncState.updateOne({ _id: 'book-info', owner }, { $set: { nextMutationAt: new Date(lastMutation + mutationDelayMs) } })
      }
      return target[key](...args)
    }
  } })
  try {
    const start = Date.now()
    const pacing = await BookInfoSyncState.findById('book-info').lean()
    if (pacing.retryAt && pacing.retryAt > new Date()) return { ...summary, deferred: await BookInfoChangeSet.countDocuments({ status: { $in: ACTIVE_STATUSES } }) }
    lastMutation = mutationDelayMs ? new Date(pacing.nextMutationAt || 0).getTime() - mutationDelayMs : 0
    const base = await loadBookInfoState(client)
    assertIdentityPrefix(base.identity, pacing.identityRevision || 0, pacing.identityPrefixHash)
    await renew()
    await BookInfoSyncState.updateOne({ _id: 'book-info', owner, ...(pacing.identityRevision != null ? { identityRevision: pacing.identityRevision } : { identityRevision: { $exists: false } }) }, { $set: { sourceHeadSha: base.headSha, sourceBlobSha: base.blobSha, sourceIdentitySha: base.identitySha, identityRevision: base.identity.events.length, identityPrefixHash: identityPrefixHash(base.identity) } })
    rememberSnapshot(base)
    const filter = { $or: [{ status: { $in: ['open', 'modified', 'conflict'] } }, { status: 'publishing', updatedAt: { $lt: new Date(now - STALE_PUBLISHING_MS) } }] }
    const docs = await BookInfoChangeSet.find(filter).sort({ checkedAt: 1, createdAt: 1, _id: 1 }).limit(batchSize).lean()
    let processed = 0
    for (const doc of docs) {
      if (Date.now() - start >= maxRunMs) break
      const save = writer(doc, renew)
      const initialStatus = doc.status
      summary.checked++
      processed++
      try {
        if (doc.status === 'open') await hydrateOriginalOperation(doc, client, save)
        // A generated ref update may have succeeded before the DB write/response failed.
        if (doc.status === 'open' && doc.pendingHeadSha) {
          const ref = await client.getRef(doc.branch)
          if (ref?.sha === doc.pendingHeadSha) {
            if (doc.pendingTitle && doc.pendingBody) await client.updatePull(doc.prNumber, { title: doc.pendingTitle, body: doc.pendingBody })
            await save({ headSha: doc.pendingHeadSha, baseSha: doc.pendingBaseSha, baseBlobSha: doc.pendingBlobSha, baseIdentitySha: doc.pendingIdentitySha, ...(doc.pendingOps?.length ? { ops: doc.pendingOps, bookKey: rowKey(doc.pendingOps[0].book, doc.pendingOps[0].author) } : {}), ...clearedIntent })
          } else if (ref?.sha !== doc.headSha) await save({ status: 'modified', lastError: 'הענף השתנה בזמן הפרסום; ההצעה נשמרה' })
        }
        let patch
        if (doc.status === 'publishing') patch = await reconcilePublishing(client, doc, base)
        else if (['modified', 'conflict'].includes(doc.status)) {
          const pr = doc.prNumber ? await client.getPull(doc.prNumber) : null
          patch = { status: pr?.merged ? 'merged' : pr?.state === 'closed' ? 'closed' : doc.status }
        } else {
          const res = await refreshChangeSet(client, { ...doc, id: String(doc._id), persistIntent: async (intent) => {
            // Reserve a renamed identity atomically before publishing its generated branch.
            const key = intent.pendingOps?.[0] ? rowKey(intent.pendingOps[0].book, intent.pendingOps[0].author) : doc.bookKey
            await save({ ...intent, bookKey: key })
          } }, base)
          patch = { status: res.status === 'rebuilt' ? 'open' : res.status, lastError: null }
          if (res.status === 'rebuilt') Object.assign(patch, { headSha: res.headSha, baseSha: res.baseSha, baseBlobSha: res.baseBlobSha, baseIdentitySha: res.baseIdentitySha, ops: res.ops, ...clearedIntent })
          if (res.status !== 'open') summary[res.status]++
        }
        await save({ ...patch, checkedAt: new Date(now) })
        if (initialStatus !== 'open' && ['merged', 'closed'].includes(patch.status)) summary[patch.status]++
      } catch (err) {
        if (['LEASE_LOST', 'STALE_STATE'].includes(err.code)) throw err
        const conflict = err.code === 'CONFLICT' || err.code === 11000 || /הצעה|זהות|הספר/.test(err.message)
        await save({ ...(conflict ? { status: 'conflict' } : {}), checkedAt: new Date(now), lastError: String(err?.message || err).slice(0, 500) })
        summary[conflict ? 'conflict' : 'failed']++
        if (err.status === 429 || err.status === 403) {
          const seconds = Number(err.retryAfter)
          await BookInfoSyncState.updateOne({ _id: 'book-info', owner }, { $set: { retryAt: new Date(Date.now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000) } })
          break
        }
      }
    }
    summary.deferred = Math.max(0, await BookInfoChangeSet.countDocuments(filter) - processed)
    return summary
  } finally {
    await BookInfoSyncState.updateOne({ _id: 'book-info', owner }, { $unset: { owner: 1 }, $set: { expiresAt: new Date(0) } })
  }
}

/** Resolve legacy identity using persisted transfer provenance, without guessing an author from title. */
export async function resolveLegacyEdit(changeDoc, client = createBookInfoClient()) {
  const base = await loadBookInfoState(client)
  let identity = changeDoc.csvIdentity || { bookName: changeDoc.bookInfo.bookName, authorName: changeDoc.bookInfo.authorName || '' }
  let revision = changeDoc.identityRevision
  if (changeDoc.lastPublishedChangeSetId) {
    const published = await BookInfoChangeSet.findById(changeDoc.lastPublishedChangeSetId).lean()
    if (published && ACTIVE_STATUSES.includes(published.status)) throw new BookInfoInputError('יש להמתין למיזוג או לסגירת ה-PR הקודם של ההצעה')
    // Ledger events, only after an approved merge, are the identity authority.
  }
  if (revision == null) {
    if (!base.state.rows.has(rowKey(identity.bookName, identity.authorName))) {
      // Only merged site edits after this proposal are evidence for an older Mongo author's transition.
      const history = await BookInfoChangeSet.find({ status: 'merged', createdAt: { $gte: changeDoc.createdAt || new Date(0) } }).sort({ createdAt: 1 }).lean()
      const verified = new Set(history.map((d) => String(d._id)))
      for (const event of base.identity.events) {
        if (event.kind === 'rename' && event.changeSetId && verified.has(event.changeSetId) && rowKey(event.old.bookName, event.old.authorName) === rowKey(identity.bookName, identity.authorName)) identity = { ...event.new }
      }
      if (!base.state.rows.has(rowKey(identity.bookName, identity.authorName))) throw new BookInfoInputError('זהות ההצעה הישנה אינה בקובץ; נדרשת בדיקה ידנית לפני העברה')
    }
    revision = base.identity.events.length
  }
  try { identity = followIdentity(identity, base.identity, revision) } catch (err) { throw new BookInfoInputError(err.message) }
  const row = base.state.rows.get(rowKey(identity.bookName, identity.authorName))
  if (!row) throw new BookInfoInputError('הספר אינו בקובץ; ההצעה נשמרה לבדיקה ידנית')
  return { identity, identityRevision: base.identity.events.length, row }
}
export const _applyForTest = applyChangeSet
