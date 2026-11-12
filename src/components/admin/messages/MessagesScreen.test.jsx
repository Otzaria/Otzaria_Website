// "הודעות" מקצה לקצה (fetch מדומה): נכנסות מול נשלחו, "רק חדשות" וחיפוש מהכתובת, מגירת שיחה ו"השב", סמן כנקרא
// עם "בטל", מחיקה עם חלון אישור, פעולות מרובות, הודעה חדשה (משתמש / כולם, עם אישור), תזכורות לפי הרשאה —
// וכל בקשה לשרת באותה כתובת, שיטה וגוף כמו במסכים הקודמים.
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
const refreshAdminBadgeCounts = vi.hoisted(() => vi.fn())
vi.mock('@/components/admin/shell/useAdminBadgeCounts', () => ({ refreshAdminBadgeCounts }))
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import MessagesScreen from './MessagesScreen'

const HOUR = 3600_000
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString()
const MESSAGES = [
  // פנייה חדשה של משתמש
  { id: 'm1', subject: 'בעיה בשמירה', content: 'שלום,\nלא מצליח לשמור', status: 'unread', allowReplies: true, senderName: 'משה כהן', senderEmail: 'moshe@example.com', senderRole: 'user', recipientName: null, recipientEmail: null, createdAt: ago(2), replies: [] },
  // פנייה שנענתה
  { id: 'm2', subject: 'שאלה על ניקוד', content: 'צריך ניקוד?', status: 'replied', allowReplies: true, senderName: 'דוד לוי', senderEmail: 'david@example.com', senderRole: 'user', recipientName: null, recipientEmail: null, createdAt: ago(30), replies: [{ id: 'r1', senderName: 'מנהל', senderRole: 'admin', content: 'לא צריך', createdAt: ago(29) }] },
  // הודעה של מנהל שהמשתמש השיב עליה — בנכנסות
  { id: 'm3', subject: 'העמודים שתפסת', content: 'נא לסיים', status: 'unread', allowReplies: true, senderName: 'מנהל', senderEmail: 'admin@example.com', senderRole: 'admin', recipientName: 'יוסי', recipientEmail: 'yossi@example.com', createdAt: ago(50), replies: [{ id: 'r2', senderName: 'יוסי', senderRole: 'user', content: 'אסיים השבוע', createdAt: ago(1) }] },
  // נשלחו: למשתמש אחד
  { id: 'm4', subject: 'ההעלאה אושרה', content: 'תודה', status: 'read', allowReplies: true, senderName: 'מנהל', senderRole: 'admin', recipientName: 'רחל', recipientEmail: 'r@example.com', createdAt: ago(5), replies: [] },
  // נשלחו: לכל המשתמשים (שלוש הודעות באותו רגע)
  ...['א', 'ב', 'ג'].map((n, i) => ({ id: `b${i}`, subject: 'עדכון לכולם', content: 'שיפורים בעורך', status: 'read', allowReplies: true, senderName: 'מנהל', senderRole: 'admin', recipientName: `נמען ${n}`, recipientEmail: null, createdAt: new Date(Date.now() - 70 * HOUR + i).toISOString(), replies: [] })),
]
const USERS_BASIC = [{ _id: 'u1', name: 'רחל לוי', email: 'rachel@example.com' }, { _id: 'u2', name: 'שרה כהן', email: 'sara@example.com' }]

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let routes
beforeEach(() => {
  window.sessionStorage.clear() // טיוטות התשובה (useReplyDrafts)
  calls = []
  refreshAdminBadgeCounts.mockClear()
  routes = {
    'GET /api/messages?allMessages=true': () => json({ success: true, messages: MESSAGES }),
    'GET /api/admin/users-basic': () => json({ success: true, users: USERS_BASIC }),
    'PUT /api/messages/mark-read': () => json({ success: true }),
    'DELETE /api/messages/delete': () => json({ success: true }),
    'POST /api/messages/reply': () => json({ success: true }),
    'POST /api/messages/send-admin': (init) => json({ success: true, message: JSON.parse(init.body).sendToAll ? 'נשלח בהצלחה ל-2 משתמשים' : 'נשלח בהצלחה' }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body, headers: init?.headers })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
})

function renderAt(url, props = {}) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><MessagesScreen initialMessages={MESSAGES} canRemind viewerName="בודק" {...props} /></ToastProvider>)
}
const writes = () => calls.filter((c) => !c.key.startsWith('GET'))
const openButtons = () => screen.getAllByRole('button', { name: /^פתח את (השיחה|ההודעה)/ })

describe('הודעות — נכנסות', () => {
  test('נכנסות: פניות ושיחה שמשתמש השיב בה; "חדש" על מה שלא נקרא; המונה בלשונית', () => {
    renderAt('/library/admin/messages')
    const list = screen.getByRole('list', { name: 'שיחות' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    // מהפעילות האחרונה: m3 (תשובה לפני שעה), m1, m2. m3 — הצוות פתח, יוסי ענה: בשורה יוסי (הצד השני), לא המנהל
    expect(within(rows[0]).getByText('יוסי')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('מנהל')).toBeNull()
    expect(within(rows[0]).getByText('חדש')).toBeInTheDocument()
    expect(within(rows[1]).getByText('משה כהן')).toBeInTheDocument()
    expect(within(rows[2]).queryByText('חדש')).toBeNull()
    expect(rows[2]).toHaveTextContent('השבת: לא צריך')
    expect(screen.getByRole('link', { name: 'נכנסות, 2 חדשות' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'תזכורות' })).toHaveAttribute('href', '/library/admin/messages?view=reminders')
  })

  test('"רק חדשות" מהכתובת ואליה; חיפוש', async () => {
    renderAt('/library/admin/messages?new=1')
    expect(within(screen.getByRole('list', { name: 'שיחות חדשות' })).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.setup().click(screen.getByRole('button', { name: /רק חדשות/ }))
    expect(window.location.search).toBe('')
    expect(openButtons()).toHaveLength(3)
  })

  test('אין חדשות — "אין הודעות חדשות" ו"הצג את כל השיחות"', async () => {
    renderAt('/library/admin/messages?new=1', { initialMessages: MESSAGES.map((m) => ({ ...m, status: 'read' })) })
    expect(screen.getByText('אין הודעות חדשות')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'הצג את כל השיחות' }))
    expect(openButtons()).toHaveLength(3)
  })

  test('אין פניות בכלל — הסבר', () => {
    renderAt('/library/admin/messages', { initialMessages: [] })
    expect(screen.getByText('אין פניות')).toBeInTheDocument()
  })

  test('מגירה: השרשור, "השב" — אותו גוף כמו קודם, רענון והמונה בסרגל', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /פתח את השיחה "שאלה על ניקוד"/ }))
    const drawer = await screen.findByRole('dialog', { name: 'שאלה על ניקוד' })
    expect(window.location.search).toBe('?message=m2')
    const thread = within(drawer).getByRole('list', { name: 'השיחה' })
    expect(within(thread).getAllByRole('listitem')).toHaveLength(2)
    expect(within(drawer).getByText(/באזור האישי שלו\. היא לא נשלחת בדואר/)).toBeInTheDocument()
    await user.type(within(drawer).getByLabelText('השב לדוד לוי'), 'תודה רבה')
    await user.click(within(drawer).getByRole('button', { name: 'שלח תשובה' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('POST /api/messages/reply')
    expect(JSON.parse(writes()[0].body)).toEqual({ messageId: 'm2', reply: 'תודה רבה', fromAdminPanel: true })
    expect(await screen.findByText('התשובה נשלחה')).toBeInTheDocument()
    expect(refreshAdminBadgeCounts).toHaveBeenCalled()
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /api/messages?allMessages=true')).toBe(true))
  })

  test('סגירת מגירה עם תשובה שלא נשלחה — "לצאת בלי לשמור?"', async () => {
    renderAt('/library/admin/messages?message=m1')
    const user = userEvent.setup()
    const drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    await user.type(within(drawer).getByLabelText('השב למשה כהן'), 'טיוטה')
    await user.click(within(drawer).getByRole('button', { name: 'סגירה' }))
    expect(await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'הישאר' }))
    expect(screen.getByRole('dialog', { name: 'בעיה בשמירה' })).toBeInTheDocument()
  })

  test('סמן כנקרא מה-⋮: מיד ברשימה, "בטל" מבטל בלי בקשה', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'פעולות נוספות: בעיה בשמירה' }))
    await user.click(await screen.findByRole('menuitem', { name: 'סמן כנקרא' }))
    expect(screen.getByRole('link', { name: 'נכנסות, אחת חדשה' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'בטל' }))
    expect(screen.getByRole('link', { name: 'נכנסות, 2 חדשות' })).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  test('סמן כנקרא — הבקשה יוצאת אחרי ההמתנה, באותו גוף כמו קודם, והמונה בסרגל מתרענן', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/library/admin/messages')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: 'פעולות נוספות: בעיה בשמירה' }))
    await user.click(await screen.findByRole('menuitem', { name: 'סמן כנקרא' }))
    expect(writes()).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(6500) })
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('PUT /api/messages/mark-read')
    expect(JSON.parse(writes()[0].body)).toEqual({ messageId: 'm1' })
    await waitFor(() => expect(refreshAdminBadgeCounts).toHaveBeenCalled())
  })

  test('מחק לצמיתות: חלון אישור, DELETE באותו גוף, השורה יוצאת', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'פעולות נוספות: בעיה בשמירה' }))
    await user.click(await screen.findByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: 'למחוק את השיחה לצמיתות?' })
    expect(writes()).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('DELETE /api/messages/delete')
    expect(JSON.parse(writes()[0].body)).toEqual({ messageId: 'm1' })
    await waitFor(() => expect(openButtons()).toHaveLength(2))
    expect(refreshAdminBadgeCounts).toHaveBeenCalled()
  })

  test('מחיקה מתוך המגירה: המגירה נסגרת פעם אחת ("אחורה" אחד), והשורה יוצאת', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    const back = vi.spyOn(window.history, 'back')
    await user.click(screen.getByRole('button', { name: /פתח את השיחה "בעיה בשמירה"/ }))
    const drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    await user.click(within(drawer).getByRole('button', { name: 'מחק לצמיתות' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'למחוק את השיחה לצמיתות?' })).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'בעיה בשמירה' })).toBeNull())
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
    expect(writes().map((w) => w.key)).toEqual(['DELETE /api/messages/delete'])
  })

  test('פעולה מרובה: סמן כנקרא — רק מה שלא נקרא; מחק — עם המספר בחלון', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'בחר את כל השיחות בעמוד' }))
    expect(screen.getByRole('group', { name: 'פעולות על הנבחרים' })).toHaveTextContent('3 נבחרו')
    await user.click(screen.getByRole('button', { name: 'סמן את הנבחרות כנקראו' }))
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes().map((w) => JSON.parse(w.body).messageId).sort()).toEqual(['m1', 'm3'])
    // 3 נבחרו: 2 סומנו + אחת שכבר נקראה — הסכום שווה למה שנבחר
    expect(await screen.findByText('2 שיחות סומנו כנקראו. שיחה אחת כבר הייתה נקראה.')).toBeInTheDocument()
    expect(refreshAdminBadgeCounts).toHaveBeenCalled()
    // הפוקוס חוזר ל"בחר הכול" (הכפתורים יצאו מה-DOM)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /את כל השיחות בעמוד|את הבחירה בעמוד/ })))

    await user.click(screen.getByRole('checkbox', { name: /^בחר את "בעיה בשמירה"/ }))
    await user.click(screen.getByRole('checkbox', { name: /^בחר את "שאלה על ניקוד"/ }))
    await user.click(screen.getByRole('button', { name: 'מחק את הנבחרות לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: 'למחוק לצמיתות 2 שיחות?' })
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes().filter((w) => w.key === 'DELETE /api/messages/delete')).toHaveLength(2))
    await waitFor(() => expect(openButtons()).toHaveLength(1))
  })

  test('פעולה מרובה שנכשלה בחלקה — מה שנכשל נשאר מסומן', async () => {
    routes['DELETE /api/messages/delete'] = (init) => (JSON.parse(init.body).messageId === 'm2' ? json({ success: false }, { status: 500 }) : json({ success: true }))
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: /^בחר את "בעיה בשמירה"/ }))
    await user.click(screen.getByRole('checkbox', { name: /^בחר את "שאלה על ניקוד"/ }))
    await user.click(screen.getByRole('button', { name: 'מחק את הנבחרות לצמיתות' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'מחק לצמיתות' }))
    expect(await screen.findByText(/שיחה אחת נמחקה\. שיחה אחת נכשלה ונשארה בבחירה\./)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^בחר את "שאלה על ניקוד"/ })).toBeChecked()
  })
})

describe('הודעות — נשלחו', () => {
  test('אל מי, נושא; "לכל המשתמשים" — שורה אחת עם מספר הנמענים', () => {
    renderAt('/library/admin/messages?view=sent')
    const rows = within(screen.getByRole('list', { name: 'הודעות שנשלחו' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('רחל')
    expect(rows[1]).toHaveTextContent('3 נמענים')
    expect(screen.getByRole('link', { name: 'נשלחו' })).toHaveAttribute('aria-current', 'page')
  })

  test('מחיקת הודעה לכמה נמענים — חלון עם המספר, ו-DELETE לכל אחת', async () => {
    renderAt('/library/admin/messages?view=sent')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'פעולות נוספות: עדכון לכולם' }))
    await user.click(await screen.findByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: 'למחוק את ההודעה אצל 3 נמענים?' })
    expect(dialog).toHaveTextContent('אצל 3 הנמענים שלא השיבו עליה')
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes()).toHaveLength(3))
    expect(writes().map((w) => JSON.parse(w.body).messageId).sort()).toEqual(['b0', 'b1', 'b2'])
    expect(await screen.findByText('ההודעה נמחקה')).toBeInTheDocument()
  })
})

describe('הודעות — הודעה חדשה', () => {
  test('למשתמש אחד: אותו גוף כמו קודם, בלי חלון אישור', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'הודעה חדשה' }))
    const drawer = await screen.findByRole('dialog', { name: 'הודעה חדשה' })
    expect(within(drawer).getByText(/לא נשלחת בדואר/)).toBeInTheDocument()
    const send = within(drawer).getByRole('button', { name: 'שלח' })
    // לא מושבת: לחיצה בלי פרטים אומרת מה חסר, ולא שולחת
    await user.click(send)
    expect(within(drawer).getByText('בחר למי לשלוח.')).toBeInTheDocument()
    expect(within(drawer).getByText('כתוב נושא.')).toBeInTheDocument()
    expect(within(drawer).getByText('כתוב את תוכן ההודעה.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /^משתמש/ })).not.toBeDisabled())
    await user.click(within(drawer).getByRole('button', { name: /^משתמש/ }))
    await user.click(await screen.findByRole('option', { name: /רחל לוי/ }))
    await user.type(within(drawer).getByLabelText('נושא'), 'שלום')
    await user.type(within(drawer).getByLabelText('תוכן'), 'תוכן ההודעה')
    expect(within(drawer).getByRole('region', { name: 'תצוגה מקדימה' })).toHaveTextContent('מאת בודק')
    await user.click(send)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('POST /api/messages/send-admin')
    expect(JSON.parse(writes()[0].body)).toEqual({ recipientId: 'u1', subject: 'שלום', message: 'תוכן ההודעה', sendToAll: false })
    expect(await screen.findByText('ההודעה נשלחה לרחל לוי')).toBeInTheDocument()
  })

  test('לכל המשתמשים: חלון אישור עם המספר; ביטול — לא נשלח; אישור — אותו גוף כמו קודם', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'הודעה חדשה' }))
    const drawer = await screen.findByRole('dialog', { name: 'הודעה חדשה' })
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /^משתמש/ })).not.toBeDisabled())
    await user.click(within(drawer).getByRole('button', { name: /^למי/ }))
    await user.click(await screen.findByRole('option', { name: /כל המשתמשים/ }))
    await user.type(within(drawer).getByLabelText('נושא'), 'עדכון')
    await user.type(within(drawer).getByLabelText('תוכן'), 'לכולם')
    await user.click(within(drawer).getByRole('button', { name: 'שלח לכל המשתמשים' }))
    let dialog = await screen.findByRole('dialog', { name: 'לשלוח את ההודעה לכל המשתמשים?' })
    // בלי מספר משוער על הכפתור; בגוף — "לכ-2" (הערכה: רק משתמשים רגילים ברשימה)
    expect(dialog).toHaveTextContent('היא תגיע לכ-2 משתמשים')
    expect(dialog).not.toHaveTextContent('אי אפשר לבטל')
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    expect(writes()).toHaveLength(0)
    await user.click(within(drawer).getByRole('button', { name: 'שלח לכל המשתמשים' }))
    dialog = await screen.findByRole('dialog', { name: 'לשלוח את ההודעה לכל המשתמשים?' })
    await user.click(within(dialog).getByRole('button', { name: 'שלח לכל המשתמשים' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(JSON.parse(writes()[0].body)).toEqual({ recipientId: null, subject: 'עדכון', message: 'לכולם', sendToAll: true })
    expect(await screen.findByText('ההודעה נשלחה ל-2 משתמשים')).toBeInTheDocument()
  })
})

describe('הודעות — הרשאות ושגיאות', () => {
  test('בלי הרשאה לתזכורות (מנהל תוספים): אין לשונית, ו-?view=reminders — "אין לך הרשאה", בלי בקשות', () => {
    renderAt('/library/admin/messages?view=reminders', { canRemind: false })
    expect(screen.queryByRole('link', { name: 'תזכורות' })).toBeNull()
    expect(screen.getByText('אין לך הרשאה לתזכורות')).toBeInTheDocument()
    expect(screen.getByText('פניות של משתמשים לצוות, והודעות שהצוות שלח.')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  test('טעינה בשרת שנכשלה — "לא הצלחנו לטעון" ו"נסה שוב" טוען מחדש', async () => {
    renderAt('/library/admin/messages', { initialMessages: [], initialError: true })
    expect(screen.getByText('לא הצלחנו לטעון את ההודעות')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'נסה שוב' }))
    await waitFor(() => expect(openButtons()).toHaveLength(3))
  })

  test('שיחה שלא קיימת בכתובת — הודעה, והכתובת מתנקה', async () => {
    renderAt('/library/admin/messages?message=nope')
    expect(await screen.findByText('השיחה לא נמצאה. ייתכן שנמחקה.')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(''))
  })
})

describe('הודעות — ממצאי הסקירה', () => {
  test('שיחה שהצוות פתח והמשתמש ענה: השם בכותרת — המשתמש, ו"השב ל…" — מי שבאמת יקבל', async () => {
    renderAt('/library/admin/messages?message=m3')
    const drawer = await screen.findByRole('dialog', { name: 'העמודים שתפסת' })
    expect(drawer).toHaveTextContent('שיחה עם יוסי')
    expect(drawer).toHaveTextContent('הצוות פתח את השיחה, מאת מנהל')
    expect(within(drawer).getByLabelText('השב ליוסי')).toBeInTheDocument()
  })

  test('פנייה של מנהל OCR שלא נקראה — בנכנסות עם "חדש", והמונה בלשונית כולל אותה', () => {
    const ocr = { id: 'o1', subject: 'בקשה', content: 'עזרה', status: 'unread', allowReplies: true, senderName: 'אורי', senderEmail: 'ori@example.com', senderId: 'u-ori', senderRole: 'admin_ocr', recipientName: null, recipientEmail: null, recipientId: null, createdAt: ago(0.5), replies: [] }
    renderAt('/library/admin/messages', { initialMessages: [...MESSAGES, ocr] })
    const rows = within(screen.getByRole('list', { name: 'שיחות' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('אורי')
    expect(within(rows[0]).getByText('חדש')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'נכנסות, 3 חדשות' })).toBeInTheDocument()
  })

  test('"סמן כנקרא" גלוי בשורה חדשה; רענון באמצע ההמתנה לא מחזיר את "חדש"', async () => {
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'סמן כנקרא: "בעיה בשמירה" עם משה כהן' }))
    expect(screen.getByRole('link', { name: 'נכנסות, אחת חדשה' })).toBeInTheDocument()
    // רענון (השרת עוד מחזיר "לא נקראה")
    await user.click(screen.getByRole('button', { name: 'רענן את ההודעות' }))
    await screen.findByText('ההודעות עודכנו')
    expect(screen.getByRole('link', { name: 'נכנסות, אחת חדשה' })).toBeInTheDocument()
    const row = screen.getByRole('button', { name: /פתח את השיחה "בעיה בשמירה"/ }).closest('li')
    expect(within(row).queryByText('חדש')).toBeNull()
  })

  test('חיפוש: נשמר במעבר בין לשוניות, ו"נמצאו גם בנשלחו" כשאין כאן', async () => {
    renderAt(`/library/admin/messages?q=${encodeURIComponent('רחל')}`)
    expect(screen.getByText('לא נמצאו שיחות')).toBeInTheDocument()
    expect(screen.getByText(/נמצאה גם אחת בנשלחו/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'נשלחו' }).getAttribute('href')).toContain('q=')
    await userEvent.setup().click(screen.getByRole('button', { name: 'הצג בנשלחו' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'נשלחו' })).toHaveAttribute('aria-current', 'page'))
    expect(new URLSearchParams(window.location.search).get('q')).toBe('רחל')
    expect(within(screen.getByRole('list', { name: 'הודעות שנשלחו' })).getAllByRole('listitem')).toHaveLength(1)
  })

  test('סגירת המגירה בזמן "שולח…": בלי "לצאת בלי לשמור?"; כשל — הודעה עם "פתח שוב", והטקסט חוזר', async () => {
    let fail
    routes['POST /api/messages/reply'] = () => new Promise((resolve) => { fail = () => resolve(json({ success: false }, { status: 500 })) })
    renderAt('/library/admin/messages')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /פתח את השיחה "בעיה בשמירה"/ }))
    let drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    await user.type(within(drawer).getByLabelText('השב למשה כהן'), 'תשובה חשובה')
    await user.click(within(drawer).getByRole('button', { name: 'שלח תשובה' }))
    await user.click(within(drawer).getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'בעיה בשמירה' })).toBeNull())
    await act(async () => { fail() })
    expect(await screen.findByText(/התשובה למשה כהן לא נשלחה/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'פתח שוב' }))
    drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    expect(within(drawer).getByLabelText('השב למשה כהן')).toHaveValue('תשובה חשובה')
  })

  test('תשובה שנכשלה ב-401 — קישור "התחבר" במגירה, והטקסט נשאר', async () => {
    routes['POST /api/messages/reply'] = () => json({ error: 'x' }, { status: 401 })
    renderAt('/library/admin/messages?message=m1')
    const user = userEvent.setup()
    const drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    await user.type(within(drawer).getByLabelText('השב למשה כהן'), 'טקסט')
    await user.click(within(drawer).getByRole('button', { name: 'שלח תשובה' }))
    expect(await within(drawer).findByRole('link', { name: 'התחבר' })).toHaveAttribute('href', expect.stringContaining('/auth/login'))
    expect(within(drawer).getByLabelText('השב למשה כהן')).toHaveValue('טקסט')
  })

  test('"שלח תשובה" בלי טקסט — אומר מה חסר, בלי בקשה', async () => {
    renderAt('/library/admin/messages?message=m1')
    const drawer = await screen.findByRole('dialog', { name: 'בעיה בשמירה' })
    await userEvent.setup().click(within(drawer).getByRole('button', { name: 'שלח תשובה' }))
    expect(within(drawer).getByText('כתוב תשובה לפני השליחה.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  test('"לכל המשתמשים" אצל מנהל כללי: המספר המדויק כמו בשרת', async () => {
    routes['GET /api/admin/users'] = () => json({ success: true, users: [{ role: 'user' }, { role: 'developer' }, {}, { role: 'admin' }] })
    renderAt('/library/admin/messages', { exactAudience: true })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'הודעה חדשה' }))
    const drawer = await screen.findByRole('dialog', { name: 'הודעה חדשה' })
    await user.click(within(drawer).getByRole('button', { name: /^למי/ }))
    await user.click(await screen.findByRole('option', { name: /כל המשתמשים/ }))
    await user.type(within(drawer).getByLabelText('נושא'), 'עדכון')
    await user.type(within(drawer).getByLabelText('תוכן'), 'לכולם')
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /api/admin/users')).toBe(true))
    await user.click(within(drawer).getByRole('button', { name: 'שלח לכל המשתמשים' }))
    const dialog = await screen.findByRole('dialog', { name: 'לשלוח את ההודעה לכל המשתמשים?' })
    expect(dialog).toHaveTextContent('היא תגיע ל-3 משתמשים')
  })

  test('"לכל המשתמשים" כשאין אף משתמש שאינו מנהל — הסבר, ובלי בקשה', async () => {
    routes['GET /api/admin/users'] = () => json({ success: true, users: [{ role: 'admin' }] })
    renderAt('/library/admin/messages', { exactAudience: true })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'הודעה חדשה' }))
    const drawer = await screen.findByRole('dialog', { name: 'הודעה חדשה' })
    await user.click(within(drawer).getByRole('button', { name: /^למי/ }))
    await user.click(await screen.findByRole('option', { name: /כל המשתמשים/ }))
    await user.type(within(drawer).getByLabelText('נושא'), 'עדכון')
    await user.type(within(drawer).getByLabelText('תוכן'), 'לכולם')
    await within(drawer).findByText(/ההודעה לא תגיע לאף אחד/)
    await user.click(within(drawer).getByRole('button', { name: 'שלח לכל המשתמשים' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('אין למי לשלוח')
    expect(writes()).toHaveLength(0)
  })

  test('בלשונית תזכורות "הודעה חדשה" משני — הפעולה הבולטת של האשף', () => {
    routes['GET /api/library/list'] = () => json({ success: true, books: [] })
    routes['GET /api/admin/users'] = () => json({ success: true, users: [] })
    routes['GET /api/admin/history'] = () => json({ success: true, history: [] })
    renderAt('/library/admin/messages?view=reminders')
    expect(screen.getByRole('button', { name: 'הודעה חדשה' }).className).not.toMatch(/(^|\s)bg-primary(\s|$)/)
    expect(screen.getByRole('link', { name: 'תזכורות' })).toHaveAttribute('aria-current', 'page')
  })

  test('נושא ארוך בלי רווחים: השורה השנייה נחתכת ומכילה את ה-sr-only שבתוכה (relative) — לא מרחיבה את הדף', () => {
    const long = `https://example.com/${'a'.repeat(600)}`
    renderAt('/library/admin/messages', { initialMessages: [{ ...MESSAGES[0], id: 'L1', subject: long }] })
    const line = screen.getByText(long).closest('p')
    expect(line.className).toMatch(/(^|\s)truncate(\s|$)/)
    expect(line.className).toMatch(/(^|\s)relative(\s|$)/)
    expect(line.querySelector('.sr-only')).not.toBeNull()
  })
})
