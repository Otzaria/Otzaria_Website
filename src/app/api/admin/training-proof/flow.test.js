// @vitest-environment node
// מסכי הניהול של "הגהה לאימון המודלים" (docs/76 §8.3 סשן ד') — סבב מלא מול MongoDB אמיתי
// (mongodb-memory-server) ותיקיית-העלאות זמנית: העלאה במנות, העלאה חוזרת, השהיה, סימון
// מדומה של מתנדב, סקירה (בודד, מסומנות, גורף, "תקן ואשר", "החזר לממתינות", דחייה),
// הורדה ← הקובץ עובר את בדיקת החוזה ← המחיקה רק אחרי שהשרת סיים לשלוח ← יומן; מתנדבים,
// הוראות, והדף הישן. בלי הבינארי של Mongo — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// תיקיית-ההעלאות נקראת בטעינת lib/ocr/images — לכן לפני כל ה-import
const { getServerSessionMock, TMP } = vi.hoisted(() => {
  const dir = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/tp-admin-${process.pid}-${Date.now()}`
  process.env.UPLOAD_DIR = dir
  return { getServerSessionMock: vi.fn(), TMP: dir }
})
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import { zipSync, unzipSync, strFromU8 } from 'fflate'
import User from '@/models/User'
import TrainingProofItem from '@/models/TrainingProofItem'
import TrainingProofPackage from '@/models/TrainingProofPackage'
import TrainingProofVolunteer from '@/models/TrainingProofVolunteer'
import TrainingProofBook from '@/models/TrainingProofBook'
import TrainingProofExportLog from '@/models/TrainingProofExportLog'
import TrainingProofExportLock from '@/models/TrainingProofExportLock'
import TrainingProofCorrection from '@/models/TrainingProofCorrection'
import TrainingProofArchive from '@/models/TrainingProofArchive'
import PageProofBook from '@/models/PageProofBook'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { sampleEntries, ocrItem, routerItem } from '@/lib/trainingProof/testFixtures'
import { takeRound, markItem } from '@/lib/trainingProof/round'
import { checkReturnLine, checkReturnManifest, volId } from '@/lib/trainingProof/returnFile'
import { volunteerStats } from '@/lib/trainingProof/stats'
import { applyArchive } from '@/lib/trainingProof/stats'
import { deleteMatchingItems } from './_lib/files'
import { POST as uploadPOST } from './upload/route'
import { POST as stepPOST } from './upload/[token]/route'
import { GET as packagesGET } from './packages/route'
import { PATCH as packagePATCH, DELETE as packageDELETE } from './packages/[packageId]/[part]/route'
import { GET as reviewGET } from './review/route'
import { POST as decidePOST } from './review/decide/route'
import { POST as fixPOST } from './review/fix/route'
import { POST as bulkPOST } from './review/bulk/route'
import { GET as framesGET } from './review/frames/route'
import { GET as summaryGET } from './summary/route'
import { GET as imageGET } from './items/[id]/image/route'
import { GET as ctxGET } from './items/[id]/ctx/route'
import { GET as exportGET } from './export/route'
import { POST as exportPOST } from './export/[section]/route'
import { purges, purgeExported } from './_lib/exporter'
import { GET as volsGET, POST as volsPOST } from './volunteers/route'
import { POST as volPOST } from './volunteers/[userId]/route'
import { GET as guideGET, PUT as guidePUT } from './guide/route'
import { GET as correctionsGET } from './volunteers/[userId]/corrections/route'
import { trimCorrections } from '@/lib/trainingProof/corrections'
import { GET as legacyGET, POST as legacyPOST } from './legacy/route'

vi.setConfig({ testTimeout: 60000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  fs.rmSync(TMP, { recursive: true, force: true })
})

let admin, vol, other
const as = (u) =>
  getServerSessionMock.mockResolvedValue(
    u ? { user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user' } } : null
  )
const URL0 = 'http://localhost/api/admin/training-proof'
const jreq = (method, body, suffix = '') =>
  new Request(`${URL0}${suffix}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
const P = (o) => ({ params: Promise.resolve(o) })
const J = async (res) => ({ status: res.status, ...(await res.json()) })

function zipFile(entries, name = 'pkg.zip') {
  return new File([zipSync(entries)], name, { type: 'application/zip' })
}
async function upload(section, entries, name) {
  const fd = new FormData()
  fd.append('section', section)
  fd.append('file', zipFile(entries, name))
  return J(await uploadPOST(new Request(`${URL0}/upload`, { method: 'POST', body: fd })))
}
// כל המנות עד הסוף (כמו הדפדפן)
async function ingest(token) {
  let r
  let calls = 0
  do {
    r = await J(await stepPOST(new Request(`${URL0}/upload/${token}`, { method: 'POST' }), P({ token })))
    calls++
  } while (r.success && !r.finished && calls < 100)
  return { ...r, calls }
}
const review = async (qs) => J(await reviewGET(new Request(`${URL0}/review?${new URLSearchParams(qs)}`)))

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip(db.skip)
  await db.reset()
  vi.clearAllMocks()
  fs.rmSync(path.join(TMP, 'training-proof'), { recursive: true, force: true })
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', role: 'admin_ocr' })
  vol = await User.create({ name: 'רחל', email: 'v@example.org', password: 'x', isVerified: true })
  other = await User.create({ name: 'דוד', email: 'd@example.org', password: 'x', isVerified: true })
  await TrainingProofVolunteer.create({ userId: vol._id, status: 'approved', decidedAt: new Date() })
  as(admin)
})

describe('שער-הגישה', () => {
  it('בלי התחברות — 401; מגיה מאושר (לא מנהל) — 403; בלי מטמון', async () => {
    as(null)
    expect((await summaryGET()).status).toBe(401)
    as(vol)
    const res = await summaryGET()
    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    as(admin)
    expect((await summaryGET()).status).toBe(200)
  })
})

describe('העלאת חומר', () => {
  it('מחיקת קבצים מתבצעת רק למסמכים שנמחקו בפועל', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 2 }))
    await ingest(s.token)
    const docs = await TrainingProofItem.find().sort({ uid: 1 }).lean()
    await TrainingProofItem.updateOne({ _id: docs[0]._id }, { $set: { status: 'submitted' } })
    const r = await deleteMatchingItems(
      { _id: { $in: docs.map((d) => d._id) }, status: { $in: ['available', 'held'] } },
      { imagePath: 1, ctxPath: 1, book: 1, section: 1, packageId: 1, part: 1 }
    )
    expect(r.deleted).toHaveLength(1)
    expect(await TrainingProofItem.findById(docs[0]._id)).toBeTruthy()
    expect(fs.existsSync(path.join(TMP, docs[0].imagePath.replace('/uploads/', '')))).toBe(true)
    expect(fs.existsSync(path.join(TMP, docs[1].imagePath.replace('/uploads/', '')))).toBe(false)
  })

  it('קובץ של חלק אחר — הודעה ברורה ושום דבר לא נכתב', async () => {
    const r = await upload('router', sampleEntries('ocr', { n: 3 }))
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/שייך ל"זיהוי טקסט"/)
    expect(r.wrongSection).toBe('ocr')
    expect(await TrainingProofPackage.countDocuments()).toBe(0)
  })

  it('קליטה במנות, תמונות לדיסק, החבילה נפתחת רק בסוף; העלאה חוזרת לא משכפלת', async () => {
    const entries = sampleEntries('ocr', { n: 650, items: Array.from({ length: 650 }, (_, i) => ocrItem(i, i === 0 ? { ctx: { img: 'img/ctx-p17.jpg', bbox: [1, 1, 50, 20] } } : {})) })
    const s = await upload('ocr', entries, 'tp-ocr-1.zip')
    expect(s.success).toBe(true)
    expect(s.total).toBe(650)
    expect(s.read.byTrack).toMatchObject({ rashi: 163 })
    expect(s.existing).toBe(0)
    let pkg = await TrainingProofPackage.findOne().lean()
    expect(pkg.open).toBe(false)
    const r = await ingest(s.token)
    expect(r).toMatchObject({ finished: true, done: 650, inserted: 650 })
    expect(r.calls).toBe(3) // 300 + 300 + 50
    pkg = await TrainingProofPackage.findOne().lean()
    expect(pkg.open).toBe(true)
    expect(await TrainingProofItem.countDocuments({ status: 'available' })).toBe(650)
    const it0 = await TrainingProofItem.findOne({ uid: 'ocr:lines:22710' }).lean()
    expect(fs.existsSync(path.join(TMP, it0.imagePath.replace('/uploads/', '')))).toBe(true)
    expect(fs.existsSync(path.join(TMP, it0.ctxPath.replace('/uploads/', '')))).toBe(true)

    // מתנדב סימן שורה — העלאה חוזרת לא דורסת אותה
    await TrainingProofItem.updateOne({ _id: it0._id }, { $set: { status: 'submitted', result: { action: 'ok' }, vol: vol._id } })
    await TrainingProofPackage.updateOne({}, { $set: { open: false } })
    const again = await upload('ocr', entries, 'tp-ocr-1.zip')
    expect(again).toMatchObject({ existing: 650, proofed: 1, newPackage: false })
    const r2 = await ingest(again.token)
    expect(r2).toMatchObject({ finished: true, inserted: 0, skipped: 650 })
    expect(await TrainingProofItem.countDocuments()).toBe(650)
    expect((await TrainingProofItem.findById(it0._id).lean()).status).toBe('submitted')
    expect((await TrainingProofPackage.findOne().lean()).open).toBe(false) // מצב ההשהיה נשמר

    const list = await J(await packagesGET())
    expect(list.packages[0]).toMatchObject({ section: 'ocr', part: 1, open: false, counts: { total: 650, submitted: 1, available: 649 } })
  })

  it('השהה/פתח; מחיקה: מה שלא הוגה נמחק עם התמונות, מה שהוגה נשאר', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 4 }))
    await ingest(s.token)
    const key = P({ packageId: 'tp-20261027-1f3a9c2e', part: '1' })
    expect((await J(await packagePATCH(jreq('PATCH', { open: false }), key))).open).toBe(false)
    const one = await TrainingProofItem.findOne({ uid: 'ocr:lines:22711' })
    await TrainingProofItem.updateOne({ _id: one._id }, { $set: { status: 'approved', result: { action: 'ok' }, vol: vol._id } })
    const gone = await TrainingProofItem.findOne({ uid: 'ocr:lines:22710' }).lean()
    const d = await J(await packageDELETE(jreq('DELETE'), key))
    expect(d).toMatchObject({ deleted: 3, kept: 1, dropped: false })
    expect(fs.existsSync(path.join(TMP, gone.imagePath.replace('/uploads/', '')))).toBe(false)
    expect(await TrainingProofPackage.countDocuments()).toBe(1)
  })
})

// מתנדב לוקח סבב ומסמן — כמו הדף של המתנדב
async function volunteerMarks(section, marks) {
  const r = await takeRound(String(vol._id), section)
  const items = r.items
  for (let i = 0; i < marks.length && i < items.length; i++) {
    const m = await markItem(String(vol._id), items[i]._id, marks[i])
    expect(m.ok).toBe(true)
  }
  return items
}

describe('סקירה ואישור — זיהוי טקסט', () => {
  beforeEach(async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 6 }))
    await ingest(s.token)
  })

  it('רשימה ומסננים, אישור מהיר של "נכון", תקן-ואשר, דחייה, החזרה לממתינות', async () => {
    const items = await volunteerMarks('ocr', [
      { action: 'ok' },
      { action: 'ok' },
      { action: 'fixed', text: 'מילה אחרת לגמרי' },
      { action: 'seg' },
      { action: 'router' },
    ])
    let q = await review({ section: 'ocr' })
    expect(q.total).toBe(5)
    expect(q.stats).toMatchObject({ submitted: 5, okUnchanged: 2 })
    expect(q.stats.vols).toEqual([expect.objectContaining({ name: 'רחל', pending: 5, match: null })])
    expect(q.items[0]).toHaveProperty('text')
    expect(q.items[0].book).toBeUndefined()
    expect((await review({ section: 'ocr', action: 'fixed' })).total).toBe(1)

    // האישור הגורף — קודם ספירה (לחלון-האישור), ואז על כל התור
    const dry = await J(await bulkPOST(jreq('POST', { section: 'ocr', kind: 'ok-unchanged', dry: true })))
    expect(dry.count).toBe(2)
    expect(await TrainingProofItem.countDocuments({ status: 'approved' })).toBe(0)
    expect((await J(await bulkPOST(jreq('POST', { section: 'ocr', kind: 'ok-unchanged' })))).count).toBe(2)

    // תקן ואשר: המנהל מתקן את התיקון של המתנדב
    const fixedId = String(items[2]._id)
    const f = await J(await fixPOST(jreq('POST', { id: fixedId, mark: { action: 'fixed', text: 'מילה  אחרת  נכונה ' } })))
    expect(f).toMatchObject({ success: true, fixed: true })
    let doc = await TrainingProofItem.findById(fixedId).lean()
    expect(doc).toMatchObject({ status: 'approved', adminFixed: true, result: { action: 'fixed', text: 'מילה אחרת נכונה' }, volResult: { action: 'fixed', text: 'מילה אחרת לגמרי' } })
    // החזר לממתינות — התיקון של המנהל מתבטל
    await decidePOST(jreq('POST', { section: 'ocr', ids: [fixedId], decision: 'unapprove' }))
    doc = await TrainingProofItem.findById(fixedId).lean()
    expect(doc).toMatchObject({ status: 'submitted', adminFixed: false, result: { action: 'fixed', text: 'מילה אחרת לגמרי' } })
    // תיקון זהה למה שהמתנדב סימן = אישור רגיל
    expect((await J(await fixPOST(jreq('POST', { id: fixedId, mark: { action: 'fixed', text: 'מילה אחרת לגמרי' } })))).fixed).toBe(false)

    // דחייה: חוזר למאגר, המתנדב לא יקבל שוב
    const segId = String(items[3]._id)
    expect((await J(await decidePOST(jreq('POST', { section: 'ocr', ids: [segId], decision: 'reject' })))).count).toBe(1)
    doc = await TrainingProofItem.findById(segId).lean()
    expect(doc).toMatchObject({ status: 'available', result: null, vol: null })
    expect(doc.notFor.map(String)).toContain(String(vol._id))
    expect(doc.rejectedFor.map(String)).toContain(String(vol._id))

    // סימון מסומנות: אישור של מה שכבר אושר לא נספר פעמיים
    const rest = await J(await decidePOST(jreq('POST', { section: 'ocr', ids: [String(items[4]._id), String(items[0]._id)], decision: 'approve' })))
    expect(rest).toMatchObject({ count: 1, asked: 2 })
    q = await review({ section: 'ocr' })
    expect(q.total).toBe(0)
    expect((await review({ section: 'ocr', status: 'approved' })).total).toBe(4)
  })

  it('"הכול ממתנדב" — רק הממתינות שלו', async () => {
    await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'bad' }])
    const r = await J(await bulkPOST(jreq('POST', { section: 'ocr', kind: 'volunteer', vol: String(vol._id) })))
    expect(r.count).toBe(2)
    expect((await J(await bulkPOST(jreq('POST', { section: 'ocr', kind: 'nope' })))).status).toBe(400)
  })

  it('תמונה למנהל — לכל פריט; למתנדב — לא בנתיב הזה', async () => {
    const it0 = await TrainingProofItem.findOne().lean()
    const res = await imageGET(new Request(`${URL0}/items/${it0._id}/image`), P({ id: String(it0._id) }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    as(vol)
    expect((await imageGET(new Request('http://x'), P({ id: String(it0._id) }))).status).toBe(403)
  })
})

describe('סקירה — נתב הכתב', () => {
  it('"מה שהמתנדב הסכים בו עם הנתב", ותיקון כתב-מילה בשורה מעורבת', async () => {
    const items = Array.from({ length: 4 }, (_, i) => routerItem(i))
    const s = await upload('router', sampleEntries('router', { items }))
    await ingest(s.token)
    const round = await takeRound(String(vol._id), 'router')
    const byUid = new Map(round.items.map((d) => [d.uid, d]))
    const mixed = byUid.get('router:rlines:779') // pred=mixed, בלי מילים
    const m0 = byUid.get('router:rlines:777') // pred=square, עם מילים
    await markItem(String(vol._id), m0._id, { label: 'square' }) // הסכים
    await markItem(String(vol._id), byUid.get('router:rlines:778')._id, { label: 'square' }) // pred=rashi — לא הסכים
    const words = routerItem(0).words.map((w) => ({ k: w.k, box: w.box, label: 'square' }))
    await markItem(String(vol._id), byUid.get('router:rlines:780')._id, { label: 'mixed', words }) // pred=latin
    expect(mixed).toBeTruthy()

    const q = await review({ section: 'router' })
    expect(q.stats.agree).toBe(1)
    expect((await review({ section: 'router', agree: '1' })).total).toBe(1)
    expect((await review({ section: 'router', agree: '0' })).total).toBe(2)

    // תיקון לפני אישור: מילה אחת ברש"י
    const mixedSub = await TrainingProofItem.findOne({ uid: 'router:rlines:780' }).lean()
    const fixed = words.map((w) => (w.k === 2 ? { ...w, label: 'rashi' } : w))
    const f = await J(await fixPOST(jreq('POST', { id: String(mixedSub._id), mark: { label: 'mixed', words: fixed } })))
    expect(f.fixed).toBe(true)
    expect(f.item.result.words.find((w) => w.k === 2).label).toBe('rashi')
    expect(f.item.result.words_src).toBe('station')

    const b = await J(await bulkPOST(jreq('POST', { section: 'router', kind: 'router-agree' })))
    expect(b.count).toBe(1)
    expect(await TrainingProofItem.countDocuments({ section: 'router', status: 'approved' })).toBe(2)
  })

  it('תיבת-מילה פגומה (x0 == x1) — הקובץ נקלט עם אזהרה, השורה בלי מילים ומתחלקת באתר; עמוד מלא לנתב', async () => {
    const ctx = { img: 'img/ctx-b-a7f3310c6e-p3.jpg', bbox: [100, 400, 640, 454] }
    const bad = routerItem(1, { words: [{ k: 0, box: [450, 0, 540, 54] }, { k: 1, box: [335, 15, 335, 50] }], ctx })
    const s = await upload('router', sampleEntries('router', { items: [routerItem(0, { ctx }), bad, routerItem(2)] }))
    expect(s.success).toBe(true)
    expect(s.warnings).toEqual(['שורה אחת: תיבות-המילים לא תקינות — יחולקו לפי הדיו (שורה 2 בקובץ)'])
    expect((await ingest(s.token)).inserted).toBe(3)
    const doc = await TrainingProofItem.findOne({ uid: bad.uid }).lean()
    expect(doc.payload.words).toBeUndefined()
    expect(doc.ctxPath).toMatch(/ctx-b-a7f3310c6e-p3\.jpg$/)
    expect(fs.existsSync(path.join(TMP, doc.ctxPath.replace('/uploads/', '')))).toBe(true)

    // סקירה: לנתב יש עמוד (אותו נתיב מוגן של הניהול)
    const res = await ctxGET(new Request(`${URL0}/items/${doc._id}/ctx`), P({ id: String(doc._id) }))
    expect(res.status).toBe(200)
    // המתנדב מסמן "מעורבת" עם חלוקה משלו — words_src: "site"
    await takeRound(String(vol._id), 'router')
    const words = [{ k: 0, box: [300, 0, 540, 54], label: 'square' }, { k: 1, box: [0, 0, 290, 54], label: 'rashi' }]
    const m = await markItem(String(vol._id), doc._id, { label: 'mixed', words })
    expect(m.error).toBeUndefined()
    expect((await TrainingProofItem.findById(doc._id).lean()).result.words_src).toBe('site')
  })
})

describe('סקירה — גלאי האזורים', () => {
  it('טבלה לפי ספר, העמודים של ספר, ואישור כל העמודים שסומנו', async () => {
    const s = await upload('frames', sampleEntries('frames', { n: 3 }))
    expect(s.read.books).toEqual([{ alias: 'ספר 388', pages: 3 }])
    await ingest(s.token)
    const book = await TrainingProofBook.findOne().lean()
    expect(book).toMatchObject({ alias: 'ספר 388', pagesTotal: 24 })
    expect(book.streams).toHaveLength(2)
    // סימון מדומה (העורך של הגלאי שומר result = {status, frames, streams_added})
    const pages = await TrainingProofItem.find({ section: 'frames' }).sort({ 'payload.page': 1 }).lean()
    for (const p of pages.slice(0, 2)) {
      await TrainingProofItem.updateOne(
        { _id: p._id },
        { $set: { status: 'submitted', vol: vol._id, submittedAt: new Date(), result: { status: 'marked', frames: p.payload.frames.slice(1), streams_added: [] } } }
      )
    }
    const t = await J(await framesGET(new Request(`${URL0}/review/frames`)))
    expect(t.books).toEqual([expect.objectContaining({ alias: 'ספר 388', counts: { available: 1, held: 0, submitted: 2, approved: 0 }, vols: ['רחל'], changes: 2 })])
    const one = await J(await framesGET(new Request(`${URL0}/review/frames?book=b-a7f3310c6e`)))
    expect(one.pages).toHaveLength(3)
    expect(one.pages[0]).toMatchObject({ page: 1, status: 'submitted', changes: 1 })
    expect(one.book.streams).toHaveLength(2)
    expect((await framesGET(new Request(`${URL0}/review/frames?book=x`))).status).toBe(400)
    // "תקן ואשר" בגלאי — אותה בדיקה של עמוד (checkFramesPage) מול הזרמים של הספר
    const bad = { ...pages[0].payload.frames[0], role: 'no-such-role' }
    expect((await J(await fixPOST(jreq('POST', { id: String(pages[0]._id), mark: { frames: [bad] } })))).status).toBe(400)
    const fixed = await J(await fixPOST(jreq('POST', { id: String(pages[0]._id), mark: { status: 'draft', frames: pages[0].payload.frames } })))
    expect(fixed.status).toBe(200)
    expect(fixed).toMatchObject({ fixed: true, item: { status: 'approved', adminFixed: true } })
    const saved = await TrainingProofItem.findById(pages[0]._id).lean()
    expect(saved.result.status).toBe('marked')
    expect(saved.result.frames).toHaveLength(pages[0].payload.frames.length)
    expect(saved.result.frames.every((f) => !('src' in f))).toBe(true)
    expect(saved.volResult.frames).toHaveLength(pages[0].payload.frames.length - 1)
    const r = await J(await bulkPOST(jreq('POST', { section: 'frames', kind: 'book', book: 'b-a7f3310c6e' })))
    expect(r.count).toBe(1)
  })

  it('אותו ספר בשני קבצים: זרם חדש נוסף, זרם קיים וזרם של מתנדב לא נדרסים, ומי שמחזיק את הספר נשאר', async () => {
    const s1 = await upload('frames', sampleEntries('frames', { n: 1 }))
    await ingest(s1.token)
    const until = new Date(Date.now() + 3600e3)
    await TrainingProofBook.updateOne(
      { book: 'b-a7f3310c6e' },
      { $set: { claimedBy: vol._id, claimedUntil: until }, $push: { streams: { id: 'x1', name: 'הגהות', role: 'commentary', added: true } } }
    )
    const e2 = sampleEntries('frames', { n: 1, manifest: { package_id: 'tp-20261028-00aa11bb' } })
    const [b] = JSON.parse(new TextDecoder().decode(e2['books.json']))
    b.streams = [{ id: 's1', name: 'שם אחר', role: 'body' }, ...b.streams.slice(1), { id: 's3', name: "פירוש ב'", role: 'commentary' }]
    e2['books.json'] = new TextEncoder().encode(JSON.stringify([b]))
    const s2 = await upload('frames', e2)
    expect((await ingest(s2.token)).finished).toBe(true)
    const book = await TrainingProofBook.findOne({ book: 'b-a7f3310c6e' }).lean()
    expect(book.streams.map((x) => x.id)).toEqual(['s1', 's2', 'x1', 's3'])
    expect(book.streams[0].name).toBe('פנים')
    expect(String(book.claimedBy)).toBe(String(vol._id))
  })
})

describe('הורדה לתחנה', () => {
  it('ארכוב מונים הוא idempotent לפי exportId', async () => {
    const delta = new Map([[String(vol._id), { ocr: { approved: 2, unchanged: 1, rejected: 0 } }]])
    await applyArchive(delta, 'tpx-20261028-aabbcc')
    await applyArchive(delta, 'tpx-20261028-aabbcc')
    const saved = await TrainingProofArchive.findOne({ userId: vol._id }).lean()
    expect(saved.stats.ocr).toMatchObject({ approved: 2, unchanged: 1 })
    expect((await volunteerStats(String(vol._id))).ocr).toMatchObject({ approved: 2, unchanged: 1 })
  })

  it('מונים שנשמרו קודם ברשומת-המגיה נספרים, והורדה שכבר נספרה שם לא נספרת שוב', async () => {
    await TrainingProofVolunteer.updateOne(
      { userId: vol._id },
      { $set: { 'stats.archived.ocr': { approved: 3, unchanged: 3, rejected: 1 } }, $addToSet: { archivedExports: 'tpx-20261028-aabbcc' } }
    )
    await applyArchive(new Map([[String(vol._id), { ocr: { approved: 3, unchanged: 3, rejected: 1 } }]]), 'tpx-20261028-aabbcc')
    await applyArchive(new Map([[String(vol._id), { ocr: { approved: 1, unchanged: 0, rejected: 0 } }]]), 'tpx-20261029-ddeeff')
    expect((await volunteerStats(String(vol._id))).ocr).toMatchObject({ approved: 4, unchanged: 3, rejected: 1, saved: 5 })
  })

  it('נעילת ייצוא במסד חוסמת גם מופע שרת אחר', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 1 }))
    await ingest(s.token)
    await TrainingProofItem.updateMany({}, { $set: { status: 'approved', result: { action: 'ok' }, vol: vol._id } })
    await TrainingProofExportLock.create({
      section: 'ocr',
      exportId: 'tpx-20261028-locked',
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect((await J(await exportPOST(jreq('POST'), P({ section: 'ocr' })))).status).toBe(409)
    expect(await TrainingProofItem.countDocuments()).toBe(1)
  })

  it('ZIP לפי החוזה, רק מה שאושר; המחיקה רק אחרי שהשרת סיים לשלוח; יומן; מונים לארכיון', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ocrItem(i, i < 2 ? { ctx: { img: 'img/ctx-shared.jpg', bbox: [1, 1, 50, 20] } } : {}))
    const s = await upload('ocr', sampleEntries('ocr', { items }))
    await ingest(s.token)
    const marked = await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'fixed', text: 'טקסט מתוקן' }, { action: 'bad' }])
    const approvedIds = marked.slice(0, 2).map((d) => String(d._id))
    await decidePOST(jreq('POST', { section: 'ocr', ids: approvedIds, decision: 'approve' }))
    // אחת נדחתה קודם (rejectedFor) ואז אושרה אצל מתנדב אחר — נספרת לשניהם בארכיון
    const sum0 = await J(await exportGET())
    expect(sum0.sections.ocr.count).toBe(2)
    const kept = await TrainingProofItem.findOne({ status: { $ne: 'approved' } }).lean()
    const gone = await TrainingProofItem.find({ _id: { $in: approvedIds } }).lean()

    const res = await exportPOST(jreq('POST'), P({ section: 'ocr' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    const exportId = res.headers.get('x-export-id')
    // לפני שהקובץ נקרא — שום דבר לא נמחק
    expect(await TrainingProofItem.countDocuments({ _id: { $in: approvedIds } })).toBe(2)
    expect((await J(await exportPOST(jreq('POST'), P({ section: 'ocr' })))).status).toBe(409) // הורדה כבר רצה
    const bytes = new Uint8Array(await res.arrayBuffer())
    const report = await purges.get('ocr')
    expect(report).toMatchObject({ deleted: 2, packages: 0 })

    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'results.jsonl'])
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(checkReturnManifest(manifest)).toBe(null)
    expect(manifest).toMatchObject({ section: 'ocr', export_id: exportId, station_ids: ['st-6b1e0d5a'], counts: { items: 2 } })
    const lines = strFromU8(files['results.jsonl']).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => checkReturnLine('ocr', l))).toEqual([null, null])
    expect(lines.every((l) => l.vol === volId(String(vol._id)))).toBe(true)
    expect(JSON.stringify(lines)).not.toMatch(/רחל|example\.org/)

    expect(await TrainingProofItem.countDocuments({ _id: { $in: approvedIds } })).toBe(0)
    for (const g of gone) expect(fs.existsSync(path.join(TMP, g.imagePath.replace('/uploads/', '')))).toBe(false)
    // תמונת-ההקשר המשותפת נשארת כל עוד יש פריט שמשתמש בה
    const ctxUser = await TrainingProofItem.findOne({ ctxPath: { $ne: null } }).lean()
    if (ctxUser) expect(fs.existsSync(path.join(TMP, ctxUser.ctxPath.replace('/uploads/', '')))).toBe(true)
    expect(await TrainingProofItem.findById(kept._id)).toBeTruthy()
    const log = await TrainingProofExportLog.findOne({ exportId }).lean()
    expect(log).toMatchObject({ section: 'ocr', count: 2, packages: ['tp-20261027-1f3a9c2e'] })
    // המונים של המתנדב שורדים את המחיקה
    const st = await volunteerStats(String(vol._id))
    expect(st.ocr).toMatchObject({ approved: 2, unchanged: 2 })
    await purgeExported({ section: 'ocr', exportId, ids: approvedIds, packages: ['tp-20261027-1f3a9c2e'], by: admin._id })
    expect((await volunteerStats(String(vol._id))).ocr).toMatchObject({ approved: 2, unchanged: 2 })
    const sum1 = await J(await exportGET())
    expect(sum1.sections.ocr.count).toBe(0)
    expect(sum1.log[0]).toMatchObject({ exportId, count: 2, by: 'מנהלת' })
  })

  it('מנהל OCR שהגיה בעצמו (בלי רשומת-מגיה) — המונים שלו שורדים את ההורדה', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 3 }))
    await ingest(s.token)
    const r = await takeRound(String(admin._id), 'ocr')
    for (const it of r.items.slice(0, 2)) expect((await markItem(String(admin._id), it._id, { action: 'ok' })).ok).toBe(true)
    await decidePOST(jreq('POST', { section: 'ocr', ids: r.items.slice(0, 2).map((d) => String(d._id)), decision: 'approve' }))
    expect((await volunteerStats(String(admin._id))).ocr).toMatchObject({ approved: 2, saved: 2 })
    const res = await exportPOST(jreq('POST'), P({ section: 'ocr' }))
    await res.arrayBuffer()
    await purges.get('ocr')
    expect(await TrainingProofItem.countDocuments({ status: 'approved' })).toBe(0)
    expect((await volunteerStats(String(admin._id))).ocr).toMatchObject({ approved: 2, unchanged: 2, saved: 2 })
    // לא נוצרה לו בקשת-גישה ולא שורה של מגיה רגיל
    const vols = await J(await volsGET())
    expect(vols.requests).toHaveLength(0)
  })

  it('מחיקת חבילה: דחיות של מתנדב בשורות שנמחקו נשמרות במונים', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 2 }))
    await ingest(s.token)
    const marked = await volunteerMarks('ocr', [{ action: 'ok' }])
    await decidePOST(jreq('POST', { section: 'ocr', ids: [String(marked[0]._id)], decision: 'reject' }))
    expect((await volunteerStats(String(vol._id))).ocr).toMatchObject({ rejected: 1, saved: 1 })
    await packageDELETE(jreq('DELETE'), P({ packageId: 'tp-20261027-1f3a9c2e', part: '1' }))
    expect(await TrainingProofItem.countDocuments()).toBe(0)
    expect((await volunteerStats(String(vol._id))).ocr).toMatchObject({ rejected: 1, saved: 1 })
  })

  it('כשהכול ירד — החבילה ותיקיית התמונות נמחקות; דפדפן שניתק באמצע — שום דבר לא נמחק', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 2 }))
    await ingest(s.token)
    await TrainingProofItem.updateMany({}, { $set: { status: 'approved', result: { action: 'ok' }, vol: vol._id, reviewedAt: new Date() } })

    const r1 = await exportPOST(jreq('POST'), P({ section: 'ocr' }))
    const reader = r1.body.getReader()
    await reader.read()
    await reader.cancel()
    expect(await TrainingProofItem.countDocuments()).toBe(2)
    expect(await TrainingProofExportLog.countDocuments()).toBe(0)

    const r2 = await exportPOST(jreq('POST'), P({ section: 'ocr' }))
    await r2.arrayBuffer()
    await purges.get('ocr')
    expect(await TrainingProofItem.countDocuments()).toBe(0)
    expect(await TrainingProofPackage.countDocuments()).toBe(0)
    expect(fs.existsSync(path.join(TMP, 'training-proof', 'tp-20261027-1f3a9c2e'))).toBe(false)
    expect((await J(await exportPOST(jreq('POST'), P({ section: 'ocr' })))).status).toBe(409)
  })
})

describe('מתנדבים', () => {
  it('בקשה ← אישור; ביטול גישה מחזיר את מה שתפס; הוספה ישירה', async () => {
    await TrainingProofVolunteer.create({ userId: other._id, status: 'pending', requestMessage: 'אשמח לעזור' })
    let v = await J(await volsGET())
    expect(v.requests).toEqual([expect.objectContaining({ name: 'דוד', email: 'd@example.org', message: 'אשמח לעזור' })])
    expect(v.approved.map((x) => x.name)).toEqual(['רחל'])
    expect((await J(await summaryGET())).requests).toBe(1)

    const ok1 = await J(await volPOST(jreq('POST', { action: 'approve' }), P({ userId: String(other._id) })))
    expect(ok1.status).toBe('approved')
    expect((await J(await volPOST(jreq('POST', { action: 'deny' }), P({ userId: String(other._id) })))).status).toBe(409)

    const s = await upload('ocr', sampleEntries('ocr', { n: 3 }))
    await ingest(s.token)
    await volunteerMarks('ocr', [{ action: 'ok' }])
    const rv = await J(await volPOST(jreq('POST', { action: 'revoke' }), P({ userId: String(vol._id) })))
    expect(rv).toMatchObject({ status: 'revoked', released: { items: 2 } })
    expect(await TrainingProofItem.countDocuments({ status: 'available' })).toBe(2)
    expect(await TrainingProofItem.countDocuments({ status: 'submitted' })).toBe(1) // ההגשה נשארת לסקירה

    const third = await User.create({ name: 'שרה', email: 'Sara@Example.org', password: 'x' })
    const add = await J(await volsPOST(jreq('POST', { query: 'sara@example.org' })))
    expect(add).toMatchObject({ success: true, name: 'שרה' })
    expect((await TrainingProofVolunteer.findOne({ userId: third._id }).lean()).status).toBe('approved')
    expect((await J(await volsPOST(jreq('POST', { query: 'nobody@x.org' })))).status).toBe(404)
    expect((await J(await volsPOST(jreq('POST', { query: 'm@example.org' })))).status).toBe(409) // מנהל
    v = await J(await volsGET())
    expect(v.others).toEqual([expect.objectContaining({ name: 'רחל', status: 'revoked' })])
  })
})

describe('הוראות ההגהה והדף הישן', () => {
  it('הוראות: שמירה לחלק וקריאה', async () => {
    expect((await J(await guideGET())).guides.ocr).toBe(null)
    const r = await J(await guidePUT(jreq('PUT', { section: 'router', markdown: '## כותרת\r\n- סעיף' })))
    expect(r.success).toBe(true)
    const g = await J(await guideGET())
    expect(g.guides.router).toMatchObject({ markdown: '## כותרת\n- סעיף', by: 'מנהלת' })
    expect((await J(await guidePUT(jreq('PUT', { section: 'x', markdown: '' })))).status).toBe(400)
  })

  it('הדף הישן: ספירה; בלי משפט-האישור — לא נמחק דבר; איתו — הכול נמחק', async () => {
    await PageProofBook.collection.insertOne({ gid: 'g1', title: 'x' })
    fs.mkdirSync(path.join(TMP, 'page-proof', 'g1'), { recursive: true })
    fs.writeFileSync(path.join(TMP, 'page-proof', 'g1', 'p001.jpg'), 'x')
    fs.mkdirSync(path.join(TMP, 'books', 's'), { recursive: true })
    fs.writeFileSync(path.join(TMP, 'books', 's', 'page.1.jpg'), 'x')
    const c = await J(await legacyGET())
    expect(c).toMatchObject({ counts: { books: 1, pages: 0 }, files: 1, confirm: 'מחק את הדף הישן' })
    expect((await J(await legacyPOST(jreq('POST', { confirm: 'כן' })))).status).toBe(400)
    expect(await PageProofBook.countDocuments()).toBe(1)
    const d = await J(await legacyPOST(jreq('POST', { confirm: 'מחק את הדף הישן' })))
    expect(d).toMatchObject({ deleted: { books: 1 }, files: 1 })
    expect(fs.existsSync(path.join(TMP, 'page-proof'))).toBe(false)
    expect(fs.existsSync(path.join(TMP, 'books', 's', 'page.1.jpg'))).toBe(true)
  })
})

describe('התיקונים של המנהל, לפי מתנדב', () => {
  const corrections = async (sec = '') =>
    J(await correctionsGET(new Request(`${URL0}/volunteers/${vol._id}/corrections${sec ? `?section=${sec}` : ''}`), P({ userId: String(vol._id) })))
  const volRow = async () => (await J(await volsGET())).approved.find((v) => v.userId === String(vol._id))

  it('"לא קריא" / "לנתב" מהמנהל במקום מה שהמתנדב סימן: מאושר, נרשם כתיקון, והמתנדב נשמר', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 3 }))
    await ingest(s.token)
    const marked = await volunteerMarks('ocr', [{ action: 'bad' }, { action: 'fixed', text: 'נוסח המתנדב' }, { action: 'router' }])
    const [a, b, c] = marked.map((x) => String(x._id))
    expect((await J(await fixPOST(jreq('POST', { id: a, mark: { action: 'ok' } })))).fixed).toBe(true)
    expect((await J(await fixPOST(jreq('POST', { id: b, mark: { action: 'router' } })))).fixed).toBe(true)
    expect((await J(await fixPOST(jreq('POST', { id: c, mark: { action: 'router' } })))).fixed).toBe(false)
    const [ia, ib, ic] = await Promise.all([a, b, c].map((id) => TrainingProofItem.findById(id).lean()))
    expect(ia).toMatchObject({ status: 'approved', adminFixed: true, result: { action: 'ok' }, volResult: { action: 'bad' } })
    expect(ib).toMatchObject({ status: 'approved', adminFixed: true, result: { action: 'router' }, volResult: { action: 'fixed', text: 'נוסח המתנדב' } })
    expect(ic.adminFixed).toBeFalsy()
  })

  it('"תקן ואשר" נרשם למתנדב; תיקון זהה — לא; "החזר לממתינות" מוחק; המונה והיומן שורדים את ההורדה; קובץ-ההחזרה לא משתנה', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 4 }))
    await ingest(s.token)
    const marked = await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'fixed', text: 'נוסח המתנדב' }, { action: 'ok' }, { action: 'ok' }])
    const [a, b, c, d] = marked.map((x) => String(x._id))
    // a: המנהל תיקן טקסט · b: "תיקן" לאותו נוסח = אישור רגיל · c: תיקון שבוטל אחר-כך · d: אישור רגיל
    expect((await J(await fixPOST(jreq('POST', { id: a, mark: { action: 'fixed', text: 'נוסח המנהל' } })))).fixed).toBe(true)
    expect((await J(await fixPOST(jreq('POST', { id: b, mark: { action: 'fixed', text: 'נוסח המתנדב' } })))).fixed).toBe(false)
    expect((await J(await fixPOST(jreq('POST', { id: c, mark: { action: 'bad' } })))).fixed).toBe(true)
    await decidePOST(jreq('POST', { section: 'ocr', ids: [d], decision: 'approve' }))
    expect((await corrections()).items).toHaveLength(2)
    await decidePOST(jreq('POST', { section: 'ocr', ids: [c], decision: 'unapprove' }))

    let log = await corrections()
    expect(log.items).toHaveLength(1)
    const it0 = await TrainingProofItem.findById(a).lean()
    expect(log.items[0]).toMatchObject({
      section: 'ocr',
      alias: it0.payload.alias,
      before: { action: 'ok', text: it0.payload.text },
      after: { action: 'fixed', text: 'נוסח המנהל' },
    })
    expect(JSON.stringify(log.items[0])).not.toMatch(/img|png|jpg|webp/)
    let row = await volRow()
    expect(row.stats.corrected).toBe(1)
    expect(row.stats.bySection.ocr).toMatchObject({ approved: 3, unchanged: 2, corrected: 1 })

    // ההורדה לתחנה: הפריטים נמחקים — המונה והיומן נשארים; קובץ-ההחזרה כמו קודם
    const res = await exportPOST(jreq('POST'), P({ section: 'ocr' }))
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    await purges.get('ocr')
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'results.jsonl'])
    const lines = strFromU8(files['results.jsonl']).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => checkReturnLine('ocr', l))).toEqual([null, null, null])
    expect(lines.find((l) => l.admin_fixed)).toMatchObject({ action: 'fixed', text: 'נוסח המנהל' })
    expect(await TrainingProofItem.countDocuments({ _id: a })).toBe(0)
    log = await corrections()
    expect(log.items).toHaveLength(1)
    row = await volRow()
    expect(row.stats.bySection.ocr).toMatchObject({ approved: 3, unchanged: 2, corrected: 1 })
    expect((await corrections('router')).items).toEqual([])
  })

  it('נתב: הגרסה של המתנדב ← של המנהל; החדשים קודם; רק האחרונים נשמרים', async () => {
    const s = await upload('router', sampleEntries('router', { items: Array.from({ length: 3 }, (_, i) => routerItem(i)) }))
    await ingest(s.token)
    const marked = await volunteerMarks('router', [{ label: 'square' }, { label: 'rashi' }, { label: 'latin' }])
    await fixPOST(jreq('POST', { id: String(marked[0]._id), mark: { label: 'rashi' } }))
    await fixPOST(jreq('POST', { id: String(marked[1]._id), mark: { bad: true } }))
    const log = await corrections()
    expect(log.items.map((x) => [x.before, x.after])).toEqual([
      [{ label: 'rashi', words: null }, { bad: true }],
      [{ label: 'square', words: null }, { label: 'rashi', words: null }],
    ])
    expect((await volRow()).stats.bySection.router.corrected).toBe(2)
    expect(await trimCorrections(String(vol._id), 1)).toBe(1)
    expect((await corrections()).items.map((x) => x.after)).toEqual([{ bad: true }])
    expect((await J(await correctionsGET(new Request('http://x'), P({ userId: 'nope' })))).status).toBe(400)
    as(vol)
    expect((await J(await correctionsGET(new Request('http://x'), P({ userId: String(vol._id) })))).status).toBe(403)
  })

  it('כשל זמני בכתיבת היומן אינו הופך אישור מוצלח ל-500, והקריאה הבאה משלימה אותו בלי כפילות', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 1 }))
    await ingest(s.token)
    const [marked] = await volunteerMarks('ocr', [{ action: 'ok' }])
    const write = vi.spyOn(TrainingProofCorrection, 'findOneAndUpdate').mockRejectedValueOnce(new Error('temporary log failure'))
    const res = await J(await fixPOST(jreq('POST', { id: String(marked._id), mark: { action: 'fixed', text: 'תיקון' } })))
    expect(res.status).toBe(200)
    expect(res.fixed).toBe(true)
    expect((await TrainingProofItem.findById(marked._id).lean()).status).toBe('approved')
    expect(await TrainingProofCorrection.countDocuments()).toBe(0)
    write.mockRestore()

    expect((await corrections()).items).toHaveLength(1)
    expect((await corrections()).items).toHaveLength(1)
    expect(await TrainingProofCorrection.countDocuments({ item: marked._id })).toBe(1)
  })

  it('החזר לממתינות מוחק יומן רק לפריט שהעדכון המותנה שלו הצליח', async () => {
    const s = await upload('ocr', sampleEntries('ocr', { n: 2 }))
    await ingest(s.token)
    const marked = await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'ok' }])
    for (const d of marked) await fixPOST(jreq('POST', { id: String(d._id), mark: { action: 'bad' } }))
    expect((await corrections()).items).toHaveLength(2)

    const original = TrainingProofItem.findOneAndUpdate.bind(TrainingProofItem)
    const raced = String(marked[1]._id)
    const update = vi.spyOn(TrainingProofItem, 'findOneAndUpdate').mockImplementation((filter, ...args) => {
      if (filter.status === 'approved' && String(filter._id) === raced) return Promise.resolve(null)
      return original(filter, ...args)
    })
    const res = await J(await decidePOST(jreq('POST', {
      section: 'ocr', ids: marked.map((d) => String(d._id)), decision: 'unapprove',
    })))
    update.mockRestore()

    expect(res.count).toBe(1)
    expect((await TrainingProofItem.findById(marked[0]._id).lean()).status).toBe('submitted')
    expect((await TrainingProofItem.findById(marked[1]._id).lean()).status).toBe('approved')
    expect((await corrections()).items).toHaveLength(1)
    expect(await TrainingProofCorrection.exists({ item: marked[1]._id })).toBeTruthy()
  })
})
