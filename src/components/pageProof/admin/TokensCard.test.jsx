import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import TokensCard from './TokensCard'

// כרטיס "מפתחות-גישה לתוכנת-הספר": הרשימה (prefix בלבד, מצב, ביטול רק לפעיל), יצירה עם שם/תוקף/
// הרשאות, המפתח מוצג פעם אחת עם העתקה ואזהרה — ונעלם אחרי "הסתר", ביטול באישור, ותקרת 5.
// fetch והחלונות מדומים (showConfirm — בצורת callback, מאשר מיד).

const { showConfirm, showAlert } = vi.hoisted(() => ({ showConfirm: vi.fn(), showAlert: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))

const SECRET = `ppt_${'Q'.repeat(43)}`
const T = (id, extra = {}) => ({
  id,
  name: `מפתח ${id}`,
  prefix: 'ppt_Ab12',
  scopes: ['read', 'review', 'import'],
  createdAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2027-02-28T10:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  state: 'active',
  ...extra,
})

function mockServer({ tokens = [T('t1'), T('t2', { state: 'revoked', revokedAt: '2026-09-10T10:00:00.000Z', lastUsedAt: '2026-09-09T08:30:00.000Z' })], createReply } = {}) {
  let list = tokens
  const calls = []
  const fn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null })
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (url === '/api/admin/page-proof/tokens' && method === 'GET') {
      return reply(200, { success: true, tokens: list, active: list.filter((t) => t.state === 'active').length, max: 5 })
    }
    if (url === '/api/admin/page-proof/tokens' && method === 'POST') {
      if (createReply) return reply(createReply.status, createReply.json)
      const item = T('new', { name: calls.at(-1).body.name, scopes: calls.at(-1).body.scopes })
      list = [item, ...list]
      return reply(201, { success: true, token: SECRET, item })
    }
    const m = url.match(/^\/api\/admin\/page-proof\/tokens\/(\w+)$/)
    if (m && method === 'DELETE') {
      list = list.map((t) => (t.id === m[1] ? { ...t, state: 'revoked', revokedAt: new Date().toISOString() } : t))
      return reply(200, { success: true, item: list.find((t) => t.id === m[1]) })
    }
    throw new Error(`fetch לא צפוי: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  showConfirm.mockImplementation((_t, _m, action) => action())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const table = () => screen.findByTestId('tokens-table')

describe('TokensCard — רשימה', () => {
  it('prefix, שם, הרשאות, מצב; ביטול רק למפתח פעיל; "לא נעשה שימוש"', async () => {
    mockServer()
    render(<TokensCard />)
    const rows = within(await table()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('ppt_Ab12…')
    expect(rows[0]).toHaveTextContent('מפתח t1')
    expect(rows[0]).toHaveTextContent('קריאה · אישור ודחייה · ייבוא')
    expect(rows[0]).toHaveTextContent('לא נעשה שימוש')
    expect(rows[0]).toHaveTextContent('פעיל')
    expect(within(rows[0]).getByRole('button', { name: 'ביטול המפתח מפתח t1' })).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('בוטל')
    expect(within(rows[1]).queryByRole('button')).toBeNull()
    expect(screen.getByText('1 מתוך 5 פעילים')).toBeInTheDocument()
  })

  it('אין מפתחות — הודעה', async () => {
    mockServer({ tokens: [] })
    render(<TokensCard />)
    expect(await screen.findByText('אין מפתחות')).toBeInTheDocument()
  })
})

describe('TokensCard — יצירה', () => {
  it('שולח שם/ימים/הרשאות; המפתח מוצג פעם אחת עם העתקה ואזהרה, ונעלם אחרי "הסתר"', async () => {
    const { calls } = mockServer()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<TokensCard />)
    await table()

    fireEvent.change(screen.getByLabelText('שם המפתח'), { target: { value: 'המחשב בבית' } })
    fireEvent.change(screen.getByLabelText('תוקף (ימים)'), { target: { value: '30' } })
    fireEvent.click(screen.getByLabelText(/^ייבוא חבילות-עמודים/))
    fireEvent.click(screen.getByRole('button', { name: /צור מפתח/ }))

    const reveal = await screen.findByTestId('token-reveal')
    expect(calls.find((c) => c.method === 'POST').body).toEqual({ name: 'המחשב בבית', days: 30, scopes: ['read', 'review'] })
    expect(within(reveal).getByTestId('token-value')).toHaveTextContent(SECRET)
    expect(reveal).toHaveTextContent('זו הפעם היחידה שהוא מוצג')
    // בזמן שהמפתח מוצג — אין טופס
    expect(screen.queryByRole('button', { name: /צור מפתח/ })).toBeNull()

    fireEvent.click(within(reveal).getByRole('button', { name: /העתק$/ }))
    await waitFor(() => expect(within(reveal).getByRole('button', { name: /הועתק$/ })).toBeInTheDocument())
    expect(writeText).toHaveBeenCalledWith(SECRET)

    fireEvent.click(within(reveal).getByRole('button', { name: /הסתר את המפתח/ }))
    expect(screen.queryByTestId('token-reveal')).toBeNull()
    expect(document.body.textContent).not.toContain(SECRET)
    // הרשימה נטענה מחדש, עם המפתח החדש (prefix בלבד)
    const rows = within(await table()).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('המחשב בבית')
    expect(screen.getByRole('button', { name: /צור מפתח/ })).toBeInTheDocument()
  })

  it('העתקה שנכשלה — הנחיה להעתקה ידנית', async () => {
    mockServer()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<TokensCard />)
    await table()
    fireEvent.click(screen.getByRole('button', { name: /צור מפתח/ }))
    fireEvent.click(await screen.findByRole('button', { name: /העתק$/ }))
    expect(await screen.findByText(/ההעתקה נכשלה/)).toBeInTheDocument()
  })

  it('קלט לא תקין — הכפתור כבוי (ימים מחוץ לטווח, בלי הרשאות, בלי שם)', async () => {
    mockServer()
    render(<TokensCard />)
    await table()
    const button = screen.getByRole('button', { name: /צור מפתח/ })
    expect(button).toBeEnabled()
    fireEvent.change(screen.getByLabelText('תוקף (ימים)'), { target: { value: '400' } })
    expect(button).toBeDisabled()
    expect(screen.getByText(/בין 1 ל-365/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('תוקף (ימים)'), { target: { value: '180' } })
    expect(button).toBeEnabled()
    for (const label of [/^קריאה/, /^אישור ודחייה/, /^ייבוא חבילות-עמודים/]) fireEvent.click(screen.getByLabelText(label))
    expect(button).toBeDisabled()
    expect(screen.getByText('יש לבחור לפחות הרשאה אחת')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/^קריאה/))
    fireEvent.change(screen.getByLabelText('שם המפתח'), { target: { value: '  ' } })
    expect(button).toBeDisabled()
  })

  it('שגיאת-שרת (למשל תקרה) — הודעה, בלי מפתח', async () => {
    mockServer({ createReply: { status: 409, json: { success: false, error: 'יש כבר 5 מפתחות פעילים' } } })
    render(<TokensCard />)
    await table()
    fireEvent.click(screen.getByRole('button', { name: /צור מפתח/ }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('שגיאה', 'יש כבר 5 מפתחות פעילים'))
    expect(screen.queryByTestId('token-reveal')).toBeNull()
  })

  it('5 פעילים — היצירה כבויה, עם הסבר', async () => {
    mockServer({ tokens: ['a', 'b', 'c', 'd', 'e'].map((id) => T(id)) })
    render(<TokensCard />)
    await table()
    expect(screen.getByRole('button', { name: /צור מפתח/ })).toBeDisabled()
    expect(screen.getByText(/בטלו מפתח שאינו בשימוש/)).toBeInTheDocument()
  })
})

describe('TokensCard — ביטול', () => {
  it('באישור: DELETE למפתח, והרשימה מתעדכנת', async () => {
    const { calls } = mockServer()
    render(<TokensCard />)
    const rows = within(await table()).getAllByRole('row').slice(1)
    fireEvent.click(within(rows[0]).getByRole('button', { name: /ביטול המפתח/ }))
    expect(showConfirm).toHaveBeenCalledWith('ביטול מפתח-גישה', expect.stringContaining('ppt_Ab12…'), expect.any(Function), 'בטל את המפתח', 'חזרה')
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/admin/page-proof/tokens/t1')).toBe(true))
    await waitFor(() => expect(within(screen.getByTestId('tokens-table')).queryAllByRole('button')).toHaveLength(0))
    expect(screen.getByText('0 מתוך 5 פעילים')).toBeInTheDocument()
  })

  it('בלי אישור — לא נשלח דבר', async () => {
    const { calls } = mockServer()
    showConfirm.mockImplementation(() => {})
    render(<TokensCard />)
    const rows = within(await table()).getAllByRole('row').slice(1)
    fireEvent.click(within(rows[0]).getByRole('button', { name: /ביטול המפתח/ }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })
})
