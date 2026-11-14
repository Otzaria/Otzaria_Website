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

// role — מחרוזת (JWT ישן: role בלבד), או אובייקט { role, roles } (JWT עם תפקידים מרובים)
async function call(path, role) {
  const headers = {}
  if (role) {
    const fields = typeof role === 'string' ? { role } : role
    const token = await encode({ token: { sub: 'u1', ...fields }, secret: SECRET })
    headers.cookie = `next-auth.session-token=${token}`
  }
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }), event)
}

const passed = (res) => res.headers.get('x-middleware-next') === '1'
const denied = (res) =>
  (res.status === 307 && /\/library\/unauthorized/.test(res.headers.get('location') || '')) || res.status === 403

const OCR_PAGES = ['/library/admin/ocr-training', '/library/admin/ocr-lines', '/library/admin/ocr-layout', '/library/admin/page-proof']
const OCR_APIS = ['/api/admin/ocr-training', '/api/admin/ocr-lines/abc', '/api/admin/ocr-layout', '/api/admin/page-proof', '/api/admin/training-proof/review', '/api/admin/stats']
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

describe('proxy — צורת הדף', () => {
  const PAGES = ['/library/admin/tzurat-hadaf']
  const APIS = ['/api/admin/tzurat-hadaf/stats', '/api/admin/tzurat-hadaf/uploads/64b7f0c2a1b2c3d4e5f60001/chunks/0']

  it('מנהל כללי ומנהל ספרים — הניהול פתוח', async () => {
    for (const role of ['admin', 'admin_books']) {
      for (const path of [...PAGES, ...APIS]) expect(passed(await call(path, role)), `${role} ${path}`).toBe(true)
    }
  })

  it('מנהל OCR, מנהל ספרים-בלבד, מאמן מודלים, מנהל תוספים — חסומים', async () => {
    for (const role of ['admin_ocr', 'admin_books_only', 'model_trainer', 'admin_plugins', 'user']) {
      for (const path of [...PAGES, ...APIS]) expect(denied(await call(path, role)), `${role} ${path}`).toBe(true)
    }
  })

  it('אזור המתנדב דורש התחברות; עם session עובר לראוט (שבודק אימות)', async () => {
    for (const path of ['/library/tzurat-hadaf', '/library/tzurat-hadaf/fast', '/api/tzurat-hadaf/fast']) {
      const anon = await call(path)
      expect(anon.status, path).toBe(307)
      expect(anon.headers.get('location')).toMatch(/\/auth\/login/)
      expect(passed(await call(path, 'user')), path).toBe(true)
    }
  })
})

describe('proxy — כמה תפקידים לאותו משתמש (איחוד הרשאות)', () => {
  const BOOKS_AND_OCR = { role: 'admin_books', roles: ['admin_books', 'admin_ocr'] }
  const UPLOADS = ['/library/admin/uploads', '/api/admin/uploads/list']

  it('מנהל ספרים + מנהל OCR: גם אזורי ה-OCR וגם ההעלאות', async () => {
    for (const path of ['/library/admin', ...OCR_PAGES, ...OCR_APIS, ...UPLOADS, '/library/admin/books', '/api/admin/books']) {
      expect(passed(await call(path, BOOKS_AND_OCR)), path).toBe(true)
    }
  })

  it('מנהל ספרים + מנהל OCR: מה ששניהם חוסמים נשאר חסום (משתמשים, תוספים, משוב החיפוש)', async () => {
    for (const path of ['/library/admin/users', '/api/admin/users', '/library/admin/plugins', '/api/admin/plugins', SEARCH_FEEDBACK_PAGE]) {
      expect(denied(await call(path, BOOKS_AND_OCR)), path).toBe(true)
    }
  })

  it('כל תפקיד לבדו עדיין חסום במה שהשני מתיר', async () => {
    for (const path of OCR_PAGES) expect(denied(await call(path, 'admin_books')), path).toBe(true)
    for (const path of UPLOADS) expect(denied(await call(path, 'admin_ocr')), path).toBe(true)
  })

  it('התפקיד הראשי לבדו (role) לא קובע — roles קובע, בכל סדר', async () => {
    const ocrFirst = { role: 'admin_ocr', roles: ['admin_ocr', 'admin_books'] }
    for (const path of [...OCR_PAGES, ...UPLOADS]) expect(passed(await call(path, ocrFirst)), path).toBe(true)
  })

  it('מפתח + מנהל OCR: הלוח נפתח (לא מפנה לדיווחים), וגם דיווחי התוכנה וגם OCR', async () => {
    const devOcr = { role: 'admin_ocr', roles: ['admin_ocr', 'developer'] }
    for (const path of ['/library/admin', '/library/admin/app-reports', ...OCR_PAGES]) {
      expect(passed(await call(path, devOcr)), path).toBe(true)
    }
    expect(denied(await call('/library/admin/uploads', devOcr))).toBe(true)
  })

  it('מפתח בלבד: הלוח עדיין מפנה לדיווחי התוכנה', async () => {
    const res = await call('/library/admin', { role: 'developer', roles: ['developer'] })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/library\/admin\/app-reports$/)
  })

  it('מנהל תוספים + מנהל ספרים-בלבד: תוספים וספרים, בלי העלאות', async () => {
    const pb = { role: 'admin_books_only', roles: ['admin_plugins', 'admin_books_only'] }
    for (const path of ['/library/admin/plugins', '/api/admin/plugins', '/library/admin/books', '/api/admin/books']) {
      expect(passed(await call(path, pb)), path).toBe(true)
    }
    for (const path of UPLOADS) expect(denied(await call(path, pb)), path).toBe(true)
  })
})
