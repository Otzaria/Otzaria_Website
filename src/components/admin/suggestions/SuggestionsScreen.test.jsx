// "הצעות עריכה" מקצה לקצה (fetch מדומה): כרטיסים, סינון מהכתובת, אישור / דחייה עם אותם גופים כמו קודם,
// הודעת התנגשות בתוך הכרטיס, דחייה עם "בטל", פעולה מרובה הצעה-אחר-הצעה (skipped, התנגשות, עצור, 403),
// חלון אישור לדחייה מרובה, החלפות זהות, פוקוס, וחסימה מעריכה.
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

import SuggestionsScreen from './SuggestionsScreen'

const EDITS = [
  // הצעה ידנית — כמו שהמסד מחזיר אותה: findReplace הוא אובייקט עם ברירות מחדל ב-null (models/BookEdit.js)
  { _id: 'e1', book: 'b1', bookPath: 'תנך/בראשית.txt', author: 'u1', authorName: 'ישראל ישראלי', kind: 'manual', editType: 'ocr', changeCount: 1,
    findReplace: { find: null, replace: null, isRegex: false, scope: 'book' },
    changes: [{ idx: 0, before: 'יהי אור', after: 'יהי אור,', status: 'pending' }], createdAt: '2026-11-04T10:00:00Z' },
  { _id: 'e2', book: 'b2', bookPath: 'משנה/ברכות.txt', author: 'u2', authorName: 'משה כהן', kind: 'find-replace', changeCount: 2,
    findReplace: { find: 'שרש', replace: 'שורש', isRegex: false },
    changes: [{ idx: 0, before: 'שרש א', after: 'שורש א', status: 'pending' }, { idx: 1, before: 'שרש ב', after: 'שורש ב', status: 'pending' }],
    createdAt: '2026-11-03T10:00:00Z' },
]

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
    'GET /api/library/edits?status=pending': () => json(EDITS),
    'POST /api/library/edits/e1': () => json({ status: 'approved' }),
    'POST /api/library/edits/e2': () => json({ status: 'approved' }),
    'POST /api/library/edits/batch': () => json({ success: true, approved: 1, rejected: 0, conflicts: 0, skipped: 0 }),
    'POST /api/library/users/u1/block': () => json({ success: true, rejected: 2 }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})
afterEach(async () => {
  // ההגנה על יציאה (useBulkLeaveGuard) מוסיפה רשומה להיסטוריה בזמן פעולה מרובה, ומסירה אותה ב-history.back()
  // — שמתבצע אחרי רגע. מחכים לו, כדי שלא יחזיר את הכתובת של הטסט הזה באמצע הטסט הבא (כמו ב-PagesScreen.test).
  await new Promise((resolve) => setTimeout(resolve, 30))
})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><SuggestionsScreen /></ToastProvider>)
}
const posts = () => calls.filter((c) => c.key.startsWith('POST'))
const card = (name) => screen.getByRole('heading', { name: new RegExp(name) }).closest('li')
const batchFor = (init) => JSON.parse(init.body).ids[0]

describe('הצעות עריכה', () => {
  test('כרטיסים: ספר, סוג, מציע, וחלקים; בלי המילה "תור" או "מקטע"', async () => {
    renderAt('/library/dicta-edit/moderation')
    const list = await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    expect(within(list).getAllByRole('listitem').filter((li) => li.parentElement === list)).toHaveLength(2)
    expect(within(card('בראשית')).getByText('עריכה ידנית')).toBeInTheDocument()
    expect(within(card('ברכות')).getByText('חיפוש והחלפה')).toBeInTheDocument()
    expect(within(card('בראשית')).getByText('ישראל ישראלי')).toBeInTheDocument()
    expect(within(card('ברכות')).getByText('2 חלקים')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/תור|מקטע/)
  })

  test('סינון מהכתובת: סוג', async () => {
    renderAt('/library/dicta-edit/moderation?kind=find-replace')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    expect(screen.queryByRole('heading', { name: /בראשית/ })).toBeNull()
    expect(screen.getByRole('heading', { name: /ברכות/ })).toBeInTheDocument()
  })

  test('הצעה ידנית (findReplace מלא ב-null) — בלי "מחליף" ובלי "אשר את כל ההחלפות הזהות"', async () => {
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    expect(within(card('בראשית')).queryByText('מחליף')).toBeNull()
    expect(within(card('ברכות')).getByText('מחליף')).toBeInTheDocument()
    await user.click(within(card('בראשית')).getByRole('button', { name: /פעולות נוספות/ }))
    await screen.findByRole('menuitem', { name: 'פתח בספר' })
    expect(screen.queryByRole('menuitem', { name: 'אשר את כל ההחלפות הזהות' })).toBeNull()
  })

  test('"אשר" — אותו גוף כמו קודם, וההצעה יוצאת מהרשימה', async () => {
    const user = userEvent.setup()
    // השרת: אחרי האישור ההצעה כבר לא ממתינה (הרענון השקט לא מחזיר אותה)
    routes['POST /api/library/edits/e1'] = () => {
      routes['GET /api/library/edits?status=pending'] = () => json(EDITS.slice(1))
      return json({ status: 'approved' })
    }
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /^אשר: / }))
    await waitFor(() => expect(posts()[0]).toEqual({ key: 'POST /api/library/edits/e1', body: '{"action":"approve"}' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: /בראשית/ })).toBeNull())
  })

  test('ספר שנמחק (book-missing) — "הספר כבר לא קיים", לא "נכנסה לספר"', async () => {
    routes['POST /api/library/edits/e1'] = () => json({ status: 'book-missing' })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /^אשר: / }))
    expect(await screen.findByText('הספר "בראשית" כבר לא קיים, ולכן ההצעה נסגרה בלי שינוי')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/נכנסה לספר/)
  })

  test('אחרי "אשר" הפוקוס עובר לכרטיס הבא; בכישלון הוא נשאר על הכפתור', async () => {
    routes['POST /api/library/edits/e2'] = () => json({ error: 'x' }, { status: 500 })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation?sort=oldest')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    const approve = within(card('ברכות')).getByRole('button', { name: /^אשר הכול: / })
    await user.click(approve)
    expect(await screen.findByText('לא הצלחנו לאשר את ההצעה.')).toBeInTheDocument()
    expect(approve).toHaveFocus()
    routes['POST /api/library/edits/e2'] = () => {
      routes['GET /api/library/edits?status=pending'] = () => json(EDITS.slice(0, 1))
      return json({ status: 'approved' })
    }
    await user.click(approve)
    await waitFor(() => expect(screen.queryByRole('heading', { name: /ברכות/ })).toBeNull())
    expect(document.activeElement).toBe(card('בראשית'))
  })

  test('התנגשות באישור — הודעה בתוך הכרטיס עם "פתח בספר", הודעה קופצת, וההצעה נשארת', async () => {
    routes['POST /api/library/edits/e1'] = () => json({ status: 'conflict', conflicts: [{}] })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /^אשר: / }))
    const title = await within(card('בראשית')).findByText('ההצעה לא אושרה, והיא עדיין ממתינה')
    const notice = title.closest('[role="status"]')
    expect(notice).not.toBeNull()
    expect(within(notice).getByRole('link', { name: 'פתח בספר' })).toHaveAttribute('href', expect.stringContaining('/library/dicta-edit/b1'))
    expect(await screen.findByText(/"בראשית" לא אושרה: הטקסט בספר השתנה/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /בראשית/ })).toBeInTheDocument()
  })

  test('אישור חלקים נבחרים — שורת הכפתורים מתחלפת, ו-moderate-changes עם האינדקסים', async () => {
    routes['POST /api/library/edits/e2'] = () => json({ status: 'partial', approved: 1, rejected: 0, conflicts: 0 })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('ברכות')).getByRole('checkbox', { name: 'חלק 2 בהצעה לברכות' }))
    expect(within(card('ברכות')).queryByRole('button', { name: /^אשר הכול/ })).toBeNull()
    await user.click(within(card('ברכות')).getByRole('button', { name: 'אשר חלק אחד' }))
    await waitFor(() => expect(posts()[0]).toEqual({ key: 'POST /api/library/edits/e2', body: '{"action":"moderate-changes","approve":[1]}' }))
  })

  test('"אשר את כל ההחלפות הזהות" — חלון אישור, patternFilter, והודעה בסוף', async () => {
    routes['POST /api/library/edits/batch'] = () => json({ success: true, approved: 3, conflicts: 1 })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('ברכות')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'אשר את כל ההחלפות הזהות' }))
    const dialog = await screen.findByRole('dialog', { name: 'לאשר את כל ההחלפות הזהות?' })
    await user.click(within(dialog).getByRole('button', { name: 'אשר את כולן' }))
    await waitFor(() => expect(posts()[0]).toEqual({ key: 'POST /api/library/edits/batch', body: '{"action":"approve","patternFilter":{"find":"שרש","replace":"שורש"}}' }))
    expect(await screen.findByText(/3 הצעות אושרו · הצעה אחת לא אושרה/)).toBeInTheDocument()
  })

  test('"אשר נבחרים" — אותה נקודת קצה מרובה, הצעה אחת בכל בקשה, וסיכום', async () => {
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות בעמוד' }))
    await user.click(screen.getByRole('button', { name: 'אשר את הנבחרים' }))
    await waitFor(() => expect(posts().map((c) => c.body)).toEqual(['{"action":"approve","ids":["e1"]}', '{"action":"approve","ids":["e2"]}']))
    expect(posts().every((c) => c.key === 'POST /api/library/edits/batch')).toBe(true)
    expect(await screen.findByText('2 הצעות אושרו.')).toBeInTheDocument()
  })

  test('אשר נבחרים: skipped — "לא עודכנה", נשארת ומסומנת; התנגשות — הודעה בכרטיס ו"פרטים"', async () => {
    routes['POST /api/library/edits/batch'] = (init) => (batchFor(init) === 'e1'
      ? json({ success: true, approved: 0, rejected: 0, conflicts: 0, skipped: 1 })
      : json({ success: true, approved: 0, rejected: 0, conflicts: 1, skipped: 0 }))
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות בעמוד' }))
    await user.click(screen.getByRole('button', { name: 'אשר את הנבחרים' }))
    const summary = await screen.findByText(/והיא נשארה ברשימה · הצעה אחת לא עודכנה\. נסה שוב/)
    expect(summary.textContent).not.toMatch(/בידי מישהו אחר/)
    expect(screen.getByRole('heading', { name: /בראשית/ })).toBeInTheDocument()
    expect(within(card('בראשית')).getByRole('checkbox', { name: 'בחר את ההצעה לבראשית' })).toBeChecked()
    expect(within(card('ברכות')).getByText('ההצעה לא אושרה, והיא עדיין ממתינה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'פרטים' })).toBeInTheDocument()
  })

  test('403 באמצע ריצה — נעצר, והמסך ננעל', async () => {
    routes['POST /api/library/edits/batch'] = (init) => (batchFor(init) === 'e2'
      ? json({ success: true, approved: 1, rejected: 0, conflicts: 0, skipped: 0 })
      : json({ error: 'forbidden' }, { status: 403 }))
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation?sort=oldest')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות בעמוד' }))
    await user.click(screen.getByRole('button', { name: 'אשר את הנבחרים' }))
    expect(await screen.findByText('אין לך עוד הרשאה לאשר או לדחות הצעות')).toBeInTheDocument()
    expect(posts()).toHaveLength(2)
    expect(within(card('בראשית')).getByRole('button', { name: /^אשר: / })).toHaveAttribute('aria-disabled', 'true')
  })

  test('"עצור" באמצע ריצה: הפוקוס ב"עצור", הבחירה נעולה, ומה שלא נשלח נשאר מסומן', async () => {
    let release
    routes['POST /api/library/edits/batch'] = () => new Promise((resolve) => {
      release = () => {
        routes['GET /api/library/edits?status=pending'] = () => json(EDITS.slice(1))
        resolve(json({ success: true, approved: 1, rejected: 0, conflicts: 0, skipped: 0 }))
      }
    })
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות בעמוד' }))
    await user.click(screen.getByRole('button', { name: 'אשר את הנבחרים' }))
    const stop = await screen.findByRole('button', { name: 'עצור' })
    await waitFor(() => expect(stop).toHaveFocus())
    expect(screen.getByRole('button', { name: 'נקה בחירה' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(card('בראשית')).getByRole('checkbox', { name: 'בחר את ההצעה לבראשית' })).toBeDisabled()
    await user.click(stop)
    await act(async () => { release() })
    expect(await screen.findByText(/הצעה אחת אושרה · נעצר: הצעה אחת לא נשלחה/)).toBeInTheDocument()
    expect(posts()).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('heading', { name: /בראשית/ })).toBeNull())
    expect(within(card('ברכות')).getByRole('checkbox', { name: 'בחר את ההצעה לברכות' })).toBeChecked()
  })

  test('"דחה נבחרים" — חלון אישור עם המספר; ביטול לא שולח כלום, והפוקוס חוזר לכפתור', async () => {
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל ההצעות בעמוד' }))
    const reject = screen.getByRole('button', { name: 'דחה את הנבחרים' })
    await user.click(reject)
    const dialog = await screen.findByRole('dialog', { name: 'לדחות 2 הצעות?' })
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    expect(posts()).toEqual([])
    await waitFor(() => expect(reject).toHaveFocus())
  })

  test('חסימה מעריכה — מ-⋮, בחלון אישור, עם אותו גוף כמו קודם, ואיפה מבטלים', async () => {
    const user = userEvent.setup()
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'חסום את ישראל ישראלי מעריכה' }))
    const dialog = await screen.findByRole('dialog', { name: /לחסום מעריכה/ })
    expect(within(dialog).getByText(/במסך "משתמשים"/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('סיבה (לא חובה)'), 'הצעות לא רציניות')
    await user.click(within(dialog).getByRole('button', { name: 'חסום מעריכה' }))
    await waitFor(() => expect(posts()[0]).toEqual({ key: 'POST /api/library/users/u1/block', body: '{"blocked":true,"reason":"הצעות לא רציניות","rejectPending":true}' }))
    expect(await screen.findByText('ישראל ישראלי נחסם מעריכה. 2 הצעות שלו נדחו.')).toBeInTheDocument()
  })

  test('אין הצעות — מצב ריק; שגיאה — "נסה שוב", בלי אותו משפט פעמיים', async () => {
    routes['GET /api/library/edits?status=pending'] = () => json([])
    const { unmount } = renderAt('/library/dicta-edit/moderation')
    expect(await screen.findByText('אין הצעות שממתינות')).toBeInTheDocument()
    unmount()
    routes['GET /api/library/edits?status=pending'] = () => json({ error: 'Internal Server Error' }, { status: 500 })
    renderAt('/library/dicta-edit/moderation')
    expect(await screen.findByText('לא הצלחנו לטעון את הצעות העריכה')).toBeInTheDocument()
    expect(screen.getAllByText(/לא הצלחנו לטעון את הצעות העריכה/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument()
  })

  test('סינון בלי תוצאות — "נקה סינון" פעם אחת בלבד', async () => {
    renderAt('/library/dicta-edit/moderation?kind=find-replace&author=u1')
    expect(await screen.findByText('אין הצעות שמתאימות לסינון')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /נקה סינון/ })).toHaveLength(1)
  })
})

describe('דחייה בודדת — "בטל" לפני שהבקשה יוצאת', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  test('"בטל" בכרטיס — לא נשלח כלום, והכרטיס חוזר', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /^דחה: / }))
    expect(await screen.findByText('ההצעה ל"בראשית" תידחה')).toBeInTheDocument()
    const undo = within(card('בראשית')).getByRole('button', { name: 'בטל את הדחייה: ההצעה לבראשית' })
    await waitFor(() => expect(undo).toHaveFocus())
    await user.click(undo)
    expect(await screen.findByText('הדחייה בוטלה')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(posts()).toEqual([])
    expect(within(card('בראשית')).getByRole('button', { name: /^דחה: / })).toHaveFocus()
  })

  test('בלי "בטל" — אחרי כמה שניות נשלח אותו גוף כמו קודם, והכרטיס יוצא', async () => {
    routes['POST /api/library/edits/e1'] = () => {
      routes['GET /api/library/edits?status=pending'] = () => json(EDITS.slice(1))
      return json({ status: 'rejected' })
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/library/dicta-edit/moderation')
    await screen.findByRole('list', { name: 'ההצעות שממתינות' })
    await user.click(within(card('בראשית')).getByRole('button', { name: /^דחה: / }))
    expect(posts()).toEqual([])
    await act(async () => { vi.advanceTimersByTime(6000) })
    await waitFor(() => expect(posts()).toEqual([{ key: 'POST /api/library/edits/e1', body: '{"action":"reject"}' }]))
    await waitFor(() => expect(screen.queryByRole('heading', { name: /בראשית/ })).toBeNull())
    expect(await screen.findByText('ההצעה ל"בראשית" נדחתה')).toBeInTheDocument()
  })
})
