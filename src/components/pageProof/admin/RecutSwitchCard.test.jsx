import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RecutSwitchCard from './RecutSwitchCard'

// כרטיס "שליחת מתנדבים לזיהוי-מחדש": שלושה מצבים (פועל/כבוי/אוטומטי) נשמרים ב-PATCH, מה שקורה עכשיו
// (הכפתור מופיע או לא), מתי תוכנת-הספר נראתה, כמה ממתינים — ו"החזר את כל הממתינים" באישור.
// fetch והחלונות מדומים (showConfirm — בצורת callback, מאשר מיד).

const { showConfirm, showAlert } = vi.hoisted(() => ({ showConfirm: vi.fn(), showAlert: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))

const state = (over = {}) => ({
  success: true,
  settings: { recutRequests: 'on', autoMinutes: 15 },
  effective: { recutRequests: true },
  bookSoftwareSeenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  pendingRecut: { waiting: 2, picked: 1 },
  ...over,
})

function mockServer(initial = state()) {
  let cur = initial
  const calls = []
  global.fetch = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null })
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (url === '/api/admin/page-proof/settings' && method === 'GET') return reply(200, cur)
    if (url === '/api/admin/page-proof/settings' && method === 'PATCH') {
      const m = calls.at(-1).body.recutRequests
      cur = state({ settings: { recutRequests: m, autoMinutes: 15 }, effective: { recutRequests: m !== 'off' } })
      return reply(200, cur)
    }
    if (url === '/api/admin/page-proof/recut-requests/release' && method === 'POST') {
      cur = state({ pendingRecut: { waiting: 0, picked: 1 } })
      return reply(200, { success: true, released: 2, skipped: 0, picked: 1 })
    }
    return reply(404, { success: false })
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
  showConfirm.mockImplementation((_t, _m, onConfirm) => onConfirm())
})
afterEach(() => {
  delete global.fetch
})

describe('RecutSwitchCard', () => {
  it('מציג את המצב, מתי תוכנת-הספר נראתה וכמה ממתינים; "כבוי" נשמר והכפתור למתנדבים יורד', async () => {
    const calls = mockServer()
    render(<RecutSwitchCard />)
    await screen.findByRole('radio', { name: 'פועל' })
    expect(screen.getByRole('radio', { name: 'פועל' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('recut-effective')).toHaveTextContent('הכפתור מופיע למתנדבים')
    expect(screen.getByText(/תוכנת-הספר נראתה לאחרונה: לפני 5 דקות/)).toBeInTheDocument()
    expect(screen.getByTestId('recut-waiting')).toHaveTextContent('ממתינים עכשיו: 2 עמודים (ועוד 1 שכבר בתוכנת-הספר)')
    fireEvent.click(screen.getByRole('radio', { name: 'כבוי' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'כבוי' })).toHaveAttribute('aria-checked', 'true'))
    expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ recutRequests: 'off' })
    expect(screen.getByTestId('recut-effective')).toHaveTextContent('הכפתור אינו מופיע למתנדבים')
  })

  it('"החזר את כל הממתינים למתנדבים" — באישור, ואחריו אין ממתינים (הכפתור כבוי)', async () => {
    const calls = mockServer()
    render(<RecutSwitchCard />)
    const btn = await screen.findByRole('button', { name: 'החזר את כל הממתינים למתנדבים' })
    fireEvent.click(btn)
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('בוצע', expect.stringContaining('2 עמודים חזרו למתנדבים')))
    expect(calls.some((c) => c.url === '/api/admin/page-proof/recut-requests/release' && c.method === 'POST')).toBe(true)
    await waitFor(() => expect(screen.getByTestId('recut-waiting')).toHaveTextContent('ממתינים עכשיו: 0 עמודים'))
    expect(screen.getByRole('button', { name: 'החזר את כל הממתינים למתנדבים' })).toBeDisabled()
  })

  it('"אוטומטי" מסביר לפי כמה דקות; תוכנת-הספר שלא נראתה מעולם — נאמר במפורש', async () => {
    mockServer(state({ settings: { recutRequests: 'auto', autoMinutes: 15 }, effective: { recutRequests: false }, bookSoftwareSeenAt: null }))
    render(<RecutSwitchCard />)
    await screen.findByRole('radio', { name: 'אוטומטי' })
    expect(screen.getByTestId('recut-effective')).toHaveTextContent('הכפתור אינו מופיע למתנדבים (אוטומטי — לפי 15 הדקות האחרונות)')
    expect(screen.getByText(/עוד לא נראתה/)).toBeInTheDocument()
  })
})
