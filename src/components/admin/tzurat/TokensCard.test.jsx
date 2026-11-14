import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import TokensCard from './TokensCard'

// "מפתחות גישה" של צורת הדף (tht_): רשימה, יצירה (המפתח מוצג פעם אחת), ביטול מ-⋮ עם דיאלוג אדום, תקרה.
// התגובות בלי success (CONTRACT.md) — ההצלחה לפי res.ok. הבקשות — כמו קודם.

const BASE = '/api/admin/tzurat-hadaf/tokens'
const SECRET = `tht_${'Q'.repeat(43)}`
const T = (id, extra = {}) => ({
  id,
  name: `מפתח ${id}`,
  prefix: 'tht_Ab12',
  scopes: ['read', 'review', 'import'],
  createdAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2027-03-30T10:00:00.000Z',
  lastUsedAt: null,
  state: 'active',
  ...extra,
})

function mockServer({ tokens = [T('t1'), T('t2', { state: 'revoked' })], createReply } = {}) {
  let list = tokens
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET'
      const body = init.body ? JSON.parse(init.body) : null
      calls.push({ url, method, body })
      const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
      if (url === BASE && method === 'GET') return reply(200, { tokens: list, active: list.filter((t) => t.state === 'active').length, max: 5 })
      if (url === BASE && method === 'POST') {
        if (createReply) return reply(createReply.status, createReply.json)
        const item = T('new', { name: body.name, scopes: body.scopes })
        list = [item, ...list]
        return reply(201, { token: SECRET, item })
      }
      const m = url.match(/\/tokens\/(\w+)$/)
      if (m && method === 'DELETE') {
        list = list.map((t) => (t.id === m[1] ? { ...t, state: 'revoked' } : t))
        return reply(200, { item: list.find((t) => t.id === m[1]) })
      }
      throw new Error(`fetch לא צפוי: ${method} ${url}`)
    })
  )
  return { calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

const renderIt = (props = {}) => render(<ToastProvider><TokensCard {...props} /></ToastProvider>)
const rowsOf = async () => within(await screen.findByTestId('tokens-table')).getAllByTestId('token-row')
const openRevoke = async (name) => {
  await userEvent.click(await screen.findByRole('button', { name: `עוד פעולות למפתח ${name}` }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'בטל את המפתח' }))
  return screen.findByRole('dialog', { name: 'לבטל את המפתח?' })
}

describe('TokensCard (צורת הדף)', () => {
  it('רשימה: prefix, הרשאות בעברית, ⋮ רק לפעיל', async () => {
    mockServer()
    renderIt()
    const rows = await rowsOf()
    expect(rows[0].textContent).toContain('tht_Ab12…')
    expect(rows[0].textContent).toContain('קריאה · הכרעה · ייבוא')
    expect(rows[0].textContent).toContain('לא נעשה בו שימוש')
    expect(within(rows[0]).getByRole('button', { name: 'עוד פעולות למפתח מפתח t1' })).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('button')).toBeNull()
    expect(rows[1].textContent).toContain('בוטל')
  })

  it('יצירה: שולח שם/ימים/הרשאות כמו קודם, מציג את המפתח פעם אחת, ונעלם אחרי "הסתר"', async () => {
    const { calls } = mockServer()
    const onDirty = vi.fn()
    renderIt({ onDirty })
    await screen.findByTestId('tokens-table')
    fireEvent.change(screen.getByLabelText('שם המפתח'), { target: { value: 'site_pull' } })
    fireEvent.change(screen.getByLabelText('תוקף (ימים)'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /^ייבוא/ }))
    fireEvent.click(screen.getByRole('button', { name: /צור מפתח/ }))
    expect((await screen.findByTestId('token-value')).textContent).toBe(SECRET)
    expect(calls.find((c) => c.method === 'POST').body).toEqual({ name: 'site_pull', days: 30, scopes: ['read', 'review'] })
    // המפתח מוצג — הפוקוס עליו, והמעטפת יודעת שיש מה לאבד
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('token-reveal')))
    expect(onDirty).toHaveBeenLastCalledWith(true)
    // השורה החדשה נוספה מקומית — בלי GET נוסף
    expect(screen.getByTestId('tokens-table').textContent).toContain('site_pull')
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /הסתר את המפתח/ }))
    expect(screen.queryByTestId('token-value')).toBeNull()
    expect(onDirty).toHaveBeenLastCalledWith(false)
    // אחרי "הסתר" — הפוקוס לשדה השם
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('שם המפתח')))
  })

  it('שגיאת שרת ביצירה — הודעה קופצת, בלי מפתח', async () => {
    mockServer({ createReply: { status: 409, json: { error: 'יש כבר 5 מפתחות פעילים' } } })
    renderIt()
    await screen.findByTestId('tokens-table')
    fireEvent.click(screen.getByRole('button', { name: /צור מפתח/ }))
    expect(await screen.findByText('יש כבר 5 מפתחות פעילים')).toBeInTheDocument()
    expect(screen.queryByTestId('token-value')).toBeNull()
  })

  it('ביטול: דיאלוג אדום, DELETE באישור, והשורה נשארת עם "בוטל"', async () => {
    const { calls } = mockServer()
    renderIt()
    const dialog = await openRevoke('מפתח t1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'בטל את המפתח' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === `${BASE}/t1`)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'עוד פעולות למפתח מפתח t1' })).toBeNull())
    // מקומית, בלי טעינה מחדש: "בוטל", המונה יורד, והפוקוס בכותרת "המפתחות"
    const rows = await rowsOf()
    expect(rows[0].textContent).toContain('בוטל')
    expect(screen.getByText('0 מתוך 5 פעילים')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'המפתחות' })))
  })

  it('"חזרה" בדיאלוג — לא נשלח דבר', async () => {
    const { calls } = mockServer()
    renderIt()
    const dialog = await openRevoke('מפתח t1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'חזרה' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('5 פעילים — היצירה כבויה', async () => {
    mockServer({ tokens: ['a', 'b', 'c', 'd', 'e'].map((id) => T(id)) })
    renderIt()
    await screen.findByTestId('tokens-table')
    expect(screen.getByRole('button', { name: /צור מפתח/ })).toBeDisabled()
    expect(screen.getByText(/יש כבר 5 מפתחות פעילים/)).toBeInTheDocument()
  })
})
