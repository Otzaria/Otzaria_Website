// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server, כמו בדיקות-האינטגרציה של node:test) — המפתח נמצא
// לפי הגיבוב במסד, והמשתמש נקרא מהמסד בכל שימוש. בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// getPageProofSession (tokenAuth.js): בלי Bearer — בדיוק getServerSession; עם Bearer — המפתח בלבד:
// תקף/שגוי/פגום/פג/בוטל, משתמש שהורד מתפקידו או נמחק, הרשאה חסרה, "שימוש אחרון" לכל היותר פעם
// בדקה, והאטה לפי כתובת אחרי ניסיונות שגויים.

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import User from '@/models/User'
import PageProofToken from '@/models/PageProofToken'
import { requireAccess } from '@/lib/apiResponse'
import { hasOcrAccess } from '@/lib/roles'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { getPageProofSession } from './tokenAuth'
import { bearerFailures, FAIL_LIMIT } from './tokenThrottle'
import { generateToken, hashToken } from './tokenSecret'
import { tokenPrefixOf, TOUCH_MS, VIA_SUFFIX } from './tokenRules'

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
let admin

async function mkToken(user, extra = {}) {
  const secret = generateToken()
  const doc = await PageProofToken.create({
    user: user._id,
    name: 'בדיקה',
    hash: hashToken(secret),
    prefix: tokenPrefixOf(secret),
    expiresAt: new Date(Date.now() + 30 * DAY),
    ...extra,
  })
  return { secret, doc }
}

const req = (authorization, headers = {}) =>
  new Request('http://localhost/api/admin/page-proof', { headers: authorization === null ? headers : { authorization, ...headers } })
const bearer = (secret, headers) => req(`Bearer ${secret}`, headers)

async function expectKeyError(res, status, code) {
  expect(res.session).toBeNull()
  expect(res.denied.status).toBe(status)
  expect(res.denied.headers.get('Cache-Control')).toBe('private, no-store')
  const body = await res.denied.json()
  expect(body).toMatchObject({ success: false, code })
  expect(body.error).toMatch(/[א-ת]/)
  return body
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  bearerFailures.reset()
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(null)
  admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin_ocr' })
})

afterEach(() => {
  delete process.env.TRUSTED_PROXY_COUNT
})

describe('בלי Bearer — ה-session כמו עד היום', () => {
  it('מחזיר את getServerSession כמות-שהוא, בלי לגשת למפתחות', async () => {
    const session = { user: { id: 'x', role: 'admin' } }
    getServerSessionMock.mockResolvedValue(session)
    const spy = vi.spyOn(PageProofToken, 'findOne')
    for (const r of [req(null), req('Basic dXNlcjpwYXNz'), undefined, {}, { headers: {} }]) {
      const out = await getPageProofSession(r, 'read')
      expect(out.denied).toBeNull()
      expect(out.session).toBe(session)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('בלי session — null, ו-requireAccess נותן 401 כרגיל', async () => {
    const out = await getPageProofSession(req(null), 'read')
    expect(out).toEqual({ session: null, denied: null })
    expect(requireAccess(out.session, hasOcrAccess).status).toBe(401)
  })
})

describe('Bearer — מפתח תקף', () => {
  it('session מדומה של בעל המפתח, ו-requireAccess עובר עליו בלי שינוי; ה-session של הדפדפן אינו נשאל', async () => {
    const { secret, doc } = await mkToken(admin, { scopes: ['read', 'review'] })
    getServerSessionMock.mockResolvedValue({ user: { id: 'other', role: 'admin' } })
    const out = await getPageProofSession(bearer(secret), 'read')
    expect(out.denied).toBeNull()
    expect(out.session).toEqual({
      user: { id: String(admin._id), _id: String(admin._id), name: `מנהל${VIA_SUFFIX}`, role: 'admin_ocr' },
      via: 'token',
      tokenId: String(doc._id),
      scopes: ['read', 'review'],
    })
    expect(requireAccess(out.session, hasOcrAccess)).toBeNull()
    expect(getServerSessionMock).not.toHaveBeenCalled()
    // כמה הרשאות — כולן נדרשות
    expect((await getPageProofSession(bearer(secret), ['read', 'review'])).denied).toBeNull()
  })

  it('גם מנהל כללי (admin)', async () => {
    const boss = await User.create({ name: 'ראשי', email: 'b@example.org', password: 'x', role: 'admin' })
    const { secret } = await mkToken(boss)
    const out = await getPageProofSession(bearer(secret), 'import')
    expect(out.session.user.role).toBe('admin')
  })
})

describe('Bearer — נדחה', () => {
  it('מפתח שגוי (בצורה תקינה) ← 401 token_invalid, עם WWW-Authenticate', async () => {
    await mkToken(admin)
    const res = await getPageProofSession(bearer(generateToken()), 'read')
    await expectKeyError(res, 401, 'token_invalid')
    expect(res.denied.headers.get('WWW-Authenticate')).toMatch(/^Bearer realm="page-proof", error="invalid_token"/)
  })

  it('פגום: Bearer ריק, קצר, בלי ppt_, שני ערכים ← 401 בלי לגשת למסד', async () => {
    const spy = vi.spyOn(PageProofToken, 'findOne')
    for (const h of ['Bearer', 'Bearer ', 'Bearer ppt_abc', 'Bearer abc.def.ghi', `Bearer ${generateToken()} x`]) {
      await expectKeyError(await getPageProofSession(req(h), 'read'), 401, 'token_invalid')
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('פג ← 401 token_expired', async () => {
    const { secret } = await mkToken(admin, { expiresAt: new Date(Date.now() - 1000) })
    await expectKeyError(await getPageProofSession(bearer(secret), 'read'), 401, 'token_expired')
  })

  it('בוטל ← 401 token_revoked — מיד, בלי מטמון', async () => {
    const { secret, doc } = await mkToken(admin)
    expect((await getPageProofSession(bearer(secret), 'read')).denied).toBeNull()
    await PageProofToken.updateOne({ _id: doc._id }, { $set: { revokedAt: new Date() } })
    await expectKeyError(await getPageProofSession(bearer(secret), 'read'), 401, 'token_revoked')
  })

  it('המשתמש כבר אינו מנהל OCR ← 403 token_user; חזר להיות — המפתח פועל שוב', async () => {
    const { secret } = await mkToken(admin)
    for (const role of ['user', 'admin_books', 'admin_plugins', 'developer']) {
      await User.updateOne({ _id: admin._id }, { $set: { role } })
      await expectKeyError(await getPageProofSession(bearer(secret), 'read'), 403, 'token_user')
    }
    await User.updateOne({ _id: admin._id }, { $set: { role: 'admin_ocr' } })
    expect((await getPageProofSession(bearer(secret), 'read')).denied).toBeNull()
  })

  it('המשתמש נמחק ← 401', async () => {
    const { secret } = await mkToken(admin)
    await User.deleteOne({ _id: admin._id })
    await expectKeyError(await getPageProofSession(bearer(secret), 'read'), 401, 'token_invalid')
  })

  it('אין למפתח ההרשאה ← 403 token_scope (עם insufficient_scope)', async () => {
    const { secret } = await mkToken(admin, { scopes: ['read'] })
    const res = await getPageProofSession(bearer(secret), 'review')
    await expectKeyError(res, 403, 'token_scope')
    expect(res.denied.headers.get('WWW-Authenticate')).toBe('Bearer realm="page-proof", error="insufficient_scope", scope="review"')
    await expectKeyError(await getPageProofSession(bearer(secret), 'import'), 403, 'token_scope')
    await expectKeyError(await getPageProofSession(bearer(secret), ['read', 'review']), 403, 'token_scope')
    expect((await getPageProofSession(bearer(secret), 'read')).denied).toBeNull()
  })

  it('ראוט שלא ציין הרשאה — נדחה (לא "הכול מותר")', async () => {
    const { secret } = await mkToken(admin)
    await expectKeyError(await getPageProofSession(bearer(secret)), 403, 'token_scope')
    await expectKeyError(await getPageProofSession(bearer(secret), []), 403, 'token_scope')
  })
})

describe('שימוש אחרון', () => {
  it('נרשם בשימוש הראשון, ולא שוב בתוך דקה; אחרי דקה — מתעדכן', async () => {
    const { secret, doc } = await mkToken(admin)
    const lastUsed = async () => (await PageProofToken.findById(doc._id).lean()).lastUsedAt
    expect(await lastUsed()).toBeNull()
    await getPageProofSession(bearer(secret), 'read')
    const first = await lastUsed()
    expect(first).toBeInstanceOf(Date)
    await getPageProofSession(bearer(secret), 'read')
    expect((await lastUsed()).getTime()).toBe(first.getTime())
    const old = new Date(Date.now() - TOUCH_MS - 5000)
    await PageProofToken.updateOne({ _id: doc._id }, { $set: { lastUsedAt: old } })
    await getPageProofSession(bearer(secret), 'read')
    expect((await lastUsed()).getTime()).toBeGreaterThan(old.getTime())
  })

  it('ניסיון שנדחה (הרשאה חסרה) אינו נרשם כשימוש', async () => {
    const { secret, doc } = await mkToken(admin, { scopes: ['read'] })
    await getPageProofSession(bearer(secret), 'import')
    expect((await PageProofToken.findById(doc._id).lean()).lastUsedAt).toBeNull()
  })
})

describe('האטה לפי כתובת', () => {
  it(`אחרי ${FAIL_LIMIT} ניסיונות שגויים — 429 עם Retry-After, גם למפתח תקף מאותה כתובת; כתובת אחרת לא נפגעת`, async () => {
    process.env.TRUSTED_PROXY_COUNT = '1'
    const { secret } = await mkToken(admin)
    const from = (ip, s) => bearer(s, { 'x-forwarded-for': ip })
    for (let i = 0; i < FAIL_LIMIT; i++) {
      await expectKeyError(await getPageProofSession(from('203.0.113.7', generateToken()), 'read'), 401, 'token_invalid')
    }
    const spy = vi.spyOn(PageProofToken, 'findOne')
    const blocked = await getPageProofSession(from('203.0.113.7', secret), 'read')
    await expectKeyError(blocked, 429, 'token_throttled')
    expect(Number(blocked.denied.headers.get('Retry-After'))).toBeGreaterThan(0)
    // חסום — בלי לגשת למסד
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect((await getPageProofSession(from('198.51.100.9', secret), 'read')).denied).toBeNull()
    // בלי Bearer — ההאטה אינה חלה (ה-session הרגיל)
    expect((await getPageProofSession(req(null, { 'x-forwarded-for': '203.0.113.7' }), 'read')).denied).toBeNull()
  })

  it('פג/בוטל נספרים; הרשאה חסרה ומשתמש שהורד — לא', async () => {
    process.env.TRUSTED_PROXY_COUNT = '1'
    const from = (s) => bearer(s, { 'x-forwarded-for': '192.0.2.1' })
    const { secret: readOnly } = await mkToken(admin, { scopes: ['read'] })
    for (let i = 0; i < FAIL_LIMIT + 2; i++) await getPageProofSession(from(readOnly), 'import')
    expect((await getPageProofSession(from(readOnly), 'read')).denied).toBeNull()
    const { secret: expired } = await mkToken(admin, { expiresAt: new Date(Date.now() - 1000) })
    for (let i = 0; i < FAIL_LIMIT; i++) await getPageProofSession(from(expired), 'read')
    await expectKeyError(await getPageProofSession(from(readOnly), 'read'), 429, 'token_throttled')
  })
})
