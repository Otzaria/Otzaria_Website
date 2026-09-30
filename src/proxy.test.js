// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ה-proxy מול מפתח-גישה של תוכנת-הספר: withAuth האמיתי של next-auth (בלי session — אין JWT)
// מפנה כל נתיב מוגן להתחברות; רק Bearer ppt_… לנתיבי הניהול של הגהת-העמודים (חוץ מניהול
// המפתחות) עובר לראוט — שם המפתח נבדק. חסימת השבת חלה גם על בקשות במפתח.
// שער-השבת מדומה (בלעדיו — בקשה ל-Hebcal).

const { isAssurBemlacha } = vi.hoisted(() => ({ isAssurBemlacha: vi.fn() }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha } }))

import proxy from './proxy'

const TOKEN = `ppt_${'Ab9-_'.repeat(8)}xyz`
const event = { waitUntil: () => {} }
const call = (path, authorization) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { headers: authorization ? { authorization } : {} }), event)

const passed = (res) => res.headers.get('x-middleware-next') === '1'
const toLogin = (res) => res.status === 307 && /\/auth\/login\?callbackUrl=/.test(res.headers.get('location') || '')

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-for-proxy'
})
beforeEach(() => {
  isAssurBemlacha.mockResolvedValue(false)
})

describe('proxy — מפתח-גישה של תוכנת-הספר', () => {
  it('Bearer ppt_ בלי session עובר לראוטי הניהול של הגהת-העמודים', async () => {
    for (const path of [
      '/api/admin/page-proof',
      '/api/admin/page-proof/submissions',
      '/api/admin/page-proof/submissions/64b7f0c2a1b2c3d4e5f60001',
      '/api/admin/page-proof/books/gAbc12345/fixes',
      '/api/admin/page-proof/books/gAbc12345/submissions',
      '/api/admin/page-proof/import',
    ]) {
      expect(passed(await call(path, `Bearer ${TOKEN}`)), path).toBe(true)
    }
  })

  it('ניהול המפתחות ושאר האתר — הפניה להתחברות, כמו בלי מפתח', async () => {
    for (const path of ['/api/admin/page-proof/tokens', '/api/admin/page-proof/tokens/64b7f0c2a1b2c3d4e5f60001', '/api/admin/users', '/api/admin/books', '/api/page-proof', '/library/admin/page-proof']) {
      expect(toLogin(await call(path, `Bearer ${TOKEN}`)), path).toBe(true)
    }
  })

  it('בלי מפתח, או Bearer שאינו ppt_ — ההתנהגות הקיימת (הפניה להתחברות)', async () => {
    expect(toLogin(await call('/api/admin/page-proof'))).toBe(true)
    expect(toLogin(await call('/api/admin/page-proof', 'Bearer abc.def.ghi'))).toBe(true)
    expect(toLogin(await call('/api/admin/page-proof', 'Basic dXNlcjpwYXNz'))).toBe(true)
    // נתיב ציבורי — עובר כמו תמיד, עם מפתח או בלעדיו
    expect(passed(await call('/api/plugins/search'))).toBe(true)
    expect(passed(await call('/api/plugins/search', `Bearer ${TOKEN}`))).toBe(true)
  })

  it('בשבת/יו"ט — 503 JSON גם לבקשה במפתח', async () => {
    isAssurBemlacha.mockResolvedValue(true)
    const res = await call('/api/admin/page-proof', `Bearer ${TOKEN}`)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('3600')
    expect(await res.json()).toMatchObject({ error: 'shabbat' })
  })
})
