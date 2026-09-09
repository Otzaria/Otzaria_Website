import { describe, it, expect, vi } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn()
}))

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import { requirePluginsAdmin } from './adminAuth'

describe('requirePluginsAdmin', () => {
  it('denies with a 403 and { error } body when there is no session', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)

    const auth = await requirePluginsAdmin()

    expect(auth.ok).toBe(false)
    expect(auth.response.status).toBe(403)
    const body = await auth.response.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('denies with a 403 when the session lacks plugins access', async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'user' } })

    const auth = await requirePluginsAdmin()

    expect(auth.ok).toBe(false)
    expect(auth.response.status).toBe(403)
  })

  it('allows and returns the session when the user has plugins access', async () => {
    const session = { user: { role: 'admin' } }
    getServerSessionMock.mockResolvedValueOnce(session)

    const auth = await requirePluginsAdmin()

    expect(auth.ok).toBe(true)
    expect(auth.session).toBe(session)
  })
})
