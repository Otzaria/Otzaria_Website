/**
 * פרסום עריכות "מידע על ספרים" כ-PR לריפו Otzaria/otzaria-library (ForDB/book_info.csv).
 *
 * לכל עריכה ענף משלה (site/book-info-<id>). שינוי CSV או זהויות ב-main גורר עדכון מדורג
 * בקומיט fast-forward (refreshChangeSet); דחיפה ידנית מקבילה נדחית אטומית.
 */
import { createRepoClient } from '../dicta/github-api.js'
import { resolveSignoff } from '../acronyms/fork.js'
import { exportBookInfoCsv, parseBookInfoCsv } from './csv.js'
import { BOOK_INFO_IDENTITY_PATH, assertIdentityPrefix, identityPrefixHash, emptyIdentity, parseIdentity, rebaseIdentities } from './identity.js'
import { applyChangeSet, summarizeChangeSet } from './changes.js'

export const BOOK_INFO_REPO = 'Otzaria/otzaria-library'
export const BOOK_INFO_BRANCH = 'main'
export const BOOK_INFO_PATH = 'ForDB/book_info.csv'
const decodeUtf8 = (bytes) => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
const PR_BODY_LIMIT = 60_000

/** הטוקן המשותף לכל כתיבות ה-GitHub של האתר (כמו הכינויים ותיקוני הספרים). */
export function createBookInfoClient({ token = (process.env.DICTA_LIBRARY_GITHUB_TOKEN || '').trim(), fetchImpl } = {}) {
  if (!token) throw Object.assign(new Error('DICTA_LIBRARY_GITHUB_TOKEN is not configured'), { code: 'TOKEN_MISSING' })
  return createRepoClient({ repo: BOOK_INFO_REPO, token, ...(fetchImpl ? { fetchImpl } : {}), timeoutMs: 60_000 })
}

export const branchName = (changeSetId) => `site/book-info-${changeSetId}`

let lastLiveIdentity = null
let liveStarted = 0
let liveCompleted = 0
let cachedIdentity = null
let cachedParse = null // { blobSha, state }

/** main הנוכחי של הריפו ומצב הקובץ בו. */
export async function loadBookInfoState(client, commitSha = null) {
  const ticket = commitSha ? null : ++liveStarted
  const head = commitSha ? { commitSha, treeSha: (await client.getCommit(commitSha)).treeSha } : await client.getBranchHead(BOOK_INFO_BRANCH)
  const dir = BOOK_INFO_PATH.slice(0, BOOK_INFO_PATH.lastIndexOf('/'))
  const entries = await client.listDir(dir, head.commitSha)
  const meta = entries?.find((e) => e.path === BOOK_INFO_PATH && e.type === 'file')
  if (!meta) throw Object.assign(new Error(`${BOOK_INFO_PATH} not found in ${BOOK_INFO_REPO}@${BOOK_INFO_BRANCH}`), { code: 'FILE_MISSING' })
  let parsed = cachedParse
  if (parsed?.blobSha !== meta.sha) {
    const bytes = await client.getBlob(meta.sha)
    parsed = { blobSha: meta.sha, state: parseBookInfoCsv(decodeUtf8(bytes)) }
    cachedParse = parsed
  }
  const identityMeta = entries?.find((e) => e.path === BOOK_INFO_IDENTITY_PATH && e.type === 'file')
  let identity = cachedIdentity
  if (identity?.blobSha !== (identityMeta?.sha || null)) {
    identity = { blobSha: identityMeta?.sha || null, ledger: identityMeta ? parseIdentity(decodeUtf8(await client.getBlob(identityMeta.sha))) : emptyIdentity() }
  }
  identity ||= { blobSha: null, ledger: emptyIdentity() }
  cachedIdentity = identity
  if (!commitSha && ticket > liveCompleted) {
    if (lastLiveIdentity) assertIdentityPrefix(identity.ledger, lastLiveIdentity.events.length, identityPrefixHash(lastLiveIdentity))
    lastLiveIdentity = identity.ledger
    liveCompleted = ticket
  }
  return { headSha: head.commitSha, treeSha: head.treeSha, blobSha: meta.sha, identitySha: identityMeta?.sha || null, identity: identity.ledger, state: parsed.state }
}

function titleFor(changeSet) {
  const op = changeSet.ops[0]
  const who = op.author ? `${op.book} (${op.author})` : op.book
  return changeSet.ops.length === 1 ? `מידע על ספרים מהאתר: ${who}` : `מידע על ספרים מהאתר: ${changeSet.ops.length} ספרים`
}

function bodyFor(changeSet, summary) {
  const intro = [
    'נפתח אוטומטית מדף "מידע על ספרים" באתר אוצריא.',
    '',
    '> [!NOTE]',
    '> האתר מעדכן את הענף כשמידע הספרים משתנה ב-`main`, בקומיט fast-forward השומר על ההיסטוריה.',
    '> דחיפה ידנית לענף עוצרת את הבנייה מחדש; לתיקון עדיף לבקש שינוי ולסגור.',
    '',
  ]
  return [...intro, summary.text, '', `Change-Set: ${changeSet.id}`].join('\n')
}

const summarize = (results) => summarizeChangeSet(results, { maxLength: PR_BODY_LIMIT })

/** עריכה שכל שינוייה כבר ב-main אינה מייצרת קומיט; מחזיר commitSha: null. */
async function commitChangeSet(client, base, changeSet) {
  const { state, results } = applyChangeSet(base.state, changeSet.ops)
  const conflicts = results.filter((r) => r.status === 'conflict')
  if (conflicts.length) throw Object.assign(new Error(conflicts.map((r) => r.reason).join('; ')), { code: 'CONFLICT' })
  const summary = summarize(results)
  if (!results.some((r) => r.status === 'applied')) return { commitSha: null, summary }
  const csv = exportBookInfoCsv(state)
  if (exportBookInfoCsv(parseBookInfoCsv(csv)) !== csv) throw new Error('CSV round-trip failed')
  const blob = await client.createBlob(Buffer.from(csv, 'utf8'), { utf8: true })
  const entries = [{ path: BOOK_INFO_PATH, mode: '100644', type: 'blob', sha: blob.sha }]
  const ledger = { ...base.identity, events: [...(base.identity?.events || [])] }
  for (const result of results) {
    if (result.status === 'applied' && 'authorName' in result.after) ledger.events.push({ id: ledger.events.length + 1, kind: 'rename', old: { bookName: result.op.book, authorName: result.op.author }, new: { bookName: result.op.book, authorName: result.after.authorName }, commit: null, changeSetId: changeSet.id })
  }
  if (ledger.events.length !== (base.identity?.events.length || 0)) {
    const identityBlob = await client.createBlob(Buffer.from(JSON.stringify(ledger, null, 2) + '\n', 'utf8'), { utf8: true })
    entries.push({ path: BOOK_INFO_IDENTITY_PATH, mode: '100644', type: 'blob', sha: identityBlob.sha })
  }
  const tree = await client.createTree(base.treeSha, entries)
  const signoff = await resolveSignoff(client)
  const message = `${titleFor(changeSet)}\n\nChange-Set: ${changeSet.id}\n\nSigned-off-by: ${signoff}`
  const commit = await client.createCommit({ message, treeSha: tree.sha, parents: changeSet.headSha ? [...new Set([changeSet.headSha, base.headSha])] : [base.headSha] })
  return { commitSha: commit.sha, summary }
}

/**
 * פותח PR לעריכה חדשה.
 * @param {{id:string, ops:object[]}} changeSet
 */
export async function publishChangeSet(client, changeSet, base) {
  base ||= await loadBookInfoState(client)
  const { commitSha, summary } = await commitChangeSet(client, base, changeSet)
  if (!commitSha) throw Object.assign(new Error('השינוי כבר קיים בקובץ'), { code: 'NO_EFFECT' })
  const branch = branchName(changeSet.id)
  await changeSet.persistIntent?.({ pendingHeadSha: commitSha, pendingBaseSha: base.headSha, pendingBlobSha: base.blobSha, pendingIdentitySha: base.identitySha, pendingTitle: titleFor(changeSet), pendingBody: bodyFor(changeSet, summary), branch })
  await client.createRef(branch, commitSha)
  const pr = await client.createPull({ title: titleFor(changeSet), body: bodyFor(changeSet, summary), head: branch, base: BOOK_INFO_BRANCH })
  return { branch, prNumber: pr.number, prUrl: pr.url, baseSha: base.headSha, baseBlobSha: base.blobSha, baseIdentitySha: base.identitySha, headSha: commitSha, summary }
}

/** פותח PR לענף קיים (למשל כשתשובת GitHub על פתיחת ה-PR אבדה). */
export async function openPullForBranch(client, changeSet, base) {
  const summary = summarize(applyChangeSet(base.state, changeSet.ops).results)
  const pr = await client.createPull({ title: changeSet.pendingTitle || titleFor(changeSet), body: changeSet.pendingBody || bodyFor(changeSet, summary), head: branchName(changeSet.id), base: BOOK_INFO_BRANCH })
  return { prNumber: pr.number, prUrl: pr.url, summary }
}

/**
 * מצב PR פתוח, ובנייה מחדש שלו מעל main כשהוא התקדם. PR שכל שינוייו כבר ב-main נסגר.
 * @returns {Promise<{status:'merged'|'closed'|'open'|'rebuilt'|'modified', headSha?:string, baseSha?:string, summary?:object}>}
 */
export async function refreshChangeSet(client, changeSet, base) {
  const pr = await client.getPull(changeSet.prNumber)
  if (pr.merged) return { status: 'merged' }
  if (pr.state === 'closed') return { status: 'closed' }
  if (changeSet.baseBlobSha === base.blobSha && (changeSet.baseIdentitySha || null) === base.identitySha) return { status: 'open' }
  if (!changeSet.baseBlobSha && changeSet.baseSha === base.headSha) return { status: 'open' }
  const ref = await client.getRef(changeSet.branch)
  if (!ref || ref.sha !== changeSet.headSha) return { status: 'modified' }
  const ops = rebaseIdentities(changeSet.ops, base)
  const { commitSha, summary } = await commitChangeSet(client, base, { ...changeSet, ops })
  if (!commitSha) {
    await client.commentOnIssue(changeSet.prNumber, 'כל השינויים ב-PR הזה כבר נמצאים ב-`main`, ולכן הוא נסגר.')
    await client.updatePull(changeSet.prNumber, { state: 'closed' })
    return { status: 'closed' }
  }
  await changeSet.persistIntent?.({ pendingHeadSha: commitSha, pendingBaseSha: base.headSha, pendingBlobSha: base.blobSha, pendingIdentitySha: base.identitySha, pendingOps: ops, pendingTitle: titleFor({ ...changeSet, ops }), pendingBody: bodyFor({ ...changeSet, ops }, summary) })
  try {
    await client.updateRef(changeSet.branch, commitSha, { force: false })
  } catch (err) {
    // Atomic ancestry enforcement rejects a push that raced the check above.
    const actual = (await client.getRef(changeSet.branch))?.sha
    if (actual !== commitSha) {
      if (actual !== changeSet.headSha) return { status: 'modified' }
      throw err
    }
  }
  await client.updatePull(changeSet.prNumber, { title: titleFor({ ...changeSet, ops }), body: bodyFor({ ...changeSet, ops }, summary) })
  return { status: 'rebuilt', headSha: commitSha, baseSha: base.headSha, baseBlobSha: base.blobSha, baseIdentitySha: base.identitySha, ops, summary }
}

/** לבדיקות בלבד. */
export function resetBookInfoCaches() {
  cachedParse = null
  cachedIdentity = null
  lastLiveIdentity = null
  liveStarted = 0
  liveCompleted = 0
}
