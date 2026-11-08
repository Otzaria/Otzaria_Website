import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import DisputesSection from './DisputesSection'

// "מחלוקות": טעינה לפי מסננים (בוררים מעוצבים), הקריאות מסומנות (אוצריא / הדפוס לפי זיהוי הטקסט), התשובות והרמזים,
// וההכרעות — אותו גוף בדיוק כמו קודם (PATCH items/[id]): print/otz, טקסט אחר, elsewhere רק ל-otz_only, ומ-⋮: פתח
// מחדש למתנדבים, בטל "דורש בדיקה", לא רלוונטי. אחרי הכרעה הכרטיס נשאר במקומו, והמונים של הלשוניות מתעדכנים (onChanged).

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

const renderIt = (props = {}) => render(<ToastProvider><DisputesSection {...props} /></ToastProvider>)
const menu = async (card, name) => {
  await userEvent.click(within(card).getByRole('button', { name: /עוד פעולות להחלטה/ }))
  return screen.queryByRole('menuitem', { name })
}

describe('DisputesSection', () => {
  it('טוען מחלוקות ומציג את שתי הקריאות מסומנות, תשובות ורמזים', async () => {
    const { gets } = mockServer([item('i1')])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    expect(gets[0]).toBe(`${API}/items?status=disputed&page=1`)
    expect(within(card).getByTestId('item-otz').textContent).toBe('אמר')
    expect(within(card).getByTestId('item-print').textContent).toBe('אמרו')
    expect(within(card).getByText('אוצריא')).toBeInTheDocument()
    expect(within(card).getByText('הדפוס לפי זיהוי הטקסט')).toBeInTheDocument()
    expect(card.textContent).toContain('ראובן')
    expect(card.textContent).toContain('«אמרי»')
    const hints = within(card).getAllByTestId('item-hint').map((h) => h.textContent)
    expect(hints).toEqual(['תורת אמת: כמו הדפוס', 'מקור נוסף: כמו אוצריא', 'כלל כתיבה: ראשי תיבות וקיצורים'])
    expect(within(card).getByRole('img').getAttribute('src')).toBe('/api/tzurat-hadaf/items/i1/image?ctx=1')
    expect(within(card).getByText('במחלוקת')).toBeInTheDocument()
    // replace — בלי "נדפס במקום אחר"
    expect(within(card).queryByRole('button', { name: 'נדפס במקום אחר' })).toBeNull()
  })

  it('הכרעה "כמו הדפוס" — אותו PATCH, הכרטיס נשאר במקומו עם התג החדש, הודעה, והמונים מתעדכנים', async () => {
    const { patches } = mockServer([item('i1')])
    const onChanged = vi.fn()
    renderIt({ onChanged })
    const card = await screen.findByTestId('admin-item')
    fireEvent.click(within(card).getByRole('button', { name: 'כמו הדפוס' }))
    await within(card).findByTestId('item-resolved')
    expect(patches).toEqual([{ id: 'i1', body: { action: 'resolve', verdict: 'print' } }])
    expect(screen.getByTestId('admin-item')).toBe(card)
    expect(within(card).getByText('הוכרע')).toBeInTheDocument()
    expect(await screen.findByText('ההחלטה בברכות ב. הוכרעה: כמו הדפוס')).toBeInTheDocument()
    // המונה מתעדכן מקומית: מצב קודם → מצב חדש; הסה"כ ברשימה יורד (יצא מ"במחלוקת")
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith('item', 'disputed', 'resolved')
    expect(screen.getByText('0 החלטות')).toBeInTheDocument()
  })

  it('טקסט אחר — נשלח עם text', async () => {
    const { patches } = mockServer([item('i1')])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    const btn = within(card).getByRole('button', { name: 'טקסט אחר' })
    // "כבוי" בלי disabled (softDisabled) — הפוקוס לא נזרק אחרי השליחה
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(btn)
    expect(patches).toEqual([])
    // שם ייחודי לשדה: "מה נדפס (טקסט אחר)" + הדף, סוג הגוש והמילים
    const field = within(card).getByLabelText(/^מה נדפס \(טקסט אחר\) — ברכות ב\., /)
    fireEvent.change(field, { target: { value: ' אמרי ' } })
    fireEvent.click(btn)
    await waitFor(() => expect(patches).toEqual([{ id: 'i1', body: { action: 'resolve', verdict: 'other', text: 'אמרי' } }]))
    await waitFor(() => expect(field.value).toBe(''))
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).not.toBeDisabled()
  })

  it('otz_only — יש "נדפס במקום אחר"', async () => {
    const { patches } = mockServer([item('i2', { question: 'otz_only', print: [], status: 'flagged' })])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    expect(within(card).getByText('דורש בדיקה')).toBeInTheDocument()
    // הסיבה ל"דורש בדיקה" — בכרטיס
    expect(within(card).getByTestId('item-flagged-why').textContent).toContain('החיתוך')
    fireEvent.click(within(card).getByRole('button', { name: 'נדפס במקום אחר' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].body).toEqual({ action: 'resolve', verdict: 'elsewhere' })
  })

  it('⋮: בטל "דורש בדיקה" / לא רלוונטי / פתח מחדש למתנדבים — אותו גוף כמו קודם', async () => {
    const { patches } = mockServer([item('i3', { status: 'flagged' })])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    await userEvent.click(await menu(card, 'בטל את "דורש בדיקה"'))
    await waitFor(() => expect(patches.map((p) => p.body)).toEqual([{ action: 'unflag' }]))
    // אחרי unflag הפריט פתוח — אין "פתח מחדש למתנדבים", יש "לא רלוונטי"
    expect(await menu(card, 'פתח מחדש למתנדבים')).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'לא רלוונטי' }))
    await waitFor(() => expect(patches.map((p) => p.body.action)).toEqual(['unflag', 'obsolete']))
    await userEvent.click(await menu(card, 'פתח מחדש למתנדבים'))
    await waitFor(() => expect(patches.map((p) => p.body)).toEqual([{ action: 'unflag' }, { action: 'obsolete' }, { action: 'reopen' }]))
  })

  it('מסננים — מצב, מסכת וסוג, וחזרה לעמוד 1; עימוד', async () => {
    const { gets } = mockServer([item('i1')])
    renderIt()
    await screen.findByTestId('admin-item')
    await userEvent.click(screen.getByRole('button', { name: /הבא/ }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=disputed&page=2`))
    await userEvent.click(screen.getByRole('button', { name: /^מצב/ }))
    await userEvent.click(await screen.findByRole('option', { name: /דורש בדיקה/ }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=flagged&page=1`))
    await userEvent.click(screen.getByRole('button', { name: /^מסכת/ }))
    await userEvent.click(await screen.findByRole('option', { name: /שבת/ }))
    await userEvent.click(screen.getByRole('button', { name: /^סוג/ }))
    await userEvent.click(await screen.findByRole('option', { name: /רש"י/ }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/items?status=flagged&slug=shabbat&kind=r&page=1`))
  })

  it('שגיאה מהשרת בהכרעה — מוצגת בכרטיס', async () => {
    mockServer([item('i1')])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'הפריט כבר הוכרע', code: 'closed' }) })))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו אוצריא' }))
    expect((await within(card).findByRole('alert')).textContent).toBe('הפריט כבר הוכרע')
  })

  it('התחברות שפגה (הפניה לדף ההתחברות / 200 בלי JSON) — אין הודעת הצלחה, התג לא משתנה', async () => {
    mockServer([item('i1')])
    const onChanged = vi.fn()
    renderIt({ onChanged })
    const card = await screen.findByTestId('admin-item')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0, type: 'opaqueredirect', json: async () => null })))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו הדפוס' }))
    const alert = await within(card).findByRole('alert')
    expect(alert).toHaveTextContent('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')
    // קישור "התחבר" — חוזר לאותו מסך אחרי ההתחברות
    expect(within(alert).getByRole('link', { name: 'התחבר' }).getAttribute('href')).toMatch(/^\/auth\/login\?callbackUrl=/)
    // דף HTML שהתקבל כ-200 (בלי JSON) — גם לא הצלחה
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') })))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו אוצריא' }))
    await waitFor(() => expect(within(card).getByRole('alert').textContent).toContain('התשובה מהשרת לא תקינה'))
    expect(within(card).getByText('במחלוקת')).toBeInTheDocument()
    expect(screen.queryByText(/הוכרעה/)).toBeNull()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('חסימת שבת — ההסבר בעברית, לא המילה shabbat', async () => {
    mockServer([item('i1')])
    renderIt()
    const card = await screen.findByTestId('admin-item')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: 'shabbat', message: 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים' }) })))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו הדפוס' }))
    expect((await within(card).findByRole('alert')).textContent).toBe('הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים')
  })

  it('החלפת מסנן — הרשימה הקודמת לא מוצגת עד שהתשובה מגיעה (שלד טעינה)', async () => {
    mockServer([item('i1')])
    renderIt()
    await screen.findByTestId('admin-item')
    let release
    const pending = new Promise((r) => { release = r })
    const prev = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('status=flagged')) await pending
      return prev(url, init)
    }))
    await userEvent.click(screen.getByRole('button', { name: /^מצב/ }))
    await userEvent.click(await screen.findByRole('option', { name: /דורש בדיקה/ }))
    expect(screen.queryByTestId('admin-item')).toBeNull()
    expect(screen.getByRole('status', { name: 'טוען…' })).toBeInTheDocument()
    release()
    expect(await screen.findByTestId('admin-item')).toBeInTheDocument()
  })

  it('אין מחלוקות — הודעה ריקה; שגיאת טעינה — "נסה שוב"', async () => {
    mockServer([])
    const { unmount } = renderIt()
    expect(await screen.findByText('אין מחלוקות פתוחות')).toBeInTheDocument()
    unmount()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'תקלה' }) })))
    renderIt()
    expect(await screen.findByText('לא הצלחנו לטעון את ההחלטות')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /נסה שוב/ })).toBeInTheDocument()
  })
})
