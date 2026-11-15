// @vitest-environment node
// ראוט הדיווחים של המתנדב: session → 401, גוף לא תקין → 400, תרגום תוצאות server.js ל-HTTP, no-store.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pageReports/server', () => ({ createPageReport: m.create, listMyPageReports: m.list }))

import { getServerSession } from 'next-auth'
import { GET, POST } from './route'

const post = (body) => POST(new Request('http://x/api/page-reports', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }))

describe('/api/page-reports', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset().mockResolvedValue({ user: { id: 'u1', role: 'user', name: 'מ' } })
    m.create.mockReset()
    m.list.mockReset()
  })

  it('POST בלי session → 401, בלי לקרוא לשרת', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await post({ kind: 'message' })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ success: false })
    expect(m.create).not.toHaveBeenCalled()
  })

  it('POST גוף לא JSON → 400', async () => {
    expect((await post('{oops')).status).toBe(400)
  })

  it('POST הצלחה → 201 עם report, private/no-store', async () => {
    const report = { _id: 'r1', kind: 'message', status: 'pending', createdAt: '2026-01-01' }
    m.create.mockResolvedValue({ ok: true, report })
    const res = await post({ kind: 'message', bookPath: 'b', pageNumber: 1, message: 'x' })
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, report })
    expect(m.create).toHaveBeenCalledWith({ id: 'u1', role: 'user', name: 'מ' }, { kind: 'message', bookPath: 'b', pageNumber: 1, message: 'x' })
  })

  it('POST שגיאה מהשרת → אותו סטטוס והודעה', async () => {
    m.create.mockResolvedValue({ ok: false, status: 429, error: 'הרבה' })
    const res = await post({ kind: 'message' })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ success: false, error: 'הרבה' })
  })

  it('GET מעביר bookPath ו-pageNumber ומחזיר reports', async () => {
    m.list.mockResolvedValue({ ok: true, reports: [{ _id: 'r1' }] })
    const res = await GET(new Request('http://x/api/page-reports?bookPath=sefer&pageNumber=3'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, reports: [{ _id: 'r1' }] })
    expect(m.list).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), 'sefer', '3')
  })

  it('GET בלי session → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    expect((await GET(new Request('http://x/api/page-reports'))).status).toBe(401)
  })
})
