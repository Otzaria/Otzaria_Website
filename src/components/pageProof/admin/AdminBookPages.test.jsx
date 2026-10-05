import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import AdminBookPages from './AdminBookPages'
import { adminCounts, DRAFT_WARNING } from '@/lib/pageProof/adminGrid'
import { formatUntil } from '@/lib/pageProof/dates'

// רשת-העמודים של ספר בניהול: המצב של כל עמוד (מי מחזיק ועד מתי), המתג "פתוח
// למתנדבים" לעמוד ולטווח ("פתח רק את הטווח וסגור את כל השאר"), ושחרור תפיסה —
// לעמוד ובבת אחת — עם אזהרה שהטיוטה של המתנדב נשארת רק בדפדפן שלו.
// fetch והחלונות מדומים (showConfirm — בצורת callback, כדי שהכפתור יישא את שם הפעולה —
// מאשר מיד, אלא אם נקבע אחרת).

const { showConfirm, showAlert } = vi.hoisted(() => ({ showConfirm: vi.fn(), showAlert: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))

const later = new Date(Date.now() + 20 * 3600e3).toISOString()
const past = new Date(Date.now() - 5 * 3600e3).toISOString()
const A = (n, state, extra = {}) => ({
  id: `p${n}`,
  page: n,
  seq: Math.floor((n - 1) / 5),
  revision: 1,
  lineCount: 30,
  required: 1,
  state,
  volunteer: true,
  holder: null,
  leasedUntil: null,
  lease: null,
  pending: 0,
  ...extra,
})
const PAGES = [
  A(1, 'open'),
  A(2, 'open', { volunteer: false }),
  A(3, 'second', { required: 2, pending: 1 }),
  A(4, 'taken', { holder: 'ראובן', lease: 'active', leasedUntil: later }),
  A(5, 'open', { holder: 'שמעון', lease: 'expired', leasedUntil: past }),
  A(6, 'submitted', { pending: 1 }),
  A(7, 'approved'),
  A(8, 'recut', { volunteer: false }),
  A(9, 'recut', { recutRequest: { id: 'req9', by: 'ראובן', at: new Date().toISOString(), picked: false } }),
]
const BOOK = { gid: 'g1abcdef', title: 'ספר הבדיקה', script: 'square', active: true }
const BASE = '/api/admin/page-proof/books/g1abcdef'

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, ...body }) })

let fetchMock
let calls
beforeEach(() => {
  showConfirm.mockReset().mockImplementation((title, message, onConfirm) => onConfirm?.())
  showAlert.mockReset()
  calls = []
  fetchMock = vi.fn((url, init = {}) => {
    const u = String(url)
    const method = init.method || 'GET'
    if (method !== 'GET') calls.push({ url: u, method, body: JSON.parse(init.body) })
    if (u === `${BASE}/pages` && method === 'GET') return ok({ book: BOOK, pages: PAGES, counts: adminCounts(PAGES) })
    if (u === `${BASE}/pages` && method === 'PATCH') return ok({ changed: 3, open: 20, closed: 180 })
    if (u === `${BASE}/release` && method === 'POST') return ok({ released: 1 })
    if (u === '/api/admin/page-proof/submissions/req9' && method === 'PATCH') return ok({ status: 'rejected', pageStatus: 'open', returnedToRequester: true })
    if (u === `${BASE}/reopen` && method === 'POST') return ok({ reopened: 1, pages: [7], skipped: [] })
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ success: false, error: 'לא צפוי' }) })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const loaded = () => screen.findByText('עמוד 8', {}, { timeout: 5000 })
const card = (n) => screen.getByText(`עמוד ${n}`).closest('.group')

describe('AdminBookPages', { timeout: 20000 }, () => {
  it('כל עמוד עם המצב שלו: פנוי / תפוס (בידי מי ועד מתי) / תפיסה שפגה / ממתין לאישור / אושר / זיהוי-מחדש / סגור', async () => {
    render(<AdminBookPages gid="g1abcdef" title="ספר הבדיקה" onClose={vi.fn()} />)
    await loaded()
    expect(screen.getByRole('heading', { name: 'עמודי הספר: ספר הבדיקה' })).toBeInTheDocument()
    expect(within(card(1)).getByText('פנוי')).toBeInTheDocument()
    expect(within(card(4)).getByText('תפוס')).toBeInTheDocument()
    expect(within(card(4)).getByText('ע"י ראובן')).toBeInTheDocument()
    expect(within(card(4)).getByText(/^שמור עד /)).toHaveTextContent(`שמור עד ${formatUntil(later, new Date())}`)
    expect(within(card(5)).getByText('התפיסה של שמעון פגה')).toBeInTheDocument()
    expect(within(card(6)).getByText('ממתין לאישור')).toBeInTheDocument()
    expect(within(card(7)).getByText('אושר')).toBeInTheDocument()
    expect(within(card(8)).getByText('ממתין לזיהוי-מחדש')).toBeInTheDocument()
    expect(within(card(3)).getByText('הגשה אחת ממתינה לאישור')).toBeInTheDocument()
    // סגור למתנדבים: סימון על התמונה והמתג כבוי
    expect(within(card(2)).getByText('סגור למתנדבים')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'עמוד 2 פתוח למתנדבים' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'עמוד 1 פתוח למתנדבים' })).toBeChecked()
    // שחרור — רק לעמוד שמישהו רשום עליו (בתוקף או שפג)
    expect(screen.getByRole('button', { name: 'שחרור עמוד 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שחרור עמוד 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שחרור עמוד 1' })).not.toBeInTheDocument()
    expect(screen.getByText(/שמור לו 48 שעות \(לכל עמוד לחוד; שבת וחג אינם נספרים\)/)).toBeInTheDocument()
  })

  it('המסננים: "סגורים למתנדבים" מציג רק אותם', async () => {
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'סגורים למתנדבים · 2' }))
    expect(screen.getAllByText(/^עמוד \d+$/).map((e) => e.textContent)).toEqual(['עמוד 2', 'עמוד 8'])
    fireEvent.click(screen.getByRole('button', { name: 'תפיסות שפגו · 1' }))
    expect(screen.getAllByText(/^עמוד \d+$/).map((e) => e.textContent)).toEqual(['עמוד 5'])
  })

  it('המתג בכרטיס ← PATCH לעמוד הזה בלבד, והרשת והמונים נטענים מחדש', async () => {
    const onChanged = vi.fn()
    render(<AdminBookPages gid="g1abcdef" onChanged={onChanged} />)
    await loaded()
    fireEvent.click(screen.getByRole('checkbox', { name: 'עמוד 1 פתוח למתנדבים' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ url: `${BASE}/pages`, method: 'PATCH', body: { volunteer: false, ids: ['p1'] } })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(fetchMock.mock.calls.filter(([u, i]) => u === `${BASE}/pages` && !i?.method)).toHaveLength(2)
  })

  it('"פתח רק את הטווח וסגור את כל השאר" ← אישור, ואז {volunteer:true, from, to, others:false}', async () => {
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.change(screen.getByLabelText('מעמוד'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('עד עמוד'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'פתח רק את הטווח וסגור את כל השאר' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(showConfirm).toHaveBeenCalledWith('פתיחת הטווח בלבד', expect.stringContaining('עמודים 1–20 יהיו פתוחים'), expect.any(Function), 'פתח וסגור את השאר', 'ביטול')
    expect(calls[0].body).toEqual({ volunteer: true, from: 1, to: 20, others: false })
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('בוצע', expect.stringContaining('20 עמודים פתוחים ו-180 סגורים')))
  })

  it('פתיחה/סגירה של טווח בלי השאר; טווח לא תקין ← הודעה ובלי בקשה', async () => {
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.change(screen.getByLabelText('מעמוד'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('עד עמוד'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'פתח את הטווח' }))
    expect(screen.getByRole('alert')).toHaveTextContent('עמוד ההתחלה אחרי עמוד הסוף')
    expect(calls).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('עד עמוד'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'סגור את הטווח' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({ volunteer: false, from: 30, to: 30 })
    expect(showConfirm).not.toHaveBeenCalled()
  })

  it('שחרור עמוד בידי מנהל ← אישור עם האזהרה על הטיוטה של המתנדב, ואז POST לעמוד הזה', async () => {
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'שחרור עמוד 4' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    const [title, message, onYes, yes, no] = showConfirm.mock.calls[0]
    expect(typeof onYes).toBe('function')
    expect(no).toBe('ביטול')
    expect(title).toBe('שחרור עמוד')
    expect(message).toContain('לשחרר את עמוד 4 (בידי ראובן)?')
    expect(message).toContain(DRAFT_WARNING)
    expect(yes).toBe('שחרר')
    expect(calls[0]).toEqual({ url: `${BASE}/release`, method: 'POST', body: { ids: ['p4'] } })
  })

  it('ביטול בחלון-האישור ← שום בקשה', async () => {
    showConfirm.mockImplementation(() => {}) // המשתמש לחץ "ביטול" — הפעולה לא נקראת
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'שחרור עמוד 4' }))
    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(calls).toHaveLength(0)
  })

  it('בבת אחת: ניקוי התפיסות שפגו, ושחרור כל התפיסות בספר — כל אחד עם אזהרה', async () => {
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    expect(screen.getByText('1 תפוסים עכשיו · 1 תפיסות שפגו')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'נקה תפיסות שפגו' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({ scope: 'expired' })
    expect(showConfirm.mock.calls[0][1]).toContain('תפיסה אחת שפגה')
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('בוצע', 'עמוד אחד שוחרר'))

    fireEvent.click(screen.getByRole('button', { name: 'שחרר את כל התפיסות בספר' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].body).toEqual({ scope: 'all' })
    expect(showConfirm.mock.calls[1][1]).toContain('את כל 2 העמודים התפוסים')
    expect(showConfirm.mock.calls[1][1]).toContain(DRAFT_WARNING)
  })

  it('שגיאה מהשרת ← הודעה, והרשת נטענת מחדש', async () => {
    fetchMock.mockImplementation((url, init = {}) => {
      if ((init.method || 'GET') === 'GET') return ok({ book: BOOK, pages: PAGES, counts: adminCounts(PAGES) })
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ success: false, error: 'טווח עמודים לא תקין' }) })
    })
    render(<AdminBookPages gid="g1abcdef" />)
    await loaded()
    fireEvent.click(screen.getByRole('checkbox', { name: 'עמוד 1 פתוח למתנדבים' }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('שגיאה', 'טווח עמודים לא תקין'))
  })

  it('עמוד שממתין לזיהוי-מחדש בבקשת מתנדב: מי ביקש ומתי; "ביטול הבקשה" ← אישור, ואז release_recut על הבקשה', async () => {
    render(<AdminBookPages gid="g1abcdef" onClose={vi.fn()} />)
    await loaded()
    const c9 = card(9)
    expect(within(c9).getByTestId('recut-request')).toHaveTextContent('לבקשת ראובן · היום')
    expect(within(c9).getByTestId('recut-request')).toHaveTextContent('ממתין לתוכנת-הספר')
    // זיהוי-מחדש שלא בבקשה — בלי השורה ובלי הכפתור
    expect(within(card(8)).queryByTestId('recut-request')).toBeNull()
    expect(within(card(8)).queryByRole('button', { name: /ביטול הבקשה/ })).toBeNull()

    fireEvent.click(within(c9).getByRole('button', { name: 'ביטול הבקשה לזיהוי-מחדש של עמוד 9' }))
    expect(showConfirm).toHaveBeenCalledWith('ביטול בקשה לזיהוי-מחדש', expect.stringContaining('יחזור אל ראובן'), expect.any(Function), 'בטל את הבקשה', 'ביטול')
    await waitFor(() => expect(calls).toEqual([{ url: '/api/admin/page-proof/submissions/req9', method: 'PATCH', body: { action: 'release_recut' } }]))
  })

  it('"סגירה" קוראת ל-onClose', async () => {
    const onClose = vi.fn()
    render(<AdminBookPages gid="g1abcdef" onClose={onClose} />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(onClose).toHaveBeenCalled()
  })

  // עריכה אחרי אישור — רק מנהל (docs/63 §5)
  it('עמוד מאושר — "פתח מחדש לעריכה" אחרי אישור; לעמודים אחרים אין כפתור; עמוד שנפתח מחדש — מסומן', async () => {
    render(<AdminBookPages gid="g1abcdef" title="ספר הבדיקה" onClose={vi.fn()} />)
    await loaded()
    for (const n of [1, 4, 6, 8]) expect(within(card(n)).queryByRole('button', { name: /פתיחה מחדש לעריכה/ })).not.toBeInTheDocument()
    fireEvent.click(within(card(7)).getByRole('button', { name: 'פתיחה מחדש לעריכה של עמוד 7' }))
    await waitFor(() => expect(calls.some((c) => c.url === `${BASE}/reopen`)).toBe(true))
    expect(showConfirm.mock.calls.at(-1)[0]).toBe('פתיחה מחדש לעריכה')
    expect(showConfirm.mock.calls.at(-1)[1]).toMatch(/האישור הבא — שוב בידי מנהל/)
    expect(calls.find((c) => c.url === `${BASE}/reopen`)).toEqual({ url: `${BASE}/reopen`, method: 'POST', body: { ids: ['p7'] } })
  })
})
