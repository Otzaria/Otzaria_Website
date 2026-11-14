// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { visibleNavItems } from './adminNav.js'
import { canHandleCorrections } from './roles.js'

// התאמה בין סרגל הניהול ל-proxy: כל קישור שהסרגל מציג לצופה חייב לעבור את ה-proxy
// עבור אותו צופה (אחרת המשתמש לוחץ ומקבל "אין הרשאה"). JWT אמיתי של next-auth, בלי DB;
// שער השבת מדומה — כמו ב-src/proxy.roles.test.js. הצופה כולל גם את הדגלים שב-JWT
// (מתנדב תיקונים, מפקח) — משתמש רגיל עם דגל רואה את הסרגל בעמודי /library/corrections.
const { isAssurBemlacha } = vi.hoisted(() => ({ isAssurBemlacha: vi.fn() }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha } }))

import proxy from '../proxy'

const SECRET = 'test-secret-for-admin-nav'
const event = { waitUntil: () => {} }

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = SECRET
})
beforeEach(() => {
  isAssurBemlacha.mockResolvedValue(false)
})

async function call(path, viewer) {
  const token = await encode({ token: { sub: 'u1', ...viewer }, secret: SECRET })
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: `next-auth.session-token=${token}` } }), event)
}

const passed = (res) => res.headers.get('x-middleware-next') === '1'

const ROLES = ['admin', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'model_trainer', 'developer']

// כל תפקיד (וגם משתמש רגיל), בלי דגלים ועם כל צירוף של דגל מתנדב תיקונים ודגל מפקח
const FLAGS = [{}, { isCorrectionsVolunteer: true }, { isSupervisor: true }, { isCorrectionsVolunteer: true, isSupervisor: true }]
// וגם כל זוג תפקידים (תפקידים מרובים — roles ב-JWT, role הוא הראשי): הסרגל מציג איחוד, וה-proxy מתיר איחוד
const PAIRS = ROLES.flatMap((a, i) => ROLES.slice(i + 1).map((b) => ({ role: a, roles: [a, b] })))
const VIEWERS = [
  ...['user', ...ROLES].flatMap((role) => FLAGS.map((flags) => ({ role, ...flags }))),
  ...PAIRS,
]
const describeViewer = (v) => [v.roles ? v.roles.join('+') : v.role, v.isCorrectionsVolunteer && 'מתנדב תיקונים', v.isSupervisor && 'מפקח'].filter(Boolean).join(' + ')

async function blockedItems(viewer) {
  const blocked = []
  for (const item of visibleNavItems(viewer)) {
    if (!passed(await call(item.href, viewer))) blocked.push(item.href)
  }
  return blocked
}

describe('סרגל הניהול מול ה-proxy', () => {
  for (const viewer of VIEWERS) {
    it(`${describeViewer(viewer)}: כל פריט בסרגל נפתח בלי חסימה`, async () => {
      expect(await blockedItems(viewer)).toEqual([])
    })
  }

  // ה-proxy מתיר את /library/corrections לכל מחובר; האכיפה שם היא ב-API (canHandleCorrections).
  // לכן הסרגל חייב להציג את הפריט רק למי שה-API יתיר לו — אחרת הוא נכנס ורואה "אין הרשאה".
  it('תיקוני טקסט מוצג רק למי שרשאי לטפל בתיקונים (canHandleCorrections)', () => {
    for (const viewer of VIEWERS) {
      const shown = visibleNavItems(viewer).some((item) => item.id === 'corrections')
      expect([describeViewer(viewer), shown]).toEqual([describeViewer(viewer), canHandleCorrections(viewer)])
    }
  })

  it('משתמש רגיל עם דגלים: בלי אף קישור ל-/library/admin (ה-proxy חוסם אותו שם)', async () => {
    for (const flags of FLAGS) {
      const viewer = { role: 'user', ...flags }
      expect(visibleNavItems(viewer).filter((item) => item.href.startsWith('/library/admin'))).toEqual([])
      expect(passed(await call('/library/admin', viewer))).toBe(false)
    }
  })
})
