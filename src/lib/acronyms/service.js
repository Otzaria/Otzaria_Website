/**
 * שכבת השרת של דף הכינויים: תמונת מצב של הפורק, שליחת סל כ-PR וסנכרון PR-ים פתוחים.
 * מקור האמת לכינויים הוא הפורק; Mongo שומר רק את הסלים ואת מצב ה-PR שלהם.
 */
import AcronymChangeSet from '../../models/AcronymChangeSet.js'
import { listBooks } from './dump.js'
import { validateChangeSet } from './changes.js'
import { ACRONYMS_REPO, branchName, createAcronymsClient, loadForkState, publishChangeSet, refreshChangeSet } from './fork.js'

// ה-cron מנקה את המטמון כש-master זז, ולכן אין צורך בתוקף קצר
const SNAPSHOT_TTL_MS = 10 * 60_000
// סל שנשאר 'publishing' זמן רב נפל באמצע הפרסום (קריסה/timeout); ה-cron בודק אם ה-PR נפתח.
const STALE_PUBLISHING_MS = 10 * 60_000

export class AcronymsInputError extends Error {}

// על globalThis: ב-Next ה-route של הדף וה-route של ה-cron עשויים לקבל עותקים נפרדים של המודול
const cache = (globalThis.__acronymsForkSnapshot ??= { snapshot: null, inflight: null })

/** ספרי הפורק וכינוייהם; בקשות שמגיעות יחד אחרי שהמטמון פג ממתינות לאותה משיכה מ-GitHub. */
export async function getForkSnapshot(client = createAcronymsClient()) {
  if (cache.snapshot && Date.now() - cache.snapshot.at < SNAPSHOT_TTL_MS) return cache.snapshot
  cache.inflight ??= loadForkState(client)
    .then((base) => rememberSnapshot(base))
    .finally(() => {
      cache.inflight = null
    })
  return cache.inflight
}

function rememberSnapshot(base) {
  const prev = cache.snapshot
  cache.snapshot = prev?.headSha === base.headSha ? { ...prev, at: Date.now() } : { at: Date.now(), headSha: base.headSha, books: listBooks(base.state) }
  return cache.snapshot
}

/** סלים פתוחים, לתצוגת "ממתין ב-PR" ליד כל ספר. */
export async function listOpenChangeSets() {
  const docs = await AcronymChangeSet.find({ status: { $in: ['open', 'modified'] } })
    .select('ops prNumber prUrl status label kind createdAt')
    .sort({ createdAt: 1 })
    .lean()
  return docs.map((d) => ({ id: String(d._id), ops: d.ops, prNumber: d.prNumber, prUrl: d.prUrl, status: d.status, label: d.label, kind: d.kind }))
}

/**
 * מאמת סל מול master העדכני ופותח לו PR.
 * @returns {Promise<{id:string, prUrl:string, prNumber:number, counts:object, books:number}>}
 */
export async function submitChangeSet({ rawOps, userId = null, kind = 'user', label = '', legacyPendingIds }, client = createAcronymsClient()) {
  const base = await loadForkState(client)
  const checked = validateChangeSet(rawOps, base.state)
  if (checked.error) throw new AcronymsInputError(checked.error)

  const doc = await AcronymChangeSet.create({ ops: checked.ops, kind, label, submittedBy: userId, status: 'publishing', legacyPendingIds })
  const id = String(doc._id)
  try {
    const res = await publishChangeSet(client, { id, ops: checked.ops, label }, base)
    await AcronymChangeSet.updateOne(
      { _id: doc._id },
      { $set: { status: 'open', branch: res.branch, prNumber: res.prNumber, prUrl: res.prUrl, baseSha: res.baseSha, headSha: res.headSha, counts: res.summary.counts, books: res.summary.books } }
    )
    return { id, prUrl: res.prUrl, prNumber: res.prNumber, counts: res.summary.counts, books: res.summary.books }
  } catch (err) {
    await AcronymChangeSet.updateOne({ _id: doc._id }, { $set: { status: 'failed', lastError: String(err?.message || err).slice(0, 500) } })
    throw err
  }
}

async function reconcilePublishing(client, doc) {
  const [owner] = ACRONYMS_REPO.split('/')
  const branch = doc.branch || branchName(String(doc._id))
  const pr = await client.findPullByHead(owner, branch)
  if (!pr) return { status: 'failed', lastError: 'הפרסום לא הושלם' }
  const ref = await client.getRef(branch)
  const head = ref ? await client.getCommit(ref.sha) : null
  return { status: 'open', branch, prNumber: pr.number, prUrl: pr.url, headSha: ref?.sha || null, baseSha: head?.parents?.[0] || null }
}

/**
 * ל-cron: מעדכן סלים שמוזגו/נסגרו, ובונה מחדש מעל master סלים שהוא התקדם תחתם.
 * @returns {Promise<Record<string, number>>}
 */
export async function syncChangeSets(client = createAcronymsClient(), now = Date.now()) {
  const summary = { checked: 0, rebuilt: 0, merged: 0, closed: 0, modified: 0, failed: 0 }
  const stale = await AcronymChangeSet.find({ status: 'publishing', updatedAt: { $lt: new Date(now - STALE_PUBLISHING_MS) } })
  for (const doc of stale) {
    const patch = await reconcilePublishing(client, doc)
    await AcronymChangeSet.updateOne({ _id: doc._id }, { $set: patch })
    if (patch.status === 'failed') summary.failed++
  }

  const base = await loadForkState(client)
  if (cache.snapshot && cache.snapshot.headSha !== base.headSha) rememberSnapshot(base)
  const open = await AcronymChangeSet.find({ status: 'open' }).sort({ createdAt: 1 })
  if (open.length === 0) return summary
  for (const doc of open) {
    summary.checked++
    try {
      const res = await refreshChangeSet(client, { id: String(doc._id), ops: doc.ops, label: doc.label, prNumber: doc.prNumber, branch: doc.branch, baseSha: doc.baseSha, headSha: doc.headSha }, base)
      if (res.status === 'open') continue
      const patch = { status: res.status === 'rebuilt' ? 'open' : res.status, lastError: null }
      if (res.status === 'rebuilt') Object.assign(patch, { headSha: res.headSha, baseSha: res.baseSha, counts: res.summary.counts, books: res.summary.books })
      await AcronymChangeSet.updateOne({ _id: doc._id }, { $set: patch })
      summary[res.status]++
    } catch (err) {
      // סל אחד שנכשל אינו עוצר את השאר; ינוסה שוב בהרצה הבאה.
      await AcronymChangeSet.updateOne({ _id: doc._id }, { $set: { lastError: String(err?.message || err).slice(0, 500) } })
      summary.failed++
    }
  }
  return summary
}
