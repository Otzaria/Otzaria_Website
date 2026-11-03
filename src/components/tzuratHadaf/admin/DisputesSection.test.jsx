import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import DisputesSection from './DisputesSection'

// "מחלוקות": טעינה לפי מסננים, הקריאות מסומנות (אוצריא / הדפוס לפי ה-OCR), התשובות והרמזים, וההכרעות
// (PATCH items/[id]) — print/otz, טקסט אחר, elsewhere רק ל-otz_only, החזרה לתור, ביטול סימון, לא רלוונטי.

const API = '/api/admin/tzurat-hadaf'

const item = (id, extra = {}) => ({
  id,
  slug: 'berakhot',
  masechet: 'ברכות',
  daf: 'ב.',
  kind: 'g',
  question: 'replace',
  otz: ['אמר'],
  print: ['אמרו'],
  ctxBefore: ['רבי', 'יהושע'],
  ctxAfter: ['עד', 'סוף'],
  status: 'disputed',
  imageUrl: `/api/tzurat-hadaf/items/${id}/image?ctx=1`,
  hints: { te: 'print', oh: 'otz', bx: '', rule: 'abbr' },
  answers: [
    { user: 'a', name: 'ראובן', verdict: 'print', via: 'fast', at: '2026-10-20T10:00:00Z' },
    { user: 'b', name: 'שמעון', verdict: 'other', text: 'אמרי', via: 'page', at: '2026-10-21T10:00:00Z' },
  ],
  ...extra,
})

function mockServer(items) {
  const patches = []
  const gets = []
  const fn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (url === `${API}/batches`) return reply(200, { batches: [{ slug: 'shabbat', masechet: 'שבת', order: 2 }, { slug: 'berakhot', masechet: 'ברכות', order: 1 }] })
    if (url.startsWith(`${API}/items?`) || url === `${API}/items`) {
      gets.push(url)
      return reply(200, { items, total: items.length, page: 1, pages: 3 })
    }
    const m = url.match(/\/items\/(\w+)$/)
    if (m && method === 'PATCH') {
      const body = JSON.parse(init.body)
      patches.push({ id: m[1], body })
      const it = items.find((x) => x.id === m[1])
      const status = body.action === 'resolve' ? 'resolved' : body.action === 'reopen' || body.action === 'unflag' ? 'open' : 'obsolete'
      return reply(200, { item: { ...it, status, resolved: body.action === 'resolve' ? { verdict: body.verdict, text: body.text || null, byName: 'מנהל' } : null } })
    }
    throw new Error(`fetch לא צפוי: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return { patches, gets }
}

afterEach(() => vi.unstubAllGlobals())

describe('DisputesSection', () => {
  it('טוען מחלוקות ומציג את שתי הקריאות מסומנות, תשובות ורמזים', async () => {
    const { gets } = mockServer([item('i1')])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    expect(gets[0]).toBe(`${API}/items?status=disputed&page=1`)
    expect(within(card).getByTestId('item-otz').textContent).toBe('אמר')
    expect(within(card).getByTestId('item-print').textContent).toBe('אמרו')
    expect(within(card).getByText('אוצריא:')).toBeInTheDocument()
    expect(within(card).getByText('הדפוס לפי ה-OCR:')).toBeInTheDocument()
    expect(card.textContent).toContain('ראובן')
    expect(card.textContent).toContain('«אמרי»')
    const hints = within(card).getAllByTestId('item-hint').map((h) => h.textContent)
    expect(hints).toEqual(['תורת אמת: כמו הדפוס', 'עד נוסף: כמו אוצריא', 'כלל: abbr'])
    expect(within(card).getByRole('img').getAttribute('src')).toBe('/api/tzurat-hadaf/items/i1/image?ctx=1')
    // replace — בלי elsewhere
    expect(within(card).queryByRole('button', { name: /elsewhere/ })).toBeNull()
  })

  it('הכרעה "כמו הדפוס" — PATCH resolve והסטטוס מתעדכן', async () => {
    const { patches } = mockServer([item('i1')])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    fireEvent.click(within(card).getByRole('button', { name: 'כמו הדפוס (print)' }))
    await within(card).findByTestId('item-resolved')
    expect(patches).toEqual([{ id: 'i1', body: { action: 'resolve', verdict: 'print' } }])
    expect(card.textContent).toContain('הוכרע')
  })

  it('טקסט אחר — נשלח עם text', async () => {
    const { patches } = mockServer([item('i1')])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    const btn = within(card).getByRole('button', { name: 'טקסט אחר' })
    expect(btn).toBeDisabled()
    fireEvent.change(within(card).getByLabelText('טקסט אחר'), { target: { value: ' אמרי ' } })
    fireEvent.click(btn)
    await waitFor(() => expect(patches).toEqual([{ id: 'i1', body: { action: 'resolve', verdict: 'other', text: 'אמרי' } }]))
  })

  it('otz_only — יש "בעמוד/בשורה אחרים"; flagged — "בטל סימון"', async () => {
    const { patches } = mockServer([item('i2', { question: 'otz_only', print: [], status: 'flagged' })])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    fireEvent.click(within(card).getByRole('button', { name: /elsewhere/ }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].body).toEqual({ action: 'resolve', verdict: 'elsewhere' })
  })

  it('בטל סימון / החזר לתור / לא רלוונטי', async () => {
    const { patches } = mockServer([item('i3', { status: 'flagged' })])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    fireEvent.click(within(card).getByRole('button', { name: 'בטל סימון' }))
    await waitFor(() => expect(patches.map((p) => p.body.action)).toEqual(['unflag']))
    // אחרי unflag הפריט פתוח — אין "החזר לתור", יש "לא רלוונטי"
    await waitFor(() => expect(within(card).queryByRole('button', { name: /החזר לתור/ })).toBeNull())
    fireEvent.click(within(card).getByRole('button', { name: 'לא רלוונטי' }))
    await waitFor(() => expect(patches.map((p) => p.body.action)).toEqual(['unflag', 'obsolete']))
    await waitFor(() => expect(within(card).getByRole('button', { name: /החזר לתור/ })).toBeInTheDocument())
    fireEvent.click(within(card).getByRole('button', { name: /החזר לתור/ }))
    await waitFor(() => expect(patches.map((p) => p.body.action)).toEqual(['unflag', 'obsolete', 'reopen']))
  })

  it('מסננים — מצב, מסכת וסוג, וחזרה לדף 1; דפדוף', async () => {
    const { gets } = mockServer([item('i1')])
    render(<DisputesSection />)
    await screen.findByTestId('admin-item')
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=disputed&page=2`))
    fireEvent.change(screen.getByLabelText('מצב'), { target: { value: 'flagged' } })
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=flagged&page=1`))
    await screen.findByRole('option', { name: 'שבת' })
    fireEvent.change(screen.getByLabelText('מסכת'), { target: { value: 'shabbat' } })
    fireEvent.change(screen.getByLabelText('סוג'), { target: { value: 'r' } })
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=flagged&slug=shabbat&kind=r&page=1`))
  })

  it('שגיאה מהשרת בהכרעה — מוצגת', async () => {
    mockServer([item('i1')])
    render(<DisputesSection />)
    const card = await screen.findByTestId('admin-item')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'הפריט כבר הוכרע', code: 'closed' }) })))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו אוצריא (otz)' }))
    expect((await within(card).findByRole('alert')).textContent).toBe('הפריט כבר הוכרע')
  })
})
