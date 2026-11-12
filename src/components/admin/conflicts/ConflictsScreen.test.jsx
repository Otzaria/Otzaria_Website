// "התנגשויות בסנכרון" מקצה לקצה (fetch מדומה): רשימה, פתיחת ספר טוענת את ההבדלים רק אז, בחירה בחלק עם
// כמה שניות של "בטל" ואז אותו גוף כמו קודם, לחיצה כפולה לא מכריעה את החלק הבא, כשל בשמירה, נוסח ריק,
// פעולה על כל הספר בחלון אישור, ו"GitHub" רק פעם אחת, עם הסבר.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import ConflictsScreen from './ConflictsScreen'

const BOOKS = [
  { _id: 'c1', path: 'תנך/בראשית.txt', title: 'בראשית', category: 'תנך', conflictCount: 2, detectedAt: '2026-11-04T08:00:00Z' },
  { _id: 'c2', path: 'הלכה/משנה ברורה.txt', title: 'משנה ברורה', category: 'הלכה', conflictCount: 1, detectedAt: '2026-11-01T08:00:00Z' },
]
const DIFF = { changeCount: 2, changes: [
  { before: 'יהי אור', after: 'יהי אור,', fullBefore: 'ויאמר יהי אור', fullAfter: 'ויאמר יהי אור,' },
  { before: 'שרש', after: 'שורש', fullBefore: 'שרש העבודה', fullAfter: 'שורש העבודה' },
] }

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let routes
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  calls = []
  routes = {
    'GET /api/library/conflicts': () => json(BOOKS),
    'GET /api/library/books/c1/conflict-diff': () => json(DIFF),
    'POST /api/library/books/c1/resolve-conflict-hunk': () => json({ success: true, resolved: false, conflictCount: 1 }),
    'POST /api/library/books/c2/resolve-conflict': () => json({ success: true }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body })
    const handler = routes[key]
    return handler ? handler() : json({}, { status: 404 })
  }))
})
afterEach(() => { vi.useRealTimers() })

const renderScreen = () => render(<ToastProvider><ConflictsScreen /></ToastProvider>)
const row = (name) => screen.getByRole('heading', { name }).closest('li')
const posts = () => calls.filter((c) => c.key.startsWith('POST'))
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const wait = (ms) => act(async () => { vi.advanceTimersByTime(ms) })

async function openBook(user, name = 'בראשית') {
  await screen.findByRole('list', { name: 'הספרים שמחכים להחלטה' })
  await user.click(within(row(name)).getByRole('button', { name: /הצג את ההבדלים/ }))
  await within(row(name)).findByText('חלק 1 מתוך 2')
}

describe('התנגשויות בסנכרון', () => {
  test('רשימת הספרים; ההבדלים לא נטענים עד שפותחים; "GitHub" רק בהסבר', async () => {
    renderScreen()
    await screen.findByRole('list', { name: 'הספרים שמחכים להחלטה' })
    expect(screen.getByText('2 ספרים מחכים להחלטה')).toBeInTheDocument()
    expect(calls.some((c) => c.key.includes('conflict-diff'))).toBe(false)
    expect(document.body.textContent.match(/GitHub/g)).toHaveLength(1)
    expect(document.body.textContent).toMatch(/מאגר המרכזי \(GitHub\)/)
    expect(screen.getByRole('link', { name: 'חזרה למרחב העריכה' })).toHaveAttribute('href', '/library/dicta-edit')
  })

  test('בחירה בחלק: "בטל" לכמה שניות, ואז אותו גוף כמו קודם; החלק נשאר במקומו ומסומן', async () => {
    const user = setup()
    renderScreen()
    await openBook(user)
    expect(within(row('בראשית')).getByRole('link', { name: 'פתח בעורך' })).toHaveAttribute('href', '/library/dicta-edit/c1')
    await user.click(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
    expect(await screen.findByText('חלק 1 ב"בראשית": יישאר הנוסח שבאתר')).toBeInTheDocument()
    expect(within(row('בראשית')).getByText('נבחר: הנוסח שבאתר')).toBeInTheDocument()
    expect(posts()).toEqual([])
    await wait(6000)
    await waitFor(() => expect(posts()).toEqual([
      { key: 'POST /api/library/books/c1/resolve-conflict-hunk', body: '{"before":"ויאמר יהי אור","after":"ויאמר יהי אור,","strategy":"ours"}' },
    ]))
    expect(await within(row('בראשית')).findByText('נשמר: נשאר הנוסח שבאתר')).toBeInTheDocument()
    expect(await within(row('בראשית')).findByText('חלק אחד שונה')).toBeInTheDocument()
    // החלק השני עדיין לבחירה
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 2 מתוך 2' })).toBeInTheDocument()
  })

  test('"בטל" — לא נשלח כלום, והכפתורים חוזרים', async () => {
    const user = setup()
    renderScreen()
    await openBook(user)
    await user.click(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבמאגר: חלק 1 מתוך 2' }))
    const cancel = await within(row('בראשית')).findByRole('button', { name: 'בטל את הבחירה: חלק 1 מתוך 2' })
    await waitFor(() => expect(cancel).toHaveFocus())
    await user.click(cancel)
    await wait(10000)
    expect(posts()).toEqual([])
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבמאגר: חלק 1 מתוך 2' })).toBeInTheDocument()
  })

  test('לחיצה כפולה — מכריעה רק את החלק שנלחץ, לא את הבא', async () => {
    const user = setup()
    renderScreen()
    await openBook(user)
    await user.dblClick(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 2 מתוך 2' })).toBeInTheDocument()
    await wait(6000)
    await waitFor(() => expect(posts()).toHaveLength(1))
  })

  test('כשל בשמירה — ההבדלים נטענים מחדש, הודעת שגיאה, והבחירה מתבטלת', async () => {
    routes['POST /api/library/books/c1/resolve-conflict-hunk'] = () => json({ error: 'עומס עדכונים מקבילים על הספר, נסו שוב' }, { status: 409 })
    const user = setup()
    renderScreen()
    await openBook(user)
    await user.click(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
    await wait(6000)
    expect(await screen.findByText('מישהו אחר עדכן את הספר באותו רגע. נסה שוב.')).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.key.includes('conflict-diff'))).toHaveLength(2))
    expect(await within(row('בראשית')).findByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' })).toBeInTheDocument()
  })

  test('נוסח ריק — מוצג, עם "השאר בלי טקסט (מחק את החלק)"', async () => {
    routes['GET /api/library/books/c1/conflict-diff'] = () => json({ changeCount: 2, changes: [
      { before: '', after: 'פסוק שנוסף באתר', fullBefore: '', fullAfter: 'פסוק שנוסף באתר' }, DIFF.changes[1],
    ] })
    const user = setup()
    renderScreen()
    await openBook(user)
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר בלי טקסט (מחק את החלק): חלק 1 מתוך 2' })).toBeInTheDocument()
  })

  test('כל הספר — מ-⋮, חלון אישור (הרסני), ואז הספר יוצא מהרשימה', async () => {
    routes['POST /api/library/books/c2/resolve-conflict'] = () => {
      routes['GET /api/library/conflicts'] = () => json(BOOKS.slice(0, 1))
      return json({ success: true })
    }
    const user = setup()
    renderScreen()
    await screen.findByRole('list', { name: 'הספרים שמחכים להחלטה' })
    await user.click(within(row('משנה ברורה')).getByRole('button', { name: /פעולות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'השאר את הנוסח שבמאגר בכל הספר' }))
    const dialog = await screen.findByRole('dialog', { name: 'להשאיר בכל הספר את הנוסח שבמאגר?' })
    expect(within(dialog).getByText('העריכות שנעשו באתר בספר הזה, כולל הצעות עריכה שאושרו, יבוטלו.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'השאר את הנוסח שבמאגר' }))
    await waitFor(() => expect(posts()).toEqual([
      { key: 'POST /api/library/books/c2/resolve-conflict', body: '{"strategy":"theirs"}' },
    ]))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'משנה ברורה' })).toBeNull())
  })

  test('אין ספרים — מצב ריק', async () => {
    routes['GET /api/library/conflicts'] = () => json([])
    renderScreen()
    expect(await screen.findByText('אין ספרים שמחכים להחלטה')).toBeInTheDocument()
  })
})

describe('הכרעות ממתינות — יציאה והכרעה על כל הספר', () => {
  async function choosePart(user) {
    await user.click(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
  }
  async function wholeBookDialog(user) {
    await user.click(within(row('בראשית')).getByRole('button', { name: /פעולות/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'השאר את הנוסח שבמאגר בכל הספר' }))
    return screen.findByRole('dialog', { name: 'להשאיר בכל הספר את הנוסח שבמאגר?' })
  }
  function warnsBeforeUnload() {
    const event = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(event) })
    return event.defaultPrevented
  }

  test('ביטול ההכרעה על כל הספר משאיר את בחירת החלק לשליחה בזמן המקורי', async () => {
    const user = setup()
    renderScreen()
    await openBook(user)
    await choosePart(user)
    const dialog = await wholeBookDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    expect(within(row('בראשית')).getByText('נבחר: הנוסח שבאתר')).toBeInTheDocument()
    await wait(6000)
    expect(posts()).toEqual([
      { key: 'POST /api/library/books/c1/resolve-conflict-hunk', body: '{"before":"ויאמר יהי אור","after":"ויאמר יהי אור,","strategy":"ours"}' },
    ])
    expect(within(row('בראשית')).getByText('נשמר: נשאר הנוסח שבאתר')).toBeInTheDocument()
  })

  test('ביטול חלון הספר מאפשר עדיין לבטל את בחירת החלק', async () => {
    const user = setup()
    renderScreen()
    await openBook(user)
    await choosePart(user)
    const dialog = await wholeBookDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    await user.click(within(row('בראשית')).getByRole('button', { name: 'בטל את הבחירה: חלק 1 מתוך 2' }))
    await wait(7000)
    expect(posts()).toEqual([])
    expect(warnsBeforeUnload()).toBe(false)
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' })).toBeEnabled()
  })

  test('אישור פעולה מלאה שנכשל מנקה את בחירות ההמתנה ומאפשר לבחור מחדש', async () => {
    routes['POST /api/library/books/c1/resolve-conflict'] = () => json({ error: 'תקלה בשרת' }, { status: 500 })
    const user = setup()
    renderScreen()
    await openBook(user)
    await choosePart(user)
    const dialog = await wholeBookDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'השאר את הנוסח שבמאגר' }))
    await screen.findByText('תקלה בשרת')
    expect(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' })).toBeEnabled()
    expect(warnsBeforeUnload()).toBe(false)
    await wait(7000)
    expect(posts()).toHaveLength(1)
    await choosePart(user)
    await wait(6000)
    expect(posts().at(-1).key).toBe('POST /api/library/books/c1/resolve-conflict-hunk')
  })

  test('רענון וסגירה מזהירים גם בזמן ההמתנה וגם בזמן כתיבה; אחרי שמירה האזהרה מוסרת', async () => {
    let finish
    routes['POST /api/library/books/c1/resolve-conflict-hunk'] = () => new Promise((resolve) => { finish = resolve })
    const user = setup()
    renderScreen()
    await openBook(user)
    expect(warnsBeforeUnload()).toBe(false)
    await choosePart(user)
    expect(warnsBeforeUnload()).toBe(true)
    await wait(6000)
    expect(warnsBeforeUnload()).toBe(true)
    await act(async () => { finish(json({ success: true, resolved: false, conflictCount: 1 })) })
    expect(warnsBeforeUnload()).toBe(false)
  })

  test('הכרעת הספר מחכה לכל תור החלקים שכבר יצא, גם כשהטיימר פג בתוך חלון האישור', async () => {
    const finishes = []
    routes['POST /api/library/books/c1/resolve-conflict-hunk'] = () => new Promise((resolve) => { finishes.push(resolve) })
    routes['POST /api/library/books/c1/resolve-conflict'] = () => json({ error: 'תקלה בשרת' }, { status: 500 })
    const user = setup()
    renderScreen()
    await openBook(user)
    await choosePart(user)
    await user.click(within(row('בראשית')).getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 2 מתוך 2' }))
    const dialog = await wholeBookDialog(user)
    await wait(6000)
    expect(posts()).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'השאר את הנוסח שבמאגר' }))
    expect(posts()).toHaveLength(1)
    await act(async () => { finishes[0](json({ success: true, resolved: false, conflictCount: 1 })) })
    expect(posts()).toHaveLength(2)
    expect(posts().every((p) => p.key.endsWith('resolve-conflict-hunk'))).toBe(true)
    await act(async () => { finishes[1](json({ success: true, resolved: false, conflictCount: 1 })) })
    await screen.findByText('תקלה בשרת')
    expect(posts()).toHaveLength(3)
    expect(posts()[2].key).toBe('POST /api/library/books/c1/resolve-conflict')
  })
})

test('הכרעה על כל הספר מדווחת כשהחלק האחרון כבר סגר את ההתנגשות', async () => {
  let finish
  routes['POST /api/library/books/c1/resolve-conflict-hunk'] = () => new Promise((resolve) => { finish = resolve })
  routes['POST /api/library/books/c1/resolve-conflict'] = () => json({ success: true, status: 'not-conflict' })
  const user = setup()
  renderScreen()
  await openBook(user)
  const book = within(row('בראשית'))
  await user.click(book.getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
  await user.click(book.getByRole('button', { name: /פעולות/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'השאר את הנוסח שבמאגר בכל הספר' }))
  const dialog = await screen.findByRole('dialog', { name: 'להשאיר בכל הספר את הנוסח שבמאגר?' })
  await wait(6000)
  await user.click(within(dialog).getByRole('button', { name: 'השאר את הנוסח שבמאגר' }))
  await act(async () => { finish(json({ success: true, status: 'resolved', resolved: true, conflictCount: 0 })) })
  expect(screen.getByText('ההתנגשות כבר הוכרעה. הבחירה לכל הספר לא הוחלה.')).toBeInTheDocument()
  expect(screen.queryByText('ב"בראשית" נשאר הנוסח שבמאגר')).not.toBeInTheDocument()
})
