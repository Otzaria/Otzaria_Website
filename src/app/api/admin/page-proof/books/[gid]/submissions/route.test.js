// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// ההגשות של ספר לפי עמוד, עם הפעולות והעמוד השמור (לתצוגת "לפני/אחרי" בתוכנת-הספר):
// קיבוץ לפי עמוד (כפולים יחד), העמוד בלי polygon/baseline ועם sig, הגשה על גרסה קודמת,
// סינון לפי מצב, עימוד (after/limit/next), ושגיאות.

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import User from '@/models/User'
import PageProofBook from '@/models/PageProofBook'
import PageProofPage from '@/models/PageProofPage'
import PageProofSubmission from '@/models/PageProofSubmission'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { pageSig } from '@/lib/pageProof/adminReview'
import { GET } from './route'

// מסד אמיתי — תחת עומס (כל הבדיקות במקביל) בקשות רבות לוקחות יותר מ-5 שניות
vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gSubsList01'
const get = (qs = '', gid = GID) => GET(new Request(`http://localhost/api/admin/page-proof/books/${gid}/submissions${qs}`), { params: Promise.resolve({ gid }) })
const doc = (page) => ({ page, size: [100, 100], lines: [{ id: 1, bbox: [10, 10, 90, 20], text: 'שורה', polygon: [[1, 1]], baseline: [[1, 1]] }] })

let book
let users
let pages

async function sub(page, user, extra = {}) {
  return PageProofSubmission.create({
    page: pages[page]._id,
    book: book._id,
    gid: GID,
    pageNo: page,
    user: user._id,
    userName: user.name,
    who: `otz-${user._id}`,
    ops: [{ kind: 'text', page, ids: [1], value: `${user.name}:${page}` }],
    opCount: 1,
    ...extra,
  })
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { id: 'u', role: 'admin_ocr' } })
  users = [await User.create({ name: 'ראובן', email: 'r@example.org', password: 'x' }), await User.create({ name: 'שמעון', email: 's@example.org', password: 'x' })]
  book = await PageProofBook.create({ gid: GID, title: 'ספר', script: 'rashi' })
  pages = {}
  for (const n of [1, 2, 3, 4, 5]) {
    pages[n] = await PageProofPage.create({ book: book._id, gid: GID, page: n, seq: 0, doc: doc(n), lineCount: 1, imagePath: `/x/p${n}.jpg`, required: n === 2 ? 2 : 1, revision: n === 4 ? 2 : 1 })
  }
  await sub(2, users[1], { createdAt: new Date('2026-09-02') })
  await sub(2, users[0], { createdAt: new Date('2026-09-01') })
  await sub(1, users[0])
  // הוגשה על גרסה 1; העמוד כבר בגרסה 2
  await sub(4, users[0], { revision: 1 })
  await sub(5, users[1], { status: 'approved', reviewedAt: new Date() })
})

describe('GET /api/admin/page-proof/books/[gid]/submissions', () => {
  it('לפי עמוד, עם הפעולות; כפולים יחד (לפי זמן ההגשה); העמוד בלי polygon/baseline, עם sig ומצב', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toMatchObject({ success: true, gid: GID, title: 'ספר', script: 'rashi', status: 'submitted', total: 3, next: null })
    expect(body.pages.map((g) => [g.page.page, g.submissions.map((s) => s.userName)])).toEqual([
      [1, ['ראובן']],
      [2, ['ראובן', 'שמעון']],
      [4, ['ראובן']],
    ])
    const g2 = body.pages[1]
    expect(g2.page).toMatchObject({ gid: GID, page: 2, required: 2, revision: 1, status: 'open', title: 'ספר', script: 'rashi' })
    expect(g2.page.imageUrl).toMatch(/^\/api\/page-proof\/pages\/[0-9a-f]{24}\/image\?v=1$/)
    expect(g2.page.doc.lines[0]).toEqual({ id: 1, bbox: [10, 10, 90, 20], text: 'שורה' })
    expect(g2.page.sig).toBe(pageSig(await PageProofPage.findById(pages[2]._id).lean()))
    expect(g2.submissions[0]).toMatchObject({ status: 'submitted', who: `otz-${users[0]._id}`, ops: [{ kind: 'text', page: 2, ids: [1], value: 'ראובן:2' }], needsRecut: false, revision: 1 })
  })

  it('הגשה על גרסה קודמת: submission.revision (1) שונה מ-page.revision (2)', async () => {
    const g4 = (await (await get()).json()).pages.find((g) => g.page.page === 4)
    expect([g4.submissions[0].revision, g4.page.revision]).toEqual([1, 2])
    expect(g4.page.sig).toMatch(/^2:/)
  })

  it('status=approved; מצב לא מוכר ← submitted', async () => {
    const approved = await (await get('?status=approved')).json()
    expect(approved.pages.map((g) => g.page.page)).toEqual([5])
    expect((await (await get('?status=bogus')).json()).status).toBe('submitted')
  })

  it('עימוד: limit ו-after, next עד הסוף', async () => {
    const a = await (await get('?limit=2')).json()
    expect([a.pages.map((g) => g.page.page), a.next, a.total]).toEqual([[1, 2], 2, 3])
    const b = await (await get(`?limit=2&after=${a.next}`)).json()
    expect([b.pages.map((g) => g.page.page), b.next]).toEqual([[4], null])
    // limit מחוץ לטווח ← 1..25
    expect((await (await get('?limit=0')).json()).pages).toHaveLength(1)
    expect((await (await get('?limit=abc')).json()).pages).toHaveLength(3)
  })

  it('ספר בלי הגשות — רשימה ריקה; ספר שאינו קיים ← 404; gid לא תקין ← 400', async () => {
    await PageProofSubmission.deleteMany({})
    expect(await (await get()).json()).toMatchObject({ success: true, total: 0, next: null, pages: [] })
    expect((await get('', 'gNoSuchBook1')).status).toBe(404)
    expect((await get('', 'bad/gid')).status).toBe(400)
  })

  it('401 בלי session, 403 בלי הרשאת OCR', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await get()).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books' } })
    expect((await get()).status).toBe(403)
  })
})
