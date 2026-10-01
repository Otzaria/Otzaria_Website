/**
 * פרסום סלי כינויים כ-PR לפורק Otzaria/SeforimAcronymizer.
 *
 * לכל סל ענף משלו (site/acronyms-<id>) עם קומיט אחד מעל master. הקובץ ממוין לפי id, ולכן שני
 * סלים שמוסיפים שורות תמיד מתנגשים זה בזה; אחרי כל מיזוג ל-master כל סל פתוח נבנה מחדש מעליו
 * (refreshChangeSet), והענף מתעדכן ב-force. ענף שמישהו אחר דחף אליו לא נדרס.
 */
import { createRepoClient, ghFetch } from '../dicta/github-api.js'
import { parseDump, exportDump } from './dump.js'
import { applyChangeSet, summarizeChangeSet } from './changes.js'

export const ACRONYMS_REPO = 'Otzaria/SeforimAcronymizer'
export const ACRONYMS_BRANCH = 'master'
export const ACRONYMS_PATH = 'data/acronymizer.sql'
const PR_BODY_LIMIT = 60_000
const FALLBACK_SIGNOFF = 'Otzaria Website <noreply@otzaria.org>'

/** הטוקן המשותף לכל כתיבות ה-GitHub של האתר (כמו תיקוני הספרים). */
export function createAcronymsClient({ token = process.env.DICTA_LIBRARY_GITHUB_TOKEN, fetchImpl } = {}) {
  if (!token) throw Object.assign(new Error('DICTA_LIBRARY_GITHUB_TOKEN is not configured'), { code: 'TOKEN_MISSING' })
  return createRepoClient({ repo: ACRONYMS_REPO, token, ...(fetchImpl ? { fetchImpl } : {}), timeoutMs: 60_000 })
}

export const branchName = (changeSetId) => `site/acronyms-${changeSetId}`

let cachedParse = null // { blobSha, state } — הקובץ כ-10MB, והפענוח נעשה פעם אחת לכל גרסה

/** master הנוכחי של הפורק ומצב הכינויים בו. */
export async function loadForkState(client) {
  const head = await client.getBranchHead(ACRONYMS_BRANCH)
  // רשימת התיקייה ולא contents של הקובץ: מעל 1MB ה-contents API אינו מחזיר את הקובץ.
  const dir = ACRONYMS_PATH.slice(0, ACRONYMS_PATH.lastIndexOf('/'))
  const meta = (await client.listDir(dir, head.commitSha))?.find((e) => e.path === ACRONYMS_PATH && e.type === 'file')
  if (!meta) throw new Error(`${ACRONYMS_PATH} not found in ${ACRONYMS_REPO}@${ACRONYMS_BRANCH}`)
  if (cachedParse?.blobSha !== meta.sha) {
    const bytes = await client.getBlob(meta.sha)
    cachedParse = { blobSha: meta.sha, state: parseDump(bytes.toString('utf8')) }
  }
  return { headSha: head.commitSha, treeSha: head.treeSha, blobSha: meta.sha, state: cachedParse.state }
}

let cachedSignoff = null

/** שורת ה-DCO שהפורק דורש בכל קומיט: המשתמש שהטוקן שייך לו, עם כתובת noreply שלו. */
export async function resolveSignoff(client, token = process.env.DICTA_LIBRARY_GITHUB_TOKEN) {
  if (process.env.ACRONYMS_SIGNOFF) return process.env.ACRONYMS_SIGNOFF
  if (cachedSignoff) return cachedSignoff
  try {
    const me = await ghFetch('https://api.github.com/user', { token, fetchImpl: client.fetchImpl, timeoutMs: 20_000 })
    cachedSignoff = me?.login ? `${me.name || me.login} <${me.id}+${me.login}@users.noreply.github.com>` : FALLBACK_SIGNOFF
  } catch {
    return FALLBACK_SIGNOFF
  }
  return cachedSignoff
}

function titleFor(changeSet, summary) {
  const what = `${summary.counts.add + summary.counts.remove + summary.counts.rename} שינויים ב-${summary.books} ספרים`
  return changeSet.label ? `כינויים מהאתר (${changeSet.label}): ${what}` : `כינויים מהאתר: ${what}`
}

function bodyFor(changeSet, summary) {
  const intro = [
    'נפתח אוטומטית מדף הכינויים באתר אוצריא.',
    '',
    '> [!NOTE]',
    '> האתר בונה את הענף הזה מחדש מעל `master` אחרי כל מיזוג, כדי שה-PR לא יתנגש עם PR-ים אחרים של האתר.',
    '> דחיפה ידנית לענף עוצרת את הבנייה מחדש; לתיקון עדיף לבקש שינוי ולסגור.',
    '',
  ]
  let text = summary.text
  if (text.length > PR_BODY_LIMIT) text = `${text.slice(0, PR_BODY_LIMIT)}\n\n… (הרשימה קוצרה — הפירוט המלא ב-diff ובתגובת ההבדלים)`
  return [...intro, text, '', `Change-Set: ${changeSet.id}`].join('\n')
}

// GitHub מחזיר 401 גם לטוקן תקין כשההעלאה נמשכת מעל כדקה; העלאה שנכשלה לא יוצרת כלום,
// ולכן ניסיון נוסף בטוח.
async function uploadDump(client, text) {
  const bytes = Buffer.from(text, 'utf8')
  try {
    return await client.createBlob(bytes, { utf8: true })
  } catch (err) {
    if (err.status !== 401) throw err
    return client.createBlob(bytes, { utf8: true })
  }
}

/** סל שכל פעולותיו כבר חלו על master אינו מייצר קומיט; מחזיר commitSha: null. */
async function commitChangeSet(client, base, changeSet) {
  const { state, results } = applyChangeSet(base.state, changeSet.ops)
  const summary = summarizeChangeSet(results)
  if (!results.some((r) => r.status === 'applied')) return { commitSha: null, summary }
  const blob = await uploadDump(client, exportDump(state))
  const tree = await client.createTree(base.treeSha, [{ path: ACRONYMS_PATH, mode: '100644', type: 'blob', sha: blob.sha }])
  const signoff = await resolveSignoff(client)
  const message = `${titleFor(changeSet, summary)}\n\nChange-Set: ${changeSet.id}\n\nSigned-off-by: ${signoff}`
  const commit = await client.createCommit({ message, treeSha: tree.sha, parents: [base.headSha] })
  return { commitSha: commit.sha, summary }
}

/**
 * פותח PR לסל חדש.
 * @param {{id:string, ops:object[], label?:string}} changeSet
 * @returns {Promise<{branch:string, prNumber:number, prUrl:string, baseSha:string, headSha:string, summary:object}>}
 */
export async function publishChangeSet(client, changeSet, base) {
  base ||= await loadForkState(client)
  const { commitSha, summary } = await commitChangeSet(client, base, changeSet)
  if (!commitSha) throw Object.assign(new Error('כל השינויים בסל כבר קיימים בפורק'), { code: 'NO_EFFECT' })
  const branch = branchName(changeSet.id)
  await client.createRef(branch, commitSha)
  const pr = await client.createPull({ title: titleFor(changeSet, summary), body: bodyFor(changeSet, summary), head: branch, base: ACRONYMS_BRANCH })
  return { branch, prNumber: pr.number, prUrl: pr.url, baseSha: base.headSha, headSha: commitSha, summary }
}

/**
 * פותח PR לענף קיים של סל (למשל כשתשובת GitHub על פתיחת ה-PR אבדה). הכותרת מחושבת מול base.
 * @returns {Promise<{prNumber:number, prUrl:string, summary:object}>}
 */
export async function openPullForBranch(client, changeSet, base) {
  const summary = summarizeChangeSet(applyChangeSet(base.state, changeSet.ops).results)
  const pr = await client.createPull({ title: titleFor(changeSet, summary), body: bodyFor(changeSet, summary), head: branchName(changeSet.id), base: ACRONYMS_BRANCH })
  return { prNumber: pr.number, prUrl: pr.url, summary }
}

/**
 * מצב PR פתוח של סל, ובנייה מחדש שלו מעל master כשהוא התקדם. PR שכל שינוייו כבר ב-master נסגר.
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
    await client.commentOnIssue(changeSet.prNumber, 'כל השינויים ב-PR הזה כבר נמצאים ב-`master`, ולכן הוא נסגר.')
    await client.updatePull(changeSet.prNumber, { state: 'closed' })
    return { status: 'closed' }
  }
  await client.updateRef(changeSet.branch, commitSha, { force: true })
  return { status: 'rebuilt', headSha: commitSha, baseSha: base.headSha, summary }
}

/** לבדיקות בלבד. */
export function resetForkCaches() {
  cachedParse = null
  cachedSignoff = null
}
