// דיווחים על עמודים — לוגיקת השרת (DB): שליחת דיווח, "הדיווחים שלי", רשימת הניהול והכרעה (כולל החלה על
// טקסט העמוד). imports יחסיים (נבדק ב-node:test מול Mongo בזיכרון — server.int.test.mjs).
// תוצאות: { ok: true, ... } או { ok: false, status, error } — הראוטים רק מתרגמים ל-HTTP.
//
// עדכונים: על PageReport ועל Page — רק עדכונים מותנים (findOneAndUpdate), אף פעם לא doc.save():
//   - העמוד משתנה רק אם הטקסט בשדה עדיין זהה למה שנקרא, ורק כשהוא לא בטיפול (השמירה האוטומטית תדרוס).
//   - הדיווח מתעדכן רק אם הסטטוס, ההחלה ו-updatedAt עדיין כמו שנקראו (שני מנהלים במקביל — אחד מנצח, השני מקבל 409).
//   - סדר: קודם העמוד, אחר כך הדיווח. אם הדיווח נכשל אחרי שהעמוד השתנה — מחזירים את הטקסט (מותנה).
import mongoose from 'mongoose'
import PageReport from '../../models/PageReport.js'
import Page from '../../models/Page.js'
import Book from '../../models/Book.js'
import { hasBooksAccess, hasBookLibraryAccess } from '../roles.js'
import { canViewPageContent } from '../pageEditAccess.js'
import {
  normalizeReportInput, normalizeDecision, statusAfter, canApplyToPage, resolveMarker, pageFieldForColumn,
  currentMarker, finalTexts, markerNeedsUpdate,
  APPLY_BLOCKED_MESSAGE, REPORT_KINDS,
} from './rules.js'
import {
  adminReportShape, myReportShape, parseAdminListQuery, countsFromRows, applyModeFor, REPORTS_PER_HOUR, MY_REPORTS_LIMIT,
} from './shapes.js'

const HOUR = 60 * 60 * 1000
const PAGE_TEXT_FIELDS = 'status imagePath content rightColumn leftColumn claimedBy'

export const BOOK_ERROR_FORBIDDEN = 'רק מי שתפס את העמוד יכול לדווח על טעות בספר'
export const RATE_LIMIT_MESSAGE = 'שלחת הרבה דיווחים בשעה האחרונה. אפשר לנסות שוב מאוחר יותר.'
export const TEXT_CHANGED_MESSAGE = 'הטקסט השתנה בינתיים, נסו שוב'
export const REPORT_CHANGED_MESSAGE = 'הדיווח עודכן בינתיים על ידי מנהל אחר. רעננו ונסו שוב.'

const fail = (status, error) => ({ ok: false, status, error })
const userIdOf = (user) => user?._id || user?.id || null
const isObjectId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v)

/** הספר לפי slug או name (כמו api/page-content). bookPath יכול להגיע מקודד */
async function findBook(bookPath) {
  let decoded = bookPath
  try { decoded = decodeURIComponent(bookPath) } catch { /* נשאר כמו שהוא */ }
  return Book.findOne({ $or: [{ slug: decoded }, { name: decoded }] }).lean()
}

/** ספר מוסתר/פרטי — רק מנהל ספרייה או הבעלים (כמו GET /api/page-content) */
function canSeeBook(book, user) {
  if (!book.isHidden && !book.isPrivate) return true
  if (hasBookLibraryAccess(user)) return true
  return book.ownerId != null && String(book.ownerId) === String(userIdOf(user))
}

async function findBookAndPage(bookPath, pageNumber, user) {
  const book = await findBook(bookPath)
  if (!book) return fail(404, 'הספר לא נמצא')
  if (!canSeeBook(book, user)) return fail(403, 'אין הרשאות לצפייה בספר זה')
  const page = await Page.findOne({ book: book._id, pageNumber }).select(PAGE_TEXT_FIELDS).lean()
  if (!page) return fail(404, 'העמוד לא נמצא')
  return { ok: true, book, page }
}

/**
 * מתנדב שולח דיווח.
 * @param {{_id?: any, id?: any, role?: string, roles?: string[], name?: string}} user session.user
 * @param {object} raw גוף הבקשה
 */
export async function createPageReport(user, raw, { now = new Date() } = {}) {
  const userId = userIdOf(user)
  if (!userId) return fail(401, 'יש להתחבר כדי לשלוח דיווח')
  const input = normalizeReportInput(raw)
  if (!input.ok) return fail(400, input.error)
  const v = input.value

  const found = await findBookAndPage(v.bookPath, v.pageNumber, user)
  if (!found.ok) return found
  const { book, page } = found

  if (v.kind === 'book_error') {
    // הדיווח משנה את טקסט העמוד (הסימון) — רק מי שתפס את העמוד, או מנהל ספרים
    const isOwner = page.claimedBy != null && String(page.claimedBy) === String(userId)
    if (!isOwner && !hasBooksAccess(user)) return fail(403, BOOK_ERROR_FORBIDDEN)
  } else {
    const view = canViewPageContent(page, user)
    if (!view.ok) return fail(403, view.error)
  }

  // מגבלת קצב (משותפת לטעויות ולהודעות) — למתנדבים בלבד; מנהלים ומנהלי ספרים פטורים
  if (!hasBooksAccess(user)) {
    const recent = await PageReport.countDocuments({ user: userId, createdAt: { $gte: new Date(now.getTime() - HOUR) } })
    if (recent >= REPORTS_PER_HOUR) return fail(429, RATE_LIMIT_MESSAGE)
  }

  const doc = await PageReport.create({
    ...v,
    book: book._id,
    bookPath: book.slug || book.name,
    bookName: book.name || '',
    page: page._id,
    user: userId,
    userName: user?.name || '',
  })
  return { ok: true, report: { _id: String(doc._id), kind: doc.kind, status: doc.status, createdAt: doc.createdAt } }
}

/** הדיווחים של המשתמש עצמו על עמוד אחד (חדש → ישן) */
export async function listMyPageReports(user, bookPath, pageNumberRaw) {
  const userId = userIdOf(user)
  if (!userId) return fail(401, 'יש להתחבר')
  const pageNumber = Number(pageNumberRaw)
  if (!bookPath || !Number.isSafeInteger(pageNumber) || pageNumber < 1) return fail(400, 'חסר ספר או מספר עמוד')
  const book = await findBook(String(bookPath))
  if (!book) return fail(404, 'הספר לא נמצא')
  const page = await Page.findOne({ book: book._id, pageNumber }).select('_id').lean()
  if (!page) return fail(404, 'העמוד לא נמצא')
  const rows = await PageReport.find({ user: userId, page: page._id }).sort({ createdAt: -1 }).limit(MY_REPORTS_LIMIT).lean()
  return { ok: true, reports: rows.map(myReportShape) }
}

async function pagesById(ids) {
  if (ids.length === 0) return new Map()
  const pages = await Page.find({ _id: { $in: ids } }).select(PAGE_TEXT_FIELDS).lean()
  return new Map(pages.map((p) => [String(p._id), p]))
}

/** רשימת הניהול */
export async function listAdminPageReports(params) {
  const parsed = parseAdminListQuery(params)
  if (!parsed.ok) return fail(400, parsed.error)
  const { kind, status, book, page, skip, limit } = parsed.value

  const scope = {}
  if (book) {
    const bookDoc = await findBook(book)
    if (!bookDoc) {
      return { ok: true, reports: [], counts: countsFromRows([]), total: 0, hasMore: false }
    }
    scope.book = bookDoc._id
  }
  if (page !== null) scope.pageNumber = page

  const filter = { ...scope, kind }
  if (status !== 'all') filter.status = status

  const [rows, total, countRows] = await Promise.all([
    PageReport.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PageReport.countDocuments(filter),
    PageReport.aggregate([
      { $match: { ...scope, kind: { $in: [...REPORT_KINDS] } } },
      { $group: { _id: { kind: '$kind', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ])
  const pages = await pagesById([...new Set(rows.map((r) => String(r.page)))])
  return {
    ok: true,
    reports: rows.map((r) => adminReportShape(r, pages.get(String(r.page)) || null)),
    counts: countsFromRows(countRows),
    total,
    hasMore: skip + rows.length < total,
  }
}

/** האם הפעולה מותרת במצב הנוכחי של הדיווח (null = מותר) */
function actionConflict(report, action) {
  const applied = Boolean(report.appliedToText)
  if (report.kind === 'message') {
    if (action === 'handled' && report.status !== 'pending') return 'ההודעה כבר סומנה כמטופלת'
    if (action === 'reopen' && report.status !== 'handled') return 'ההודעה כבר ממתינה לטיפול'
    return null
  }
  if (action === 'reopen') {
    if (applied) return 'אי אפשר להחזיר לטיפול דיווח שכבר הוחל על הטקסט'
    if (report.status === 'pending') return 'הדיווח כבר ממתין לטיפול'
    return null
  }
  if (action === 'apply') {
    if (applied) return 'הדיווח כבר הוחל על הטקסט'
    if (report.status !== 'approved' && report.status !== 'rejected') return 'יש להכריע בדיווח לפני שמחילים אותו על הטקסט'
    return null
  }
  // approve / reject — מותר גם לשנות הכרעה, כל עוד לא הוחלה על הטקסט
  if (applied) return 'הדיווח כבר הוחל על הטקסט — אי אפשר לשנות את ההכרעה'
  return null
}

/**
 * הכרעת מנהל בדיווח.
 * @param {{_id?: any, id?: any, name?: string}} admin session.user (ההרשאה נבדקת בראוט)
 * @param {string} id
 * @param {object} raw { action, applyToText?, note?, original?, proposed?, applyMode? } — ראו normalizeDecision
 * @returns {Promise<{ ok: true, report: object, applyResult: 'applied'|'marker_updated'|'not_found'|null } | { ok: false, status: number, error: string }>}
 */
export async function decidePageReport(admin, id, raw, { now = new Date() } = {}) {
  if (!isObjectId(id)) return fail(404, 'הדיווח לא נמצא')
  const report = await PageReport.findById(id).lean()
  if (!report) return fail(404, 'הדיווח לא נמצא')
  const decision = normalizeDecision(raw, report.kind)
  if (!decision.ok) return fail(400, decision.error)
  const { action, applyToText, note, edit, applyMode } = decision.value

  const conflict = actionConflict(report, action)
  if (conflict) return fail(409, conflict)
  if (applyMode === 'marker' && report.status !== 'approved') return fail(409, 'אפשר לעדכן את הסימון רק בדיווח שאושר')

  const nextStatus = statusAfter(action, report.status)
  // הנוסח שהמנהל קבע (רק באישור). זהה לשל המדווח — מאפסים (אין "נוסח מנהל")
  let finalSet = null
  if (edit) {
    const changed = edit.original !== report.original || edit.proposed !== report.proposed
    finalSet = changed
      ? { finalOriginal: edit.original, finalProposed: edit.proposed, finalBy: userIdOf(admin), finalByName: admin?.name || '', finalAt: now }
      : { finalOriginal: null, finalProposed: null, finalBy: null, finalByName: '', finalAt: null }
  }
  const next = { ...report, ...(finalSet || {}) }
  const final = finalTexts(next)

  // מה כותבים בטקסט העמוד:
  //   applyToText — החלפת הסימון (בתיקון / בטקסט שבספר), או בהחלה מאוחרת 'marker' — סימון בנוסח שהוחלט. חובה: עמוד
  //   בעריכה → 409.
  //   אישור בנוסח שונה מהסימון שבטקסט ("השאר בסוגריים") — עדכון הסימון לנוסח החדש, כשאפשר; עמוד בעריכה — ההכרעה
  //   נשמרת, והסימון מתעדכן אחר כך ("עדכן את הסימון בטקסט", markerStale).
  let mode = null
  let required = false
  if (applyToText) {
    mode = applyMode === 'marker' ? 'marker' : applyModeFor(nextStatus)
    required = true
  } else if (action === 'approve' && markerNeedsUpdate(next)) {
    mode = 'marker'
  }

  let applyResult = null
  let pageWrite = null // { field, before, after } — לשחזור אם עדכון הדיווח נכשל
  let page = null
  if (mode) {
    page = await Page.findById(report.page).select(PAGE_TEXT_FIELDS).lean()
    if (page && !canApplyToPage(page.status)) {
      if (required) return fail(409, APPLY_BLOCKED_MESSAGE)
      mode = null
    }
  }

  if (mode) {
    const field = pageFieldForColumn(report.column)
    const before = page ? (page[field] ?? '') : ''
    const marker = { ...currentMarker(report), offset: report.offset ?? null }
    const resolved = page ? resolveMarker(before, marker, mode, final) : { found: false }
    if (!resolved.found) {
      // apply מאוחר בלי סימון — אין מה לעשות, ולא משנים כלום
      if (action === 'apply') return { ok: true, report: adminReportShape(report, page), applyResult: 'not_found' }
      if (required) applyResult = 'not_found'
    } else {
      const updated = await Page.findOneAndUpdate(
        { _id: page._id, [field]: before, status: { $ne: 'in-progress' } },
        { $set: { [field]: resolved.text } },
        { returnDocument: 'after', projection: { _id: 1 } }
      )
      if (!updated) {
        // ייתכן שהעמוד נתפס בינתיים — אז ההודעה המדויקת היא חסימת ההחלה
        const fresh = await Page.findById(page._id).select('status').lean()
        return fail(409, fresh && !canApplyToPage(fresh.status) ? APPLY_BLOCKED_MESSAGE : TEXT_CHANGED_MESSAGE)
      }
      applyResult = mode === 'marker' ? 'marker_updated' : 'applied'
      pageWrite = { id: page._id, field, before, after: resolved.text }
    }
  }

  const set = { status: nextStatus, ...(finalSet || {}) }
  if (action !== 'apply') {
    set.resolution = action === 'reopen'
      ? null
      : { note, by: userIdOf(admin), byName: admin?.name || '', at: now }
  }
  if (applyResult === 'applied') {
    set.appliedToText = applyModeFor(nextStatus)
    set.appliedAt = now
  }
  if (applyResult === 'marker_updated') {
    const same = final.original === report.original && final.proposed === report.proposed
    set.markerOriginal = same ? null : final.original
    set.markerProposed = same ? null : final.proposed
  }

  const saved = await PageReport.findOneAndUpdate(
    // updatedAt — גם שני אישורים מקבילים (approved → approved בנוסחים שונים) לא דורסים זה את זה
    { _id: report._id, status: report.status, appliedToText: report.appliedToText ?? null, updatedAt: report.updatedAt },
    { $set: set },
    { returnDocument: 'after' }
  ).lean()
  if (!saved) {
    if (pageWrite) {
      // מנהל אחר הקדים — מחזירים את הטקסט, רק אם אף אחד לא נגע בו מאז
      await Page.updateOne({ _id: pageWrite.id, [pageWrite.field]: pageWrite.after }, { $set: { [pageWrite.field]: pageWrite.before } })
    }
    return fail(409, REPORT_CHANGED_MESSAGE)
  }

  const savedPage = await Page.findById(saved.page).select(PAGE_TEXT_FIELDS).lean()
  return { ok: true, report: adminReportShape(saved, savedPage), applyResult }
}
