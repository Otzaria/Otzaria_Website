// "הצעות למילון" מקצה לקצה (fetch מדומה): מילה אחת לכל מילה עם מי שהוסיף, לשוניות, חיפוש מהכתובת, אשר / דלג / הסר
// עם "בטל" ובאותם גופים כמו קודם (זוג אחר זוג), השורה נשארת במקומה, פעולה מרובה עם חלון אישור, מקלדת, ו-403.
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react'
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

import DictionaryScreen from './DictionaryScreen'

const ENTRIES = [
  { userId: 'u1', name: 'משה כהן', email: 'moshe@example.com', word: 'ובכן' },
  { userId: 'u2', name: 'יעקב לוי', email: 'yaakov@example.com', word: 'ובכן' },
  { userId: 'u3', name: 'דוד', email: 'david@example.com', word: 'ובכן' },
  { userId: 'u1', name: 'משה כהן', email: 'moshe@example.com', word: 'אדמו"ר' },
  { userId: 'u2', name: 'יעקב לוי', email: 'yaakov@example.com', word: 'זצוק"ל' },
]
const SKIPPED = [{ userId: 'u2', word: 'זצוק"ל' }, { userId: 'u3', word: 'ובכן' }]

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
    'GET /api/admin/dictionary': () => json({ success: true, entries: ENTRIES, skipped: SKIPPED }),
    'POST /api/admin/dictionary': () => json({ success: true }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><DictionaryScreen /></ToastProvider>)
}
const posts = () => calls.filter((c) => c.key.startsWith('POST')).map((c) => JSON.parse(c.body))
const row = (word) => screen.getByRole('heading', { name: word }).closest('li')

describe('הצעות למילון — תצוגה', () => {
  test('מילה אחת לכל מילה, מהמילה שהכי הרבה משתמשים הוסיפו; מונים בלשוניות', async () => {
    renderAt('/library/admin/dictionary')
    const list = await screen.findByRole('list', { name: 'המילים שממתינות' })
    const words = within(list).getAllByRole('heading').map((h) => h.textContent)
    expect(words).toEqual(['ובכן', 'אדמו"ר'])
    expect(within(row('ובכן')).getByRole('button', { name: /3 משתמשים/ })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'המילים לפי מצב' })
    expect(within(tabs).getByRole('link', { name: /ממתינות, 2 מילים/ })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: /דולגו, מילה אחת/ })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/תור/)
  })

  test('"3 משתמשים" פותח את רשימת המשתמשים, עם מי שדולג', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    const toggle = within(row('ובכן')).getByRole('button', { name: /הצג מי הוסיף/ })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const users = within(row('ובכן')).getByRole('list', { name: 'מי הוסיף את המילה' })
    expect(within(users).getAllByRole('listitem')).toHaveLength(3)
    expect(within(users).getByText('דולג')).toBeInTheDocument()
    expect(within(users).getByText('moshe@example.com')).toBeInTheDocument()
  })

  test('לשונית "דולגו" מהכתובת: רק "אשר", בלי "דלג"', async () => {
    renderAt('/library/admin/dictionary?view=skipped')
    await screen.findByRole('list', { name: 'המילים שדולגו' })
    const r = row('זצוק"ל')
    expect(within(r).getByRole('button', { name: /^אשר את/ })).toBeInTheDocument()
    expect(within(r).queryByRole('button', { name: /^דלג/ })).toBeNull()
  })

  test('חיפוש מהכתובת — במילה ובמשתמש; בלי תוצאות — "נקה חיפוש"', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary?q=לוי')
    const list = await screen.findByRole('list', { name: 'המילים שממתינות' })
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['ובכן'])
    window.history.replaceState(null, '', '/library/admin/dictionary?q=אין-כזה')
    const empty = (await screen.findByText('לא נמצאו מילים')).closest('[role="status"]')
    await user.click(within(empty).getByRole('button', { name: 'נקה חיפוש' }))
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  test('אין מילים — מצב ריק', async () => {
    routes['GET /api/admin/dictionary'] = () => json({ success: true, entries: [], skipped: [] })
    renderAt('/library/admin/dictionary')
    expect(await screen.findByText('אין מילים שממתינות')).toBeInTheDocument()
  })

  test('403 בטעינה — "אין לך הרשאה", בלי "נסה שוב"', async () => {
    routes['GET /api/admin/dictionary'] = () => json({ success: false, error: 'Forbidden' }, { status: 403 })
    renderAt('/library/admin/dictionary')
    expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })
})

describe('הצעות למילון — פעולות עם "בטל"', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  test('אשר: אחרי כמה שניות — add-global לכל מי שהוסיף, באותו גוף; השורה נשארת עם "נוספה למילון"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /^אשר את "ובכן"/ }))
    expect(posts()).toEqual([])
    const undo = within(row('ובכן')).getByRole('button', { name: 'בטל: "ובכן"' })
    await waitFor(() => expect(undo).toHaveFocus())
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(posts()).toEqual([
      { action: 'add-global', userId: 'u1', word: 'ובכן' },
      { action: 'add-global', userId: 'u2', word: 'ובכן' },
      { action: 'add-global', userId: 'u3', word: 'ובכן' },
    ]))
    expect(calls.find((c) => c.key.startsWith('POST')).body).toBe('{"action":"add-global","userId":"u1","word":"ובכן"}')
    expect(await within(row('ובכן')).findByText('נוספה למילון')).toBeInTheDocument()
    // השורה במקומה — הראשונה ברשימה
    const list = screen.getByRole('list', { name: 'המילים שממתינות' })
    expect(within(list).getAllByRole('heading')[0]).toHaveTextContent('ובכן')
    expect(await screen.findByText('"ובכן" נוספה למילון הכללי.')).toBeInTheDocument()
    // המונה בלשונית כבר לא סופר אותה
    expect(screen.getByRole('link', { name: /ממתינות, מילה אחת/ })).toBeInTheDocument()
  })

  test('"בטל" — לא נשלח כלום, והפוקוס חוזר ל"אשר"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('אדמו"ר')).getByRole('button', { name: /^אשר את/ }))
    await user.click(within(row('אדמו"ר')).getByRole('button', { name: /^בטל/ }))
    expect(await screen.findByText('הפעולה בוטלה.')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(posts()).toEqual([])
    expect(within(row('אדמו"ר')).getByRole('button', { name: /^אשר את/ })).toHaveFocus()
  })

  test('דלג — רק מי שעוד לא דולג; הסר — remove-personal לכולם', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /^דלג על/ }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(posts()).toEqual([
      { action: 'skip', userId: 'u1', word: 'ובכן' },
      { action: 'skip', userId: 'u2', word: 'ובכן' },
    ]))
    expect(await within(row('ובכן')).findByText('דולגה')).toBeInTheDocument()
    calls = []
    await user.click(within(row('אדמו"ר')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(await screen.findByRole('menuitem', { name: /הסר מהמילון האישי/ }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(posts()).toEqual([{ action: 'remove-personal', userId: 'u1', word: 'אדמו"ר' }]))
  })

  test('כשל באמצע — הודעת שגיאה, והשורה חוזרת לכפתורים', async () => {
    let n = 0
    routes['POST /api/admin/dictionary'] = () => (++n === 2 ? json({ success: false }, { status: 500 }) : json({ success: true }))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /^אשר את/ }))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להוסיף את "ובכן" אצל כל המשתמשים')
    expect(within(row('ובכן')).queryByText('נוספה למילון')).toBeNull()
  })

  test('מקלדת: ↓ עובר לשורה הבאה, A מאשר את השורה שבפוקוס', async () => {
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    const first = row('ובכן')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(row('אדמו"ר')).toHaveFocus()
    fireEvent.keyDown(row('אדמו"ר'), { key: 'ש', code: 'KeyA' })
    expect(within(row('אדמו"ר')).getByRole('button', { name: /^בטל/ })).toBeInTheDocument()
  })
})

describe('הצעות למילון — פעולה מרובה', () => {
  test('אשר נבחרות — חלון אישור עם המספר, ואז מילה אחר מילה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל המילים בעמוד הזה' }))
    expect(screen.getByText('2 מילים נבחרו', { selector: '[aria-hidden]' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'אשר את הנבחרות — הוסף למילון הכללי' }))
    const dialog = await screen.findByRole('dialog', { name: /להוסיף 2 מילים למילון הכללי/ })
    expect(posts()).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'הוסף 2 מילים' }))
    await waitFor(() => expect(posts()).toHaveLength(4))
    expect(posts().every((p) => p.action === 'add-global')).toBe(true)
    expect(await screen.findByText('2 מילים נוספו למילון.')).toBeInTheDocument()
  })

  test('דלג נבחרות — בלי חלון אישור', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('אדמו"ר')).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'דלג על הנבחרות' }))
    await waitFor(() => expect(posts()).toEqual([{ action: 'skip', userId: 'u1', word: 'אדמו"ר' }]))
    expect(await screen.findByText('מילה אחת דולגה.')).toBeInTheDocument()
  })
})

describe('הצעות למילון — פעולה על משתמש אחד, ולכמה משתמשים זה נאמר', () => {
  test('ההודעה והתפריט אומרים "של כל 3 המשתמשים"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderAt('/library/admin/dictionary')
      await screen.findByRole('list', { name: 'המילים שממתינות' })
      expect(within(row('ובכן')).getByRole('button', { name: /^אשר את "ובכן".*לכל 3 המשתמשים/ })).toBeInTheDocument()
      await user.click(within(row('ובכן')).getByRole('button', { name: /פעולות נוספות/ }))
      expect(await screen.findByRole('menuitem', { name: 'הסר מהמילון האישי של כל 3 המשתמשים' })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      await user.click(within(row('ובכן')).getByRole('button', { name: /^אשר את/ }))
      expect(await screen.findByText(/של כל 3 המשתמשים בעוד כמה שניות/)).toBeInTheDocument()
      await user.click(within(row('ובכן')).getByRole('button', { name: /^בטל/ }))
      await act(async () => { vi.advanceTimersByTime(10000) })
      expect(posts()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  test('"הסר" אצל משתמש אחד — חלון אישור עם "בטל", ובקשה אחת בגוף של המסך הקודם; האחרים נשארים', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /הצג מי הוסיף/ }))
    await user.click(within(row('ובכן')).getByRole('button', { name: 'הסר את "ובכן" מהמילון האישי של יעקב לוי' }))
    const dialog = await screen.findByRole('dialog', { name: /להסיר את "ובכן" מהמילון האישי של יעקב לוי/ })
    expect(within(dialog).getByRole('button', { name: 'בטל' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'הסר' }))
    await waitFor(() => expect(posts()).toEqual([{ action: 'remove-personal', userId: 'u2', word: 'ובכן' }]))
    expect(await screen.findByText('"ובכן" הוסרה מהמילון האישי של יעקב לוי.')).toBeInTheDocument()
    const users = within(row('ובכן')).getByRole('list', { name: 'מי הוסיף את המילה' })
    expect(within(users).queryByText('יעקב לוי')).toBeNull()
    expect(within(users).getByText('משה כהן')).toBeInTheDocument()
  })

  test('"אשר" ו"דלג" אצל משתמש אחד — מיד, בקשה אחת לכל אחת', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /הצג מי הוסיף/ }))
    await user.click(within(row('ובכן')).getByRole('button', { name: 'דלג על "ובכן" אצל משה כהן' }))
    await waitFor(() => expect(posts()).toEqual([{ action: 'skip', userId: 'u1', word: 'ובכן' }]))
    await user.click(within(row('ובכן')).getByRole('button', { name: 'אשר את "ובכן" אצל יעקב לוי — הוסף למילון הכללי' }))
    await waitFor(() => expect(posts()).toEqual([{ action: 'skip', userId: 'u1', word: 'ובכן' }, { action: 'add-global', userId: 'u2', word: 'ובכן' }]))
  })

  test('כשל באמצע מילה של כמה משתמשים — הרשימה נטענת מחדש', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let n = 0
      routes['POST /api/admin/dictionary'] = () => (++n === 2 ? json({ success: false }, { status: 500 }) : json({ success: true }))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderAt('/library/admin/dictionary')
      await screen.findByRole('list', { name: 'המילים שממתינות' })
      await user.click(within(row('ובכן')).getByRole('button', { name: /^אשר את/ }))
      await act(async () => { vi.advanceTimersByTime(6000) })
      await screen.findByText(/אצל כל המשתמשים. הרשימה עודכנה/)
      await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/admin/dictionary')).toHaveLength(2))
    } finally {
      vi.useRealTimers()
    }
  })

  test('התחברות שפגה — המסך ננעל, והודעה אחת עם "התחבר" (בלי הודעה קופצת כפולה)', async () => {
    routes['POST /api/admin/dictionary'] = () => json({ success: false }, { status: 401 })
    const user = userEvent.setup()
    renderAt('/library/admin/dictionary')
    await screen.findByRole('list', { name: 'המילים שממתינות' })
    await user.click(within(row('ובכן')).getByRole('button', { name: /הצג מי הוסיף/ }))
    await user.click(within(row('ובכן')).getByRole('button', { name: 'דלג על "ובכן" אצל משה כהן' }))
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'התחבר' })).toHaveLength(1)
    expect(screen.queryByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeNull()
  })
})
