import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import ProofBookGrid from './ProofBookGrid'

// רשת-העמודים: טעינה, כרטיסי-המונים כמסננים, "העמודים שלי", תצוגה ברצפים עם
// "תפוס את 5 העמודים", ותפיסת עמוד ← העורך. fetch, הניווט והחלונות מדומים;
// חלון-השאלה מאשר מיד.

const { push, showConfirm, showAlert } = vi.hoisted(() => ({
  push: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))

const later = new Date(Date.now() + 5 * 3600 * 1000).toISOString()
const P = (n, state, extra = {}) => ({
  id: `id${n}`,
  page: n,
  seq: Math.floor((n - 1) / 5),
  revision: 1,
  lineCount: 10,
  required: 1,
  state,
  claimer: null,
  leasedUntil: null,
  submittedAt: null,
  ...extra,
})

const PAGES = [
  P(1, 'open'),
  P(2, 'open'),
  P(3, 'mine', { leasedUntil: later }),
  P(4, 'taken', { claimer: 'ראובן', leasedUntil: later }),
  P(5, 'submitted'),
  P(6, 'open'),
  P(7, 'approved'),
  P(8, 'done'),
]
const COUNTS = { total: 8, open: 3, mine: 1, taken: 1, submitted: 1, second: 0, approved: 1, done: 1, recut: 0, available: 3, my: 3 }
const BOOK = { gid: 'g1', title: 'ספר הבדיקה', script: 'rashi', active: true, lineCount: 80 }

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, ...body }) })
const fail = (status, error) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({ success: false, error }) })

let fetchMock
beforeEach(() => {
  push.mockReset()
  showAlert.mockReset()
  showConfirm.mockReset().mockImplementation((title, message, onConfirm) => onConfirm?.())
  fetchMock = vi.fn((url) => {
    if (String(url).startsWith('/api/page-proof/books/g1') && !String(url).includes('claim-seq')) {
      return ok({ book: BOOK, pages: PAGES, counts: COUNTS })
    }
    return fail(500, 'לא צפוי')
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// המתנה לטעינה — שאילתת-טקסט זולה עם זמן נדיב (בהרצה המלאה הטסטים רצים במקביל)
const loaded = () => screen.findByText('ספר הבדיקה', { selector: 'h1' }, { timeout: 5000 })

const cards = () => screen.getAllByText(/^עמוד \d+$/).map((el) => Number(el.textContent.replace('עמוד ', '')))

describe('ProofBookGrid', { timeout: 20000 }, () => {
  it('טוען את הספר: כותרת, כתב, מונים וכל הכרטיסים', async () => {
    render(<ProofBookGrid gid="g1" />)
    expect(await loaded()).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/page-proof/books/g1', expect.objectContaining({ method: 'GET' }))
    expect(screen.getByText(/8 עמודים · כתב רש"י/)).toBeInTheDocument()
    expect(cards()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // "המשך לעבוד" בכותרת — לעמוד הראשון שבטיפולי
    expect(screen.getByRole('link', { name: 'המשך לעבוד (1 בטיפולך)' })).toHaveAttribute('href', '/library/page-proof?page=id3')
    // בלי עמודים לזיהוי-מחדש — בלי הכרטיס שלהם
    expect(screen.queryByRole('button', { name: /ממתינים לזיהוי-מחדש/ })).not.toBeInTheDocument()
  })

  it('כרטיסי-המונים מסננים; "העמודים שלי" מצמצם; "נקה סינון" מחזיר הכול', async () => {
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /פנויים/ }))
    expect(cards()).toEqual([1, 2, 6])
    fireEvent.click(screen.getByRole('button', { name: /סה"כ עמודים/ }))
    fireEvent.click(screen.getByRole('button', { name: 'העמודים שלי' }))
    expect(cards()).toEqual([3, 5, 7])
    fireEvent.click(screen.getByRole('button', { name: /פנויים/ }))
    expect(screen.getByText('אין עמודים שמתאימים לסינון')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'נקה סינון' }))
    expect(cards()).toHaveLength(8)
  })

  it('"תפוס ועבוד" (אחרי אישור) ← POST לתפיסה ← העורך', async () => {
    fetchMock.mockImplementation((url, opts) => {
      if (url === '/api/page-proof/pages/id1/claim' && opts?.method === 'POST') return ok({ page: { id: 'id1', page: 1 } })
      return ok({ book: BOOK, pages: PAGES, counts: COUNTS })
    })
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    fireEvent.click(screen.getAllByRole('button', { name: 'תפוס ועבוד' })[0])
    await waitFor(() => expect(push).toHaveBeenCalledWith('/library/page-proof?page=id1'), { timeout: 5000 })
    expect(showConfirm).toHaveBeenCalledWith('עבודה על עמוד 1', expect.any(String), expect.any(Function), 'תפוס ועבוד', 'ביטול')
  })

  it('תפיסה שנכשלה (409) ← הודעה בעברית מהשרת, בלי ניווט, והרשת נטענת מחדש', async () => {
    fetchMock.mockImplementation((url, opts) => {
      if (opts?.method === 'POST') return fail(409, 'העמוד נתפס בינתיים בידי מתנדב אחר')
      return ok({ book: BOOK, pages: PAGES, counts: COUNTS })
    })
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    const loads = fetchMock.mock.calls.length
    fireEvent.click(screen.getAllByRole('button', { name: 'תפוס ועבוד' })[0])
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('שגיאה', 'העמוד נתפס בינתיים בידי מתנדב אחר'), { timeout: 5000 })
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(loads + 2), { timeout: 5000 })
  })

  it('שחרור (אחרי אישור) ← DELETE, טעינה מחדש והודעה', async () => {
    fetchMock.mockImplementation((url, opts) => {
      if (url === '/api/page-proof/pages/id3/claim' && opts?.method === 'DELETE') return ok({})
      return ok({ book: BOOK, pages: PAGES, counts: COUNTS })
    })
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'שחרור עמוד 3' }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('בוצע', 'עמוד 3 שוחרר וחזר למאגר'), { timeout: 5000 })
    expect(fetchMock).toHaveBeenCalledWith('/api/page-proof/pages/id3/claim', expect.objectContaining({ method: 'DELETE' }))
  })

  it('תצוגה ברצפים: שורה לכל רצף, "תפוס" רק כשיש פנויים, ותפיסת רצף ← הצעה לפתוח בעורך', async () => {
    fetchMock.mockImplementation((url, opts) => {
      if (String(url).endsWith('/claim-seq')) {
        expect(JSON.parse(opts.body)).toEqual({ seq: 0 })
        return ok({ claimed: 2, pages: [{ id: 'id1', page: 1 }, { id: 'id2', page: 2 }] })
      }
      return ok({ book: BOOK, pages: PAGES, counts: COUNTS })
    })
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /הצג ברצפים של 5/ }))

    const first = screen.getByRole('region', { name: 'רצף עמודים 1–5' })
    const second = screen.getByRole('region', { name: 'רצף עמודים 6–8' })
    expect(within(first).getAllByText(/^עמוד \d+$/)).toHaveLength(5)
    expect(within(second).getAllByText(/^עמוד \d+$/)).toHaveLength(3)
    // ברצף הראשון 2 פנויים מתוך 5; בשני — 1 מתוך 3
    expect(within(second).getByRole('button', { name: 'תפוס את העמוד הפנוי' })).toBeInTheDocument()

    fireEvent.click(within(first).getByRole('button', { name: 'תפוס את 2 העמודים הפנויים' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/library/page-proof?page=id1'), { timeout: 5000 })
    expect(fetchMock).toHaveBeenCalledWith('/api/page-proof/books/g1/claim-seq', expect.objectContaining({ method: 'POST' }))
    expect(showConfirm.mock.calls.map((c) => c[0])).toEqual(['רצף 1 · עמודים 1–5', 'הרצף נתפס'])
  })

  it('ספר מושהה: הודעה, ובלי כפתורי תפיסה', async () => {
    fetchMock.mockImplementation(() => ok({ book: { ...BOOK, active: false }, pages: PAGES, counts: COUNTS }))
    render(<ProofBookGrid gid="g1" />)
    expect(await screen.findByText(/הספר מושהה כרגע/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'תפוס ועבוד' })).not.toBeInTheDocument()
    expect(screen.getAllByText('הספר מושהה')).toHaveLength(3)
  })

  it('ספר שלא נמצא ← הודעת השרת וקישור חזרה לרשימה', async () => {
    fetchMock.mockImplementation(() => fail(404, 'הספר לא נמצא'))
    render(<ProofBookGrid gid="g1" />)
    expect(await screen.findByText('הספר לא נמצא', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חזרה לרשימת הספרים' })).toHaveAttribute('href', '/library/page-proof/books')
  })

  it('עמודים שהמנהל סגר להגהה אינם ברשת — רק הסבר כמה; וכלל ה-48 שעות מוצג', async () => {
    fetchMock.mockImplementation(() => ok({ book: BOOK, pages: PAGES, counts: COUNTS, hidden: 12 }))
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    expect(screen.getByText(/12 עמודים בספר עוד לא נפתחו להגהה/)).toBeInTheDocument()
    expect(screen.getByText('כל עמוד שתפסתם שמור לכם 48 שעות, וכל פתיחה שלו בעורך מחדשת את הזמן.')).toBeInTheDocument()
  })

  it('בלי עמודים סגורים — בלי ההסבר', async () => {
    render(<ProofBookGrid gid="g1" />)
    await loaded()
    expect(screen.queryByText(/לא נפתחו להגהה/)).not.toBeInTheDocument()
  })
})
