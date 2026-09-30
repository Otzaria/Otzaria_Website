// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// מפתח-גישה של תוכנת-הספר בראוטי הניהול של הגהת-העמודים — מי מקבל מפתח ובאיזו הרשאה:
//   read   — GET: רשימת-הספרים, רשת-העמודים, תיקונים, ההגשות (תור / לפי עמוד / אחת)
//   review — PATCH הגשה (אישור/דחייה/שחרור ממתנה), שחרור תפיסות, ו-fixes?mark=1
//   import — POST ייבוא
// ושום ראוט אחר: השהיה/מחיקת ספר, "פתוח למתנדבים" וניהול המפתחות — 401 גם עם מפתח תקף.
// בלי מפתח — ה-session כמו עד היום.

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import User from '@/models/User'
import PageProofBook from '@/models/PageProofBook'
import PageProofPage from '@/models/PageProofPage'
import PageProofSubmission from '@/models/PageProofSubmission'
import PageProofToken from '@/models/PageProofToken'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { bearerFailures } from '@/lib/pageProof/tokenThrottle'
import { generateToken, hashToken } from '@/lib/pageProof/tokenSecret'
import { tokenPrefixOf, VIA_SUFFIX } from '@/lib/pageProof/tokenRules'
import { GET as listBooks } from './route'
import { GET as pagesGET, PATCH as pagesPATCH } from './books/[gid]/pages/route'
import { GET as fixesGET } from './books/[gid]/fixes/route'
import { POST as releasePOST } from './books/[gid]/release/route'
import { GET as bookSubsGET } from './books/[gid]/submissions/route'
import { PATCH as bookPATCH, DELETE as bookDELETE } from './books/[gid]/route'
import { POST as importPOST } from './import/route'
import { GET as subsGET } from './submissions/route'
import { GET as subGET, PATCH as subPATCH } from './submissions/[id]/route'
import { GET as tokensGET, POST as tokensPOST } from './tokens/route'
import { DELETE as tokenDELETE } from './tokens/[id]/route'

// מסד אמיתי — תחת עומס (כל הבדיקות במקביל) בקשות רבות לוקחות יותר מ-5 שניות
vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gTokens0001'
const BASE = 'http://localhost/api/admin/page-proof'
const DAY = 24 * 3600 * 1000
const doc = (page) => ({ page, size: [100, 100], lines: [{ id: 1, bbox: [10, 10, 90, 20], text: 'שורה', polygon: [[10, 10], [90, 10], [90, 20], [10, 20]], baseline: [[10, 18], [90, 18]] }] })

let admin
let keys
let ids

async function mkToken(user, scopes) {
  const secret = generateToken()
  await PageProofToken.create({ user: user._id, name: scopes.join('+'), hash: hashToken(secret), prefix: tokenPrefixOf(secret), scopes, expiresAt: new Date(Date.now() + 30 * DAY) })
  return secret
}

const auth = (secret) => (secret ? { authorization: `Bearer ${secret}` } : {})
const at = (path, { secret, method = 'GET', json, body, headers = {} } = {}) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: { ...auth(secret), ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body,
  })
const p = (o) => ({ params: Promise.resolve(o) })

// כל ראוט מחווט: [שם, הרשאה נדרשת, קריאה(secret)]
const WIRED = () => [
  ['GET רשימת-הספרים', 'read', (s) => listBooks(at('', { secret: s }))],
  ['GET רשת-העמודים', 'read', (s) => pagesGET(at(`/books/${GID}/pages`, { secret: s }), p({ gid: GID }))],
  ['GET תיקונים', 'read', (s) => fixesGET(at(`/books/${GID}/fixes`, { secret: s }), p({ gid: GID }))],
  ['GET ההגשות לפי עמוד', 'read', (s) => bookSubsGET(at(`/books/${GID}/submissions`, { secret: s }), p({ gid: GID }))],
  ['GET תור-ההגשות', 'read', (s) => subsGET(at(`/submissions?gid=${GID}`, { secret: s }))],
  ['GET הגשה', 'read', (s) => subGET(at(`/submissions/${ids.open}`, { secret: s }), p({ id: ids.open }))],
  ['PATCH הגשה (release_recut על עמוד שאינו ממתין ← 409)', 'review', (s) => subPATCH(at(`/submissions/${ids.open}`, { secret: s, method: 'PATCH', json: { action: 'release_recut' } }), p({ id: ids.open }))],
  ['POST שחרור תפיסות', 'review', (s) => releasePOST(at(`/books/${GID}/release`, { secret: s, method: 'POST', json: { scope: 'expired' } }), p({ gid: GID }))],
  ['GET תיקונים עם mark=1', 'review', (s) => fixesGET(at(`/books/${GID}/fixes?mark=1`, { secret: s }), p({ gid: GID }))],
  ['POST ייבוא (בלי קובץ ← 400)', 'import', (s) => importPOST(at('/import', { secret: s, method: 'POST', body: new FormData() }))],
]

// ראוטים שאינם מקבלים מפתח
const UNWIRED = () => [
  ['PATCH השהיית ספר', () => bookPATCH(at(`/books/${GID}`, { secret: keys.all, method: 'PATCH', json: { status: 'paused' } }), p({ gid: GID }))],
  ['DELETE מחיקת ספר', () => bookDELETE(at(`/books/${GID}`, { secret: keys.all, method: 'DELETE' }), p({ gid: GID }))],
  ['PATCH פתוח למתנדבים', () => pagesPATCH(at(`/books/${GID}/pages`, { secret: keys.all, method: 'PATCH', json: { volunteer: false } }), p({ gid: GID }))],
  ['GET מפתחות', () => tokensGET(at('/tokens', { secret: keys.all }))],
  ['POST מפתח חדש', () => tokensPOST(at('/tokens', { secret: keys.all, method: 'POST', json: { name: 'x' } }))],
  ['DELETE ביטול מפתח', () => tokenDELETE(at(`/tokens/${ids.anyToken}`, { secret: keys.all, method: 'DELETE' }), p({ id: ids.anyToken }))],
]

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  bearerFailures.reset()
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(null)
  admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin_ocr' })
  const vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isVerified: true })
  const book = await PageProofBook.create({ gid: GID, title: 'ספר', script: 'square' })
  const mk = (page, extra = {}) => PageProofPage.create({ book: book._id, gid: GID, page, seq: 0, doc: doc(page), lineCount: 1, imagePath: `/uploads/page-proof/${GID}/p${page}.jpg`, ...extra })
  const [p1, p2] = [await mk(1, { status: 'done', activeCount: 1, submitters: [vol._id] }), await mk(2, { status: 'recut', activeCount: 1, approvedCount: 1 })]
  const base = { book: book._id, gid: GID, user: vol._id, userName: 'מתנדב', who: `otz-${vol._id}` }
  const open = await PageProofSubmission.create({ ...base, page: p1._id, pageNo: 1, ops: [{ kind: 'text', page: 1, ids: [1], value: 'שורה!' }], opCount: 1 })
  await PageProofSubmission.create({ ...base, page: p2._id, pageNo: 2, ops: [{ kind: 'line_split', page: 2, ids: [1], value: { x: 50 } }], opCount: 1, needsRecut: true, status: 'approved', reviewedAt: new Date() })
  keys = {
    read: await mkToken(admin, ['read']),
    review: await mkToken(admin, ['review']),
    import: await mkToken(admin, ['import']),
    all: await mkToken(admin, ['read', 'review', 'import']),
  }
  ids = { open: String(open._id), anyToken: String((await PageProofToken.findOne().lean())._id) }
})

describe('ראוטים מחווטים — ההרשאה הנדרשת בלבד', () => {
  it('מפתח עם ההרשאה (או כולן) עובר את השער; מפתח בלעדיה — 403 token_scope', async () => {
    for (const [name, scope, call] of WIRED()) {
      for (const k of ['read', 'review', 'import', 'all']) {
        const res = await call(keys[k])
        const allowed = k === 'all' || (k === scope && !(name.includes('mark=1') && k === 'review'))
        if (allowed) {
          expect([401, 403], `${name} ← ${k}: ${res.status}`).not.toContain(res.status)
        } else {
          expect(res.status, `${name} ← ${k}`).toBe(403)
          expect((await res.json()).code, `${name} ← ${k}`).toBe('token_scope')
        }
      }
    }
  })

  it('תשובות אמיתיות במפתח: רשימה, רשת-עמודים (recut), הגשה עם sig', async () => {
    const books = await (await listBooks(at('', { secret: keys.read }))).json()
    expect(books.books).toEqual([expect.objectContaining({ gid: GID, recut: 1, submitted: 1, approved: 1 })])
    const grid = await (await pagesGET(at(`/books/${GID}/pages`, { secret: keys.read }), p({ gid: GID }))).json()
    expect(grid.pages.map((x) => [x.page, x.state])).toEqual([
      [1, 'submitted'],
      [2, 'recut'],
    ])
    const one = await (await subGET(at(`/submissions/${ids.open}`, { secret: keys.read }), p({ id: ids.open }))).json()
    expect(one.submission.ops).toEqual([{ kind: 'text', page: 1, ids: [1], value: 'שורה!' }])
    expect(one.page.sig).toMatch(/^1:[0-9a-f]{8}$/)
    expect(one.page.doc.lines[0].polygon).toBeUndefined()
  })

  it('אישור במפתח — נרשם בשם בעל המפתח, "(תוכנת-הספר)"', async () => {
    const res = await subPATCH(at(`/submissions/${ids.open}`, { secret: keys.review, method: 'PATCH', json: { action: 'approve', note: 'אושר מהתוכנה' } }), p({ id: ids.open }))
    expect(res.status).toBe(200)
    const sub = await PageProofSubmission.findById(ids.open).lean()
    expect(sub).toMatchObject({ status: 'approved', reviewedByName: `מנהל${VIA_SUFFIX}`, reviewNote: 'אושר מהתוכנה' })
    expect(String(sub.reviewedBy)).toBe(String(admin._id))
  })

  it('מפתח בלי review אינו משנה דבר: אישור ו-mark=1 נדחים, ההגשה והסימון במקומם', async () => {
    expect((await subPATCH(at(`/submissions/${ids.open}`, { secret: keys.read, method: 'PATCH', json: { action: 'approve' } }), p({ id: ids.open }))).status).toBe(403)
    expect((await PageProofSubmission.findById(ids.open).lean()).status).toBe('submitted')
    expect((await fixesGET(at(`/books/${GID}/fixes?mark=1`, { secret: keys.read }), p({ gid: GID }))).status).toBe(403)
    expect(await PageProofSubmission.countDocuments({ exportedAt: { $ne: null } })).toBe(0)
  })

  it('תיקונים ?pages=recut — רק העמודים שממתינים לזיהוי-מחדש; עם mark=1 הם מסומנים שיצאו', async () => {
    const vol = await User.findOne({ name: 'מתנדב' })
    const p1 = await PageProofPage.findOne({ gid: GID, page: 1 })
    // עוד מאושרת — לעמוד שאינו ממתין לזיהוי-מחדש
    await PageProofSubmission.create({ page: p1._id, book: p1.book, gid: GID, pageNo: 1, user: vol._id, userName: 'מתנדב', who: 'otz-x', ops: [{ kind: 'text', page: 1, ids: [1], value: 'אחר' }], opCount: 1, status: 'approved', reviewedAt: new Date() })
    const all = JSON.parse(await (await fixesGET(at(`/books/${GID}/fixes`, { secret: keys.read }), p({ gid: GID }))).text())
    expect([...new Set(all.ops.map((o) => o.page))]).toEqual([1, 2])
    const res = await fixesGET(at(`/books/${GID}/fixes?pages=recut&mark=1`, { secret: keys.all }), p({ gid: GID }))
    const file = JSON.parse(await res.text())
    expect(file.ops.map((o) => [o.page, o.kind, o.revision])).toEqual([[2, 'line_split', 1]])
    expect(file.ops[0].sig).toMatch(/^1:/)
    expect(res.headers.get('X-Submission-Count')).toBe('1')
    const marked = await PageProofSubmission.find({ exportedAt: { $ne: null } }).lean()
    expect(marked.map((s) => s.pageNo)).toEqual([2])
  })
})

describe('ראוטים שאינם מקבלים מפתח', () => {
  it('401 גם עם מפתח תקף בכל ההרשאות — ושום דבר לא משתנה', async () => {
    for (const [name, call] of UNWIRED()) {
      const res = await call()
      expect(res.status, name).toBe(401)
    }
    expect(await PageProofBook.countDocuments({ gid: GID, status: 'active' })).toBe(1)
    expect(await PageProofPage.countDocuments({ volunteer: false })).toBe(0)
    expect(await PageProofToken.countDocuments({ revokedAt: { $ne: null } })).toBe(0)
    expect(await PageProofToken.countDocuments()).toBe(4)
  })
})

describe('בלי מפתח — ה-session כמו עד היום', () => {
  it('מנהל OCR מחובר — עובר; לא מחובר — 401; מחובר בלי הרשאת OCR — 403', async () => {
    for (const [name, , call] of WIRED()) {
      getServerSessionMock.mockResolvedValue({ user: { id: String(admin._id), _id: String(admin._id), name: 'מנהל', role: 'admin_ocr' } })
      expect([401, 403], name).not.toContain((await call(null)).status)
      getServerSessionMock.mockResolvedValue(null)
      expect((await call(null)).status, name).toBe(401)
      getServerSessionMock.mockResolvedValue({ user: { id: String(admin._id), role: 'admin_books' } })
      expect((await call(null)).status, name).toBe(403)
    }
  })

  it('אישור ב-session — נרשם בשם המשתמש, בלי הסיומת', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: String(admin._id), name: 'מנהל', role: 'admin_ocr' } })
    expect((await subPATCH(at(`/submissions/${ids.open}`, { method: 'PATCH', json: { action: 'approve' } }), p({ id: ids.open }))).status).toBe(200)
    expect((await PageProofSubmission.findById(ids.open).lean()).reviewedByName).toBe('מנהל')
  })
})
