// הנתונים של דשבורד הניהול — ספירות בצד ה-DB, לקריאה מ-Server Component בלבד.
//
// כל מקום נספר באותו תנאי שהמסך שלו (או ה-API שלו) מציג כ"ממתין". איפה שאפשר, התנאי עצמו
// מיובא מהמודול של המסך (ולא מועתק ממנו), והטסט adminDashboardData.test.js מוודא שזה אותו תנאי.
// התוצאה תלויה בתפקיד הצופה (מי רואה איזה מקום), ולכן לא ממוטמנת ולא משותפת בין משתמשים.
//
// עומס: ספירה + הוותיק באגרגציה אחת לכל מקום ($min מדלג על null — מסמך בלי תאריך לא מעלים את
// שורת הוותק), ומוני ההודעות וההעלאות משותפים עם הסרגל באותה בקשה (getRequestAdminBadgeCounts).
// אצל מנהל כללי: כ-20 שאילתות לדשבורד במקום כ-41, מול pool של 10 חיבורים (src/lib/db.js).
//
// תקרת זמן: לכל אזור תקציב אחד (DASHBOARD_BUDGET_MS) שכולל גם את החיבור ל-DB. כל שאילתה נשלחת
// עם maxTimeMS — Mongo עוצר אותה בעצמו, והיא לא ממשיכה להחזיק חיבור אחרי שוויתרנו עליה.
// מקום שנכשל או חרג מוחזר כ-{ status: 'error' } — הכרטיס שלו מציג "לא הצלחנו לטעון" ו"נסה שוב".

import connectDB from '@/lib/db'
import Message from '@/models/Message'
import Upload from '@/models/Upload'
import Plugin from '@/models/Plugin'
import ServicePluginReview from '@/models/ServicePluginReview'
import ErrorReport from '@/models/ErrorReport'
import BookEdit from '@/models/BookEdit'
import LibraryBook from '@/models/LibraryBook'
import TrainingProofItem from '@/models/TrainingProofItem'
import TrainingProofVolunteer from '@/models/TrainingProofVolunteer'
import OcrLine from '@/models/OcrLine'
import OcrLayoutPage from '@/models/OcrLayoutPage'
import BookInfo from '@/models/BookInfo'
import BookInfoChangeSet from '@/models/BookInfoChangeSet'
import BookInfoPendingChange from '@/models/BookInfoPendingChange'
import TzuratSubmission from '@/models/TzuratSubmission'
import TzuratItem from '@/models/TzuratItem'
import TzuratReport from '@/models/TzuratReport'
import Page from '@/models/Page'
import User from '@/models/User'
import Book from '@/models/Book'
import AppReport from '@/models/AppReport'
import SpellWordSkip from '@/models/SpellWordSkip'
import { ADMIN_BADGE_FILTERS, getRequestAdminBadgeCounts } from '@/lib/adminBadgeCounts'
import { failedPublishFilter, queuedFilter } from '@/lib/corrections/listFilters'
import { ACTIVE_STATUSES as BOOK_INFO_ACTIVE_STATUSES } from '@/lib/bookinfo/service'
import { SECTIONS as PROOF_SECTIONS } from '@/lib/trainingProof/vocab'
import { generalStatsScope, visibleQueues } from '@/lib/adminDashboard'

const DAY = 24 * 60 * 60 * 1000

/** התקציב של אזור שלם (חיבור + כל השאילתות שלו) */
export const DASHBOARD_BUDGET_MS = 8000
/** התקרה בצד השרת לשאילתה אחת — מעט מתחת לתקציב, כדי ש-Mongo יעצור לפני שאנחנו מוותרים */
export const QUERY_MAX_TIME_MS = 7000

/**
 * בקשות "מידע על ספרים" שמחכות למנהל: ACTIVE_STATUSES של המסך, בלי 'modified' — בקשה שנערכה
 * ידנית ב-GitHub ומטופלת שם (המסך מציג אותה ברשימה, אבל אין בה פעולה באתר).
 */
export const BOOK_INFO_WAITING_STATUSES = BOOK_INFO_ACTIVE_STATUSES.filter((status) => status !== 'modified')

/** @typedef {{ now: Date, maxTimeMS: number, badgeCounts: () => Promise<Record<string, number>> }} LoaderContext */

const options = (ctx) => ({ maxTimeMS: ctx.maxTimeMS })

/** ספירה + התאריך הוותיק באגרגציה אחת. $min מדלג על null/חסר, ולכן מסמך בלי תאריך לא מסתיר את הוותק */
async function countAndOldest(Model, filter, field, ctx) {
  const group = { _id: null, count: { $sum: 1 } }
  if (field) group.oldest = { $min: `$${field}` }
  const [row] = await Model.aggregate([{ $match: filter }, { $group: group }], options(ctx))
  return { count: row?.count ?? 0, oldest: row?.oldest ?? null }
}

/** רק התאריך הוותיק (כשהספירה כבר ידועה) — מיון לפי שדה עם תאריך אמיתי, limit 1 */
async function oldestDate(Model, filter, field, ctx) {
  const [row] = await Model.aggregate([
    { $match: { ...filter, [field]: { $type: 'date' } } },
    { $sort: { [field]: 1 } },
    { $limit: 1 },
    { $project: { _id: 0, at: `$${field}` } },
  ], options(ctx))
  return row?.at ?? null
}

function earliest(...dates) {
  const times = dates.filter(Boolean).map((d) => new Date(d).getTime()).filter(Number.isFinite)
  return times.length ? new Date(Math.min(...times)) : null
}

/** @type {Record<string, (ctx: LoaderContext) => Promise<{ count: number, oldest?: Date | null, parts?: Record<string, number> }>>} */
const QUEUE_LOADERS = {
  // התנגשויות בסנכרון — /api/library/conflicts
  conflicts: (ctx) => countAndOldest(LibraryBook, { syncStatus: 'conflict' }, 'conflict.detectedAt', ctx),

  // תיקוני טקסט שהפרסום שלהם נכשל — חלק ה"כשל" של הלשונית "אושרו / בפרסום" (listFilters.js)
  'corrections-failed': (ctx) => countAndOldest(ErrorReport, failedPublishFilter(), 'publish.updatedAt', ctx),

  // תוספים — אותו תנאי כמו מונה התוספים בסרגל, מפורק לחדשים (isApproved: false) ולעדכונים (השאר)
  plugins: async (ctx) => {
    const rows = await Plugin.aggregate([
      { $match: ADMIN_BADGE_FILTERS.pendingPlugins },
      {
        $group: {
          _id: { $eq: ['$isApproved', false] },
          count: { $sum: 1 },
          oldestCreated: { $min: '$createdAt' },
          oldestSubmitted: { $min: '$lastSubmittedAt' },
        },
      },
    ], options(ctx))
    const created = rows.find((r) => r._id === true)
    const updates = rows.find((r) => r._id !== true)
    return {
      count: (created?.count ?? 0) + (updates?.count ?? 0),
      oldest: earliest(created?.oldestCreated, updates?.oldestSubmitted),
      parts: { created: created?.count ?? 0, updates: updates?.count ?? 0 },
    }
  },

  // תוספי שירות — שני המצבים שמחכים למנהל (src/lib/servicePlugins/reviews.js: adminStart, adminRetry)
  'service-plugins': async (ctx) => {
    const rows = await ServicePluginReview.aggregate([
      { $match: { status: { $in: ['pending_admin', 'needs_operator'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ], options(ctx))
    const of = (status) => rows.find((r) => r._id === status)?.count ?? 0
    const pendingAdmin = of('pending_admin')
    const needsOperator = of('needs_operator')
    return { count: pendingAdmin + needsOperator, parts: { pendingAdmin, needsOperator } }
  },

  // הגהה לאימון — summaryCounts ב-api/admin/training-proof/_lib/review.js, לפי חלק (המסך מציג
  // מונה לכל חלק). section ב-$in — כך השאילתה משתמשת באינדקס { section, status, heldUntil }.
  'proof-review': async (ctx) => {
    const rows = await TrainingProofItem.aggregate([
      { $match: { section: { $in: PROOF_SECTIONS }, status: 'submitted' } },
      { $group: { _id: '$section', count: { $sum: 1 }, oldest: { $min: '$submittedAt' } } },
    ], options(ctx))
    const parts = Object.fromEntries(PROOF_SECTIONS.map((s) => [s, rows.find((r) => r._id === s)?.count ?? 0]))
    return { count: rows.reduce((n, r) => n + r.count, 0), oldest: earliest(...rows.map((r) => r.oldest)), parts }
  },

  // תמלול שורות / תיוג מבנה — ברירת המחדל 'submitted' של המסכים ושל ה-API
  'ocr-lines': (ctx) => countAndOldest(OcrLine, { status: 'submitted' }, 'transcribedAt', ctx),
  'ocr-layout': (ctx) => countAndOldest(OcrLayoutPage, { status: 'submitted' }, 'answeredAt', ctx),

  // הצעות עריכה ("תור אישורים") — /api/library/edits?status=pending
  moderation: (ctx) => countAndOldest(BookEdit, { status: 'pending' }, 'createdAt', ctx),

  // תיקוני טקסט — הלשונית "פנויים ובטיפולי" (ברירת המחדל), בלי מה שכבר בידיים של מישהו
  corrections: (ctx) => countAndOldest(ErrorReport, queuedFilter(ctx.now), 'createdAt', ctx),

  // צורת הדף — ברירות המחדל של הלשוניות (SubmissionsSection 'submitted', DisputesSection 'disputed',
  // ReportsSection 'new'), באותו תנאי כמו src/lib/tzuratHadaf/admin.js
  'tzurat-submissions': (ctx) => countAndOldest(TzuratSubmission, { status: 'submitted' }, 'createdAt', ctx),
  'tzurat-disputes': (ctx) => countAndOldest(TzuratItem, { practice: { $ne: true }, status: 'disputed' }, null, ctx),
  'tzurat-reports': (ctx) => countAndOldest(TzuratReport, { status: 'new' }, 'createdAt', ctx),

  // פרטי ספרים — שתי הרשימות שהמסך מציג כדורשות פעולה: בקשות GitHub פתוחות (הלשונית "פתוחות")
  // והצעות ישנות שעוד לא הועברו ל-PR (הלשונית "הצעות ישנות" — /api/admin/book-info/pending, שמדלג על
  // הצעה שהספר שלה נמחק). components/admin/bookInfo
  'book-info': async (ctx) => {
    const [rows, [legacy]] = await Promise.all([
      BookInfoChangeSet.aggregate([
        { $match: { status: { $in: BOOK_INFO_WAITING_STATUSES } } },
        { $group: { _id: '$status', count: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
      ], options(ctx)),
      BookInfoPendingChange.aggregate([
        { $lookup: { from: BookInfo.collection.name, localField: 'bookInfo', foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as: 'book' } },
        { $match: { 'book.0': { $exists: true } } },
        { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
      ], options(ctx)),
    ])
    const open = rows.reduce((n, r) => n + r.count, 0)
    const conflict = rows.find((r) => r._id === 'conflict')?.count ?? 0
    return {
      count: open + (legacy?.count ?? 0),
      oldest: earliest(...rows.map((r) => r.oldest), legacy?.oldest),
      parts: { conflict, legacy: legacy?.count ?? 0 },
    }
  },

  // בקשות גישה של מתנדבים — summaryCounts (requests)
  'proof-volunteers': (ctx) => countAndOldest(TrainingProofVolunteer, { status: 'pending' }, 'requestedAt', ctx),

  // הודעות / העלאות — המספר מהמונה של הסרגל (אותה ספירה, באותה בקשה), ורק הוותק נשאל כאן
  messages: async (ctx) => {
    const [counts, oldest] = await Promise.all([ctx.badgeCounts(), oldestDate(Message, ADMIN_BADGE_FILTERS.unreadMessages, 'createdAt', ctx)])
    return { count: counts.unreadMessages, oldest }
  },
  uploads: async (ctx) => {
    const [counts, oldest] = await Promise.all([ctx.badgeCounts(), oldestDate(Upload, ADMIN_BADGE_FILTERS.pendingUploads, 'createdAt', ctx)])
    return { count: counts.pendingUploads, oldest }
  },

  // מילון — מילים במילון האישי של משתמשים שעוד לא דולגו (כמו /api/admin/dictionary + הסינון בעמוד).
  // סופרים מהצד הקטן: כל המילים (בלי ריקות, כמו filter(Boolean) ב-API) פחות הדילוגים שהמילה שלהם
  // עדיין במילון של אותו משתמש. מדויק כי לדילוג יש אינדקס ייחודי { userId, word }.
  dictionary: async (ctx) => {
    const [[words], [skipped]] = await Promise.all([
      User.aggregate([
        { $match: { 'spellWords.0': { $exists: true } } },
        { $group: { _id: null, count: { $sum: { $size: { $filter: { input: '$spellWords', cond: { $and: [{ $ne: ['$$this', null] }, { $ne: ['$$this', ''] }] } } } } } } },
      ], options(ctx)),
      SpellWordSkip.aggregate([
        { $match: { word: { $nin: [null, ''] } } },
        {
          $lookup: {
            from: User.collection.name,
            let: { u: '$userId', w: '$word' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$_id', '$$u'] }, { $in: ['$$w', { $ifNull: ['$spellWords', []] }] }] } } },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: 'owner',
          },
        },
        { $match: { 'owner.0': { $exists: true } } },
        { $count: 'count' },
      ], options(ctx)),
    ])
    return { count: Math.max(0, (words?.count ?? 0) - (skipped?.count ?? 0)) }
  },
}

/** הבטחה שנדחית כשהמועד עובר (רשת ביטחון מעל maxTimeMS — למשל המתנה לחיבור פנוי ב-pool) */
function beforeDeadline(promise, deadline) {
  let timer
  const ms = Math.max(0, deadline - Date.now())
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`admin dashboard: over budget (${DASHBOARD_BUDGET_MS}ms)`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** התקרה לשאילתה: לא יותר מ-QUERY_MAX_TIME_MS, ולא יותר ממה שנשאר מהתקציב */
const maxTimeFor = (deadline) => Math.max(100, Math.min(QUERY_MAX_TIME_MS, deadline - Date.now()))

/**
 * כל המקומות שהתפקיד רואה, במקביל. מחזיר { [queueId]: QueueResult }.
 * זורק רק כשאין חיבור ל-DB בתוך התקציב — ואז הדשבורד מציג הודעה אחת ("לא הצלחנו לטעון").
 * @param {string} role
 * @param {{ features?: { servicePlugins?: boolean }, now?: Date }} [options]
 */
export async function loadDashboardQueues(role, { features = {}, now = new Date() } = {}) {
  const queues = visibleQueues(role, features)
  if (queues.length === 0) return {}
  const deadline = Date.now() + DASHBOARD_BUDGET_MS
  await beforeDeadline(connectDB(), deadline)

  const ctx = { now, maxTimeMS: maxTimeFor(deadline), badgeCounts: () => getRequestAdminBadgeCounts(role) }
  const entries = await Promise.all(
    queues.map(async (queue) => {
      const loader = QUEUE_LOADERS[queue.id]
      if (!loader) return [queue.id, { status: 'error' }]
      try {
        const result = await beforeDeadline(loader(ctx), deadline)
        return [queue.id, { status: 'ok', ...result }]
      } catch (error) {
        console.error(`admin dashboard: "${queue.id}" failed`, error)
        return [queue.id, { status: 'error' }]
      }
    })
  )
  return Object.fromEntries(entries)
}

/**
 * המספרים הכלליים ("מצב כללי") — רק מה שהתפקיד רואה. אותו תקציב זמן כמו המקומות; חריגה → זורק,
 * והאזור מציג "לא הצלחנו לטעון" עם "נסה שוב".
 * @param {string} role
 * @param {{ now?: Date }} [options]
 */
export async function loadGeneralStats(role, { now = new Date() } = {}) {
  const scope = generalStatsScope(role)
  if (!scope.books) return {}
  const deadline = Date.now() + DASHBOARD_BUDGET_MS
  await beforeDeadline(connectDB(), deadline)
  const opts = { maxTimeMS: maxTimeFor(deadline) }
  const [bookRows, totalPages, completedPages, inProgressPages, users, appReportsWeek] = await beforeDeadline(Promise.all([
    Book.aggregate([{ $group: { _id: null, books: { $sum: 1 }, hidden: { $sum: { $cond: [{ $eq: ['$isHidden', true] }, 1, 0] } } } }], opts),
    Page.estimatedDocumentCount(opts),
    Page.countDocuments({ status: 'completed' }, opts),
    Page.countDocuments({ status: 'in-progress' }, opts),
    scope.users ? User.estimatedDocumentCount(opts) : undefined,
    scope.appReports ? AppReport.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 7 * DAY) } }, opts) : undefined,
  ]), deadline)
  const [bookRow] = bookRows
  return { books: bookRow?.books ?? 0, hiddenBooks: bookRow?.hidden ?? 0, totalPages, completedPages, inProgressPages, users, appReportsWeek }
}

/** המקומות שיש להם טוען — הטסט מוודא שאין מקום בדשבורד בלי מקור נתון */
export const DASHBOARD_LOADER_IDS = Object.freeze(Object.keys(QUEUE_LOADERS))
