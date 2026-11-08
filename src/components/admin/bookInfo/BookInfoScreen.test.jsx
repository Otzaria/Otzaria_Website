// "פרטי ספרים" מקצה לקצה (fetch מדומה): בקשות המיזוג (פתוחות עם מה שנכשל / כולן / טען עוד) באותן כתובות כמו קודם, מצבים, סינון
// "צריך בדיקה", קישור ל-GitHub, והצעות ישנות — פתיחת בקשה ומחיקה באותם גופים, עם "בטל" ועם חלון אישור.
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import BookInfoScreen from './BookInfoScreen'

const CHANGE_SETS = [
  { id: 's1', book: 'מסילת ישרים', author: 'רמח"ל', changes: { generationName: 'אחרונים', startYear: 1707 }, status: 'open', prNumber: 12, prUrl: 'https://github.com/Otzaria/otzaria-library/pull/12', lastError: null, submittedBy: 'משה כהן', createdAt: '2026-11-04T10:00:00Z' },
  { id: 's2', book: 'חובות הלבבות', author: 'רבנו בחיי', changes: { authorName: 'רבנו בחיי אבן פקודה' }, status: 'conflict', prNumber: 13, prUrl: 'https://github.com/Otzaria/otzaria-library/pull/13', lastError: 'הקובץ השתנה; נדרשת בדיקה', submittedBy: 'יעקב לוי', createdAt: '2026-11-03T10:00:00Z' },
]
const LEGACY = [
  { id: 'c1', bookInfoId: 'b1', submittedBy: 'דוד', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', approved: { bookName: 'כוזרי', authorName: 'ריה"ל', startYear: null }, changes: { authorName: 'רבי יהודה הלוי', startYear: 1140 }, changedFields: ['authorName', 'startYear'] },
  { id: 'c2', bookInfoId: 'b2', submittedBy: 'שמואל', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', approved: { bookName: 'ספר החינוך', generationName: '' }, changes: { generationName: 'ראשונים' }, changedFields: ['generationName'] },
]

const FAILED = { id: 's3', book: 'ספר העיקרים', author: 'ר\' יוסף אלבו', changes: { startYear: 1425 }, status: 'failed', prNumber: null, prUrl: null, lastError: 'הפרסום לא הושלם', submittedBy: 'אהרן', createdAt: '2026-11-05T10:00:00Z' }
const STUCK = { id: 's4', book: 'שבט מוסר', author: '', changes: { startYear: 1712 }, status: 'publishing', prNumber: null, prUrl: null, lastError: null, submittedBy: 'אהרן', createdAt: '2026-10-19T10:00:00Z' }
const SAME = { id: 'c3', bookInfoId: 'b3', submittedBy: 'חיים', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', approved: { bookName: 'משנה ברורה', startYear: 1884 }, changes: { startYear: '1884' }, changedFields: ['startYear'] }

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let routes
beforeEach(() => {
  calls = []
  routes = {
    'GET /api/admin/book-info/change-sets?active=true': () => json({ success: true, rows: CHANGE_SETS, nextCursor: null }),
    'GET /api/admin/book-info/change-sets?active=false': () => json({ success: true, rows: CHANGE_SETS, nextCursor: 'abc+/=' }),
    'GET /api/admin/book-info/change-sets?active=false&cursor=abc%2B%2F%3D': () => json({ success: true, rows: [{ ...CHANGE_SETS[0], id: 's9', book: 'כוזרי', status: 'merged' }], nextCursor: null }),
    'GET /api/admin/book-info/pending': () => json({ success: true, rows: LEGACY }),
    'POST /api/admin/book-info/pending': (init) => {
      const body = JSON.parse(init.body)
      if (body.action === 'publish') return json({ success: true, processed: 1, prNumber: 77, prUrl: 'https://github.com/Otzaria/otzaria-library/pull/77' })
      return json({ success: true, processed: body.selections.length })
    },
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body, cache: init?.cache })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><BookInfoScreen /></ToastProvider>)
}
const posts = () => calls.filter((c) => c.key.startsWith('POST')).map((c) => c.body)
const requestRow = (book) => screen.getByRole('heading', { name: book }).closest('li')
const card = (book) => screen.getByRole('heading', { name: book }).closest('li')

describe('פרטי ספרים — בקשות המיזוג', () => {
  test('ברירת מחדל: הפתוחות, באותה כתובת ו-no-store כמו קודם; מצב, שינויים, וקישור ל-GitHub בחלון חדש', async () => {
    renderAt('/library/admin/book-info')
    await screen.findByRole('list', { name: 'הבקשות' })
    const get = calls.find((c) => c.key.startsWith('GET /api/admin/book-info/change-sets'))
    expect(get).toEqual({ key: 'GET /api/admin/book-info/change-sets?active=true', body: undefined, cache: 'no-store' })
    const row = requestRow('מסילת ישרים')
    expect(within(row).getAllByText('ממתין לפרסום').length).toBeGreaterThan(0)
    expect(within(row).getByText('אחרונים')).toBeInTheDocument()
    const link = within(row).getByRole('link', { name: 'בקשת מיזוג 12 ב-GitHub (נפתח בחלון חדש)' })
    expect(link).toHaveAttribute('href', 'https://github.com/Otzaria/otzaria-library/pull/12')
    expect(link).toHaveAttribute('target', '_blank')
    const conflict = requestRow('חובות הלבבות')
    expect(within(conflict).getByText('הקובץ השתנה; נדרשת בדיקה')).toBeInTheDocument()
    expect(within(conflict).getByText(/תקן אותה ומזג, או סגור אותה/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\bPR\b|מוזג/)
  })

  test('"פתוחות" מציגה גם בקשה שנכשלה (מתוך האחרונות), עם הסבר פשוט ו"מה לעשות" — ולא סופרת אותה כ"צריכה בדיקה"', async () => {
    routes['GET /api/admin/book-info/change-sets?active=false'] = () => json({ success: true, rows: [...CHANGE_SETS, FAILED], nextCursor: null })
    renderAt('/library/admin/book-info')
    await screen.findByRole('heading', { name: 'ספר העיקרים' })
    const row = requestRow('ספר העיקרים')
    expect(within(row).getAllByText('נכשל').length).toBeGreaterThan(0)
    expect(within(row).getByText(/הבקשה לא נפתחה ב.GitHub עד הסוף/)).toBeInTheDocument()
    expect(within(row).getByText(/בקש מהמשתמש לשלוח אותו שוב/)).toBeInTheDocument()
    // הסיבה המקורית — רק ב"פרטים"
    expect(within(row).getByText('פרטים')).toBeInTheDocument()
    expect(screen.getByText('בקשה אחת צריכה בדיקה')).toBeInTheDocument()
  })

  test('"בפתיחה" כבר יותר מרבע שעה — "תקוע בפתיחה", ונספר כצריך בדיקה', async () => {
    routes['GET /api/admin/book-info/change-sets?active=true'] = () => json({ success: true, rows: [...CHANGE_SETS, STUCK], nextCursor: null })
    renderAt('/library/admin/book-info')
    await screen.findByRole('list', { name: 'הבקשות' })
    expect(within(requestRow('שבט מוסר')).getAllByText('תקוע בפתיחה').length).toBeGreaterThan(0)
    expect(screen.getByText('2 בקשות צריכות בדיקה')).toBeInTheDocument()
  })

  test('"הורד את קובץ פרטי הספרים (CSV)" — בתפריט, מאותה כתובת, עם הודעה כשנכשל', async () => {
    const user = userEvent.setup()
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    routes['GET /api/admin/book-info/export-csv'] = () => ({ ok: true, status: 200, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'text/csv' }), blob: async () => new Blob(['a']) })
    renderAt('/library/admin/book-info')
    await screen.findByRole('list', { name: 'הבקשות' })
    await user.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await user.click(await screen.findByRole('menuitem', { name: 'הורד את קובץ פרטי הספרים (CSV)' }))
    expect(await screen.findByText('הקובץ ירד.')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'GET /api/admin/book-info/export-csv')).toBe(true)
    routes['GET /api/admin/book-info/export-csv'] = () => json({ success: false }, { status: 500 })
    await user.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await user.click(await screen.findByRole('menuitem', { name: 'הורד את קובץ פרטי הספרים (CSV)' }))
    expect(await screen.findByText('לא הצלחנו להוריד את הקובץ.')).toBeInTheDocument()
  })

  test('בקשה שצריכה בדיקה — הודעה, ו"הצג רק אותן" מסנן', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info')
    await screen.findByRole('list', { name: 'הבקשות' })
    expect(screen.getByText('בקשה אחת צריכה בדיקה')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'הצג רק אותן' }))
    await waitFor(() => expect(window.location.search).toBe('?status=conflict'))
    const list = screen.getByRole('list', { name: 'הבקשות' })
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['חובות הלבבות'])
    expect(screen.queryByText('בקשה אחת צריכה בדיקה')).toBeNull()
  })

  test('"כל הבקשות" — active=false, ו"טען עוד בקשות" — עם cursor מקודד, מוסיף לרשימה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=all')
    await screen.findByRole('list', { name: 'הבקשות' })
    expect(calls.some((c) => c.key === 'GET /api/admin/book-info/change-sets?active=false')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'טען עוד בקשות' }))
    expect(await screen.findByRole('heading', { name: 'כוזרי' })).toBeInTheDocument()
    expect(within(requestRow('כוזרי')).getAllByText('פורסם').length).toBeGreaterThan(0)
    // הקודמות נשארות, והכפתור נעלם כשאין עוד
    expect(screen.getByRole('heading', { name: 'מסילת ישרים' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'טען עוד בקשות' })).toBeNull()
  })

  test('חיפוש מהכתובת; אין תוצאות ויש עוד — נאמר על כמה עבר החיפוש, ו"טען עוד" מוצא', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=all&q=כוזרי')
    expect(await screen.findByText('אין בקשות שמתאימות לסינון')).toBeInTheDocument()
    expect(screen.getByText(/החיפוש עבר על 2 בקשות האחרונות/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'טען עוד בקשות' }))
    expect(await screen.findByRole('heading', { name: 'כוזרי' })).toBeInTheDocument()
  })

  test('מצב מהכתובת — רק הבקשות במצב הזה', async () => {
    renderAt('/library/admin/book-info?status=open')
    const list = await screen.findByRole('list', { name: 'הבקשות' })
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['מסילת ישרים'])
  })

  test('לשונית "הצעות ישנות" עם המספר — רק כשיש כאלה', async () => {
    renderAt('/library/admin/book-info')
    const tabs = screen.getByRole('navigation', { name: 'בקשות המיזוג' })
    expect(await within(tabs).findByRole('link', { name: /הצעות ישנות, 2 הצעות/ })).toHaveAttribute('href', '/library/admin/book-info?view=legacy')
  })

  test('בלי הצעות ישנות — אין לשונית', async () => {
    routes['GET /api/admin/book-info/pending'] = () => json({ success: true, rows: [] })
    renderAt('/library/admin/book-info')
    await screen.findByRole('list', { name: 'הבקשות' })
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /api/admin/book-info/pending')).toBe(true))
    expect(screen.queryByRole('link', { name: /הצעות ישנות/ })).toBeNull()
  })

  test('אין בקשות פתוחות — מצב ריק חיובי', async () => {
    routes['GET /api/admin/book-info/change-sets?active=true'] = () => json({ success: true, rows: [], nextCursor: null })
    renderAt('/library/admin/book-info')
    expect(await screen.findByText('אין בקשות פתוחות')).toBeInTheDocument()
  })

  test('כשל בטעינה — הודעה ו"נסה שוב" שטוען מחדש', async () => {
    const ok = routes['GET /api/admin/book-info/change-sets?active=true']
    routes['GET /api/admin/book-info/change-sets?active=true'] = () => json({ success: false }, { status: 500 })
    renderAt('/library/admin/book-info')
    expect(await screen.findByText('לא הצלחנו לטעון את בקשות המיזוג')).toBeInTheDocument()
    routes['GET /api/admin/book-info/change-sets?active=true'] = ok
    await userEvent.setup().click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(await screen.findByRole('heading', { name: 'מסילת ישרים' })).toBeInTheDocument()
  })

  test('403 בטעינה — "אין לך הרשאה", בלי "נסה שוב"', async () => {
    routes['GET /api/admin/book-info/change-sets?active=true'] = () => json({ success: false, error: 'Forbidden' }, { status: 403 })
    renderAt('/library/admin/book-info')
    expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })
})

describe('פרטי ספרים — הצעות ישנות', () => {
  test('בהתחלה שום שדה לא מסומן; "בחר" בכרטיס מסמן את כולם, ופתיחה שולחת אותו גוף כמו קודם', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    expect(within(card('כוזרי')).getByRole('checkbox', { name: 'לכלול את "שם המחבר"' })).not.toBeChecked()
    expect(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'בחר את ההצעה לכוזרי (כל השדות)' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג' }))
    await waitFor(() => expect(posts()).toEqual(['{"action":"publish","selections":[{"changeId":"c1","fields":["authorName","startYear"]}]}']))
    expect(await within(card('כוזרי')).findByText('נפתחה בקשת מיזוג')).toBeInTheDocument()
    expect(within(card('כוזרי')).getByRole('link', { name: /בקשת מיזוג 77/ })).toHaveAttribute('href', 'https://github.com/Otzaria/otzaria-library/pull/77')
    // הכרטיס במקומו — הראשון; המספר בלשונית יורד
    const list = screen.getByRole('list', { name: 'ההצעות הישנות' })
    expect(within(list).getAllByRole('heading')[0]).toHaveTextContent('כוזרי')
    expect(screen.getByRole('link', { name: /הצעות ישנות, הצעה אחת/ })).toBeInTheDocument()
  })

  test('רק השדה שסומן נשלח, והשאר נשאר בהצעה בלי סימון', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'לכלול את "תחילת התקופה"' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג (שדה אחד)' }))
    await waitFor(() => expect(posts()).toEqual(['{"action":"publish","selections":[{"changeId":"c1","fields":["startYear"]}]}']))
    expect(await within(card('כוזרי')).findByText('נפתחה בקשת מיזוג')).toBeInTheDocument()
    expect(within(card('כוזרי')).getByRole('checkbox', { name: 'לכלול את "שם המחבר"' })).not.toBeChecked()
    expect(within(card('כוזרי')).queryByRole('checkbox', { name: 'לכלול את "תחילת התקופה"' })).toBeNull()
  })

  test('"מחק" אומר בדיוק מה יימחק; ערך ריק בקובץ — "אין בקובץ"; שדה שלא השתנה והצעה בלי שינוי — מסומנים', async () => {
    routes['GET /api/admin/book-info/pending'] = () => json({ success: true, rows: [...LEGACY, SAME] })
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    expect(within(card('כוזרי')).getByText('אין בקובץ')).toBeInTheDocument()
    await user.click(within(card('כוזרי')).getByRole('button', { name: /פעולות נוספות/ }))
    expect(await screen.findByRole('menuitem', { name: 'מחק את ההצעה' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'לכלול את "שם המחבר"' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: /פעולות נוספות/ }))
    expect(await screen.findByRole('menuitem', { name: 'מחק את השדה המסומן' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    const same = card('משנה ברורה')
    expect(within(same).getByText('ללא שינוי')).toBeInTheDocument()
    expect(within(same).getByText(/אין בהצעה הזו שינוי מול הקובץ/)).toBeInTheDocument()
    expect(within(same).queryByRole('button', { name: /פתח בקשת מיזוג/ })).toBeNull()
    expect(within(same).getByRole('button', { name: 'מחק את ההצעה' })).toBeInTheDocument()
  })

  test('כשל בפתיחה — הסיבה מהשרת בתוך הכרטיס', async () => {
    routes['POST /api/admin/book-info/pending'] = () => json({ success: false, error: 'הנתון בקובץ השתנה מאז ההצעה: authorName; ההצעה נשמרה לבדיקה' }, { status: 400 })
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'בחר את ההצעה לכוזרי (כל השדות)' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג' }))
    expect(await within(card('כוזרי')).findByText(/הנתון בקובץ השתנה מאז ההצעה/)).toBeInTheDocument()
    expect(within(card('כוזרי')).getByText('בקשת המיזוג לא נפתחה')).toBeInTheDocument()
  })

  test('פתיחה מרובה — בקשה אחת לכל הצעה, בזו אחר זו, וסיכום', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות' }))
    await user.click(screen.getByRole('button', { name: 'פתח בקשות מיזוג מהשדות המסומנים' }))
    expect(await screen.findByText('נפתחו 2 בקשות מיזוג.')).toBeInTheDocument()
    expect(posts()).toEqual([
      '{"action":"publish","selections":[{"changeId":"c1","fields":["authorName","startYear"]}]}',
      '{"action":"publish","selections":[{"changeId":"c2","fields":["generationName"]}]}',
    ])
  })

  test('הצעה שהבקשה שלה עוד באוויר — לא נשלחת שוב בפעולה מרובה', async () => {
    let release
    routes['POST /api/admin/book-info/pending'] = (init) => {
      const body = JSON.parse(init.body)
      const res = json({ success: true, processed: 1, prNumber: 77, prUrl: `https://github.com/x/pull/${body.selections[0].changeId}` })
      return body.selections[0].changeId === 'c1' ? new Promise((resolve) => { release = () => resolve(res) }) : res
    }
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'בחר את ההצעה לכוזרי (כל השדות)' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות' }))
    await user.click(screen.getByRole('button', { name: 'פתח בקשות מיזוג מהשדות המסומנים' }))
    expect(await screen.findByText('נפתחה בקשת מיזוג אחת.')).toBeInTheDocument()
    await act(async () => { release() })
    await within(card('כוזרי')).findByText('נפתחה בקשת מיזוג')
    expect(posts().filter((b) => b.includes('"c1"'))).toHaveLength(1)
    expect(posts().filter((b) => b.includes('"c2"'))).toHaveLength(1)
  })

  test('התחברות שפגה — המסך ננעל, והודעה אחת עם "התחבר" (בלי הודעה קופצת כפולה)', async () => {
    routes['POST /api/admin/book-info/pending'] = () => json({ success: false }, { status: 401 })
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(within(card('כוזרי')).getByRole('checkbox', { name: 'בחר את ההצעה לכוזרי (כל השדות)' }))
    await user.click(within(card('כוזרי')).getByRole('button', { name: 'פתח בקשת מיזוג' }))
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument()
    expect(screen.queryByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'התחבר' })).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות' })).toBeDisabled()
  })

  test('מחק כמה — חלון אישור עם המספר ו"בטל", ובקשה אחת עם כל ההצעות (כמו קודם)', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות' }))
    await user.click(screen.getByRole('button', { name: 'מחק את השדות המסומנים בהצעות שנבחרו' }))
    const dialog = await screen.findByRole('dialog', { name: /למחוק לצמיתות 2 הצעות/ })
    expect(within(dialog).getByRole('button', { name: 'בטל' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'מחק 2 לצמיתות' }))
    await waitFor(() => expect(posts()).toEqual(['{"action":"delete","selections":[{"changeId":"c1","fields":["authorName","startYear"]},{"changeId":"c2","fields":["generationName"]}]}']))
    expect(await within(card('כוזרי')).findByText('ההצעה נמחקה')).toBeInTheDocument()
  })
})

describe('פרטי ספרים — מחיקה בודדת עם "בטל"', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  test('"בטל" — לא נשלח כלום; בלי "בטל" — אחרי כמה שניות נשלח delete', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/admin/book-info?view=legacy')
    await screen.findByRole('list', { name: 'ההצעות הישנות' })
    await user.click(within(card('ספר החינוך')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'מחק את ההצעה' }))
    await user.click(within(card('ספר החינוך')).getByRole('button', { name: /^בטל את המחיקה/ }))
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(posts()).toEqual([])
    await user.click(within(card('ספר החינוך')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'מחק את ההצעה' }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(posts()).toEqual(['{"action":"delete","selections":[{"changeId":"c2","fields":["generationName"]}]}']))
    expect(await within(card('ספר החינוך')).findByText('ההצעה נמחקה')).toBeInTheDocument()
  })
})
