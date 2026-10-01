/**
 * שכבת השרת של "מידע על ספרים": תמונת מצב של הקובץ בריפו, שליחת עריכה כ-PR וסנכרון PR-ים פתוחים.
 * מקור האמת הוא ForDB/book_info.csv; Mongo שומר רק את העריכות ואת מצב ה-PR שלהן.
 */
import BookInfoChangeSet from '../../models/BookInfoChangeSet.js'
import { listBookInfo, rowKey } from './csv.js'
import { applyChangeSet, validateChangeSet } from './changes.js'
import { BOOK_INFO_REPO, branchName, createBookInfoClient, loadBookInfoState, openPullForBranch, publishChangeSet, refreshChangeSet } from './fork.js'

// ה-cron מנקה את המטמון כש-main זז, ולכן אין צורך בתוקף קצר
const SNAPSHOT_TTL_MS = 10 * 60_000
// עריכה שנשארה 'publishing' זמן רב נפלה באמצע הפרסום; ה-cron בודק אם ה-PR נפתח.
const STALE_PUBLISHING_MS = 10 * 60_000

export class BookInfoInputError extends Error {}

// על globalThis: ה-route של הדף וה-route של ה-cron עשויים לקבל עותקים נפרדים של המודול
const cache = (globalThis.__bookInfoSnapshot ??= { snapshot: null, inflight: null })

/** שורות הקובץ; בקשות שמגיעות יחד אחרי שהמטמון פג ממתינות לאותה משיכה מ-GitHub. */
export async function getBookInfoSnapshot(client = createBookInfoClient()) {
  if (cache.snapshot && Date.now() - cache.snapshot.at < SNAPSHOT_TTL_MS) return cache.snapshot
  cache.inflight ??= loadBookInfoState(client)
    .then((base) => rememberSnapshot(base))
    .finally(() => {
      cache.inflight = null
    })
  return cache.inflight
}

function rememberSnapshot(base) {
  const prev = cache.snapshot
  cache.snapshot = prev?.headSha === base.headSha ? { ...prev, at: Date.now() } : { at: Date.now(), headSha: base.headSha, rows: listBookInfo(base.state) }
  return cache.snapshot
}

/** עריכות פתוחות, לתצוגת "ממתין ב-PR" ליד כל ספר. */
export async function listOpenEdits() {
  const docs = await BookInfoChangeSet.find({ status: { $in: ['open', 'modified'] } })
    .select('ops bookKey prNumber prUrl status createdAt')
    .sort({ createdAt: 1 })
    .lean()
  return docs.map((d) => ({ id: String(d._id), bookKey: d.bookKey, changes: d.ops[0]?.changes || {}, prNumber: d.prNumber, prUrl: d.prUrl, status: d.status }))
}

/**
 * מאמת עריכה אחת מול main העדכני ופותח לה PR.
 * @param {{book:string, author:string, updates:object}} edit
 * @returns {Promise<{id:string, prUrl:string, prNumber:number}>}
 */
export async function submitEdit({ edit, userId = null }, client = createBookInfoClient()) {
  const base = await loadBookInfoState(client)
  const checked = validateChangeSet([edit], base.state)
  if (checked.error) throw new BookInfoInputError(checked.error)
  const [op] = checked.ops
  const bookKey = rowKey(op.book, op.author)
  if (await BookInfoChangeSet.exists({ bookKey, status: { $in: ['publishing', 'open', 'modified'] } })) {
    throw new BookInfoInputError('יש כבר בקשה פתוחה לספר זה; נא להמתין למיזוגה או לסגירתה')
  }

  const doc = await BookInfoChangeSet.create({ ops: [op], bookKey, submittedBy: userId, status: 'publishing' })
  const id = String(doc._id)
  try {
    const res = await publishChangeSet(client, { id, ops: [op] }, base)
    await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { status: 'open', branch: res.branch, prNumber: res.prNumber, prUrl: res.prUrl, baseSha: res.baseSha, headSha: res.headSha } })
    return { id, prUrl: res.prUrl, prNumber: res.prNumber }
  } catch (err) {
    // תשובה שנכשלה אינה אומרת שהענף או ה-PR לא נוצרו; בודקים מול GitHub לפני שמסמנים כישלון
    const lastError = String(err?.message || err).slice(0, 500)
    const patch = await reconcilePublishing(client, { _id: doc._id, ops: [op] }, base).catch(() => null)
    await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { ...(patch || {}), lastError } })
    if (patch?.status === 'open') return { id, prUrl: patch.prUrl, prNumber: patch.prNumber }
    if (err?.code === 'NO_EFFECT') {
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { status: 'failed' } })
      throw new BookInfoInputError('השינוי כבר קיים בקובץ')
    }
    throw err
  }
}

/** עריכה שנתקעה ב-'publishing': מה נוצר בפועל ב-GitHub. ענף בלי PR מקבל PR. */
async function reconcilePublishing(client, doc, base) {
  const [owner] = BOOK_INFO_REPO.split('/')
  const id = String(doc._id)
  const branch = branchName(id)
  const ref = await client.getRef(branch)
  const found = await client.findPullByHead(owner, branch)
  if (!found && !ref) return { status: 'failed', lastError: 'הפרסום לא הושלם' }
  if (found?.merged) return { status: 'merged', branch, prNumber: found.number, prUrl: found.url }
  if (found && found.state === 'closed') return { status: 'closed', branch, prNumber: found.number, prUrl: found.url }
  const pr = found ? { prNumber: found.number, prUrl: found.url } : await openPullForBranch(client, { id, ops: doc.ops }, base)
  const head = ref ? await client.getCommit(ref.sha) : null
  return { status: 'open', branch, prNumber: pr.prNumber, prUrl: pr.prUrl, headSha: ref?.sha || null, baseSha: head?.parents?.[0] || null }
}

// שני סנכרונים במקביל היו מזהים כל אחד את הבנייה של השני כדחיפה ידנית ומסמנים 'modified'
const runner = (globalThis.__bookInfoSyncRunner ??= { running: null, again: false })

/**
 * סנכרון אחד בכל פעם: קריאה בזמן ריצה מצטרפת לסבב אחד נוסף אחריה, שרואה את main העדכני.
 * @returns {Promise<Record<string, number>>} סיכום הסבב האחרון
 */
export function requestSync(sync = () => syncEdits()) {
  if (runner.running) {
    runner.again = true
    return runner.running
  }
  runner.running = (async () => {
    try {
      let summary
      do {
        runner.again = false
        summary = await sync()
      } while (runner.again)
      return summary
    } finally {
      runner.running = null
    }
  })()
  return runner.running
}

/**
 * ל-cron: מעדכן עריכות שמוזגו/נסגרו, ובונה מחדש מעל main PR-ים ש-main התקדם תחתם.
 * @returns {Promise<Record<string, number>>}
 */
export async function syncEdits(client = createBookInfoClient(), now = Date.now()) {
  const summary = { checked: 0, rebuilt: 0, merged: 0, closed: 0, modified: 0, failed: 0 }
  const base = await loadBookInfoState(client)
  const stale = await BookInfoChangeSet.find({ status: 'publishing', updatedAt: { $lt: new Date(now - STALE_PUBLISHING_MS) } })
  for (const doc of stale) {
    try {
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: await reconcilePublishing(client, doc, base) })
    } catch (err) {
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { lastError: String(err?.message || err).slice(0, 500) } })
      summary.failed++
    }
  }

  // התצוגה צריכה לראות את הערכים שמוזגו, ולכן המטמון מתחדש כש-main זז
  if (cache.snapshot && cache.snapshot.headSha !== base.headSha) rememberSnapshot(base)
  const open = await BookInfoChangeSet.find({ status: 'open' }).sort({ createdAt: 1 })
  for (const doc of open) {
    summary.checked++
    try {
      const res = await refreshChangeSet(client, { id: String(doc._id), ops: doc.ops, prNumber: doc.prNumber, branch: doc.branch, baseSha: doc.baseSha, headSha: doc.headSha }, base)
      if (res.status === 'open') continue
      const patch = { status: res.status === 'rebuilt' ? 'open' : res.status, lastError: null }
      if (res.status === 'rebuilt') Object.assign(patch, { headSha: res.headSha, baseSha: res.baseSha })
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: patch })
      summary[res.status]++
    } catch (err) {
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { lastError: String(err?.message || err).slice(0, 500) } })
      summary.failed++
    }
  }

  // PR שנדחף אליו ידנית אינו נבנה מחדש, אבל עדיין צריך לזהות מתי מוזג או נסגר. אחרת הספר נשאר
  // חסום לעריכות חדשות לתמיד (submitEdit דוחה ספר שיש לו עריכה ב-'modified').
  const modified = await BookInfoChangeSet.find({ status: 'modified' }).select('prNumber').lean()
  for (const doc of modified) {
    summary.checked++
    try {
      const pr = await client.getPull(doc.prNumber)
      const status = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : null
      if (!status) continue
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { status, lastError: null } })
      summary[status]++
    } catch (err) {
      await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: { lastError: String(err?.message || err).slice(0, 500) } })
      summary.failed++
    }
  }
  return summary
}

/** לבדיקות בלבד: ההחלה בלי GitHub. */
export const _applyForTest = applyChangeSet
