// "תזכורות" מקצה לקצה (fetch מדומה): שלוש הטעינות, האשף בשלושה שלבים, בחירת עורכים, אזהרת הכפילות, והבקשה
// ל-send-email — אותה כתובת, אותה שיטה ואותו גוף כמו במסך הקודם (admin/reminders/page.jsx).
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { generateEmailHtml } from '@/lib/adminMessagesScreen/reminderUtils'
import { DEFAULT_REMINDER_MESSAGE } from '@/lib/adminMessagesScreen/reminderWizard'
import RemindersView from './RemindersView'

const BOOKS = [
  { id: 'b1', path: 'mesilat', name: 'מסילת ישרים', category: 'מוסר', inProgressPages: 3, completedPages: 0, totalPages: 12 },
  // יש עמודים בעבודה, אבל מי שעובד עליהם לא מאשר תזכורות
  { id: 'b2', path: 'empty', name: 'ספר בלי עורכים', category: 'כללי', inProgressPages: 1, completedPages: 0, totalPages: 8 },
  // לא הושלם, אבל אין בו עמוד בעבודה — תמיד "אין למי לשלוח", ולכן לא מוצג
  { id: 'b4', path: 'idle', name: 'ספר בלי עבודה', inProgressPages: 0, completedPages: 2, totalPages: 9 },
  { id: 'b3', path: 'done', name: 'ספר גמור', inProgressPages: 0, completedPages: 4, totalPages: 4 },
]
const USERS = [
  { _id: 'u1', name: 'רחל', email: 'rachel@example.com', acceptReminders: true, isVerified: true },
  { _id: 'u2', name: 'שרה', email: 'sara@example.com', acceptReminders: true, isVerified: true },
  { _id: 'u3', name: 'לא מאשר', email: 'no@example.com', acceptReminders: false, isVerified: true },
]
const PAGES = [
  { pageNumber: 1, status: 'in-progress', claimedById: 'u1' },
  { pageNumber: 2, status: 'in-progress', claimedById: 'u2' },
  { pageNumber: 3, status: 'in-progress', claimedById: 'u3' },
  { pageNumber: 4, status: 'completed', claimedById: 'u1' },
]
const HISTORY = [{ id: 'h1', adminName: 'מנהל', bookName: 'מסילת ישרים', timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(), recipientCount: 2, isPartial: false }]

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
    'GET /api/library/list': () => json({ success: true, books: BOOKS }),
    'GET /api/admin/users': () => json({ success: true, users: USERS }),
    'GET /api/admin/history': () => json({ success: true, history: HISTORY }),
    'GET /api/book/mesilat': () => json({ success: true, pages: PAGES }),
    'GET /api/book/empty': () => json({ success: true, pages: [{ pageNumber: 1, status: 'in-progress', claimedById: 'u3' }] }),
    'POST /api/admin/send-email': () => json({ success: true, details: { successful: 1, failed: 0, filteredOut: 0 } }),
    'DELETE /api/admin/history?id=h1': () => json({ success: true, id: 'h1' }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})

function Harness() {
  const toast = useToast()
  const [confirm, element] = useConfirm()
  return <>{<RemindersView confirm={confirm} toast={toast} />}{element}</>
}
const renderView = () => render(<ToastProvider><Harness /></ToastProvider>)
const writes = () => calls.filter((c) => !c.key.startsWith('GET'))

async function chooseBook(user, name) {
  await waitFor(() => expect(screen.getByRole('button', { name: /^על איזה ספר/ })).not.toBeDisabled())
  await user.click(screen.getByRole('button', { name: /^על איזה ספר/ }))
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }))
}

describe('תזכורות', () => {
  test('השלב הראשון: רק ספרים בעבודה; "הבא" סגור עד שבוחרים; ההיסטוריה', async () => {
    renderView()
    const user = userEvent.setup()
    expect(screen.getByRole('list', { name: 'שלבי שליחת תזכורת' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הבא' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: /^על איזה ספר/ })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /^על איזה ספר/ }))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('מסילת ישרים'), expect.stringContaining('ספר בלי עורכים')])
    const history = screen.getByRole('region', { name: 'תזכורות שנשלחו' })
    expect(within(history).getByText('מסילת ישרים')).toBeInTheDocument()
  })

  test('מקצה לקצה: נמענים (רק מי שמאשר), בחירה, אזהרת כפילות, ואותו גוף בדיוק כמו קודם', async () => {
    renderView()
    const user = userEvent.setup()
    await chooseBook(user, 'מסילת ישרים')
    // כמה עורכים — כבר בשלב הראשון, כמו במסך הקודם
    expect(await screen.findByText('2 עורכים עובדים על הספר ומאשרים תזכורות.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    expect(await screen.findByText(/נמצאו 2 עורכים/)).toBeInTheDocument()
    const chosen = screen.getByRole('list', { name: 'הנמענים שנבחרו' })
    expect(within(chosen).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['רחל', 'שרה'])

    await user.click(screen.getByRole('button', { name: 'בחר עורכים' }))
    const picker = await screen.findByRole('dialog', { name: 'בחר עורכים' })
    await user.click(within(picker).getByRole('checkbox', { name: /שרה/ }))
    await user.click(within(picker).getByRole('button', { name: 'אישור (1)' }))
    expect(screen.getByText(/נבחרו 1\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'הבא' }))
    expect(screen.getByLabelText('תוכן התזכורת')).toHaveValue(DEFAULT_REMINDER_MESSAGE)
    expect(screen.getByText('התזכורת נשלחת בדואר בלבד, ולא מופיעה באתר.')).toBeInTheDocument()
    expect(screen.getByText('נושא המייל: הודעת מערכת בנוגע לספר "מסילת ישרים"')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'שלח תזכורת לעורך אחד' }))

    // התזכורת האחרונה הייתה על אותו ספר
    const dup = await screen.findByRole('dialog', { name: 'לשלוח שוב תזכורת על הספר הזה?' })
    expect(writes()).toHaveLength(0)
    await user.click(within(dup).getByRole('button', { name: 'שלח שוב' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('POST /api/admin/send-email')
    expect(JSON.parse(writes()[0].body)).toEqual({
      bcc: ['rachel@example.com'],
      subject: 'הודעת מערכת בנוגע לספר "מסילת ישרים"',
      html: generateEmailHtml('מסילת ישרים', DEFAULT_REMINDER_MESSAGE),
      text: DEFAULT_REMINDER_MESSAGE,
      bookName: 'מסילת ישרים',
      bookPath: 'mesilat',
      isPartial: true,
    })
    expect(await screen.findByText('התזכורת נשלחה')).toBeInTheDocument()
    // כל השלבים הושלמו — אין "השלב הנוכחי"
    const steps = within(screen.getByRole('list', { name: 'שלבי שליחת תזכורת' })).getAllByRole('listitem')
    expect(steps.some((li) => li.hasAttribute('aria-current'))).toBe(false)
    // ההיסטוריה נטענת שוב מהשרת
    await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/admin/history')).toHaveLength(2))
  })

  test('ספר שאין בו עורכים — "אין למי לשלוח", ו"הבא" סגור', async () => {
    renderView()
    const user = userEvent.setup()
    await chooseBook(user, 'ספר בלי עורכים')
    expect(await screen.findByText(/אין למי לשלוח\.$/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    expect(await screen.findByText('אין למי לשלוח')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הבא' })).toBeDisabled()
  })

  test('שליחה שנכשלה — ההודעה בעברית, והטקסט נשמר', async () => {
    routes['GET /api/admin/history'] = () => json({ success: true, history: [] })
    routes['POST /api/admin/send-email'] = () => json({ success: false, error: 'כל שליחות המיילים נכשלו. בדוק את הגדרות ה-SMTP בשרת.' }, { status: 500 })
    renderView()
    const user = userEvent.setup()
    await chooseBook(user, 'מסילת ישרים')
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    await screen.findByText(/נמצאו 2 עורכים/)
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    await user.click(screen.getByRole('button', { name: 'שלח תזכורת ל-2 עורכים' }))
    expect(await screen.findByText('התזכורת לא נשלחה')).toBeInTheDocument()
    expect(screen.getByText(/בדוק את הגדרות ה-SMTP/)).toBeInTheDocument()
    expect(screen.getByLabelText('תוכן התזכורת')).toHaveValue(DEFAULT_REMINDER_MESSAGE)
  })

  test('הסרה מההיסטוריה: חלון אישור, ואז DELETE באותה כתובת כמו קודם', async () => {
    renderView()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'פעולות נוספות: מסילת ישרים' }))
    await user.click(await screen.findByRole('menuitem', { name: 'הסר מההיסטוריה' }))
    const dialog = await screen.findByRole('dialog', { name: 'להסיר את הרשומה מההיסטוריה?' })
    await user.click(within(dialog).getByRole('button', { name: 'הסר' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'DELETE /api/admin/history?id=h1', body: undefined })
  })

  test('טעינת הספרים נכשלה — הודעה ו"נסה שוב"', async () => {
    routes['GET /api/library/list'] = () => json({ success: false }, { status: 500 })
    renderView()
    expect(await screen.findByText('לא הצלחנו לטעון את רשימת הספרים.')).toBeInTheDocument()
    routes['GET /api/library/list'] = () => json({ success: true, books: BOOKS })
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'נסה שוב' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /^על איזה ספר/ })).not.toBeDisabled())
  })

  test('שליחה בלי תשובה מהשרת (504) — "ייתכן שיצאה", ההיסטוריה נטענת שוב, ו"שלח" חוזר עובר דרך אישור', async () => {
    routes['GET /api/admin/history'] = () => json({ success: true, history: [] })
    routes['POST /api/admin/send-email'] = () => json({ success: false }, { status: 504 })
    renderView()
    const user = userEvent.setup()
    await chooseBook(user, 'מסילת ישרים')
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    await screen.findByText(/נמצאו 2 עורכים/)
    await user.click(screen.getByRole('button', { name: 'הבא' }))
    await user.click(screen.getByRole('button', { name: 'שלח תזכורת ל-2 עורכים' }))
    expect(await screen.findByText('לא ידוע אם התזכורת יצאה')).toBeInTheDocument()
    expect(screen.getByText(/ייתכן שהתזכורת בכל זאת יצאה/)).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/admin/history')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'שלח תזכורת ל-2 עורכים' }))
    const dialog = await screen.findByRole('dialog', { name: 'ייתכן שהתזכורת כבר יצאה' })
    await user.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    expect(writes()).toHaveLength(1)
  })
})
