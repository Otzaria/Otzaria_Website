// מסך הספרים מקצה לקצה (עם fetch מדומה): סינון מהכתובת וניקוי ערכים לא חוקיים, מצבים ריקים, שגיאה
// עם "נסה שוב", התחברות שפגה, בחירה שנגזרת ממה שמוצג (בלי "בחירת רפאים"), פעולות מרובות שמדלגות
// על ספר אישי ואומרות את זה, "הסתר" עם "בטל", מחיקה דרך דיאלוג, ומגירת הספר מהכתובת.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

const push = vi.fn()
vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    return () => window.removeEventListener('test-url', cb)
  }
  return {
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => window.location.pathname,
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search)
      return new URLSearchParams(search)
    },
  }
})
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))
// לוח הזיהוי עצמו נבדק בנפרד (BookOcrPanel.test) — כאן רק שהלשונית מציגה אותו
vi.mock('@/components/admin/ocr/BookOcrPanel', () => ({ default: ({ book }) => <p>לוח הזיהוי של {book.name}</p> }))

for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

// "אחורה" (סגירת מגירה שנפתחה ב-push) — Next מסנכרן ב-popstate
window.addEventListener('popstate', () => window.dispatchEvent(new Event('test-url')))

import BooksScreen from './BooksScreen'

// מסך שלם עם userEvent — כמה בדיקות עוברות את 5 השניות של ברירת המחדל כשהמכונה עמוסה
vi.setConfig({ testTimeout: 20000 })

const B = (id, name, extra = {}) => ({
  id, name, path: `slug-${id}`, totalPages: 10, completedPages: 0, inProgressPages: 0, category: 'כללי',
  lastUpdated: `2026-10-${String(10 + Number(id)).padStart(2, '0')}T10:00:00Z`, isHidden: false, ...extra,
})
const BOOKS = [
  B('1', 'חוות דעת', { completedPages: 4, category: 'אחרונים' }),
  B('2', 'אור החיים', { completedPages: 10, category: 'ראשונים' }),
  B('3', 'ספר המידות', { isHidden: true, category: 'ראשונים' }),
  B('4', 'מעיין נדה', { isHidden: true, isPrivate: true, ownerId: 'u1', ownerName: 'דוד', category: 'אישי - דוד', inProgressPages: 2 }),
]
const CATEGORIES = [{ name: 'כללי', color: '#eedddd' }, { name: 'ראשונים', color: '#38571a' }, { name: 'אחרונים', color: '#3b82f6' }]

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let handler
beforeEach(() => {
  calls = []
  push.mockClear()
  handler = null
  window.history.replaceState(null, '', '/library/admin/books')
  global.fetch = vi.fn(async (url, options = {}) => {
    const call = { url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, redirect: options.redirect }
    calls.push(call)
    if (handler) {
      const r = handler(call)
      if (r) return r
    }
    if (url === '/api/library/list') return json({ success: true, books: BOOKS })
    if (url === '/api/admin/categories') return json({ success: true, categories: CATEGORIES })
    if (url.startsWith('/api/book/')) return json({ success: true, book: { examplePage: null }, pages: [] })
    return json({ success: true })
  })
})
afterEach(async () => {
  // ההגנה על יציאה (useBulkLeaveGuard) מוסיפה רשומה להיסטוריה בזמן פעולה מרובה, ומסירה אותה ב-history.back()
  // — שמתבצע אחרי רגע. מחכים לו, כדי שלא יחזיר את הכתובת של הטסט הזה באמצע הטסט הבא (כמו ב-PagesScreen.test).
  await new Promise((resolve) => setTimeout(resolve, 30))
})

const renderScreen = (props = {}) => render(
  <ToastProvider>
    <BooksScreen initialBooks={BOOKS} initialCategories={CATEGORIES} {...props} />
  </ToastProvider>
)
const names = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent.replace(/visibility_off|מוסתר/g, '').trim())
const row = (name) => screen.getByRole('heading', { level: 3, name: new RegExp(name) }).closest('li')
const bar = () => screen.getByRole('group', { name: 'פעולות על הנבחרים' })
const writes = () => calls.filter((c) => c.method !== 'GET')

describe('BooksScreen — רשימה וסינון', () => {
  test('שורה: שם, תג "מוסתר" רק לספר מוסתר, קטגוריה ובעלות, התקדמות, "פתח" ו-⋮', () => {
    renderScreen()
    expect(screen.getByRole('heading', { level: 1, name: 'ספרים' })).toBeInTheDocument()
    expect(names()).toEqual(['מעיין נדה', 'ספר המידות', 'אור החיים', 'חוות דעת'])
    const hidden = row('ספר המידות')
    expect(within(hidden).getAllByText('מוסתר').length).toBeGreaterThan(0)
    expect(within(row('חוות דעת')).queryAllByText('מוסתר')).toHaveLength(0)
    expect(within(row('חוות דעת')).getByText('אחרונים')).toBeInTheDocument()
    expect(within(row('חוות דעת')).getByText('ציבורי')).toBeInTheDocument()
    expect(within(row('מעיין נדה')).getByText('אישי · דוד')).toBeInTheDocument()
    expect(within(row('חוות דעת')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    expect(within(row('אור החיים')).getAllByText('הושלם').length).toBeGreaterThan(0)
    expect(within(row('חוות דעת')).getByRole('button', { name: 'פתח את חוות דעת' })).toBeInTheDocument()
    expect(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' })).toBeInTheDocument()
    expect(screen.getByText('4 ספרים')).toBeInTheDocument()
  })

  test('סינון מהכתובת: מצב, בעלות וקטגוריה; ערכים לא חוקיים נזרקים גם מהכתובת', async () => {
    window.history.replaceState(null, '', '/library/admin/books?status=hidden&owner=public&cat=ראשונים,נמחקה&sort=zzz')
    renderScreen()
    expect(names()).toEqual(['ספר המידות'])
    await waitFor(() => expect(decodeURIComponent(window.location.search)).toBe('?vis=hidden&owner=public&cat=ראשונים'))
  })

  test('חיפוש בשם הבעלים', async () => {
    window.history.replaceState(null, '', '/library/admin/books?q=דוד')
    renderScreen()
    expect(names()).toEqual(['מעיין נדה'])
  })

  test('סינון ריק: "אין ספרים שמתאימים לסינון" ו"נקה סינון" שמחזיר הכול', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/library/admin/books?q=zzz')
    renderScreen()
    expect(screen.getByText('אין ספרים שמתאימים לסינון')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'נקה סינון' }).at(-1))
    expect(names()).toHaveLength(4)
    expect(window.location.search).toBe('')
  })

  test('אין ספרים בכלל: "אין ספרים" עם "הוסף ספר"', () => {
    renderScreen({ initialBooks: [] })
    expect(screen.getByText('אין ספרים')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'הוסף ספר' })).toHaveLength(2)
  })

  test('שגיאה בטעינה בשרת: הודעה ו"נסה שוב" שטוען מחדש (ולא "אין ספרים")', async () => {
    const user = userEvent.setup()
    renderScreen({ initialBooks: [], initialError: true })
    expect(screen.getByText('לא הצלחנו לטעון את הספרים')).toBeInTheDocument()
    expect(screen.queryByText('אין ספרים')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }))
    await waitFor(() => expect(names()).toHaveLength(4))
    expect(calls.some((c) => c.url === '/api/library/list' && c.redirect === 'manual')).toBe(true)
  })

  test('התחברות שפגה בטעינה (הפניה לדף ההתחברות): "פג תוקף ההתחברות" עם "התחבר"', async () => {
    const user = userEvent.setup()
    handler = (c) => (c.url === '/api/library/list' ? { ok: false, status: 0, type: 'opaqueredirect', redirected: false, headers: new Headers() } : null)
    renderScreen({ initialBooks: [], initialError: true })
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /התחבר/ })).toHaveAttribute('href', expect.stringContaining('/auth/login?callbackUrl='))
  })
})

describe('BooksScreen — בחירה ופעולות מרובות', () => {
  test('בחירה וסרגל: "2 ספרים נבחרו"; "מזג" משני ספרים ומעלה, ובספר אחד — מושבת עם הסבר', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את חוות דעת' }))
    expect(within(bar()).getByRole('button', { name: 'מזג — בחר לפחות שני ספרים' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את אור החיים' }))
    expect(bar()).toHaveTextContent('2 נבחרו')
    expect(within(bar()).getByRole('button', { name: 'מזג 2 ספרים' })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את ספר המידות' }))
    expect(within(bar()).getByRole('button', { name: 'מזג 3 ספרים' })).toBeEnabled()
  })

  test('"הצג" מרובה: ספר אישי מדולג (השרת חוסם), וההודעה אומרת את זה; בלי הודעה למנויים', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את ספר המידות' }))
    await user.click(screen.getByRole('checkbox', { name: 'בחר את מעיין נדה' }))
    await user.click(within(bar()).getByRole('button', { name: 'הצג את הנבחרים' }))
    expect(await screen.findByText(/ספר אחד מוצג עכשיו לכולם. ספר אישי אחד נשאר מוסתר/)).toBeInTheDocument()
    expect(writes()).toEqual([{ url: '/api/admin/books/update', method: 'PUT', body: { bookId: '3', isHidden: false }, redirect: 'manual' }])
    expect(within(row('ספר המידות')).queryAllByText('מוסתר')).toHaveLength(0)
  })

  test('בלי "בחירת רפאים": ספר שיצא מהסינון אחרי "הצג" כבר לא נבחר, ופעולה מרובה לא תחול עליו', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/library/admin/books?status=hidden')
    renderScreen()
    expect(names()).toEqual(['מעיין נדה', 'ספר המידות'])
    await user.click(screen.getByRole('checkbox', { name: 'בחר את ספר המידות' }))
    await user.click(within(bar()).getByRole('button', { name: 'הצג את הנבחרים' }))
    await screen.findByText(/מוצג עכשיו לכולם/)
    expect(names()).toEqual(['מעיין נדה'])
    expect(screen.queryByText('ספר אחד נבחר')).toBeNull()
    expect(screen.queryByRole('button', { name: 'הסתר את הנבחרים' })).toBeNull()
  })

  test('שינוי קטגוריה מרובה — רק ספרים שאינם אישיים ואינם כבר בה', async () => {
    const user = userEvent.setup()
    renderScreen()
    for (const n of ['חוות דעת', 'אור החיים', 'מעיין נדה']) await user.click(screen.getByRole('checkbox', { name: `בחר את ${n}` }))
    await user.click(within(bar()).getByRole('button', { name: /העבר את הנבחרים לקטגוריה/ }))
    await user.click(screen.getByRole('option', { name: /ראשונים/ }))
    expect(await screen.findByText(/ספר אחד הועבר לקטגוריה "ראשונים"\. ספר אישי אחד לא הועבר/)).toBeInTheDocument()
    expect(writes().map((c) => c.body)).toEqual([{ bookId: '1', category: 'ראשונים' }])
  })
})

describe('BooksScreen — פעולות על ספר', () => {
  test('"שנה קטגוריה" מ-⋮: חלון עם בורר הקטגוריה בלבד, ושמירה שולחת את הקטגוריה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' }))
    await user.click(screen.getByRole('menuitem', { name: 'שנה קטגוריה' }))
    const dialog = screen.getByRole('dialog', { name: 'שינוי קטגוריה' })
    expect(within(dialog).queryByLabelText('שם הספר')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /קטגוריה/ }))
    await user.click(screen.getByRole('option', { name: /ראשונים/ }))
    await user.click(within(dialog).getByRole('button', { name: 'שמור' }))
    await screen.findByText('הקטגוריה עודכנה')
    expect(writes()).toEqual([{ url: '/api/admin/books/update', method: 'PUT', body: { bookId: '1', name: 'חוות דעת', category: 'ראשונים' }, redirect: 'manual' }])
  })

  test('"הסתר" מ-⋮: מיד, עם "בטל" שמחזיר', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' }))
    await user.click(screen.getByRole('menuitem', { name: 'הסתר' }))
    expect(await screen.findByText(/הוסתר/)).toBeInTheDocument()
    expect(within(row('חוות דעת')).getAllByText('מוסתר').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'בטל' }))
    await waitFor(() => expect(within(row('חוות דעת')).queryAllByText('מוסתר')).toHaveLength(0))
    expect(writes().map((c) => c.body.isHidden)).toEqual([true, false])
  })

  test('"הצג" לספר אישי מוסתר — מושבת, והשם אומר למה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('מעיין נדה')).getByRole('button', { name: 'פעולות נוספות: מעיין נדה' }))
    expect(screen.getByRole('menuitem', { name: 'הצג — לא אפשרי בספר אישי' })).toHaveAttribute('aria-disabled', 'true')
  })

  test('"הצג" לספר ציבורי מוסתר — דיאלוג עם בחירה מפורשת אם לשלוח הודעה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('ספר המידות')).getByRole('button', { name: 'פעולות נוספות: ספר המידות' }))
    await user.click(screen.getByRole('menuitem', { name: 'הצג' }))
    const dialog = screen.getByRole('dialog', { name: 'להציג את הספר לכולם?' })
    await user.click(within(dialog).getByRole('button', { name: 'הצג ושלח הודעה' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes()[0].body).toEqual({ bookId: '3', isHidden: false, sendNotification: true })
    // הודעה שנשלחה אי אפשר להחזיר — בלי "בטל"
    expect(screen.queryByRole('button', { name: 'בטל' })).toBeNull()
  })

  test('"מחק לצמיתות": דיאלוג סכנה עם מה יימחק, פוקוס על "ביטול"; אישור מוחק ומוריד את השורה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = screen.getByRole('dialog', { name: 'למחוק לצמיתות את הספר?' })
    expect(dialog).toHaveTextContent('10 עמודים והתמונות שלהם')
    expect(dialog).toHaveTextContent('הטקסט של 4 העמודים שהושלמו')
    await waitFor(() => expect(document.activeElement).toHaveTextContent('ביטול'))
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(names()).not.toContain('חוות דעת'))
    expect(writes()).toEqual([{ url: '/api/admin/books/delete', method: 'DELETE', body: { bookId: '1' }, redirect: 'manual' }])
  })

  test('התחברות שפגה בפעולה: הודעת שגיאה עם "התחבר", והשורה לא משתנה', async () => {
    const user = userEvent.setup()
    handler = (c) => (c.method === 'PUT' ? { ok: false, status: 307, type: 'basic', redirected: false, headers: new Headers() } : null)
    renderScreen()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' }))
    await user.click(screen.getByRole('menuitem', { name: 'הסתר' }))
    expect(await screen.findByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    expect(within(row('חוות דעת')).queryAllByText('מוסתר')).toHaveLength(0)
  })

  test('לחיצה כפולה על "הסתר" — בקשה אחת', async () => {
    const user = userEvent.setup()
    let release
    handler = (c) => (c.method === 'PUT' ? new Promise((r) => { release = () => r(json({ success: true })) }) : null)
    renderScreen()
    for (let i = 0; i < 2; i++) {
      await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פעולות נוספות: חוות דעת' }))
      const item = screen.getByRole('menuitem', { name: 'הסתר' })
      if (item.getAttribute('aria-disabled') !== 'true') await user.click(item)
      else await user.keyboard('{Escape}')
    }
    release()
    await screen.findByText(/הוסתר/)
    expect(writes()).toHaveLength(1)
  })
})

describe('BooksScreen — פעולה מרובה גדולה', () => {
  const MANY = Array.from({ length: 60 }, (_, i) => B(String(100 + i), `ספר ${i + 1}`))

  test('"בחר את כל 60": הכפתור אומר כמה; 4 בקשות במקביל, "X מתוך Y", "עצור", סיכום ו"בטל"', async () => {
    const user = userEvent.setup()
    const waiting = []
    let active = 0
    let peak = 0
    handler = (call) => {
      if (call.method !== 'PUT') return null
      active++
      peak = Math.max(peak, active)
      return new Promise((resolve) => waiting.push(() => { active--; resolve(json({ success: true })) }))
    }
    render(<ToastProvider><BooksScreen initialBooks={MANY} initialCategories={CATEGORIES} /></ToastProvider>)
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל הספרים בעמוד' }))
    await user.click(screen.getByRole('button', { name: 'בחר את כל 60 הספרים' }))
    expect(bar()).toHaveTextContent('60 נבחרו (בכל העמודים)')
    await user.click(within(bar()).getByRole('button', { name: 'הסתר 60 ספרים' }))
    await waitFor(() => expect(waiting).toHaveLength(4))
    expect(peak).toBe(4)
    for (const release of waiting.splice(0, 4)) release()
    expect(await within(bar()).findByText(/מסתיר… [4-9] מתוך 60/)).toBeInTheDocument()
    await user.click(within(bar()).getByRole('button', { name: 'עצור' }))
    while (waiting.length) {
      for (const release of waiting.splice(0)) release()
      await new Promise((r) => setTimeout(r, 10))
    }
    const toast = await screen.findByText(/ספרים הוסתרו\. נעצר — \d+ ספרים לא עודכנו\./)
    const hidden = calls.filter((c) => c.method === 'PUT').length
    expect(hidden).toBeLessThan(60)
    expect(peak).toBe(4)

    handler = null
    calls = []
    await user.click(within(toast.closest('[role="status"], [role="alert"], li, div')).getByRole('button', { name: 'בטל' }))
    await screen.findByText(`השינוי בוטל ב-${hidden} ספרים.`)
    expect(calls.every((c) => c.method === 'PUT' && c.body.isHidden === false)).toBe(true)
    expect(calls).toHaveLength(hidden)
  })
})

describe('BooksScreen — טעינה מחדש', () => {
  test('מרוץ: תשובה ישנה שמגיעה אחרי חדשה לא דורסת אותה', async () => {
    const user = userEvent.setup()
    const pending = []
    handler = (call) => (call.url === '/api/library/list'
      ? new Promise((resolve) => pending.push(resolve))
      : null)
    renderScreen()
    const refresh = async () => {
      await user.click(screen.getByRole('button', { name: 'עוד פעולות על ספרים' }))
      await user.click(screen.getByRole('menuitem', { name: 'רענן' }))
    }
    await refresh()
    await refresh()
    await waitFor(() => expect(pending).toHaveLength(2))
    pending[1](json({ success: true, books: [B('9', 'ספר חדש')] }))
    await screen.findByRole('heading', { level: 3, name: /ספר חדש/ })
    pending[0](json({ success: true, books: BOOKS }))
    await new Promise((r) => setTimeout(r, 50))
    expect(names()).toEqual(['ספר חדש'])
    await waitFor(() => expect(document.activeElement?.id).toBe('books-list'))
  })

  test('403: "אין לך הרשאה לראות את הספרים", בלי "נסה שוב"', async () => {
    handler = (call) => (call.url === '/api/library/list' ? json({ success: false, error: 'Forbidden' }, { status: 403 }) : null)
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('button', { name: 'עוד פעולות על ספרים' }))
    await user.click(screen.getByRole('menuitem', { name: 'רענן' }))
    expect(await screen.findByText('אין לך הרשאה לראות את הספרים')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })
})

describe('BooksScreen — מגירת הספר', () => {
  test('"פתח" פותח מגירה עם לשוניות, הכתובת אומרת מה פתוח, ו-Esc סוגר ומחזיר פוקוס', async () => {
    const user = userEvent.setup()
    renderScreen()
    const open = within(row('חוות דעת')).getByRole('button', { name: 'פתח את חוות דעת' })
    await user.click(open)
    const drawer = screen.getByRole('dialog', { name: 'חוות דעת' })
    expect(window.location.search).toBe('?book=1')
    // השם הנגיש — תמיד המלא (בטלפון מוצג שם קצר)
    expect(within(drawer).getAllByRole('tab')).toHaveLength(5)
    for (const name of ['פרטים', 'עמודים', 'הנחיות עריכה', 'זיהוי טקסט אוטומטי', 'אימון מודלים']) expect(within(drawer).getByRole('tab', { name })).toBeInTheDocument()
    expect(within(drawer).getByRole('progressbar', { name: 'התקדמות' })).toHaveAttribute('aria-valuetext', '4 מתוך 10 הושלמו')
    // הפעולות: ראשית אחת בולטת, ושאר הפעולות ברשימה שקטה — כולל "שנה קטגוריה"; "מחק לצמיתות" אחרון
    expect(within(drawer).getByRole('link', { name: /פתח בספרייה/ })).toBeInTheDocument()
    const list = within(drawer).getByRole('group', { name: 'פעולות על חוות דעת' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent.replace(/^[a-z_]+/, ''))).toEqual(['שנה שם', 'שנה קטגוריה', 'הסתר', 'מזג עם ספרים אחרים', 'הורד טקסט', 'הורד PDF'])
    expect(within(within(drawer).getByRole('group', { name: 'מחיקה' })).getByRole('button', { name: /מחק לצמיתות/ })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('tab', { name: 'זיהוי טקסט אוטומטי' }))
    expect(window.location.search).toBe('?book=1&view=ocr')
    expect(within(drawer).getByText('לוח הזיהוי של חוות דעת')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('קישור ישיר למגירה (?book=…&view=pages) — נפתחת על הלשונית, וספר שלא קיים נזרק מהכתובת', async () => {
    window.history.replaceState(null, '', '/library/admin/books?book=2&view=pages')
    const { unmount } = renderScreen()
    const drawer = screen.getByRole('dialog', { name: 'אור החיים' })
    expect(within(drawer).getByRole('tab', { name: 'עמודים' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(drawer).findByText('אף אחד לא עובד עכשיו על עמודים בספר.')).toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', '/library/admin/books?book=nope')
    renderScreen()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(await screen.findByText('הספר שבקישור לא נמצא. ייתכן שנמחק או מוזג לספר אחר.')).toBeInTheDocument()
  })

  test('הנחיות עריכה: שמירה שולחת את הסעיפים והעמוד; שינוי שלא נשמר — "לצאת בלי לשמור?" לפני מעבר לשונית', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/library/admin/books?book=1&view=instructions')
    renderScreen()
    const drawer = screen.getByRole('dialog', { name: 'חוות דעת' })
    const text = await within(drawer).findByLabelText(/^ההנחיות/)
    await user.type(text, 'שורה ראשונה{Enter}שורה שנייה')
    await user.click(within(drawer).getByRole('tab', { name: 'פרטים' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await user.click(within(confirmDialog).getByRole('button', { name: 'הישאר' }))
    expect(within(drawer).getByRole('tab', { name: 'הנחיות עריכה' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await screen.findByText('ההנחיות נשמרו')
    expect(writes()).toEqual([{
      url: '/api/book/update-info', method: 'POST', redirect: 'manual',
      body: { bookId: '1', editingInfo: { title: 'הנחיות עריכה', sections: [{ title: 'כללי', items: ['שורה ראשונה', 'שורה שנייה'] }] }, examplePage: null },
    }])
  })

  test('הנחיות לא שמורות: "אחורה" בדפדפן שואל, "הישאר" משאיר את המגירה והטקסט, ורענון מזהיר', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'פתח את חוות דעת' }))
    await user.click(within(screen.getByRole('dialog', { name: 'חוות דעת' })).getByRole('tab', { name: 'הנחיות עריכה' }))
    const drawer = screen.getByRole('dialog', { name: 'חוות דעת' })
    await user.type(await within(drawer).findByLabelText(/^ההנחיות/), 'טיוטה')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    window.history.back()
    const ask = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await user.click(within(ask).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByRole('dialog', { name: 'חוות דעת' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog', { name: 'חוות דעת' })).getByLabelText(/^ההנחיות/)).toHaveValue('טיוטה')
    expect(window.location.search).toBe('?book=1&view=instructions')

    window.history.back()
    await user.click(within(await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'צא בלי לשמור' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'חוות דעת' })).toBeNull())
    expect(window.location.search).toBe('')
  })

  test('הנחיות עריכה: אחרי שמירה, מעבר ל"עמודים" וחזרה — הטופס מציג את מה שנשמר, לא את הישן', async () => {
    const user = userEvent.setup()
    // כמו השרת: הספר שנטען מגיע עם ההנחיות (הישנות) — ולא נטען שוב
    handler = (call) => (call.url.startsWith('/api/book/') && call.method === 'GET'
      ? json({ success: true, book: { editingInfo: { title: 'הנחיות עריכה', sections: [] }, examplePage: null }, pages: [] })
      : null)
    window.history.replaceState(null, '', '/library/admin/books?book=1&view=instructions')
    renderScreen()
    const drawer = screen.getByRole('dialog', { name: 'חוות דעת' })
    await user.type(await within(drawer).findByLabelText(/^ההנחיות/), 'הנחיה חדשה')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await screen.findByText('ההנחיות נשמרו')
    await user.click(within(drawer).getByRole('tab', { name: 'עמודים' }))
    expect(screen.queryByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeNull()
    await user.click(within(drawer).getByRole('tab', { name: 'הנחיות עריכה' }))
    expect(await within(drawer).findByLabelText(/^ההנחיות/)).toHaveValue('הנחיה חדשה')
    expect(within(drawer).getByRole('button', { name: 'שמור' })).toBeDisabled()
    // רק בקשת טעינה אחת לספר — הנתון שנשמר עודכן בזיכרון, בלי טעינה מחדש
    expect(calls.filter((c) => c.url.startsWith('/api/book/slug-1'))).toHaveLength(1)
  })
})

describe('BooksScreen — פוקוס אחרי מחיקה', () => {
  const removeBook = async (user, name) => {
    await user.click(within(row(name)).getByRole('button', { name: `פעולות נוספות: ${name}` }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = screen.getByRole('dialog', { name: 'למחוק לצמיתות את הספר?' })
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(names()).not.toContain(name))
  }

  test('ספר באמצע — הפוקוס לתיבת הבחירה של השורה שבאה במקומו', async () => {
    const user = userEvent.setup()
    renderScreen()
    await removeBook(user, 'ספר המידות')
    await waitFor(() => expect(within(row('אור החיים')).getByRole('checkbox', { name: 'בחר את אור החיים' })).toHaveFocus())
  })

  test('הספר האחרון ברשימה — הפוקוס לשורה שלפניו', async () => {
    const user = userEvent.setup()
    renderScreen()
    await removeBook(user, 'חוות דעת')
    await waitFor(() => expect(within(row('אור החיים')).getByRole('checkbox', { name: 'בחר את אור החיים' })).toHaveFocus())
  })

  test('הספר היחיד — הפוקוס לרשימה', async () => {
    const user = userEvent.setup()
    renderScreen({ initialBooks: [BOOKS[0]] })
    await removeBook(user, 'חוות דעת')
    await waitFor(() => expect(document.getElementById('books-list')).toHaveFocus())
  })
})
