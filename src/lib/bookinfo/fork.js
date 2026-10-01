/**
 * פרסום עריכות "מידע על ספרים" כ-PR לריפו Otzaria/otzaria-library (ForDB/book_info.csv).
 *
 * לכל עריכה ענף משלה (site/book-info-<id>) עם קומיט אחד מעל main. אחרי כל מיזוג כל PR פתוח נבנה
 * מחדש מעליו (refreshChangeSet) והענף מתעדכן ב-force; ענף שמישהו אחר דחף אליו לא נדרס.
 * אותו מנגנון כמו src/lib/acronyms/fork.js, על קובץ אחר.
 */
import { createRepoClient } from '../dicta/github-api.js'
import { resolveSignoff } from '../acronyms/fork.js'
import { exportBookInfoCsv, parseBookInfoCsv } from './csv.js'
import { applyChangeSet, summarizeChangeSet } from './changes.js'

export const BOOK_INFO_REPO = 'Otzaria/otzaria-library'
export const BOOK_INFO_BRANCH = 'main'
export const BOOK_INFO_PATH = 'ForDB/book_info.csv'
const PR_BODY_LIMIT = 60_000

/** הטוקן המשותף לכל כתיבות ה-GitHub של האתר (כמו הכינויים ותיקוני הספרים). */
export function createBookInfoClient({ token = process.env.DICTA_LIBRARY_GITHUB_TOKEN, fetchImpl } = {}) {
  if (!token) throw Object.assign(new Error('DICTA_LIBRARY_GITHUB_TOKEN is not configured'), { code: 'TOKEN_MISSING' })
  return createRepoClient({ repo: BOOK_INFO_REPO, token, ...(fetchImpl ? { fetchImpl } : {}), timeoutMs: 60_000 })
}

export const branchName = (changeSetId) => `site/book-info-${changeSetId}`

let cachedParse = null // { blobSha, state }

/** main הנוכחי של הריפו ומצב הקובץ בו. */
export async function loadBookInfoState(client) {
  const head = await client.getBranchHead(BOOK_INFO_BRANCH)
  const dir = BOOK_INFO_PATH.slice(0, BOOK_INFO_PATH.lastIndexOf('/'))
  const meta = (await client.listDir(dir, head.commitSha))?.find((e) => e.path === BOOK_INFO_PATH && e.type === 'file')
  if (!meta) throw new Error(`${BOOK_INFO_PATH} not found in ${BOOK_INFO_REPO}@${BOOK_INFO_BRANCH}`)
  if (cachedParse?.blobSha !== meta.sha) {
    const bytes = await client.getBlob(meta.sha)
    cachedParse = { blobSha: meta.sha, state: parseBookInfoCsv(bytes.toString('utf8')) }
  }
  return { headSha: head.commitSha, treeSha: head.treeSha, blobSha: meta.sha, state: cachedParse.state }
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
    '> האתר בונה את הענף הזה מחדש מעל `main` אחרי כל מיזוג, כדי שה-PR לא יתנגש עם PR-ים אחרים של האתר.',
    '> דחיפה ידנית לענף עוצרת את הבנייה מחדש; לתיקון עדיף לבקש שינוי ולסגור.',
    '',
  ]
  return [...intro, summary.text, '', `Change-Set: ${changeSet.id}`].join('\n')
}

const summarize = (results) => summarizeChangeSet(results, { maxLength: PR_BODY_LIMIT })

/** עריכה שכל שינוייה כבר ב-main אינה מייצרת קומיט; מחזיר commitSha: null. */
async function commitChangeSet(client, base, changeSet) {
  const { state, results } = applyChangeSet(base.state, changeSet.ops)
  const summary = summarize(results)
  if (!results.some((r) => r.status === 'applied')) return { commitSha: null, summary }
  const blob = await client.createBlob(Buffer.from(exportBookInfoCsv(state), 'utf8'), { utf8: true })
  const tree = await client.createTree(base.treeSha, [{ path: BOOK_INFO_PATH, mode: '100644', type: 'blob', sha: blob.sha }])
  const signoff = await resolveSignoff(client)
  const message = `${titleFor(changeSet)}\n\nChange-Set: ${changeSet.id}\n\nSigned-off-by: ${signoff}`
  const commit = await client.createCommit({ message, treeSha: tree.sha, parents: [base.headSha] })
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
  await client.createRef(branch, commitSha)
  const pr = await client.createPull({ title: titleFor(changeSet), body: bodyFor(changeSet, summary), head: branch, base: BOOK_INFO_BRANCH })
  return { branch, prNumber: pr.number, prUrl: pr.url, baseSha: base.headSha, headSha: commitSha, summary }
}

/** פותח PR לענף קיים (למשל כשתשובת GitHub על פתיחת ה-PR אבדה). */
export async function openPullForBranch(client, changeSet, base) {
  const summary = summarize(applyChangeSet(base.state, changeSet.ops).results)
  const pr = await client.createPull({ title: titleFor(changeSet), body: bodyFor(changeSet, summary), head: branchName(changeSet.id), base: BOOK_INFO_BRANCH })
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
  if (changeSet.baseSha === base.headSha) return { status: 'open' }
  const ref = await client.getRef(changeSet.branch)
  if (!ref || ref.sha !== changeSet.headSha) return { status: 'modified' }
  const { commitSha, summary } = await commitChangeSet(client, base, changeSet)
  if (!commitSha) {
    await client.commentOnIssue(changeSet.prNumber, 'כל השינויים ב-PR הזה כבר נמצאים ב-`main`, ולכן הוא נסגר.')
    await client.updatePull(changeSet.prNumber, { state: 'closed' })
    return { status: 'closed' }
  }
  await client.updateRef(changeSet.branch, commitSha, { force: true })
  await client.updatePull(changeSet.prNumber, { title: titleFor(changeSet), body: bodyFor(changeSet, summary) })
  return { status: 'rebuilt', headSha: commitSha, baseSha: base.headSha, summary }
}

/** לבדיקות בלבד. */
export function resetBookInfoCaches() {
  cachedParse = null
}
