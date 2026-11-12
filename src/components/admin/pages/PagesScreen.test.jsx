import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    window.addEventListener('popstate', cb)
    return () => {
      window.removeEventListener('test-url', cb)
      window.removeEventListener('popstate', cb)
    }
  }
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import PagesScreen from './PagesScreen'
import { filterPages, jumpTarget, parsePagesQuery, PAGES_PER_PAGE } from '@/lib/adminPagesScreen/pagesQuery'

const DAY = 86400000
const ago = (d) => new Date(Date.now() - d * DAY).toISOString()
const U1 = 'aaaaaaaaaaaaaaaaaaaaaaa1'
const U2 = 'aaaaaaaaaaaaaaaaaaaaaaa2'
const PAGES = [
  { id: 'p1', bookName: 'מסילת ישרים', number: 1, status: 'in-progress', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(20) },
  { id: 'p2', bookName: 'מסילת ישרים', number: 2, status: 'in-progress', claimedBy: 'דוד לוי', claimedById: U2, updatedAt: ago(3) },
  { id: 'p3', bookName: 'מסילת ישרים', number: 3, status: 'available', claimedBy: null, claimedById: null, updatedAt: ago(40) },
  { id: 'p4', bookName: 'אורחות צדיקים', number: 7, status: 'completed', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(1) },
  { id: 'p5', bookName: 'אורחות צדיקים', number: 8, status: 'in-progress', claimedBy: null, claimedById: null, updatedAt: ago(60) },
]
const OPTIONS = { success: true, books: ['אורחות צדיקים', 'מסילת ישרים'], users: [{ id: U1, name: 'משה כהן' }, { id: U2, name: 'דוד לוי' }] }
const RULE = '='.repeat(40)

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})
const text = (body) => ({
  ok: true, status: 200, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
  blob: async () => new Blob([body], { type: 'text/plain' }),
})

// ----- השרת המדומה: db — מה שיש "בשרת" עכשיו (אפשר לשנות אותו אחרי שהרשימה נטענה) -----
let db
let totalOverride
let calls
let routes
let saved

function listHandler(url) {
  const params = new URL(url, 'http://x').searchParams
  const query = parsePagesQuery(params)
  const matching = db.filter((p) => (!query.book || p.bookName === query.book) && (!query.user || p.claimedById === query.user))
  const rows = filterPages(matching, query)
  if (params.get('view') === 'selection') return json({ pages: rows, next: null })
  if (params.has('number')) return json({ target: jumpTarget(rows, params.get('number')) })
  const limit = PAGES_PER_PAGE
  const page = query.page
  const total = totalOverride ?? rows.length
  return json({ pages: rows.slice((page - 1) * limit, page * limit), pagination: { total, page, limit } })
}
const snapshot = (page) => ({
  status: page.status, claimedById: page.claimedById ?? null, claimedAt: page.claimedAt ?? null, updatedAt: page.updatedAt ?? null,
})
function updateHandler(init) {
  const { id, expected, status, release } = JSON.parse(init.body)
  const index = db.findIndex((p) => p.id === id)
  if (index < 0) return json({ success: true, outcome: 'gone' })
  const current = db[index]
  if (Object.entries(snapshot(current)).some(([key, value]) => value !== expected[key])) {
    return json({ success: true, outcome: 'changed', page: current })
  }
  const updatedAt = new Date().toISOString()
  db[index] = release
    ? { ...current, status: 'available', claimedBy: null, claimedById: null, claimedAt: null, updatedAt }
    : { ...current, status, updatedAt }
  return json({ success: true, outcome: 'updated', updatedAt })
}
function batchHandler(init) {
  const { ids } = JSON.parse(init.body)
  return json({ pages: db.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, text: p.content ?? `טקסט של ${p.id}` })) })
}

beforeEach(() => {
  db = PAGES.map((p) => ({ ...p }))
  totalOverride = undefined
  calls = []
  saved = []
  routes = {
    'GET /api/admin/pages/filter-options': () => json(OPTIONS),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = String(input)
    const key = `${init?.method || 'GET'} ${url}`
    calls.push({ key, body: init?.body })
    if (routes[key]) return routes[key](init)
    if (key.startsWith('GET /api/admin/pages/list?')) return listHandler(url)
    if (key === 'PUT /api/admin/pages/update') return updateHandler(init)
    if (key === 'POST /api/admin/pages/download-batch') return batchHandler(init)
    const one = key.match(/^GET \/api\/admin\/pages\/download\/(.+)$/)
    if (one) return text(`טקסט של ${decodeURIComponent(one[1])}`)
    return json({ error: 'Not found' }, { status: 404 })
  }))
  URL.createObjectURL = vi.fn((blob) => { saved.push(blob); return 'blob:x' })
  URL.revokeObjectURL = vi.fn()
})

const savedNames = []
const originalClick = HTMLAnchorElement.prototype.click
beforeEach(() => {
  savedNames.length = 0
  HTMLAnchorElement.prototype.click = function click() { savedNames.push({ href: this.getAttribute('href'), download: this.getAttribute('download') }) }
})
afterEach(async () => {
  HTMLAnchorElement.prototype.click = originalClick
  // ההגנה על יציאה (useUnsavedChangesGuard) מוסיפה רשומה להיסטוריה בזמן פעולה מרובה, ומסירה אותה ב-history.back()
  // — שמתבצע אחרי רגע. מחכים לו, כדי שלא יחזיר את הכתובת של הטסט הזה באמצע הטסט הבא.
  await new Promise((resolve) => setTimeout(resolve, 30))
})
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><a href="/library/admin/books">ספרים</a><PagesScreen /></ToastProvider>)
}
const BASE = '/library/admin/pages-management'
const enc = (s) => new URLSearchParams({ b: s }).toString().slice(2)
const row = (name) => screen.getByRole('heading', { name }).closest('li')
const puts = () => calls.filter((c) => c.key.startsWith('PUT'))
const gets = () => calls.filter((c) => c.key.startsWith('GET')).map((c) => c.key)
const updateBody = (index, action) => JSON.stringify({ id: PAGES[index].id, expected: snapshot(PAGES[index]), ...action })
const releaseBody = (index) => updateBody(index, { release: true })
const rows = async () => {
  const ul = await screen.findByRole('list', { name: /העמודים/ })
  return within(ul).getAllByRole('listitem')
}
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i))

describe('עמודים', () => {
  test('שורות: אותן בקשות כמו קודם; "שחרר" רק בעמוד בעבודה (עם הסבר); משתמש שנמחק', async () => {
    renderAt(BASE)
    expect(await rows()).toHaveLength(5)
    expect(gets()).toEqual(expect.arrayContaining(['GET /api/admin/pages/list?view=management', 'GET /api/admin/pages/filter-options']))
    const release = within(row('מסילת ישרים, עמוד 1')).getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' })
    expect(release).toHaveAttribute('title', expect.stringMatching(/לא מקבל הודעה ולא מאבד נקודות/))
    expect(within(row('מסילת ישרים, עמוד 3')).queryByRole('button', { name: /^שחרר/ })).toBeNull()
    expect(within(row('אורחות צדיקים, עמוד 7')).queryByRole('button', { name: /^שחרר/ })).toBeNull()
    expect(within(row('אורחות צדיקים, עמוד 8')).getAllByText(/משתמש שנמחק/).length).toBeGreaterThan(0)
    expect(within(row('מסילת ישרים, עמוד 1')).getAllByText('לפני 20 ימים').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1, name: 'עמודים' })).toBeInTheDocument()
  })

  test('סינון מהכתובת — לשרת אותם פרמטרים כמו קודם (status, book, userId)', async () => {
    renderAt(`${BASE}?status=completed&book=${encodeURIComponent('אורחות צדיקים')}&user=${U1}`)
    expect(await rows()).toHaveLength(1)
    expect(gets()).toContain(`GET /api/admin/pages/list?status=completed&book=${enc('אורחות צדיקים')}&user=${U1}&view=management`)
  })

  test('?user= לא תקין — לא נשלח לשרת, יורד מהכתובת, והודעה', async () => {
    renderAt(`${BASE}?user=abc`)
    expect(await rows()).toHaveLength(5)
    expect(gets().some((k) => k.includes('userId'))).toBe(false)
    expect(await screen.findByText('המשתמש שבכתובת לא נמצא. הסינון לפי משתמש הוסר.')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('ערכים לא תקינים בכתובת מתוקנים (?page=-3, ?page=99)', async () => {
    renderAt(`${BASE}?page=-3&status=pending`)
    await rows()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('"בלי שינוי יותר מ-14": השרת מתבקש רק "בעבודה", ומוצגים רק מי שלא עודכן 14 יום', async () => {
    renderAt(`${BASE}?stale=14`)
    expect(await rows()).toHaveLength(2)
    expect(gets().some((key) => key.includes('stale=14') && key.includes('view=management'))).toBe(true)
    expect(screen.queryByRole('heading', { name: 'מסילת ישרים, עמוד 2' })).toBeNull()
  })

  test('בחירה ב"בלי שינוי יותר מ-" מהבורר — בוחרת "בעבודה", ממיינת "הוותיקים קודם", ו"סינון (1)"', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: /^סינון/ }))
    await user.click(screen.getByRole('button', { name: /בלי שינוי יותר מ-/ }))
    await user.click(await screen.findByRole('option', { name: /^14 ימים/ }))
    await waitFor(() => expect(window.location.search).toBe('?stale=14&sort=oldest'))
    await waitFor(() => expect(gets().some((key) => key.includes('stale=14') && key.includes('view=management'))).toBe(true))
    await waitFor(async () => expect(await rows()).toHaveLength(2))
    // הוותיק ביותר ראשון
    expect(within((await rows())[0]).getByRole('heading').textContent).toMatch(/אורחות צדיקים/)
    expect(screen.getByRole('button', { name: 'סינון (1)' })).toBeInTheDocument()
  })

  test('ריק בסינון — "נקה סינון"', async () => {
    db = db.filter((p) => p.status !== 'completed')
    const user = userEvent.setup()
    renderAt(`${BASE}?status=completed`)
    expect(await screen.findByText('אין עמודים שמתאימים לסינון')).toBeInTheDocument()
    await user.click(within(document.getElementById('pages-list')).getByRole('button', { name: 'נקה סינון' }))
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(await rows()).toHaveLength(4)
  })

  test('שגיאה בטעינה — "לא הצלחנו לטעון" ו"נסה שוב"; 403 — אין הרשאה', async () => {
    routes['GET /api/admin/pages/list?view=management'] = () => json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    const { unmount } = renderAt(BASE)
    expect(await screen.findByText('לא הצלחנו לטעון את העמודים')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /נסה שוב/ })).toBeInTheDocument()
    unmount()
    routes['GET /api/admin/pages/list?view=management'] = () => json({ error: 'Forbidden' }, { status: 403 })
    renderAt(BASE)
    expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
  })

  test('40000 תוצאות — הרשימה הראשונה שולפת רק עמוד אחד', async () => {
    totalOverride = 40000
    renderAt(BASE)
    await rows()
    expect(gets().filter((k) => k.startsWith('GET /api/admin/pages/list'))).toEqual(['GET /api/admin/pages/list?view=management'])
    expect(screen.getByText(/40,000 עמודים/)).toBeInTheDocument()
  })

  test('מעבר עמוד: 51 עמודים — "הבא" עובר ל-?page=2; ?page=99 מתוקן לעמוד האחרון', async () => {
    db = many(51, (i) => ({ id: `n${i}`, bookName: 'ספר', number: i + 1, status: 'available', claimedBy: null, claimedById: null, updatedAt: ago(1) }))
    const user = userEvent.setup()
    const { unmount } = renderAt(BASE)
    expect(await rows()).toHaveLength(50)
    await user.click(screen.getByRole('button', { name: /הבא/ }))
    await waitFor(() => expect(window.location.search).toBe('?page=2'))
    expect(await rows()).toHaveLength(1)
    unmount()
    renderAt(`${BASE}?page=99`)
    await rows()
    await waitFor(() => expect(window.location.search).toBe('?page=2'))
  })

  test('"קפוץ לעמוד" (כשנבחר ספר) — לעמוד של הרשימה שבו הוא, והפוקוס לשורה; מספר שאין — הודעה', async () => {
    db = many(120, (i) => ({ id: `j${i}`, bookName: 'ספר', number: i + 1, status: 'available', claimedBy: null, claimedById: null, updatedAt: ago(1) }))
    const user = userEvent.setup()
    renderAt(`${BASE}?book=${encodeURIComponent('ספר')}`)
    await rows()
    const field = screen.getByRole('textbox', { name: /קפוץ לעמוד/ })
    await user.type(field, '87{Enter}')
    await waitFor(() => expect(window.location.search).toContain('page=2'))
    await waitFor(() => expect(within(row('ספר, עמוד 87')).getByRole('checkbox')).toHaveFocus())
    const currentField = screen.getByRole('textbox', { name: /קפוץ לעמוד/ })
    await user.clear(currentField)
    await user.type(currentField, '500{Enter}')
    expect(await screen.findByText('אין ברשימה עמוד 500 ב"ספר".')).toBeInTheDocument()
  })

  test('"בחר את כל N" — על פני עמודי הרשימה, נשמר במעבר עמוד; "שחרר N"', async () => {
    db = many(60, (i) => ({ id: `s${i}`, bookName: 'ספר', number: i + 1, status: i < 55 ? 'in-progress' : 'available', claimedBy: 'משה', claimedById: U1, updatedAt: ago(1) }))
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'בחר את כל 60 העמודים' }))
    expect((await screen.findAllByText('60 נבחרו (בכל העמודים)')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'שחרר 55 עמודים' })).toHaveTextContent('שחרר 55')
    await user.click(screen.getByRole('button', { name: /הבא/ }))
    expect((await screen.findAllByText('60 נבחרו (בכל העמודים)')).length).toBeGreaterThan(0)
  })

  test('אין בנבחרים עמוד בעבודה — "שחרר נבחרים" (לא "שחרר 0"), לא פעיל', async () => {
    db = many(60, (i) => ({ id: `c${i}`, bookName: 'ספר', number: i + 1, status: 'completed', claimedBy: 'משה', claimedById: U1, updatedAt: ago(1) }))
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'בחר את כל 60 העמודים' }))
    const button = screen.getByRole('button', { name: 'שחרר — אין בנבחרים עמוד בעבודה' })
    expect(button).toHaveTextContent('שחרר נבחרים')
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  test('⋮ "הורד טקסט" — אותה כתובת כמו קודם, וקובץ בשם הספר והעמוד', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(within(row('מסילת ישרים, עמוד 3')).getByRole('button', { name: /פעולות נוספות/ }))
    expect(screen.getByRole('menuitem', { name: 'פתח בעורך' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'הורד טקסט' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(gets()).toContain('GET /api/admin/pages/download/p3')
    expect(await saved[0].text()).toBe('טקסט של p3')
  })

  test('"הורד טקסט של כל N העמודים" — מעל 1,000 שואל קודם; אותה כתובת כמו "הכל"', async () => {
    totalOverride = 1500
    const user = userEvent.setup()
    renderAt(`${BASE}?status=completed`)
    await rows()
    await user.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await user.click(screen.getByRole('menuitem', { name: 'הורד טקסט של כל 1,500 העמודים המסוננים' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('להוריד את הטקסט של 1,500 עמודים?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'הורד' }))
    await waitFor(() => expect(savedNames).toContainEqual({ href: '/api/admin/pages/download-batch?status=completed', download: 'all-pages.txt' }))
  })
})

describe('שחרור — "בטל" לפני שהבקשה יוצאת, ובדיקה טרייה לפני השליחה', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  test('"בטל" בשורה — לא נשלח כלום, והפוקוס חוזר ל"שחרר"; אין "בטל" כפול בהודעה', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    expect(within(row('מסילת ישרים, עמוד 1')).getAllByText('ישוחרר בעוד כמה שניות').length).toBeGreaterThan(0)
    const undo = within(row('מסילת ישרים, עמוד 1')).getByRole('button', { name: 'בטל את השחרור: מסילת ישרים, עמוד 1' })
    await waitFor(() => expect(undo).toHaveFocus())
    expect(screen.getAllByRole('button', { name: /^בטל/ })).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(700) })
    await user.click(undo)
    expect(await screen.findByText(/השחרור בוטל/)).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(puts()).toEqual([])
    await waitFor(() => expect(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' })).toHaveFocus())
  })

  test('לחיצה כפולה על "שחרר" — הלחיצה השנייה (על "בטל" שהופיע במקום) לא מבטלת', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.dblClick(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    expect(within(row('מסילת ישרים, עמוד 1')).getByRole('button', { name: /^בטל את השחרור/ })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(puts()).toHaveLength(1))
  })

  test('Ctrl+Z מבטל את השחרור האחרון', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    await act(async () => { vi.advanceTimersByTime(700) })
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(await screen.findByText(/השחרור בוטל/)).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(puts()).toEqual([])
  })

  test('בלי "בטל" — עדכון מותנה לפי המזהה; השורה נשארת במקומה עם "שוחרר", והפוקוס נשאר בשורה', async () => {
    const user = setup()
    renderAt(`${BASE}?status=in-progress`)
    const before = (await rows()).map((li) => li.getAttribute('data-row'))
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    expect(puts()).toEqual([])
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(puts()).toEqual([{ key: 'PUT /api/admin/pages/update', body: releaseBody(0) }]))
    expect(gets().filter((key) => key.includes('/pages/list?'))).toHaveLength(1)
    expect(await screen.findByText('"מסילת ישרים", עמוד 1 שוחרר. עכשיו הוא פנוי לכל המתנדבים.')).toBeInTheDocument()
    // "פנוי" כבר לא מתאים לסינון "בעבודה" — ובכל זאת נשאר באותו מקום
    expect((await rows()).map((li) => li.getAttribute('data-row'))).toEqual(before)
    const released = row('מסילת ישרים, עמוד 1')
    expect(within(released).getAllByText('שוחרר').length).toBeGreaterThan(0)
    expect(within(released).queryByRole('button', { name: /^שחרר/ })).toBeNull()
    await waitFor(() => expect(within(released).getByRole('button', { name: /פעולות נוספות/ })).toHaveFocus())
  })

  test('העמוד השתנה מאז הטעינה (הושלם) — העדכון נדחה, והשורה מראה את המצב החדש', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    db[0] = { ...db[0], status: 'completed' }
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(await screen.findByText('"מסילת ישרים", עמוד 1 השתנה מאז הטעינה — לא שוחרר.')).toBeInTheDocument()
    expect(puts()).toHaveLength(1)
    expect(within(row('מסילת ישרים, עמוד 1')).getAllByText('הושלם').length).toBeGreaterThan(0)
  })

  test('נלקח בינתיים ע"י משתמש אחר — העדכון נדחה', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    db[0] = { ...db[0], claimedBy: 'דוד לוי', claimedById: U2 }
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(await screen.findByText(/השתנה מאז הטעינה/)).toBeInTheDocument()
    expect(puts()).toHaveLength(1)
  })

  test('"רענן" בזמן ש"בטל" עוד פתוח — השחרור לא הולך לאיבוד', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    await user.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await user.click(screen.getByRole('menuitem', { name: 'רענן' }))
    expect(await screen.findByText('הרשימה עודכנה')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(puts()).toHaveLength(1))
  })

  test('סגירת הדף בזמן ש"בטל" פתוח — השחרור נשלח מיד, בבקשה ששורדת את הסגירה', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    window.dispatchEvent(new Event('pagehide'))
    const sent = fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(sent).toHaveLength(1)
    expect(sent[0][1].keepalive).toBe(true)
    expect(sent[0][1].body).toBe(releaseBody(0))
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  test('רענון בזמן ההמתנה שומר על עמוד שהושלם בינתיים', async () => {
    const user = setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    db[0] = { ...db[0], status: 'completed' }
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    expect(puts()).toHaveLength(1)
    expect(db[0].status).toBe('completed')
    expect(db[0].claimedById).toBe(U1)
  })
})

describe('שגיאות שחרור — הודעה מדויקת', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  async function releaseFirst() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('button', { name: 'שחרר: מסילת ישרים, עמוד 1' }))
    await act(async () => { vi.advanceTimersByTime(6000) })
  }

  test('עמוד שנמחק מחזיר הודעה', async () => {
    routes['PUT /api/admin/pages/update'] = () => json({ success: true, outcome: 'gone' })
    await releaseFirst()
    expect(await screen.findByText(/לא נמצא יותר — לא שוחרר/)).toBeInTheDocument()
  })

  test('שגיאת שרת — הודעה כללית', async () => {
    routes['PUT /api/admin/pages/update'] = () => json({ success: false, error: 'Internal Server Error' }, { status: 500 })
    await releaseFirst()
    expect(await screen.findByText('לא הצלחנו לשחרר את העמוד.')).toBeInTheDocument()
  })
})

describe('שנה מצב', () => {
  test('חלון שמסביר מה יקרה; אותו גוף כמו "ערוך סטטוס" הקודם; "בעבודה" בלי מתנדב — לא לבחירה', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(within(row('מסילת ישרים, עמוד 3')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'שנה מצב…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /^פנוי/ })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /^בעבודה/ })).toBeDisabled()
    expect(within(dialog).getByText('אין מתנדב שהעמוד יחזור אליו')).toBeInTheDocument()
    // בלי בחירה מראש — האישור לא פעיל
    expect(within(dialog).getByRole('button', { name: 'שנה' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(dialog).getByRole('radio', { name: /^הושלם/ }))
    expect(within(dialog).getByText(/לא מוסיף נקודות/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'שנה ל"הושלם"' }))
    await waitFor(() => expect(puts()).toEqual([{ key: 'PUT /api/admin/pages/update', body: updateBody(2, { status: 'completed' }) }]))
    expect(await screen.findByText('"מסילת ישרים", עמוד 3 עכשיו "הושלם".')).toBeInTheDocument()
    expect(within(row('מסילת ישרים, עמוד 3')).getAllByText('הושלם').length).toBeGreaterThan(0)
  })

  test('עמוד שהושלם → "פנוי": כפתור אדום, ונשלח { status: "available" } בלבד', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(within(row('אורחות צדיקים, עמוד 7')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'שנה מצב…' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /^פנוי/ }))
    expect(within(dialog).getByText(/כבר לא ייחשב כהושלם/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'שנה ל"פנוי"' }))
    await waitFor(() => expect(puts().map((c) => c.body)).toEqual([updateBody(3, { status: 'available' })]))
  })

  test('השתנה בינתיים — לא נשלח', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    db[3] = { ...db[3], status: 'in-progress' }
    await user.click(within(row('אורחות צדיקים, עמוד 7')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'שנה מצב…' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /^פנוי/ }))
    await user.click(within(dialog).getByRole('button', { name: /^שנה ל/ }))
    expect(await screen.findByText(/השתנה בינתיים — לא שונה/)).toBeInTheDocument()
    expect(puts()).toHaveLength(1)
  })
})

describe('פעולות מרובות', () => {
  test('שחרר נבחרים: חלון אישור (לא אדום) עם המספר, בדיקה, רק מי שבעבודה נשלח, וסיכום', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    for (const name of ['מסילת ישרים, עמוד 1', 'מסילת ישרים, עמוד 2', 'מסילת ישרים, עמוד 3']) {
      await user.click(within(row(name)).getByRole('checkbox'))
    }
    expect(screen.getAllByText('3 נבחרו').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'שחרר 2 עמודים' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('לשחרר 2 עמודים?')).toBeInTheDocument()
    expect(within(dialog).getByText(/עמוד אחד מהנבחרים אינו בעבודה/)).toBeInTheDocument()
    const ok = within(dialog).getByRole('button', { name: 'שחרר 2' })
    expect(ok.className).not.toMatch(/bg-error/)
    await user.click(ok)
    expect(await screen.findByText('2 עמודים שוחררו.')).toBeInTheDocument()
    expect(puts().map((c) => c.body).sort()).toEqual([releaseBody(0), releaseBody(1)].sort())
    expect(gets().filter((key) => key.includes('/pages/list?'))).toHaveLength(1)
    expect(screen.queryByText(/נבחרו|נבחר$/)).toBeNull()
  })

  test('בדיקה לפני שליחה: מה שהשתנה מדלגים עליו, והסיכום אומר כמה', async () => {
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    db[0] = { ...db[0], status: 'completed' }
    db[1] = { ...db[1], claimedBy: 'משה כהן', claimedById: U1 }
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'שחרר 3' }))
    expect(await screen.findByText('עמוד אחד שוחרר. 2 השתנו מאז הטעינה ולא שוחררו.')).toBeInTheDocument()
    expect(puts().map((c) => c.body).sort()).toEqual([releaseBody(0), releaseBody(1), releaseBody(4)].sort())
    // כל השורות נשארו במקומן
    expect(await rows()).toHaveLength(3)
  })

  test('שחרור מעשרה ספרים לפי מזהי עמודים, בלי טעינה חוזרת של הרשימה', async () => {
    db = many(10, (i) => ({ id: `k${i}`, bookName: `ספר ${i}`, number: 1, status: 'in-progress', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(30) }))
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    db[0] = { ...db[0], status: 'completed' }
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'שחרר 10' }))
    expect(await screen.findByText('9 עמודים שוחררו. עמוד אחד השתנה מאז הטעינה ולא שוחרר.')).toBeInTheDocument()
    expect(gets().filter((k) => k.startsWith('GET /api/admin/pages/list'))).toEqual(['GET /api/admin/pages/list?status=in-progress&view=management'])
    const changed = row('ספר 0, עמוד 1')
    expect(within(changed).getAllByText('הושלם').length).toBeGreaterThan(0)
    expect(within(changed).queryByRole('button', { name: /^שחרר/ })).toBeNull()
  })

  test('ביטול בחלון האישור — לא נשלח כלום, והבחירה נשארת', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(within(row('מסילת ישרים, עמוד 1')).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'ביטול' }))
    expect(puts()).toEqual([])
    expect(screen.getAllByText('עמוד אחד נבחר').length).toBeGreaterThan(0)
  })

  test('הורד טקסט לנבחרים — בקשה לפי מזהים וקובץ אחד בסוף', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'הורד את הטקסט של הנבחרים' }))
    expect(await screen.findByText('הטקסט של 5 עמודים ירד.')).toBeInTheDocument()
    expect(calls.filter((c) => c.key === 'POST /api/admin/pages/download-batch')).toHaveLength(1)
    expect(saved).toHaveLength(1)
    const body = await saved[0].text()
    expect(body).toContain('ספר: מסילת ישרים | עמוד: 1')
    expect(body).toContain('טקסט של p5')
    expect(savedNames.at(-1).download).toBe('עמודים-5.txt')
  })

  test('הורדה מרובה שומרת על כותרות שמופיעות בתוך תוכן העמוד', async () => {
    db = many(12, (i) => ({ id: `b${i}`, bookName: 'שערי תשובה', number: i + 1, status: 'in-progress', claimedBy: 'משה', claimedById: U1, updatedAt: ago(1) }))
    db[0].content = `תחילה
${RULE}
ספר: כותרת בתוך הטקסט | עמוד: 12
${RULE}

סוף`
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'הורד את הטקסט של הנבחרים' }))
    expect(await screen.findByText('הטקסט של 12 עמודים ירד.')).toBeInTheDocument()
    expect(calls.filter((c) => c.key === 'POST /api/admin/pages/download-batch')).toHaveLength(1)
    const body = await saved[0].text()
    expect(body).toContain(db[0].content)
    expect(body).toContain('ספר: שערי תשובה | עמוד: 12\n========================================\n\nטקסט של b11\n\n\n')
  })

  test('"עצור" באמצע — "עוצר…" מיד; מה שכבר יצא מסתיים, ומה שלא נשלח נשאר מסומן', async () => {
    db = many(6, (i) => ({ id: `s${i + 1}`, bookName: 'שערי תשובה', number: i + 1, status: 'in-progress', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(30) }))
    const pending = []
    routes['PUT /api/admin/pages/update'] = (init) => new Promise((r) => { pending.push(() => r(updateHandler(init))) })
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'שחרר 6' }))
    const stop = await screen.findByRole('button', { name: 'עצור' })
    await waitFor(() => expect(pending).toHaveLength(4))
    expect(screen.getAllByText(/משחרר… 0 מתוך 6/).length).toBeGreaterThan(0)
    await user.click(stop)
    expect(screen.getAllByText('עוצר…').length).toBeGreaterThan(0)
    await act(async () => { pending.forEach((resolve) => resolve()) })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'עצור' })).toBeNull())
    expect(puts()).toHaveLength(4)
    expect(await screen.findByText('4 עמודים שוחררו. 2 לא נשלחו (עצרת). מה שלא הושלם נשאר מסומן.')).toBeInTheDocument()
    expect(screen.getAllByText('2 נבחרו').length).toBeGreaterThan(0)
  })

  test('הורדה חלקית — עמוד שחסר בשרת נשאר מסומן ושם הקובץ מציין זאת', async () => {
    const user = userEvent.setup()
    renderAt(BASE)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    db.pop()
    await user.click(screen.getByRole('button', { name: 'הורד את הטקסט של הנבחרים' }))
    expect(await screen.findByText(/הטקסט של 4 עמודים ירד \(קובץ חלקי\)/)).toBeInTheDocument()
    expect(savedNames.at(-1).download).toBe('עמודים-4-מתוך-5-חלקי.txt')
  })

  test('403 באמצע — הסיכום אומר גם כמה כבר שוחררו', async () => {
    db = many(8, (i) => ({ id: `f${i + 1}`, bookName: 'שערי תשובה', number: i + 1, status: 'in-progress', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(30) }))
    let n = 0
    routes['PUT /api/admin/pages/update'] = (init) => {
      n += 1
      return n <= 2 ? updateHandler(init) : json({ error: 'Forbidden' }, { status: 403 })
    }
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'שחרר 8' }))
    expect(await screen.findByText(/^2 עמודים שוחררו\. \d+ לא הושלמו: אין לך הרשאה לפעולה הזו\./)).toBeInTheDocument()
  })

  test('יציאה מהמסך באמצע — קישור שואל "לעצור ולצאת?"; "הישאר" — נשארים והריצה ממשיכה', async () => {
    db = many(6, (i) => ({ id: `l${i + 1}`, bookName: 'שערי תשובה', number: i + 1, status: 'in-progress', claimedBy: 'משה כהן', claimedById: U1, updatedAt: ago(30) }))
    const pending = []
    routes['PUT /api/admin/pages/update'] = (init) => new Promise((r) => { pending.push(() => r(updateHandler(init))) })
    const user = userEvent.setup()
    renderAt(`${BASE}?status=in-progress`)
    await rows()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל העמודים בעמוד הזה' }))
    await user.click(screen.getByRole('button', { name: 'שחרר את הנבחרים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'שחרר 6' }))
    await screen.findByRole('button', { name: 'עצור' })
    await user.click(screen.getByRole('link', { name: 'ספרים' }))
    const ask = await screen.findByRole('dialog')
    expect(within(ask).getByText('לעצור ולצאת?')).toBeInTheDocument()
    expect(savedNames.some((l) => l.href === '/library/admin/books')).toBe(false)
    await user.click(within(ask).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByRole('button', { name: 'עצור' })).toBeInTheDocument()
    await act(async () => {
      while (pending.length) pending.shift()()
      await Promise.resolve()
    })
    await waitFor(() => expect(puts()).toHaveLength(6))
    await act(async () => { while (pending.length) pending.shift()() })
    expect(await screen.findByText('6 עמודים שוחררו.')).toBeInTheDocument()
  })
})
