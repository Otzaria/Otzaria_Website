// @vitest-environment node
// "אישור בלי אינטרנט" (docs/115) — מול MongoDB אמיתי (mongodb-memory-server) ותיקיית-העלאות זמנית:
// התכנית והחלוקה לקבצים, הקובץ שיורד (נתונים, תמונות, בלי אימייל ובלי מפתח-ספר, האתר לא משתנה),
// והעלאת קובץ-ההחלטות עם כל כללי הבטיחות (§6). בלי הבינארי של Mongo — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { getServerSessionMock, TMP } = vi.hoisted(() => {
  const dir = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/tp-offline-${process.pid}-${Date.now()}`
  process.env.UPLOAD_DIR = dir
  return { getServerSessionMock: vi.fn(), TMP: dir }
})
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import { zipSync } from 'fflate'
import User from '@/models/User'
import TrainingProofItem from '@/models/TrainingProofItem'
import TrainingProofVolunteer from '@/models/TrainingProofVolunteer'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { sampleEntries, ocrItem, routerItem, framesItem } from '@/lib/trainingProof/testFixtures'
import { takeRound, markItem } from '@/lib/trainingProof/round'
import { POST as uploadPOST } from '../upload/route'
import { POST as stepPOST } from '../upload/[token]/route'
import { POST as decidePOST } from '../review/decide/route'
import { GET as downloadGET } from './download/[section]/route'
import { POST as decisionsPOST } from './decisions/route'

vi.setConfig({ testTimeout: 60000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  fs.rmSync(TMP, { recursive: true, force: true })
})

let admin, vol
const as = (u) =>
  getServerSessionMock.mockResolvedValue(u ? { user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user' } } : null)
const URL0 = 'http://localhost/api/admin/training-proof'
const P = (o) => ({ params: Promise.resolve(o) })
const J = async (res) => ({ status: res.status, ...(await res.json()) })
const jreq = (url, body) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function upload(section, entries) {
  const fd = new FormData()
  fd.append('section', section)
  fd.append('file', new File([zipSync(entries)], 'pkg.zip', { type: 'application/zip' }))
  const s = await J(await uploadPOST(new Request(`${URL0}/upload`, { method: 'POST', body: fd })))
  let r
  let calls = 0
  do {
    r = await J(await stepPOST(new Request(`${URL0}/upload/${s.token}`, { method: 'POST' }), P({ token: s.token })))
    calls++
  } while (r.success && !r.finished && calls < 50)
  return r
}
async function volunteerMarks(section, marks) {
  const r = await takeRound(String(vol._id), section)
  for (let i = 0; i < marks.length; i++) expect((await markItem(String(vol._id), r.items[i]._id, marks[i])).ok).toBe(true)
  return r.items.slice(0, marks.length)
}
const plan = async (section, qs = '') => J(await downloadGET(new Request(`${URL0}/offline/download/${section}?plan=1${qs}`), P({ section })))
async function download(section, qs) {
  const res = await downloadGET(new Request(`${URL0}/offline/download/${section}?${qs}`), P({ section }))
  return { res, text: res.ok ? await res.text() : null }
}
function dataOf(html) {
  const m = /<script type="application\/json" id="tp-data">([\s\S]*?)<\/script>/.exec(html)
  return JSON.parse(m[1])
}
const decide = async (body) => J(await decisionsPOST(jreq(`${URL0}/offline/decisions`, body)))
const file = (section, decisions) => ({ contract: 'tpd/1', section, offline_id: 'tpo-20261123-abcdef', decisions })

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip(db.skip)
  await db.reset()
  vi.clearAllMocks()
  fs.rmSync(path.join(TMP, 'training-proof'), { recursive: true, force: true })
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', role: 'admin_ocr' })
  vol = await User.create({ name: 'רחל', email: 'v@example.org', password: 'x', isVerified: true })
  await TrainingProofVolunteer.create({ userId: vol._id, status: 'approved', decidedAt: new Date() })
  as(admin)
})

describe('שער-הגישה', () => {
  it('רק מנהל OCR מוריד ומעלה', async () => {
    as(vol)
    expect((await plan('ocr')).status).toBe(403)
    expect((await decide(file('ocr', []))).status).toBe(403)
    as(null)
    expect((await plan('ocr')).status).toBe(401)
  })
})

describe('ההורדה', () => {
  it('תכנית, חלוקה לקבצים לפי מזהה, והקובץ: נתונים, תמונות, בלי אימייל ובלי מפתח-ספר — והאתר לא משתנה', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ocrItem(i, i === 0 ? { ctx: { img: 'img/ctx-p17.jpg', bbox: [1, 1, 50, 20] } } : {}))
    await upload('ocr', sampleEntries('ocr', { items }))
    // כל השש (הסבב אקראי — כך גם השורה עם העמוד המלא בפנים)
    await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'fixed', text: 'נוסח אחר' }, { action: 'ok' }, { action: 'bad' }, { action: 'ok' }, { action: 'ok' }])

    const p = await plan('ocr', '&n=50')
    expect(p).toMatchObject({ success: true, count: 6, per: 50 })
    expect(p.offlineId).toMatch(/^tpo-\d{8}-[0-9a-f]{6}$/)
    expect(p.parts).toEqual([{ after: null, count: 6 }])

    const before = await TrainingProofItem.find().lean()
    const { res, text } = await download('ocr', `oid=${p.offlineId}&part=1&parts=1&n=50`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(res.headers.get('content-disposition')).toContain(`tp-offline-ocr-${p.offlineId}.html`)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(text).toContain('Content-Security-Policy')
    expect(text).not.toMatch(/https?:\/\/(?!localhost)/) // שום טעינה מבחוץ
    expect(text).not.toContain('@example.org')
    const d = dataOf(text)
    expect(d).toMatchObject({ kind: 'tpo/1', section: 'ocr', offline_id: p.offlineId, part: 1, parts: 1 })
    expect(d.items).toHaveLength(6)
    expect(d.items.every((it) => it.vol?.name === 'רחל' && it.v && !('book' in it))).toBe(true)
    expect(JSON.stringify(d)).not.toContain('b-5e0c2a91d4')
    // תמונה לכל שורה + תמונת-הקשר פעם אחת
    for (const it of d.items) expect(text).toContain(`data-img="${it.img}"`)
    const withCtx = d.items.find((it) => it.ctx)
    expect(withCtx.ctx.img).toBe('c1')
    expect(text.match(/data-img="c1"/g)).toHaveLength(1)
    // בלי העמוד המלא
    const noCtx = await download('ocr', `oid=${p.offlineId}&ctx=0`)
    expect(dataOf(noCtx.text).items.every((it) => it.ctx === null)).toBe(true)
    // ההורדה אינה משנה דבר
    expect(await TrainingProofItem.find().lean()).toEqual(before)
  })

  it('חלקים לפי מזהה: אישור באתר בין ההורדות לא מזיז פריט לחלק אחר', async () => {
    await upload('ocr', sampleEntries('ocr', { n: 120 }))
    const r = await takeRound(String(vol._id), 'ocr')
    for (const it of r.items) await markItem(String(vol._id), it._id, { action: 'ok' })
    const p = await plan('ocr', '&n=50')
    expect(p.parts.map((x) => x.count)).toEqual([30]) // סבב = 30
    const p2 = await plan('ocr', '&n=10')
    expect(p2.parts.map((x) => x.count)).toEqual([10, 10, 10])
    const second = await download('ocr', `oid=${p2.offlineId}&part=2&parts=3&n=10&after=${p2.parts[1].after}`)
    const ids2 = dataOf(second.text).items.map((x) => x.id)
    // אישור של שלוש מהחלק הראשון באתר — החלק השני נשאר אותו דבר
    const first = await download('ocr', `oid=${p2.offlineId}&part=1&parts=3&n=10`)
    const ids1 = dataOf(first.text).items.map((x) => x.id)
    await J(await decidePOST(jreq(`${URL0}/review/decide`, { section: 'ocr', ids: ids1.slice(0, 3), decision: 'approve' })))
    const again = await download('ocr', `oid=${p2.offlineId}&part=2&parts=3&n=10&after=${p2.parts[1].after}`)
    expect(dataOf(again.text).items.map((x) => x.id).sort()).toEqual([...ids2].sort())
  })

  it('גלאי: קובץ לכל ספר, עם הזרמים ומספר השינויים; בלי ספר — 400', async () => {
    await upload('frames', sampleEntries('frames', { items: [framesItem(0), framesItem(1)] }))
    const docs = await TrainingProofItem.find({ section: 'frames' }).sort({ uid: 1 }).lean()
    const marked = docs[0].payload.frames.slice(0, 2)
    await TrainingProofItem.updateOne(
      { _id: docs[0]._id },
      { $set: { status: 'submitted', vol: vol._id, submittedAt: new Date(), result: { status: 'marked', frames: marked, streams_added: [] } } }
    )
    const p = await plan('frames')
    expect(p.books).toEqual([{ book: 'b-a7f3310c6e', alias: 'ספר 388', pages: 1 }])
    expect((await download('frames', `oid=${p.offlineId}`)).res.status).toBe(400)
    const { text } = await download('frames', `oid=${p.offlineId}&book=b-a7f3310c6e`)
    const d = dataOf(text)
    expect(d.book).toEqual({ alias: 'ספר 388', streams: [{ id: 's1', name: 'פנים', role: 'body' }, { id: 's2', name: "פירוש א'", role: 'commentary' }] })
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ page: 1, changes: 1, frames: expect.any(Array) })
  })

  it('אין מה להוריד — 409; מזהה-הורדה לא תקין — 400', async () => {
    expect((await download('ocr', 'oid=tpo-20261123-abcdef')).res.status).toBe(409)
    expect((await download('ocr', 'oid=xyz')).res.status).toBe(400)
  })
})

describe('העלאת ההחלטות', () => {
  it('אשר · דחה · תקן ואשר; מה שטופל באתר או הוגש מחדש — מדולג; העלאה חוזרת לא מחילה פעמיים', async () => {
    await upload('ocr', sampleEntries('ocr', { n: 7 }))
    const it = await volunteerMarks('ocr', [{ action: 'ok' }, { action: 'ok' }, { action: 'ok' }, { action: 'ok' }, { action: 'ok' }, { action: 'ok' }])
    const p = await plan('ocr')
    const d = dataOf((await download('ocr', `oid=${p.offlineId}`)).text)
    const byId = new Map(d.items.map((x) => [x.id, x]))
    const v = (doc) => byId.get(String(doc._id)).v
    const [a, b, c, e, g, h] = it

    // בינתיים באתר: e אושר; g נדחה ומתנדב אחר... (כאן — הוגש מחדש: זמן-הגשה חדש)
    await J(await decidePOST(jreq(`${URL0}/review/decide`, { section: 'ocr', ids: [String(e._id)], decision: 'approve' })))
    await TrainingProofItem.updateOne({ _id: g._id }, { $set: { submittedAt: new Date(Date.now() + 5000) } })
    await TrainingProofItem.deleteOne({ _id: h._id })

    const body = file('ocr', [
      { id: String(a._id), v: v(a), d: 'approve' },
      { id: String(b._id), v: v(b), d: 'reject' },
      { id: String(c._id), v: v(c), d: 'fix', mark: { action: 'fixed', text: 'תיקון  של המנהל ' } },
      { id: String(e._id), v: v(e), d: 'reject' },
      { id: String(g._id), v: v(g), d: 'approve' },
      { id: String(h._id), v: v(h), d: 'approve' },
    ])
    const r = await decide(body)
    expect(r).toMatchObject({ success: true, approved: 1, rejected: 1, fixed: 1, total: 6 })
    expect(r.skipped).toEqual({ 'approved-online': 1, resubmitted: 1, gone: 1 })
    expect(r.skippedList.find((x) => x.reason === 'resubmitted')).toMatchObject({ alias: expect.any(String), page: expect.any(Number) })

    const A = await TrainingProofItem.findById(a._id).lean()
    expect(A).toMatchObject({ status: 'approved' })
    expect(String(A.reviewedBy)).toBe(String(admin._id))
    const B = await TrainingProofItem.findById(b._id).lean()
    expect(B).toMatchObject({ status: 'available', result: null })
    expect(B.notFor.map(String)).toContain(String(vol._id))
    const Cx = await TrainingProofItem.findById(c._id).lean()
    expect(Cx).toMatchObject({ status: 'approved', adminFixed: true, result: { action: 'fixed', text: 'תיקון של המנהל' } })
    expect((await TrainingProofItem.findById(e._id).lean()).status).toBe('approved') // לא נדחה בדיעבד
    expect((await TrainingProofItem.findById(g._id).lean()).status).toBe('submitted')

    // אותו קובץ שוב — שום דבר לא מוחל פעמיים
    const again = await decide(body)
    expect(again).toMatchObject({ approved: 0, rejected: 0, fixed: 0 })
    expect(again.skipped).toMatchObject({ 'approved-online': 3, 'not-pending': 1 })
  })

  it('תיקון לא תקין — מדולג עם הסיבה', async () => {
    await upload('ocr', sampleEntries('ocr', { n: 2 }))
    const [o] = await volunteerMarks('ocr', [{ action: 'ok' }])
    const oc = await TrainingProofItem.findById(o._id).lean()
    const r1 = await decide(file('ocr', [{ id: String(o._id), v: oc.submittedAt.toISOString(), d: 'fix', mark: { action: 'fixed', text: '   ' } }]))
    expect(r1.skipped).toEqual({ 'bad-mark': 1 })
    expect(r1.skippedList[0].error).toMatch(/ריק/)
  })

  it('נתב — תיקון כתב; פריט מחלק אחר — מדולג; גלאי — אישור בלבד', async () => {
    await upload('router', sampleEntries('router', { items: [routerItem(0), routerItem(1)] }))
    const rr = await takeRound(String(vol._id), 'router')
    await markItem(String(vol._id), rr.items[0]._id, { label: 'square' })
    const rd = await TrainingProofItem.findById(rr.items[0]._id).lean()
    const r2 = await decide(file('router', [{ id: String(rd._id), v: rd.submittedAt.toISOString(), d: 'fix', mark: { label: 'rashi' } }]))
    expect(r2).toMatchObject({ fixed: 1 })
    expect((await TrainingProofItem.findById(rd._id).lean()).result).toMatchObject({ label: 'rashi', bad: false })

    // קובץ של חלק אחד עם פריט מחלק אחר
    const r3 = await decide(file('ocr', [{ id: String(rd._id), v: rd.submittedAt.toISOString(), d: 'approve' }]))
    expect(r3.skipped).toEqual({ 'wrong-section': 1 })

    const bad = await decide(file('frames', [{ id: String(rd._id), v: rd.submittedAt.toISOString(), d: 'fix', mark: {} }]))
    expect(bad.status).toBe(400)
    expect(bad.error).toMatch(/רק באתר/)
  })

  it('קובץ שאינו קובץ-החלטות — 400 בעברית, ושום דבר לא נגע במסד', async () => {
    expect((await decide({ contract: 'tp/1', section: 'ocr', decisions: [] })).error).toMatch(/tpd\/1/)
    expect((await decide(file('ocr', []))).error).toMatch(/אף החלטה/)
    expect((await decide(file('ocr', [{ id: 'zz', v: 'x', d: 'approve' }]))).error).toMatch(/מזהה/)
  })
})
