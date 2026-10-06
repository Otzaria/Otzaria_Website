// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// עמוד "תקוע" ב"הוגש" (פורום, 2026-10-05): המתנדב הגיש, והעמוד נעלם מ"העמודים שלי" ברגע שכל הרצף שלו
// הוגש — בלי לדעת שהוא ממתין לבדיקת מנהל ומאז מתי. כאן, דרך הראוטים האמיתיים:
//   • הגשה אינה תופסת מקום מחמשת העמודים שהמתנדב מחזיק (ההגשה משחררת את התפיסה);
//   • GET /api/page-proof/mine ← submitted: ההגשות שממתינות לבדיקת מנהל, עם מועד ההגשה — גם כשאין
//     לו עוד עמודים בטיפול; אחרי אישור או דחייה — יורדת מהרשימה;
//   • ברצף של העמוד (?page=) — העמוד שהוגש עם submittedAt.

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import User from '@/models/User'
import PageProofBook from '@/models/PageProofBook'
import PageProofPage from '@/models/PageProofPage'
import PageProofSubmission from '@/models/PageProofSubmission'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { claimPage, MAX_HELD } from '@/lib/pageProof/claims'
import { MAX_PENDING_SHOWN } from '@/lib/pageProof/pendingSubmissions'
import { GET as mineGET } from './route'
import { POST as submitPOST } from '@/app/api/page-proof/pages/[id]/submit/route'
import { PATCH as subPATCH } from '@/app/api/admin/page-proof/submissions/[id]/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gSubmitted01'
const line = (id) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main' })
const doc = (page) => ({ page, revision: 1, size: [1000, 2000], lines: [line(1), line(2)] })
const TEXT = (page) => [{ kind: 'text', page, ids: [1], value: `שורה 1 מתוקנת (${page})` }]

let vol
let admin
let book
let pages

const as = (u) =>
  getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const json = (method, body) => new Request('http://localhost/api/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const p = (o) => ({ params: Promise.resolve(o) })
const submit = (n) => submitPOST(json('POST', { revision: 1, ops: TEXT(n) }), p({ id: String(pages[n]._id) }))
const mine = async (qs = '') => (await mineGET(new Request(`http://localhost/api/page-proof/mine${qs}`))).json()

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isVerified: true })
  admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin_ocr' })
  book = await PageProofBook.create({ gid: GID, title: 'ספר ניסיון', script: 'square' })
  pages = {}
  for (let n = 1; n <= MAX_HELD + 2; n++) {
    pages[n] = await PageProofPage.create({
      book: book._id,
      gid: GID,
      page: n,
      seq: Math.floor((n - 1) / 5),
      doc: doc(n),
      lineCount: 2,
      imagePath: `/uploads/books/x/page.${n}.jpg`,
    })
  }
  as(vol)
})

describe('הגשה ומקומות-התפיסה', () => {
  it(`הגשה משחררת את המקום: אחרי ${MAX_HELD} עמודים שישי נדחה, ואחרי הגשה של אחד מהם — נתפס`, async () => {
    const uid = String(vol._id)
    for (let n = 1; n <= MAX_HELD; n++) expect((await claimPage(String(pages[n]._id), uid)).ok, `עמוד ${n}`).toBe(true)
    const refused = await claimPage(String(pages[MAX_HELD + 1]._id), uid)
    expect(refused).toMatchObject({ ok: false, status: 409 })
    expect(refused.error).toMatch(new RegExp(`עד ${MAX_HELD} עמודים`))

    const res = await submit(2)
    expect(res.status).toBe(200)
    // ההגשה שחררה את התפיסה, והעמוד רשום כמוגש — הוא אינו נספר עוד בין העמודים שבידי המתנדב
    expect(await PageProofPage.findById(pages[2]._id).lean()).toMatchObject({ leasedBy: null, leasedUntil: null, activeCount: 1 })

    expect((await claimPage(String(pages[MAX_HELD + 1]._id), uid)).ok).toBe(true)
    // ושוב מלא: חמישה בידיו (1, 3, 4, 5, 6) — השביעי נדחה
    expect((await claimPage(String(pages[MAX_HELD + 2]._id), uid)).status).toBe(409)
  })
})

describe('"הוגש — ממתין לבדיקת מנהל" ב"העמודים שלי"', () => {
  it('ההגשה ברשימה עם מועד ההגשה — גם כשאין עוד עמודים בטיפול; אישור או דחייה מורידים אותה', async () => {
    const uid = String(vol._id)
    for (const n of [1, 2]) expect((await claimPage(String(pages[n]._id), uid)).ok).toBe(true)
    const before = Date.now()
    for (const n of [1, 2]) expect((await submit(n)).status).toBe(200)

    const m = await mine()
    // אין יותר עמודים בטיפול — אבל שתי ההגשות מוצגות, הוותיקה ראשונה
    expect(m.held).toEqual([])
    expect(m.submitted.map((s) => s.page)).toEqual([1, 2])
    expect(m.submitted[0]).toMatchObject({ id: String(pages[1]._id), gid: GID, title: 'ספר ניסיון', page: 1, revision: 1 })
    expect(new Date(m.submitted[0].submittedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(m.submitted[0].submissionId).toBe(String((await PageProofSubmission.findOne({ page: pages[1]._id }).lean())._id))

    // ברצף של העמוד (פתיחה בעורך): "הוגש", עם המועד
    const seq = await mine(`?page=${pages[1]._id}`)
    const p1 = seq.sequence.pages.find((x) => x.page === 1)
    expect(p1).toMatchObject({ state: 'submitted' })
    expect(new Date(p1.submittedAt).getTime()).toBe(new Date(m.submitted[0].submittedAt).getTime())
    expect(seq.sequence.pages.find((x) => x.page === 3)).toMatchObject({ state: 'unavailable', submittedAt: null })

    // המנהל מאשר את הראשונה ודוחה את השנייה ← שתיהן יורדות מהרשימה
    as(admin)
    const subs = await PageProofSubmission.find({ user: vol._id }).sort({ pageNo: 1 }).lean()
    expect((await subPATCH(json('PATCH', { action: 'approve' }), p({ id: String(subs[0]._id) }))).status).toBe(200)
    expect((await subPATCH(json('PATCH', { action: 'reject', note: 'לא' }), p({ id: String(subs[1]._id) }))).status).toBe(200)
    as(vol)
    expect((await mine()).submitted).toEqual([])
  })

  it(`בקשה לזיהוי-מחדש אינה "הגשה"; הגשות של מתנדב אחר — לא; לכל היותר ${MAX_PENDING_SHOWN}`, async () => {
    const other = await User.create({ name: 'אחר', email: 'o@example.org', password: 'x', isVerified: true })
    const base = { book: book._id, gid: GID, ops: [], who: 'x' }
    await PageProofSubmission.create({ ...base, page: pages[1]._id, pageNo: 1, user: vol._id, status: 'approved', recutRequest: true })
    await PageProofSubmission.create({ ...base, page: pages[2]._id, pageNo: 2, user: other._id, status: 'submitted' })
    expect((await mine()).submitted).toEqual([])
    await PageProofSubmission.insertMany(
      Array.from({ length: MAX_PENDING_SHOWN + 3 }, (_, i) => ({ ...base, page: pages[3]._id, pageNo: 3, user: vol._id, status: 'submitted', createdAt: new Date(Date.now() - (i + 1) * 60000) }))
    )
    expect((await mine()).submitted).toHaveLength(MAX_PENDING_SHOWN)
  })
})
