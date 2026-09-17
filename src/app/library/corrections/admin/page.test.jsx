import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CorrectionsAdminPage from './page.jsx'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'admin' } } }) }))

const health = {
  healthy: true,
  problems: [],
  heartbeat: null,
  oldestJob: { verify: null, publish: null },
  counts: { open: 0 },
  config: {
    production: false,
    errors: [],
    runtimeSwitches: ['intakeEnabled', 'publishMode', 'autoPublish', 'verifyPaused'],
    intakeEnabled: true,
    verifyPaused: false,
    verify: { enabled: false, disabledReason: 'service_disabled', urlHost: null, secretConfigured: false, isMock: false, authority: 'none', requestedScope: 'technical_only', autoRejectAllowed: false },
    autoPublish: false,
    publish: { mode: 'disabled', requestedMode: 'disabled', disabledReason: 'publish_disabled', repo: 'Otzaria/otzaria-library', branch: 'main', tokenConfigured: true },
    source: { repo: 'Otzaria/otzaria-library', ref: 'main' },
  },
}

let posts
beforeEach(() => {
  posts = []
  global.fetch = vi.fn(async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200, json: async () => ({}) }
    }
    if (String(url).includes('/health')) return { ok: true, status: 200, json: async () => health }
    return { ok: true, status: 200, json: async () => ({ users: [] }) }
  })
})
afterEach(() => { vi.restoreAllMocks() })

describe('מתגי מסך הניהול של תיקוני הטקסט', () => {
  it('מעבר לקומיט ישיר אינו נשלח בלי אישור, ונשלח אחריו', async () => {
    render(<CorrectionsAdminPage />)
    const direct = await screen.findByRole('button', { name: 'קומיט ישיר' })

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(direct)
    expect(posts).toHaveLength(0)

    window.confirm.mockReturnValue(true)
    await userEvent.click(direct)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toEqual({ publishMode: 'direct', confirm: true })
  })

  it('מעבר ל-PR ולכיבוי הקליטה נשלח מיד בלי אישור', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CorrectionsAdminPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'פתיחת PR' }))
    await userEvent.click(screen.getByRole('button', { name: 'כבויה' }))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts.map((p) => p.body)).toEqual([{ publishMode: 'pr' }, { intakeEnabled: false }])
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
