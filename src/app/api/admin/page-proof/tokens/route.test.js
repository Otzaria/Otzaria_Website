// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// ניהול מפתחות-הגישה (tokens, tokens/[id]): יצירה — המפתח מוחזר פעם אחת ורק הגיבוב נשמר;
// "נוצר ← עובד"; רשימה בלי סודות ורק של המשתמש; תקרת 5 פעילים; קלט שגוי; ביטול מיידי;
// ורק session — מפתח לעולם אינו יוצר, מציג או מבטל מפתחות.

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import mongoose from 'mongoose'
import User from '@/models/User'
import PageProofToken from '@/models/PageProofToken'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { getPageProofSession } from '@/lib/pageProof/tokenAuth'
import { bearerFailures } from '@/lib/pageProof/tokenThrottle'
import { hashToken } from '@/lib/pageProof/tokenSecret'
import { TOKEN_RE, MAX_ACTIVE, DEFAULT_DAYS } from '@/lib/pageProof/tokenRules'
import { GET, POST } from './route'
import { DELETE } from './[id]/route'
import { GET as listBooks } from '../route'

// מסד אמיתי — תחת עומס (כל הבדיקות במקביל) בקשות רבות לוקחות יותר מ-5 שניות
vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const DAY = 24 * 3600 * 1000
const URL_TOKENS = 'http://localhost/api/admin/page-proof/tokens'
let admin
let other

const sessionOf = (u) => ({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role } })
const post = (body, headers = {}) => new Request(URL_TOKENS, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const get = (headers = {}) => new Request(URL_TOKENS, { headers })
const del = (id, headers = {}) => [new Request(`${URL_TOKENS}/${id}`, { method: 'DELETE', headers }), { params: Promise.resolve({ id: String(id) }) }]

async function create(body = { name: 'תוכנת-הספר' }) {
  const res = await POST(post(body))
  return { res, body: await res.json() }
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  bearerFailures.reset()
  vi.clearAllMocks()
  admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin_ocr' })
  other = await User.create({ name: 'אחר', email: 'o@example.org', password: 'x', role: 'admin' })
  getServerSessionMock.mockResolvedValue(sessionOf(admin))
})

describe('יצירה', () => {
  it('201: המפתח מוחזר פעם אחת; במסד רק הגיבוב וה-prefix; ברירות-מחדל 180 יום וכל ההרשאות', async () => {
    const before = Date.now()
    const { res, body } = await create({ name: '  תוכנת-הספר — בית  ' })
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(body.success).toBe(true)
    expect(body.token).toMatch(TOKEN_RE)
    expect(body.item).toMatchObject({ name: 'תוכנת-הספר — בית', prefix: body.token.slice(0, 8), scopes: ['read', 'review', 'import'], state: 'active', lastUsedAt: null, revokedAt: null })
    expect(Object.keys(body.item)).not.toContain('hash')
    const exp = new Date(body.item.expiresAt).getTime()
    expect(exp).toBeGreaterThanOrEqual(before + DEFAULT_DAYS * DAY)
    expect(exp).toBeLessThanOrEqual(Date.now() + DEFAULT_DAYS * DAY)

    const stored = await PageProofToken.findById(body.item.id).select('+hash').lean()
    expect(stored.hash).toBe(hashToken(body.token))
    expect(String(stored.user)).toBe(String(admin._id))
    // המפתח עצמו אינו נשמר בשום שדה
    expect(JSON.stringify(stored)).not.toContain(body.token)
    expect(JSON.stringify(stored)).not.toContain(body.token.slice(8))
    // ובשאילתה רגילה גם הגיבוב אינו יוצא
    expect((await PageProofToken.findById(body.item.id).lean()).hash).toBeUndefined()
  })

  it('נוצר ← עובד: המפתח מתקבל בראוט מחווט (רשימת-הספרים), בלי session', async () => {
    const { body } = await create({ name: 'בית', days: 30, scopes: ['read'] })
    getServerSessionMock.mockClear()
    getServerSessionMock.mockResolvedValue(null)
    const ok = await getPageProofSession(new Request('http://localhost/api/admin/page-proof', { headers: { authorization: `Bearer ${body.token}` } }), 'read')
    expect(ok.denied).toBeNull()
    expect(ok.session.user.id).toBe(String(admin._id))
    const res = await listBooks(new Request('http://localhost/api/admin/page-proof', { headers: { authorization: `Bearer ${body.token}` } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, books: [] })
    expect(getServerSessionMock).not.toHaveBeenCalled()
  })

  it('תוקף והרשאות לבחירה', async () => {
    const { body } = await create({ name: 'קצר', days: 7, scopes: ['import', 'read'] })
    expect(body.item.scopes).toEqual(['read', 'import'])
    const days = (new Date(body.item.expiresAt).getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('קלט שגוי ← 400 בעברית, ושום מפתח לא נוצר', async () => {
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(61) }, { name: 'a', days: 0 }, { name: 'a', days: 366 }, { name: 'a', days: 'שנה' }, { name: 'a', scopes: [] }, { name: 'a', scopes: ['admin'] }]) {
      const { res, body } = await create(bad)
      expect(res.status, JSON.stringify(bad)).toBe(400)
      expect(body.error).toMatch(/[א-ת]/)
    }
    const res = await POST(new Request(URL_TOKENS, { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
    expect(await PageProofToken.countDocuments()).toBe(0)
  })

  it(`עד ${MAX_ACTIVE} פעילים למשתמש; בוטל/פג אינם נספרים; משתמש אחר — תקרה משלו`, async () => {
    for (let i = 0; i < MAX_ACTIVE; i++) expect((await create({ name: `מפתח ${i}` })).res.status).toBe(201)
    const { res, body } = await create({ name: 'עוד אחד' })
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/פעילים/)
    expect(await PageProofToken.countDocuments({ user: admin._id })).toBe(MAX_ACTIVE)

    const one = await PageProofToken.findOne({ user: admin._id })
    await PageProofToken.updateOne({ _id: one._id }, { $set: { revokedAt: new Date() } })
    expect((await create({ name: 'במקום המבוטל' })).res.status).toBe(201)
    const two = await PageProofToken.findOne({ user: admin._id, revokedAt: null })
    await PageProofToken.updateOne({ _id: two._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await create({ name: 'במקום שפג' })).res.status).toBe(201)

    getServerSessionMock.mockResolvedValue(sessionOf(other))
    expect((await create({ name: 'של אחר' })).res.status).toBe(201)
  })
})

describe('רשימה', () => {
  it('רק המפתחות של המשתמש, מהחדש לישן, בלי המפתח ובלי הגיבוב, עם מצב', async () => {
    const a = await create({ name: 'ראשון' })
    const b = await create({ name: 'שני', scopes: ['read'] })
    await PageProofToken.updateOne({ _id: a.body.item.id }, { $set: { revokedAt: new Date() } })
    getServerSessionMock.mockResolvedValue(sessionOf(other))
    const c = await create({ name: 'של האחר' })
    getServerSessionMock.mockResolvedValue(sessionOf(admin))

    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toMatchObject({ success: true, active: 1, max: MAX_ACTIVE })
    expect(body.tokens.map((t) => [t.name, t.state, t.scopes])).toEqual([
      ['שני', 'active', ['read']],
      ['ראשון', 'revoked', ['read', 'review', 'import']],
    ])
    const text = JSON.stringify(body)
    for (const secret of [a.body.token, b.body.token, c.body.token]) {
      expect(text).not.toContain(secret)
      expect(text).not.toContain(hashToken(secret))
    }
    expect(text).not.toContain('hash')
    expect(text).not.toContain('של האחר')
  })
})

describe('ביטול', () => {
  it('מיידי: המפתח מפסיק לפעול בבקשה הבאה; ביטול חוזר — already', async () => {
    const { body } = await create({ name: 'בית' })
    const auth = { authorization: `Bearer ${body.token}` }
    const use = () => getPageProofSession(new Request('http://localhost/api/admin/page-proof', { headers: auth }), 'read')
    expect((await use()).denied).toBeNull()

    const res = await DELETE(...del(body.item.id))
    expect(res.status).toBe(200)
    const out = await res.json()
    expect(out).toMatchObject({ success: true, item: { id: body.item.id, state: 'revoked' } })
    expect(JSON.stringify(out)).not.toContain(body.token)

    const denied = (await use()).denied
    expect(denied.status).toBe(401)
    expect((await denied.json()).code).toBe('token_revoked')

    const again = await DELETE(...del(body.item.id))
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ success: true, already: true })
  })

  it('מפתח של משתמש אחר ← 404 (ולא מבוטל); מזהה לא תקין ← 400; לא קיים ← 404', async () => {
    getServerSessionMock.mockResolvedValue(sessionOf(other))
    const { body } = await create({ name: 'של האחר' })
    getServerSessionMock.mockResolvedValue(sessionOf(admin))
    expect((await DELETE(...del(body.item.id))).status).toBe(404)
    expect((await PageProofToken.findById(body.item.id).lean()).revokedAt).toBeNull()
    expect((await DELETE(...del('not-an-id'))).status).toBe(400)
    expect((await DELETE(...del(new mongoose.Types.ObjectId()))).status).toBe(404)
  })
})

describe('רק session — מפתח לעולם אינו מנהל מפתחות', () => {
  it('Bearer תקף בלי session ← 401 ביצירה, ברשימה ובביטול; שום דבר לא משתנה', async () => {
    const { body } = await create({ name: 'בית' })
    getServerSessionMock.mockResolvedValue(null)
    const auth = { authorization: `Bearer ${body.token}` }
    expect((await POST(post({ name: 'מפתח ממפתח' }, auth))).status).toBe(401)
    expect((await GET(get(auth))).status).toBe(401)
    expect((await DELETE(...del(body.item.id, auth))).status).toBe(401)
    expect(await PageProofToken.countDocuments()).toBe(1)
    expect((await PageProofToken.findById(body.item.id).lean()).revokedAt).toBeNull()
  })

  it('בלי session ← 401; בלי הרשאת OCR ← 403', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect((await GET(get())).status).toBe(401)
    expect((await POST(post({ name: 'x' }))).status).toBe(401)
    for (const role of ['user', 'admin_books', 'admin_plugins']) {
      getServerSessionMock.mockResolvedValue({ user: { id: String(admin._id), role } })
      expect((await GET(get())).status).toBe(403)
      expect((await POST(post({ name: 'x' }))).status).toBe(403)
      expect((await DELETE(...del(new mongoose.Types.ObjectId()))).status).toBe(403)
    }
    expect(await PageProofToken.countDocuments()).toBe(0)
  })
})
