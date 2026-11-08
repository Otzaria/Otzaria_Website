// מסך ההעלאות מקצה לקצה (עם fetch מדומה): מחיקה → הודעה → "בטל" שמשחזר באמת, פעולות מרובות,
// מחיקה לצמיתות דרך דיאלוג, סינון מהכתובת (כמה ערכים, ערכים לא קיימים) ומצבים ריקים, שגיאה עם
// "נסה שוב", התחברות שפגה, בחירה שנגזרת ממה שמוצג, ונעילת שורה בזמן בקשה.
import { describe, expect, test, vi, beforeEach } from 'vitest'
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

// Next מסנכרן את useSearchParams עם history; כאן — אירוע שהמוק מאזין לו
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import UploadsScreen from './UploadsScreen'

const STATUSES = { not_checked: { label: 'לא נבדק', color: '#94a3b8' }, ready: { label: 'מוכן', color: '#10b981' } }
const u = (id, bookName, extra = {}) => ({
  id, bookName, uploadedAt: `2026-10-${String(10 + Number(id)).padStart(2, '0')}T10:00:00Z`, uploadType: 'single_page',
  bookStatus: 'not_checked', status: 'pending', uploadedBy: 'משה', uploadedByEmail: 'm@x', originalFileName: `${id}.txt`, ...extra,
})
const UPLOADS = [
  u('1', 'חוות-דעת - עמוד 1'),
  u('2', 'חוות-דעת - עמוד 2'),
  u('3', 'נתיבות - עמוד 5', { bookStatus: 'ready', uploadedBy: 'דוד', uploadedByEmail: 'd@x' }),
  u('4', 'אסופות', { uploadType: 'full_book', authorName: 'הרב פלוני' }),
]

/** תשובת fetch מדומה — JSON עם content-type, כמו השרת */
const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
beforeEach(() => {
  calls = []
  push.mockClear()
  window.history.replaceState(null, '', '/library/admin/uploads')
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, redirect: options.redirect })
    const body = options.body ? JSON.parse(options.body) : {}
    return json({ success: true, uploads: [], modifiedCount: body.uploadIds?.length })
  })
})

const renderScreen = (props = {}) => render(
  <ToastProvider>
    <UploadsScreen tab="uploads" initialItems={UPLOADS} initialStatuses={STATUSES} counts={{ uploads: 4, trash: 2 }} role="admin" {...props} />
  </ToastProvider>
)
const row = (title) => screen.getByRole('heading', { level: 3, name: new RegExp(title) }).closest('li')
const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent.replace('expand_more', ''))
const tab = (name) => screen.getByRole('link', { name: new RegExp(name) })
const bar = () => screen.getByRole('group', { name: 'פעולות על הנבחרים' })
// בורר המצב בסרגל הסינון (ולא תגי "מצב הספר ..." שבשורות)
const statusFilter = () => screen.getByRole('button', { name: (name) => name.startsWith('מצב ') && !name.startsWith('מצב הספר') })

describe('UploadsScreen', () => {
  test('רשימה מקובצת לפי ספר, עם מונים בלשוניות, ו-h1 אחד', () => {
    renderScreen()
    expect(titles()).toEqual(['אסופות', 'נתיבות', 'חוות דעת'])
    expect(tab('העלאות')).toHaveTextContent('4')
    expect(tab('אשפה')).toHaveTextContent('2')
    expect(screen.getByText(/3 ספרים/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('מחק → הודעה עם שם הספר → בטל (גם Ctrl+Z) משחזר דרך batch-restore', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('נתיבות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))

    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: /נתיבות/ })).not.toBeInTheDocument())
    expect(calls.at(-1)).toMatchObject({ url: '/api/admin/uploads/batch-move-to-trash', method: 'PUT', body: { uploadIds: ['3'] }, redirect: 'manual' })
    expect(screen.getByText('"נתיבות" הועבר לאשפה')).toBeInTheDocument()
    expect(tab('אשפה')).toHaveTextContent('3')
    // הפוקוס עבר לשורה שבאה במקום
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', expect.stringMatching(/^בחר את /)))

    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: /נתיבות/ })).toBeInTheDocument())
    expect(calls.at(-1)).toMatchObject({ url: '/api/admin/uploads/batch-restore', method: 'PUT', body: { uploadIds: ['3'] } })
    expect(tab('אשפה')).toHaveTextContent('2')
  })

  test('כמה מחיקות רצופות — הודעה אחת מצטברת, ו"בטל" מחזיר את כולן', async () => {
    const user = userEvent.setup()
    renderScreen()
    for (const title of ['נתיבות', 'אסופות']) {
      await user.click(within(row(title)).getByRole('button', { name: /פעולות נוספות/ }))
      await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
      await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: new RegExp(title) })).not.toBeInTheDocument())
    }
    expect(screen.getAllByRole('button', { name: /בטל/ })).toHaveLength(1)
    expect(screen.getByText('2 ספרים הועברו לאשפה (2 העלאות)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /בטל/ }))
    await waitFor(() => expect(titles()).toHaveLength(3))
    expect(calls.at(-1).body.uploadIds.sort()).toEqual(['3', '4'])
  })

  test('כשל במחיקה — הודעת שגיאה, והשורה נשארת', async () => {
    global.fetch = vi.fn(async () => json({ error: 'x' }, { status: 500 }))
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('נתיבות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
    expect(await screen.findByText('לא הצלחנו להעביר לאשפה.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /נתיבות/ })).toBeInTheDocument()
  })

  test('התחברות שפגה (הפניה / תשובה שאינה JSON) — "פג תוקף ההתחברות" עם "התחבר", ושום דבר לא משתנה', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn(async () => ({ ok: false, status: 0, type: 'opaqueredirect', headers: new Headers(), json: async () => null }))
    renderScreen()
    await user.click(within(row('נתיבות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
    const alert = await screen.findByText(/פג תוקף ההתחברות/)
    expect(alert.closest('[data-toast]')).toContainElement(screen.getByRole('link', { name: 'התחבר' }))
    expect(screen.getByRole('link', { name: 'התחבר' }).getAttribute('href')).toMatch(/^\/auth\/login\?callbackUrl=/)
    expect(screen.getByRole('heading', { level: 3, name: /נתיבות/ })).toBeInTheDocument()
    expect(tab('אשפה')).toHaveTextContent('2')

    // 200 עם HTML (fetch שעקב אחרי הפניה) — לא הצלחה
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, type: 'basic', headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new Error('html') } }))
    await user.click(within(row('אסופות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
    expect(await screen.findByText('לא הצלחנו להעביר לאשפה.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /אסופות/ })).toBeInTheDocument()
  })

  test('כשל חלקי — מדווח כחלקי (לפי modifiedCount)', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' })
      return json({ success: true, uploads: UPLOADS, modifiedCount: 1 })
    })
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: /בחר את חוות דעת/ }))
    await user.click(within(bar()).getByRole('button', { name: 'מחק את הנבחרים' }))
    expect(await screen.findByText(/^רק 1 מתוך 2 העלאות הועברו לאשפה/)).toBeInTheDocument()
    await waitFor(() => expect(calls.map((c) => c.url)).toContain('/api/admin/uploads/list'))
  })

  test('פעולות מרובות: מונה בספרים, ו"מחק" מעביר את כולם', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: /בחר את חוות דעת/ }))
    await user.click(screen.getByRole('checkbox', { name: 'בחר את אסופות' }))
    expect(within(bar()).getByRole('status')).toHaveTextContent('2 ספרים נבחרו · 3 העלאות')
    await user.click(within(bar()).getByRole('button', { name: 'מחק את הנבחרים' }))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1))
    expect(calls.at(-1).body.uploadIds.sort()).toEqual(['1', '2', '4'])
    expect(screen.getByText('2 ספרים הועברו לאשפה (3 העלאות)')).toBeInTheDocument()
  })

  test('בחירה נגזרת ממה שמוצג: שינוי מצב תחת סינון מוציא את השורות — והבחירה איתן', async () => {
    window.history.replaceState(null, '', '/library/admin/uploads?status=not_checked')
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: /בחר את חוות דעת/ }))
    expect(within(bar()).getByRole('status')).toHaveTextContent('ספר אחד נבחר · 2 העלאות')
    await user.click(within(bar()).getByRole('button', { name: 'שנה את המצב של הנבחרים' }))
    await user.click(screen.getByRole('option', { name: /מוכן/ }))
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: /חוות דעת/ })).not.toBeInTheDocument())
    // אין "בחירת רפאים": הסרגל חזר למצב השקט, ו"מחק" לא זמין על מה שלא רואים
    expect(screen.queryByRole('group', { name: 'פעולות על הנבחרים' })?.querySelector('[role=status]')?.textContent || '').not.toMatch(/נבחר/)
    expect(screen.queryByRole('button', { name: 'מחק את הנבחרים' })).not.toBeInTheDocument()
  })

  test('שינוי מצב בשורה: תג שנפתח לבורר; חל על כל הספר, ננעל בזמן הבקשה (בלי בקשה כפולה), ו"בטל" מחזיר', async () => {
    let release
    global.fetch = vi.fn((url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
      const body = options.body ? JSON.parse(options.body) : {}
      if (calls.length === 1) return new Promise((resolve) => { release = () => resolve(json({ success: true, modifiedCount: body.uploadIds.length })) })
      return Promise.resolve(json({ success: true, modifiedCount: body.uploadIds?.length }))
    })
    const user = userEvent.setup()
    renderScreen()
    const tag = within(row('חוות דעת')).getByRole('button', { name: /מצב הספר חוות דעת/ })
    expect(tag).toHaveAccessibleName('מצב הספר חוות דעת לא נבדק')
    await user.click(tag)
    await user.click(screen.getByRole('option', { name: /מוכן/ }))
    // הבקשה פתוחה — השורה נעולה
    await waitFor(() => expect(within(row('חוות דעת')).getByRole('button', { name: /מצב הספר/ })).toBeDisabled())
    await user.click(within(row('חוות דעת')).getByRole('button', { name: /מצב הספר/ }))
    expect(calls).toHaveLength(1)
    release()
    await waitFor(() => expect(within(row('חוות דעת')).getByRole('button', { name: /מצב הספר/ })).toHaveAccessibleName('מצב הספר חוות דעת מוכן'))
    expect(calls[0]).toMatchObject({ url: '/api/admin/uploads/batch-update-book-status', body: { uploadIds: ['2', '1'], bookStatus: 'ready' } })
    expect(screen.getByText('המצב של "חוות דעת" שונה ל"מוכן"')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /בטל/ }))
    await waitFor(() => expect(within(row('חוות דעת')).getByRole('button', { name: /מצב הספר/ })).toHaveAccessibleName('מצב הספר חוות דעת לא נבדק'))
  })

  test('לחיצה כפולה על "הורד"/פעולת שורה לא שולחת פעמיים (מחק מ-⋮ פעמיים מהר)', async () => {
    let release
    global.fetch = vi.fn((url) => {
      calls.push({ url })
      return new Promise((resolve) => { release = () => resolve(json({ success: true, modifiedCount: 1 })) })
    })
    const user = userEvent.setup()
    renderScreen()
    await user.click(within(row('נתיבות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
    await user.click(within(row('נתיבות')).getByRole('button', { name: /פעולות נוספות/ }))
    expect(screen.getByRole('menuitem', { name: 'מחק' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('menuitem', { name: 'מחק' }))
    expect(calls).toHaveLength(1)
    release()
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: /נתיבות/ })).not.toBeInTheDocument())
  })

  test('סינון מהכתובת: כמה מצבים; סוג; ריק בסינון עם "נקה סינון"', async () => {
    window.history.replaceState(null, '', '/library/admin/uploads?status=ready,not_checked')
    const user = userEvent.setup()
    renderScreen()
    expect(titles()).toHaveLength(3)
    expect(statusFilter()).toHaveAccessibleName('מצב לא נבדק ועוד 1')

    await user.click(screen.getByRole('button', { name: /^סוג/ }))
    await user.click(screen.getByRole('option', { name: 'ספרים' }))
    expect(window.location.search).toBe('?type=full_book&status=ready,not_checked')
    expect(titles()).toEqual(['אסופות'])

    await user.click(screen.getAllByRole('button', { name: 'נקה סינון' })[0])
    expect(window.location.search).toBe('')
    expect(titles()).toHaveLength(3)
  })

  test('?status=xyz (לא קיים) — לא מסנן, הבורר אומר "הכול", והכתובת מתוקנת', async () => {
    window.history.replaceState(null, '', '/library/admin/uploads?status=xyz&user=nobody@x&page=99')
    renderScreen()
    expect(titles()).toHaveLength(3)
    expect(statusFilter()).toHaveAccessibleName('מצב הכול')
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('משתמש: בורר עם חיפוש ובחירה מרובה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('button', { name: /^משתמש/ }))
    await user.type(screen.getByRole('combobox', { name: /משתמש/ }), 'דו')
    await user.keyboard('{Enter}')
    expect(window.location.search).toBe('?user=d%40x')
    expect(titles()).toEqual(['נתיבות'])
  })

  test('התור ריק ("לא נבדק" בלי סינון אחר) — "אין העלאות שלא נבדקו"', () => {
    window.history.replaceState(null, '', '/library/admin/uploads?status=not_checked')
    renderScreen({ initialItems: UPLOADS.filter((x) => x.bookStatus === 'ready') })
    expect(screen.getByRole('heading', { name: 'אין העלאות שלא נבדקו' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הצג את כל ההעלאות' })).toBeInTheDocument()
  })

  test('שגיאה בטעינה מהשרת — הודעה בדף ו"נסה שוב" שטוען מחדש', async () => {
    global.fetch = vi.fn(async (url) => {
      calls.push({ url })
      return json({ success: true, uploads: UPLOADS.slice(0, 1) })
    })
    const user = userEvent.setup()
    renderScreen({ initialItems: [], initialError: true })
    expect(screen.getByRole('heading', { name: 'לא הצלחנו לטעון את ההעלאות' }).closest('[role=alert]')).toHaveTextContent('השרת לא החזיר את הרשימה')
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1))
    expect(calls.map((c) => c.url)).toContain('/api/admin/uploads/list')
  })

  test('מנהל ספרים: "הצג N קבצים" במקום הורדה מאוחדת, בלי "שלח הודעה", ושורת הסבר', async () => {
    const user = userEvent.setup()
    renderScreen({ role: 'admin_books' })
    expect(screen.getByText(/למנהל כללי בלבד/)).toBeInTheDocument()
    expect(within(row('חוות דעת')).queryByRole('button', { name: /הורד 2 קבצים/ })).not.toBeInTheDocument()
    await user.click(within(row('חוות דעת')).getByRole('button', { name: 'הצג 2 קבצים' }))
    expect(within(row('חוות דעת')).getByRole('button', { name: /2 עמודים/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(row('חוות דעת')).getAllByRole('button', { name: 'הורד קובץ' })).toHaveLength(2)
    expect(within(row('אסופות')).getByRole('button', { name: 'הורד קובץ' })).toBeInTheDocument()
    await user.click(within(row('חוות דעת')).getAllByRole('button', { name: /פעולות נוספות/ })[0])
    expect(screen.queryByRole('menuitem', { name: /שלח הודעה/ })).not.toBeInTheDocument()
  })

  test('בלי חץ לפני השם: הפתיחה — "2 עמודים ▾" בשורת הפרטים, רק בספר עם כמה קבצים', async () => {
    const user = userEvent.setup()
    renderScreen()
    expect(row('חוות דעת').querySelector('h3 button')).toBeNull()
    const toggle = within(row('חוות דעת')).getByRole('button', { name: /2 עמודים/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(row('נתיבות')).queryByRole('button', { name: /עמוד/ })).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeInTheDocument()
    // ספר שלם עם פרטים — "פרטים ▾"
    expect(within(row('אסופות')).getByRole('button', { name: /פרטים/ })).toBeInTheDocument()
  })
})

describe('UploadsScreen — אשפה', () => {
  const TRASH = [u('8', 'ישן - עמוד 1', { deletedAt: '2026-10-30T10:00:00Z' }), u('9', 'ישן - עמוד 2', { deletedAt: '2026-10-31T10:00:00Z' })]
  beforeEach(() => {
    window.history.replaceState(null, '', '/library/admin/trash')
    global.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
      const body = options.body ? JSON.parse(options.body) : {}
      return json({ success: true, uploads: TRASH, deletedCount: body.uploadIds?.length ?? 2, modifiedCount: body.uploadIds?.length })
    })
  })
  const renderTrash = (props = {}) => render(
    <ToastProvider><UploadsScreen tab="trash" initialStatuses={STATUSES} counts={{ uploads: 4, trash: 2 }} role="admin" {...props} /></ToastProvider>
  )

  test('טעינה בשלד, ו"מחק לצמיתות" רק אחרי דיאלוג (כותרת קצרה, שם הספר בגוף, פוקוס על "ביטול")', async () => {
    const user = userEvent.setup()
    renderTrash()
    expect(screen.getByText('טוען את האשפה…')).toBeInTheDocument()
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
    expect(tab('אשפה')).toHaveAttribute('aria-current', 'page')

    await user.click(within(row('ישן')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: /מחק לצמיתות/ }))
    const dialog = screen.getByRole('dialog', { name: 'למחוק לצמיתות 2 העלאות?' })
    expect(dialog).toHaveTextContent('2 העלאות של "ישן" יימחקו')
    expect(within(dialog).getByRole('button', { name: 'ביטול' })).toHaveFocus()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await screen.findByRole('heading', { name: 'האשפה ריקה' })
    expect(calls.at(-1)).toMatchObject({ url: '/api/admin/uploads/batch-permanent-delete', method: 'DELETE', body: { uploadIds: ['9', '8'] } })
  })

  test('"רוקן אשפה" — דיאלוג אדום עם המספר המדויק, פוקוס על "ביטול"; ביטול לא מוחק', async () => {
    const user = userEvent.setup()
    renderTrash()
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
    await user.click(screen.getByRole('button', { name: 'רוקן אשפה' }))
    const dialog = screen.getByRole('dialog', { name: 'למחוק לצמיתות את כל 2 ההעלאות שבאשפה?' })
    expect(within(dialog).getByRole('button', { name: 'ביטול' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'רוקן אשפה' })).toHaveAttribute('data-confirm')
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  test('באשפה אין סינון מצב: ?status= לא מסנן ונזרק מהכתובת', async () => {
    window.history.replaceState(null, '', '/library/admin/trash?status=ready')
    renderTrash()
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
    expect(screen.queryByRole('button', { name: (name) => name.startsWith('מצב ') && !name.startsWith('מצב הספר') })).not.toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('האשפה לא עונה / נכשלת — "נסה שוב"', async () => {
    global.fetch = vi.fn(async () => json({ success: false }, { status: 500 }))
    const user = userEvent.setup()
    renderTrash()
    expect(await screen.findByRole('heading', { name: 'לא הצלחנו לטעון את האשפה' })).toBeInTheDocument()
    global.fetch = vi.fn(async () => json({ success: true, uploads: TRASH }))
    await user.click(screen.getByRole('button', { name: 'נסה שוב' }))
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
  })

  test('"שחזר" בשורה, עם "בטל" שמחזיר לאשפה', async () => {
    const user = userEvent.setup()
    renderTrash({ role: 'admin_books' })
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
    await user.click(screen.getByRole('button', { name: 'שחזר 2 קבצים' }))
    await screen.findByText('2 העלאות של "ישן" שוחזרו')
    expect(calls.at(-1)).toMatchObject({ url: '/api/admin/uploads/batch-restore' })
    await user.click(screen.getByRole('button', { name: /בטל/ }))
    await screen.findByRole('heading', { level: 3, name: /ישן/ })
    expect(calls.at(-1)).toMatchObject({ url: '/api/admin/uploads/batch-move-to-trash' })
  })
})

describe('UploadsScreen — פוקוס אחרי מחיקה', () => {
  const removeBook = async (user, title) => {
    await user.click(within(row(title)).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getAllByRole('menuitem', { name: /^מחק/ })[0])
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: new RegExp(title) })).not.toBeInTheDocument())
  }
  const checkboxOf = (title) => within(row(title)).getAllByRole('checkbox')[0]

  test('ספר באמצע — הפוקוס לשורה שבאה במקומו', async () => {
    const user = userEvent.setup()
    renderScreen()
    await removeBook(user, 'נתיבות')
    await waitFor(() => expect(checkboxOf('חוות דעת')).toHaveFocus())
  })

  test('הספר האחרון ברשימה — הפוקוס לשורה שלפניו', async () => {
    const user = userEvent.setup()
    renderScreen()
    await removeBook(user, 'חוות דעת')
    await waitFor(() => expect(checkboxOf('נתיבות')).toHaveFocus())
  })

  test('הספר היחיד — הפוקוס לרשימה', async () => {
    const user = userEvent.setup()
    renderScreen({ initialItems: [UPLOADS[3]], counts: { uploads: 1, trash: 0 } })
    await removeBook(user, 'אסופות')
    await waitFor(() => expect(document.getElementById('uploads-list')).toHaveFocus())
  })
})
