/**
 * בדיקות אינטגרציה לדיווחים על עמודים (server.js) מול MongoDB אמיתי: יצירה והרשאות, מגבלת קצב,
 * "הדיווחים שלי", רשימת הניהול, הכרעה עם החלה ובלי, חסימה בעמוד בטיפול, סימון שלא נמצא, reopen
 * והחלה מאוחרת. הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import User from '../../models/User.js'
import Book from '../../models/Book.js'
import Page from '../../models/Page.js'
import PageReport from '../../models/PageReport.js'
import { startMongo } from '../corrections/testing/mongo.js'
import { buildErrorMarker, APPLY_BLOCKED_MESSAGE } from './rules.js'
import { REPORTS_PER_HOUR } from './shapes.js'
import {
  createPageReport, listMyPageReports, listAdminPageReports, decidePageReport,
  BOOK_ERROR_FORBIDDEN, TEXT_CHANGED_MESSAGE, REPORT_CHANGED_MESSAGE,
} from './server.js'

let db
before(async () => {
  db = await startMongo()
})
after(async () => {
  if (!db.skip) await db.stop()
})

const MARK = buildErrorMarker('שלמם', 'שלום')
let claimer, other, admin, book, page
const who = (u, role = 'user') => ({ _id: String(u._id), name: u.name, role })

beforeEach(async () => {
  if (db.skip) return
  await db.reset()
  ;[claimer, other, admin] = await User.create([
    { name: 'מעתיק', email: 'c@x.test', isVerified: true },
    { name: 'אחר', email: 'o@x.test', isVerified: true },
    { name: 'מנהל', email: 'a@x.test', isVerified: true },
  ])
  book = await Book.create({ name: 'ספר בדיקה', slug: 'sefer-test' })
  page = await Page.create({
    book: book._id, pageNumber: 3, imagePath: '/uploads/books/sefer-test/page.3.jpg',
    status: 'completed', claimedBy: claimer._id, content: `אמר ${MARK} עליכם`,
  })
})

const errorBody = (extra = {}) => ({
  kind: 'book_error', bookPath: 'sefer-test', pageNumber: 3, original: 'שלמם', proposed: 'שלום',
  offset: 4, contextBefore: 'אמר ', contextAfter: ' עליכם', message: 'טעות דפוס', ...extra,
})
const messageBody = (extra = {}) => ({ kind: 'message', bookPath: 'sefer-test', pageNumber: 3, message: 'העמוד חתוך', ...extra })

async function newError(extra) {
  const r = await createPageReport(who(claimer), errorBody(extra))
  assert.equal(r.ok, true, r.error)
  return r.report._id
}

test('יצירה: מי שתפס יוצר טעות בספר; הספר נמצא גם לפי השם; השדות נשמרים', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const r = await createPageReport(who(claimer), errorBody({ bookPath: 'ספר בדיקה' }))
  assert.equal(r.ok, true)
  assert.equal(r.report.kind, 'book_error')
  assert.equal(r.report.status, 'pending')
  const saved = await PageReport.findById(r.report._id).lean()
  assert.equal(saved.bookPath, 'sefer-test')
  assert.equal(saved.bookName, 'ספר בדיקה')
  assert.equal(String(saved.page), String(page._id))
  assert.equal(saved.userName, 'מעתיק')
  assert.equal(saved.offset, 4)
})

test('הרשאות: טעות בספר — לא מי שתפס נחסם, מנהל ספרים מורשה, admin_books_only לא', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const denied = await createPageReport(who(other), errorBody())
  assert.deepEqual(denied, { ok: false, status: 403, error: BOOK_ERROR_FORBIDDEN })
  assert.equal((await createPageReport(who(admin, 'admin_books'), errorBody())).ok, true)
  assert.equal((await createPageReport(who(admin, 'admin_books_only'), errorBody())).status, 403)
  // עמוד פנוי בלי תופס — גם אז רק מנהל
  await Page.updateOne({ _id: page._id }, { $set: { status: 'available' }, $unset: { claimedBy: 1 } })
  assert.equal((await createPageReport(who(other), errorBody())).status, 403)
})

test('הרשאות: הודעה — כל מי שרואה את העמוד', async (t) => {
  if (db.skip) return t.skip(db.skip)
  // עמוד גמור של מישהו אחר — אחר לא רואה אותו
  assert.equal((await createPageReport(who(other), messageBody())).status, 403)
  assert.equal((await createPageReport(who(claimer), messageBody())).ok, true)
  await Page.updateOne({ _id: page._id }, { $set: { status: 'available' } })
  assert.equal((await createPageReport(who(other), messageBody())).ok, true)
})

test('יצירה: קלט לא תקין, ספר/עמוד חסר, ספר מוסתר', async (t) => {
  if (db.skip) return t.skip(db.skip)
  assert.equal((await createPageReport(who(claimer), errorBody({ proposed: 'שלמם' }))).status, 400)
  assert.equal((await createPageReport(who(claimer), messageBody({ message: '  ' }))).status, 400)
  assert.equal((await createPageReport(who(claimer), errorBody({ bookPath: 'אין-כזה' }))).status, 404)
  assert.equal((await createPageReport(who(claimer), errorBody({ pageNumber: 99 }))).status, 404)
  await Book.updateOne({ _id: book._id }, { $set: { isHidden: true } })
  assert.equal((await createPageReport(who(claimer), errorBody())).status, 403)
  assert.equal((await createPageReport(who(admin, 'admin'), errorBody())).ok, true)
})

test('מגבלת קצב: עד 30 בשעה, אחר כך 429; דיווחים ישנים לא נספרים', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const base = { kind: 'message', book: book._id, bookPath: 'sefer-test', page: page._id, pageNumber: 3, user: claimer._id, message: 'x' }
  await PageReport.insertMany(Array.from({ length: REPORTS_PER_HOUR }, () => ({ ...base })))
  assert.equal((await createPageReport(who(claimer), messageBody())).status, 429)
  await PageReport.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } })
  assert.equal((await createPageReport(who(claimer), messageBody())).ok, true)
})

test('מגבלת קצב: מנהל ומנהל ספרים פטורים, אבל מתנדב באותו מצב נחסם', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const base = { kind: 'message', book: book._id, bookPath: 'sefer-test', page: page._id, pageNumber: 3, message: 'x' }
  await PageReport.insertMany(Array.from({ length: REPORTS_PER_HOUR }, () => ({ ...base, user: claimer._id })))
  assert.equal((await createPageReport(who(claimer, 'admin'), messageBody())).ok, true)
  assert.equal((await createPageReport(who(claimer, 'admin_books'), errorBody())).ok, true)
  assert.equal((await createPageReport(who(claimer), messageBody())).status, 429)
})

test('הדיווחים שלי: רק של המשתמש, על העמוד, חדש → ישן, עם הערת המנהל', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const first = await newError()
  await createPageReport(who(claimer), messageBody())
  await Page.updateOne({ _id: page._id }, { $set: { status: 'available' } })
  await createPageReport(who(other), messageBody())
  await decidePageReport(who(admin, 'admin'), first, { action: 'approve', note: 'תודה' })
  const mine = await listMyPageReports(who(claimer), 'sefer-test', '3')
  assert.equal(mine.ok, true)
  assert.deepEqual(mine.reports.map((r) => r.kind), ['message', 'book_error'])
  assert.equal(mine.reports[1].status, 'approved')
  assert.equal(mine.reports[1].resolution.note, 'תודה')
  assert.equal('byName' in mine.reports[1].resolution, false)
  assert.equal((await listMyPageReports(who(claimer), 'sefer-test', 'x')).status, 400)
})

test('רשימת ניהול: סינון, ספירות, צילום, סימון קיים ו-canApply', async (t) => {
  if (db.skip) return t.skip(db.skip)
  await newError()
  await createPageReport(who(claimer), messageBody())
  const list = await listAdminPageReports(new URLSearchParams())
  assert.equal(list.ok, true)
  assert.equal(list.total, 1)
  assert.equal(list.hasMore, false)
  const [r] = list.reports
  assert.equal(r.kind, 'book_error')
  assert.equal(r.pageStatus, 'completed')
  assert.equal(r.imageUrl, '/uploads/books/sefer-test/page.3.jpg')
  assert.equal(r.markerPresent, true)
  assert.equal(r.canApply, true)
  assert.deepEqual(list.counts, { book_error: { pending: 1, approved: 0, rejected: 0 }, message: { pending: 1, handled: 0 } })
  const msgs = await listAdminPageReports(new URLSearchParams('kind=message&status=all'))
  assert.equal(msgs.reports.length, 1)
  assert.equal(msgs.reports[0].canApply, false)
  assert.equal((await listAdminPageReports(new URLSearchParams('book=nope'))).total, 0)
  assert.equal((await listAdminPageReports(new URLSearchParams('book=sefer-test&page=4'))).total, 0)
  assert.equal((await listAdminPageReports(new URLSearchParams('status=handled'))).status, 400)
  // עמוד בטיפול — אין canApply
  await Page.updateOne({ _id: page._id }, { $set: { status: 'in-progress' } })
  assert.equal((await listAdminPageReports(new URLSearchParams())).reports[0].canApply, false)
})

test('רשימת ניהול: דפדוף', async (t) => {
  if (db.skip) return t.skip(db.skip)
  for (let i = 0; i < 3; i++) await createPageReport(who(claimer), messageBody({ message: `m${i}` }))
  const p1 = await listAdminPageReports(new URLSearchParams('kind=message&limit=2'))
  assert.equal(p1.reports.length, 2)
  assert.equal(p1.hasMore, true)
  const p2 = await listAdminPageReports(new URLSearchParams('kind=message&limit=2&skip=2'))
  assert.equal(p2.reports.length, 1)
  assert.equal(p2.hasMore, false)
  assert.equal(p1.reports[0].message, 'm2')
})

test('הכרעה בלי החלה: הסימון נשאר בטקסט', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', note: 'נכון' })
  assert.equal(r.ok, true)
  assert.equal(r.applyResult, null)
  assert.equal(r.report.status, 'approved')
  assert.equal(r.report.resolution.byName, 'מנהל')
  assert.equal(r.report.appliedToText, null)
  assert.equal(r.report.canApply, true)
  assert.equal((await Page.findById(page._id).lean()).content, `אמר ${MARK} עליכם`)
})

test('אושר + הוחל → התיקון; נדחה + הוחל → המקור', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true })
  assert.equal(r.applyResult, 'applied')
  assert.equal(r.report.appliedToText, 'proposed')
  assert.ok(r.report.appliedAt)
  assert.equal(r.report.markerPresent, false)
  assert.equal(r.report.canApply, false)
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלום עליכם')

  await Page.updateOne({ _id: page._id }, { $set: { content: `אמר ${MARK} עליכם` } })
  const id2 = await newError()
  const r2 = await decidePageReport(who(admin, 'admin_books'), id2, { action: 'reject', applyToText: true })
  assert.equal(r2.report.status, 'rejected')
  assert.equal(r2.report.appliedToText, 'original')
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלמם עליכם')
})

test('החלה בטור ימני/שמאלי משנה את השדה הנכון', async (t) => {
  if (db.skip) return t.skip(db.skip)
  await Page.updateOne({ _id: page._id }, { $set: { isTwoColumns: true, rightColumn: `ימין ${MARK}`, leftColumn: 'שמאל' } })
  const id = await newError({ column: 'right', offset: 5 })
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true })
  assert.equal(r.applyResult, 'applied')
  const p = await Page.findById(page._id).lean()
  assert.equal(p.rightColumn, 'ימין שלום')
  assert.equal(p.content, `אמר ${MARK} עליכם`)
})

test('עמוד בטיפול: החלה נחסמת (409) בלי שום שינוי; הכרעה בלי החלה עוברת, ואחר כך apply מאוחר', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  await Page.updateOne({ _id: page._id }, { $set: { status: 'in-progress' } })
  const blocked = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true })
  assert.deepEqual(blocked, { ok: false, status: 409, error: APPLY_BLOCKED_MESSAGE })
  assert.equal((await PageReport.findById(id).lean()).status, 'pending')
  assert.equal((await Page.findById(page._id).lean()).content, `אמר ${MARK} עליכם`)

  const decided = await decidePageReport(who(admin, 'admin'), id, { action: 'approve' })
  assert.equal(decided.report.status, 'approved')
  assert.equal(decided.report.canApply, false)
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })).status, 409)

  await Page.updateOne({ _id: page._id }, { $set: { status: 'completed' } })
  const late = await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })
  assert.equal(late.ok, true)
  assert.equal(late.applyResult, 'applied')
  assert.equal(late.report.status, 'approved')
  assert.equal(late.report.appliedToText, 'proposed')
  assert.equal(late.report.resolution.byName, 'מנהל') // ההכרעה המקורית נשמרת
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלום עליכם')
  // פעם שנייה — כבר הוחל
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })).status, 409)
})

test('apply לפני הכרעה — 409', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })).status, 409)
})

test('הסימון לא נמצא: ההכרעה נשמרת, applyResult=not_found, הטקסט לא משתנה', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  await Page.updateOne({ _id: page._id }, { $set: { content: 'המעתיק מחק את הסימון' } })
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'reject', applyToText: true })
  assert.equal(r.ok, true)
  assert.equal(r.applyResult, 'not_found')
  assert.equal(r.report.status, 'rejected')
  assert.equal(r.report.appliedToText, null)
  assert.equal(r.report.markerPresent, false)
  assert.equal((await Page.findById(page._id).lean()).content, 'המעתיק מחק את הסימון')
  // apply מאוחר בלי סימון — not_found, בלי שינוי
  const late = await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })
  assert.equal(late.applyResult, 'not_found')
  assert.equal((await PageReport.findById(id).lean()).appliedToText, null)
})

test('reopen: מחזיר לממתין ומנקה את ההכרעה; אסור אחרי החלה', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  await decidePageReport(who(admin, 'admin'), id, { action: 'reject', note: 'לא' })
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'reopen' })
  assert.equal(r.report.status, 'pending')
  assert.equal(r.report.resolution, null)
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'reopen' })).status, 409)

  await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true })
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'reopen' })).status, 409)
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'reject' })).status, 409)
})

test('הודעה: handled ו-reopen; פעולות של טעות בספר נדחות', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const created = await createPageReport(who(claimer), messageBody())
  const id = created.report._id
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'approve' })).status, 400)
  const h = await decidePageReport(who(admin, 'admin'), id, { action: 'handled', note: 'טופל', applyToText: true })
  assert.equal(h.report.status, 'handled')
  assert.equal(h.applyResult, null)
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'handled' })).status, 409)
  const back = await decidePageReport(who(admin, 'admin'), id, { action: 'reopen' })
  assert.equal(back.report.status, 'pending')
})

test('הכרעה: מזהה לא תקין / לא קיים — 404', async (t) => {
  if (db.skip) return t.skip(db.skip)
  assert.equal((await decidePageReport(who(admin, 'admin'), 'abc', { action: 'approve' })).status, 404)
  assert.equal((await decidePageReport(who(admin, 'admin'), '0123456789abcdef01234567', { action: 'approve' })).status, 404)
})

test('הטקסט השתנה בין הקריאה לכתיבה — 409 בלי שינוי בדיווח', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  // מדמים כתיבה מקבילה: findOneAndUpdate הראשון על Page "מפספס" כי הטקסט שונה
  const orig = Page.findOneAndUpdate.bind(Page)
  Page.findOneAndUpdate = async function (...args) {
    await Page.collection.updateOne({ _id: page._id }, { $set: { content: `שינוי ${MARK}` } })
    Page.findOneAndUpdate = orig
    return orig(...args)
  }
  try {
    const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true })
    assert.deepEqual(r, { ok: false, status: 409, error: TEXT_CHANGED_MESSAGE })
  } finally {
    Page.findOneAndUpdate = orig
  }
  assert.equal((await PageReport.findById(id).lean()).status, 'pending')
  assert.equal((await Page.findById(page._id).lean()).content, `שינוי ${MARK}`)
})

test('נוסח המנהל: "השאר בסוגריים" מעדכן את הסימון לנוסח החדש, והנוסח של המדווח נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', original: 'שלמם', proposed: 'שלומם' })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.applyResult, 'marker_updated')
  assert.equal(r.report.proposed, 'שלום') // של המדווח — להיסטוריה
  assert.equal(r.report.finalProposed, 'שלומם')
  assert.equal(r.report.finalOriginal, 'שלמם')
  assert.equal(r.report.finalByName, 'מנהל')
  assert.equal(r.report.appliedToText, null)
  assert.equal(r.report.markerPresent, true)
  assert.equal(r.report.markerStale, false)
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר (שלמם)[שלומם] עליכם')
  // אחר כך "החל על הטקסט" — מוצא את הסימון החדש ומחליף בנוסח המנהל
  const late = await decidePageReport(who(admin, 'admin'), id, { action: 'apply' })
  assert.equal(late.applyResult, 'applied')
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלומם עליכם')
  // "הדיווחים שלי" — הנוסח שהוחלט
  const mine = await listMyPageReports(who(claimer), 'sefer-test', '3')
  assert.equal(mine.reports[0].finalProposed, 'שלומם')
})

test('נוסח המנהל: "החלף בתיקון" כותב את התיקון של המנהל', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', applyToText: true, original: 'שלמם', proposed: 'שלומות' })
  assert.equal(r.applyResult, 'applied')
  assert.equal(r.report.appliedToText, 'proposed')
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלומות עליכם')
})

test('נוסח המנהל, עמוד בטיפול: ההכרעה נשמרת, הסימון מתעדכן אחר כך (applyMode marker) או מוחלף בנוסח המנהל', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  await Page.updateOne({ _id: page._id }, { $set: { status: 'in-progress' } })
  const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', original: 'שלמם', proposed: 'שלומם' })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.applyResult, null)
  assert.equal(r.report.markerStale, true)
  assert.equal((await Page.findById(page._id).lean()).content, `אמר ${MARK} עליכם`)
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'apply', applyMode: 'marker' })).status, 409)

  await Page.updateOne({ _id: page._id }, { $set: { status: 'completed' } })
  const marker = await decidePageReport(who(admin, 'admin'), id, { action: 'apply', applyMode: 'marker' })
  assert.equal(marker.applyResult, 'marker_updated')
  assert.equal(marker.report.markerStale, false)
  assert.equal(marker.report.appliedToText, null)
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר (שלמם)[שלומם] עליכם')

  // דיווח שני, עמוד בטיפול בזמן ההכרעה — "החל על הטקסט" אחר כך מחליף את הסימון הישן בתיקון של המנהל
  await Page.updateOne({ _id: page._id }, { $set: { content: `אמר ${MARK} עליכם`, status: 'in-progress' } })
  const id2 = await newError()
  await decidePageReport(who(admin, 'admin'), id2, { action: 'approve', original: 'שלמם', proposed: 'שלומות' })
  await Page.updateOne({ _id: page._id }, { $set: { status: 'completed' } })
  const late = await decidePageReport(who(admin, 'admin'), id2, { action: 'apply' })
  assert.equal(late.applyResult, 'applied')
  assert.equal((await Page.findById(page._id).lean()).content, 'אמר שלומות עליכם')
})

test('נוסח המנהל: בדיקת קלט (סוגריים, זהה, חלקי) — 400 בלי שינוי; זהה לשל המדווח — בלי נוסח מנהל', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  for (const body of [
    { original: 'שלמם', proposed: 'של[ום' },
    { original: 'של(מם', proposed: 'שלום' },
    { original: 'אותו', proposed: 'אותו' },
    { proposed: 'שלום' },
  ]) {
    assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'approve', ...body })).status, 400)
  }
  assert.equal((await PageReport.findById(id).lean()).status, 'pending')
  const same = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', original: 'שלמם', proposed: 'שלום' })
  assert.equal(same.applyResult, null)
  assert.equal(same.report.finalProposed, null)
  assert.equal((await Page.findById(page._id).lean()).content, `אמר ${MARK} עליכם`)
})

test('שני אישורים מקבילים (approved → approved): השני מקבל 409 ולא דורס את הנוסח של הראשון', async (t) => {
  if (db.skip) return t.skip(db.skip)
  const id = await newError()
  assert.equal((await decidePageReport(who(admin, 'admin'), id, { action: 'approve' })).ok, true)
  // מדמים מנהל אחר שאישר בנוסח אחר בין הקריאה של הדיווח לכתיבה
  const orig = PageReport.findById.bind(PageReport)
  PageReport.findById = function (...args) {
    PageReport.findById = orig
    const q = orig(...args)
    const lean = q.lean.bind(q)
    q.lean = () => {
      const snapshot = lean()
      return snapshot.then(async (doc) => {
        await new Promise((r) => setTimeout(r, 5))
        await PageReport.collection.updateOne({ _id: doc._id }, { $set: { finalProposed: 'שלומות', updatedAt: new Date() } })
        return doc
      })
    }
    return q
  }
  try {
    const r = await decidePageReport(who(admin, 'admin'), id, { action: 'approve', original: 'שלמם', proposed: 'שלומים' })
    assert.deepEqual(r, { ok: false, status: 409, error: REPORT_CHANGED_MESSAGE })
  } finally {
    PageReport.findById = orig
  }
  assert.equal((await PageReport.findById(id).lean()).finalProposed, 'שלומות')
})
