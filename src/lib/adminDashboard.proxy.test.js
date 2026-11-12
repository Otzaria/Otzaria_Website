// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { visibleQueues } from './adminDashboard.js'

// התאמה בין כרטיסי הדשבורד ל-proxy: כל קישור של תור שהדשבורד מציג לתפקיד חייב לעבור את ה-proxy
// עבור אותו תפקיד (אחרת לחיצה על הכרטיס מובילה ל"אין הרשאה"). אותו דפוס כמו adminNav.proxy.test.js.
const { isAssurBemlacha } = vi.hoisted(() => ({ isAssurBemlacha: vi.fn() }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha } }))

import proxy from '../proxy'

const SECRET = 'test-secret-for-admin-dashboard'
const event = { waitUntil: () => {} }

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = SECRET
})
beforeEach(() => {
  isAssurBemlacha.mockResolvedValue(false)
})

async function call(path, role) {
  const token = await encode({ token: { sub: 'u1', role }, secret: SECRET })
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: `next-auth.session-token=${token}` } }), event)
}

const passed = (res) => res.headers.get('x-middleware-next') === '1'

const ROLES = ['admin', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'model_trainer']

describe('כרטיסי הדשבורד מול ה-proxy', () => {
  for (const role of ROLES) {
    it(`${role}: הדשבורד עצמו וכל קישור של תור נפתחים בלי חסימה`, async () => {
      expect(passed(await call('/library/admin', role))).toBe(true)
      const blocked = []
      for (const queue of visibleQueues(role)) {
        const href = new URL(queue.href, 'http://localhost').pathname
        if (!passed(await call(href, role))) blocked.push(href)
      }
      expect(blocked).toEqual([])
    })
  }

  it('developer: עדיין מופנה מהדשבורד לדיווחי התוכנה', async () => {
    const res = await call('/library/admin', 'developer')
    expect(passed(res)).toBe(false)
    expect(res.headers.get('location')).toContain('/library/admin/app-reports')
  })
})
