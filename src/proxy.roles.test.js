// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'

// הרשאות לפי תפקיד ב-proxy, עם JWT אמיתי של next-auth (בלי DB). שער-השבת מדומה.
const { isAssurBemlacha } = vi.hoisted(() => ({ isAssurBemlacha: vi.fn() }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha } }))

import proxy from './proxy'

const SECRET = 'test-secret-for-proxy-roles'
const event = { waitUntil: () => {} }

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = SECRET
})
beforeEach(() => {
  isAssurBemlacha.mockResolvedValue(false)
})

async function call(path, role) {
  const headers = {}
  if (role) {
    const token = await encode({ token: { sub: 'u1', role }, secret: SECRET })
    headers.cookie = `next-auth.session-token=${token}`
  }
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }), event)
}

const passed = (res) => res.headers.get('x-middleware-next') === '1'
const denied = (res) =>
  (res.status === 307 && /\/library\/unauthorized/.test(res.headers.get('location') || '')) || res.status === 403

const OCR_PAGES = ['/library/admin/ocr-training', '/library/admin/ocr-lines', '/library/admin/ocr-layout', '/library/admin/page-proof']
const OCR_APIS = ['/api/admin/ocr-training', '/api/admin/ocr-lines/abc', '/api/admin/ocr-layout', '/api/admin/page-proof', '/api/admin/stats']
const SEARCH_FEEDBACK_PAGE = '/library/admin/search-feedback'
const OTHER_PAGES = ['/library/admin/users', '/library/admin/books', '/library/admin/plugins', '/library/admin/app-reports', '/library/admin/messages']
const OTHER_APIS = ['/api/admin/users', '/api/admin/books', '/api/admin/plugins']

describe('proxy — תפקיד מאמן מודלים', () => {
  it('מאמן מודלים: דשבורד, כל אזורי ה-OCR ומשוב החיפוש', async () => {
    for (const path of ['/library/admin', ...OCR_PAGES, SEARCH_FEEDBACK_PAGE, ...OCR_APIS]) {
      expect(passed(await call(path, 'model_trainer')), path).toBe(true)
    }
  })

  it('מאמן מודלים: שאר אזורי הניהול חסומים', async () => {
    for (const path of [...OTHER_PAGES, ...OTHER_APIS]) {
      expect(denied(await call(path, 'model_trainer')), path).toBe(true)
    }
  })

  it('מנהל OCR ללא שינוי: OCR כן, משוב החיפוש לא', async () => {
    for (const path of ['/library/admin', ...OCR_PAGES, ...OCR_APIS]) {
      expect(passed(await call(path, 'admin_ocr')), path).toBe(true)
    }
    expect(denied(await call(SEARCH_FEEDBACK_PAGE, 'admin_ocr'))).toBe(true)
  })

  it('מנהל כללי: הכל, כולל משוב החיפוש', async () => {
    for (const path of ['/library/admin', ...OCR_PAGES, SEARCH_FEEDBACK_PAGE, ...OTHER_PAGES, ...OTHER_APIS]) {
      expect(passed(await call(path, 'admin')), path).toBe(true)
    }
  })

  it('דף משוב החיפוש חסום לשאר התפקידים', async () => {
    for (const role of ['admin_books', 'admin_books_only', 'admin_plugins', 'developer', 'user']) {
      expect(denied(await call(SEARCH_FEEDBACK_PAGE, role)), role).toBe(true)
    }
  })

  it('API הניהול של המשוב דורש התחברות; עם session עובר לראוט (שבודק תפקיד מה-DB)', async () => {
    const anon = await call('/api/search-feedback/admin/stats')
    expect(anon.status).toBe(307)
    expect(anon.headers.get('location')).toMatch(/\/auth\/login/)
    expect(passed(await call('/api/search-feedback/admin/stats', 'user'))).toBe(true)
    // הנתיבים הציבוריים של התוכנה פתוחים בלי session
    expect(passed(await call('/api/search-feedback/events'))).toBe(true)
  })
})
