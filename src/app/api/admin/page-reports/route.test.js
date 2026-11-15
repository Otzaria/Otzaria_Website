// @vitest-environment node
// ראוטי הניהול של דיווחי העמודים: 401 בלי session, 403 בלי hasBooksAccess (גם admin_books_only), תרגום תוצאות.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pageReports/server', () => ({ listAdminPageReports: m.list, decidePageReport: m.decide }))

import { getServerSession } from 'next-auth'
import { GET } from './route'
import { PATCH } from './[id]/route'

const as = (role) => vi.mocked(getServerSession).mockResolvedValue(role ? { user: { id: 'a1', role, name: 'מנהל' } } : null)
const patch = (body, id = 'r1') => PATCH(new Request(`http://x/api/admin/page-reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.mocked(getServerSession).mockReset()
  m.list.mockReset()
  m.decide.mockReset()
})

describe('GET /api/admin/page-reports', () => {
  it('401 בלי session, 403 לתפקידים בלי hasBooksAccess', async () => {
    as(null)
    expect((await GET(new Request('http://x/api/admin/page-reports'))).status).toBe(401)
    for (const role of ['user', 'admin_books_only', 'admin_plugins', 'admin_ocr']) {
      as(role)
      expect((await GET(new Request('http://x/api/admin/page-reports'))).status, role).toBe(403)
    }
    expect(m.list).not.toHaveBeenCalled()
  })

  it('admin_books: מחזיר את הרשימה בלי ok, no-store', async () => {
    as('admin_books')
    const data = { reports: [], counts: { book_error: {}, message: {} }, total: 0, hasMore: false }
    m.list.mockResolvedValue({ ok: true, ...data })
    const res = await GET(new Request('http://x/api/admin/page-reports?kind=message'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, ...data })
    expect(m.list.mock.calls[0][0].get('kind')).toBe('message')
  })

  it('פרמטר לא תקין → 400', async () => {
    as('admin')
    m.list.mockResolvedValue({ ok: false, status: 400, error: 'הסטטוס אינו תקין' })
    expect((await GET(new Request('http://x/api/admin/page-reports?status=x'))).status).toBe(400)
  })
})

describe('PATCH /api/admin/page-reports/[id]', () => {
  it('401 / 403', async () => {
    as(null)
    expect((await patch({ action: 'approve' })).status).toBe(401)
    as('admin_books_only')
    expect((await patch({ action: 'approve' })).status).toBe(403)
    expect(m.decide).not.toHaveBeenCalled()
  })

  it('הצלחה: report ו-applyResult', async () => {
    as('admin')
    m.decide.mockResolvedValue({ ok: true, report: { _id: 'r1', status: 'approved' }, applyResult: 'applied' })
    const res = await patch({ action: 'approve', applyToText: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, report: { _id: 'r1', status: 'approved' }, applyResult: 'applied' })
    expect(m.decide).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), 'r1', { action: 'approve', applyToText: true })
  })

  it('409 (עמוד בטיפול) עובר כמו שהוא', async () => {
    as('admin_books')
    m.decide.mockResolvedValue({ ok: false, status: 409, error: 'בעריכה' })
    const res = await patch({ action: 'approve', applyToText: true })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ success: false, error: 'בעריכה' })
  })
})
