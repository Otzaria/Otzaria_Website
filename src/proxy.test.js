// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

// ה-proxy מול מפתח-גישה של תוכנת-הספר: withAuth האמיתי של next-auth (בלי session — אין JWT)
// מפנה כל נתיב מוגן להתחברות; רק Bearer ppt_… לנתיבי הניהול של הגהת-העמודים (חוץ מניהול
// המפתחות) עובר לראוט — שם המפתח נבדק. חסימת השבת חלה גם על בקשות במפתח.
// שער-השבת מדומה (בלעדיו — בקשה ל-Hebcal).

const { isAssurBemlacha } = vi.hoisted(() => ({ isAssurBemlacha: vi.fn() }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha } }))

import proxy, { config } from './proxy'
import { shabbatBlock } from '@/lib/servicePlugins/http'

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
      '/api/admin/page-proof/books/gAbc12345/pages',
      // PATCH (השהיה) מקבל מפתח; DELETE באותו נתיב עונה 401 בראוט עצמו
      '/api/admin/page-proof/books/gAbc12345',
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

describe('proxy — /api/worker (עובד OCR מקומי)', () => {
  const paths = ['/api/worker/v1/jobs', '/api/worker/v1/jobs/64b7f0c2a1b2c3d4e5f60001/input']

  it('בימי חול — עובר לראוט כמו שהוא (בלי redirect להתחברות, גם בלי Bearer)', async () => {
    for (const path of paths) {
      expect(passed(await call(path)), path).toBe(true)
      expect(passed(await call(path, 'Bearer abc')), path).toBe(true)
    }
  })

  it('בשבת/יו"ט — לא מוחרג: 503 JSON עם Retry-After ו-no-store (לא HTML ולא redirect)', async () => {
    isAssurBemlacha.mockResolvedValue(true)
    for (const path of paths) {
      const res = await call(path, 'Bearer abc')
      expect(res.status, path).toBe(503)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      expect(res.headers.get('retry-after')).toBe('3600')
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      expect(res.headers.get('location')).toBeNull()
      expect(await res.json()).toMatchObject({ error: 'shabbat' })
    }
  })
})

describe('proxy — מפתח-גישה של צורת הדף (tht_)', () => {
  const THT = `tht_${'Ab9-_'.repeat(8)}xyz`

  it('Bearer tht_ בלי session עובר לראוטי הניהול של צורת הדף', async () => {
    for (const path of [
      '/api/admin/tzurat-hadaf/stats',
      '/api/admin/tzurat-hadaf/export',
      '/api/admin/tzurat-hadaf/uploads',
      '/api/admin/tzurat-hadaf/uploads/64b7f0c2a1b2c3d4e5f60001/chunks/3',
      '/api/admin/tzurat-hadaf/sync',
    ]) {
      expect(passed(await call(path, `Bearer ${THT}`)), path).toBe(true)
    }
  })

  it('ניהול המפתחות, שאר הניהול והמתנדב — הפניה להתחברות; ppt_ אינו פותח את צורת הדף ולהפך', async () => {
    for (const path of ['/api/admin/tzurat-hadaf/tokens', '/api/admin/tzurat-hadaf/tokens/64b7f0c2a1b2c3d4e5f60001', '/api/tzurat-hadaf/fast', '/api/admin/page-proof', '/library/admin/tzurat-hadaf']) {
      expect(toLogin(await call(path, `Bearer ${THT}`)), path).toBe(true)
    }
    expect(toLogin(await call('/api/admin/tzurat-hadaf/stats', `Bearer ${TOKEN}`))).toBe(true)
    expect(toLogin(await call('/api/admin/tzurat-hadaf/stats'))).toBe(true)
  })
})

describe('proxy — תוספי שירות', () => {
  const PID = '64b7f0c2a1b2c3d4e5f60001'

  it('דף ניהול השירות דורש התחברות; דף התוסף והקטגוריות נשארים ציבוריים', async () => {
    expect(toLogin(await call(`/plugins/${PID}/service`))).toBe(true)
    expect(toLogin(await call(`/plugins/${PID.toUpperCase()}/service`))).toBe(true)
    for (const path of [`/plugins/${PID}`, '/plugins/category/service', `/plugins/${PID}/services`]) {
      expect(passed(await call(path)), path).toBe(true)
    }
  })

  it('ה-API של תוספי השירות אינו מופנה להתחברות (ציבורי ונתיבי המתווך)', async () => {
    for (const path of [`/api/service-plugins/${PID}`, '/api/service-plugins/worker/claim']) {
      expect(passed(await call(path, 'Bearer worker-secret')), path).toBe(true)
    }
  })

  it('העלאת קובצי הגשה מוחרגת מה-proxy (שהיה מעתיק את כל הגוף לזיכרון); שאר ה-API והדפים לא', () => {
    const matches = (url) => unstable_doesMiddlewareMatch({ config, url })
    const RID = '64b7f0c2a1b2c3d4e5f60002'
    for (const key of ['plugin', 'native0', 'native7']) {
      expect(matches(`/api/service-plugins/${PID}/drafts/${RID}/assets/${key}`), key).toBe(false)
    }
    for (const url of [
      '/api/service-plugins/worker/claim', `/api/service-plugins/${PID}`, `/api/service-plugins/${PID}/drafts`,
      `/api/service-plugins/${PID}/drafts/${RID}`, `/api/service-plugins/${PID}/drafts/${RID}/seal`,
      `/api/service-plugins/${PID}/download/${RID}/plugin`, '/api/admin/plugins', '/api/plugins/search', '/api/cron/x',
      `/plugins/${PID}/service`, '/library/admin',
    ]) {
      expect(matches(url), url).toBe(true)
    }
    expect(matches('/_next/static/chunk.js')).toBe(false)
  })

  it('שער השבת של ראוט ההעלאה עונה בדיוק כמו ה-proxy', async () => {
    isAssurBemlacha.mockResolvedValue(true)
    const fromProxy = await call('/api/service-plugins/worker/claim')
    const fromRoute = await shabbatBlock()
    expect(fromRoute.status).toBe(fromProxy.status)
    for (const h of ['cache-control', 'retry-after']) expect(fromRoute.headers.get(h), h).toBe(fromProxy.headers.get(h))
    expect(await fromRoute.json()).toEqual(await fromProxy.json())
    isAssurBemlacha.mockResolvedValue(false)
    expect(await shabbatBlock()).toBeNull()
  })

  it('בשבת/יו"ט — גם נתיבי המתווך נחסמים (503)', async () => {
    isAssurBemlacha.mockResolvedValue(true)
    const res = await call('/api/service-plugins/worker/claim', 'Bearer worker-secret')
    expect(res.status).toBe(503)
  })
})
