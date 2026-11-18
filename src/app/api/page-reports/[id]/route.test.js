// @vitest-environment node
// דיווח אחד לעורך: session → 401, תרגום תוצאות server.js ל-HTTP, no-store.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pageReports/server', () => ({ getPageReportForEditor: m.get }))

import { getServerSession } from 'next-auth'
import { GET } from './route'

const get = (id) => GET(new Request(`http://x/api/page-reports/${id}`), { params: Promise.resolve({ id }) })

describe('/api/page-reports/[id]', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset().mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    m.get.mockReset()
  })

  it('בלי session → 401, בלי לקרוא לשרת', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    expect((await get('r1')).status).toBe(401)
    expect(m.get).not.toHaveBeenCalled()
  })

  it('הצלחה → הדיווח, private/no-store', async () => {
    m.get.mockResolvedValue({ ok: true, report: { _id: 'r1' } })
    const res = await get('r1')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, report: { _id: 'r1' } })
    expect(m.get).toHaveBeenCalledWith({ id: 'u1', role: 'admin' }, 'r1')
  })

  it('שגיאה מהשרת → אותו סטטוס והודעה', async () => {
    m.get.mockResolvedValue({ ok: false, status: 403, error: 'אין' })
    const res = await get('r1')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ success: false, error: 'אין' })
  })
})
