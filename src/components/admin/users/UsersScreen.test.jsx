// "משתמשים" ומגירת המשתמש מקצה לקצה (fetch מדומה): שורות, סינון מהכתובת, חיפוש, מגירה, שמירת פרטים עם חלון
// שינוי תפקיד (מתוך הסרגל), מתגי צוותים והגבלות עם "בטל" — כל אחד לנקודת הקצה שלו ובאותם שדות כמו קודם —
// התור (בקשה אחת באוויר, נבנית מהשמור העדכני), מחיקה עם הקלדת הדואר, שגיאות, ו"אחורה" עם שינוי שלא נשמר.
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

import UsersScreen from './UsersScreen'

const USERS = [
  { _id: 'u1', name: 'משה כהן', email: 'moshe@example.com', role: 'admin', points: 10, completedPages: 3, inProgressPages: 1, createdAt: '2026-10-01T10:00:00Z', isVerified: true },
  { _id: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: [], points: 1200, completedPages: 40, inProgressPages: 2, isSupervisor: true, dictaEditBlocked: true, dictaEditBlockedReason: 'הצעות לא רציניות', createdAt: '2026-11-01T10:00:00Z', isVerified: true },
  { _id: 'u3', name: 'דוד פרץ', email: 'david@example.com', role: 'admin_books', points: 5, completedPages: 0, isCorrectionsVolunteer: true, createdAt: '2026-09-01T10:00:00Z', isVerified: false },
]

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})
const putOk = (init) => json({ success: true, user: { ...JSON.parse(init.body), _id: JSON.parse(init.body).userId } })

let calls
let routes
beforeEach(() => {
  calls = []
  routes = {
    'GET /api/admin/users': () => json({ success: true, users: USERS }),
    'PUT /api/admin/users': putOk,
    'DELETE /api/admin/users': () => json({ success: true }),
    'POST /api/corrections/admin/volunteers': () => json({ ok: true }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body })
    const handler = routes[key]
    return handler ? handler(init) : json({}, { status: 404 })
  }))
})

function renderAt(url, props = {}) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><UsersScreen initialUsers={USERS} viewerId="u1" {...props} /></ToastProvider>)
}
const writes = () => calls.filter((c) => !c.key.startsWith('GET'))
const bodies = () => writes().map((w) => JSON.parse(w.body))
const row = (name) => screen.getByRole('button', { name: `פתח את ${name}` }).closest('li')
const names = () => screen.getAllByRole('button', { name: /^פתח את / }).map((b) => b.textContent)
const openDrawerOf = async (id, name) => {
  renderAt(`/library/admin/users?user=${id}`)
  return screen.findByRole('dialog', { name })
}
/** בקשה שהתשובה שלה מחכה עד שמשחררים אותה */
const held = () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  return { gate, release: () => release() }
}

describe('משתמשים — רשימה', () => {
  test('שורה: שם, דואר, תפקיד (משתמש רגיל — בלי תג), צוותים והגבלות, מונים; בלי "ספרי דיקטה"', () => {
    renderAt('/library/admin/users')
    expect(screen.getByRole('heading', { level: 1, name: 'משתמשים' })).toBeInTheDocument()
    const r = row('אברהם לוי')
    expect(within(r).getByText('avi@example.com')).toBeInTheDocument()
    // "משתמש" רק לקורא המסך, לא כתג
    expect(within(r).getAllByText('משתמש').every((el) => el.className.includes('sr-only'))).toBe(true)
    expect(within(row('דוד פרץ')).getAllByText('מנהל ספרים').length).toBeGreaterThan(0)
    expect(within(r).getAllByText('מפקח').length).toBeGreaterThan(0)
    expect(within(r).getAllByText('חסום מעריכה').length).toBeGreaterThan(0)
    expect(within(r).getByText(/1,200 נקודות · 40 עמודים הושלמו/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/דיקטה/)
    // ברירת המחדל: הצטרפו לאחרונה קודם
    expect(names()).toEqual(['אברהם לוי', 'משה כהן', 'דוד פרץ'])
    expect(calls).toHaveLength(0)
  })

  test('מספר התוצאות מוכרז (role=status)', () => {
    renderAt('/library/admin/users')
    expect(screen.getAllByRole('status').some((el) => el.textContent === '3 משתמשים')).toBe(true)
  })

  test('סינון מהכתובת: תפקיד', () => {
    renderAt('/library/admin/users?role=admin_books')
    expect(names()).toEqual(['דוד פרץ'])
  })

  test('סינון מהכתובת: צוות', () => {
    renderAt('/library/admin/users?team=supervisor')
    expect(names()).toEqual(['אברהם לוי'])
  })

  test('חיפוש לפי דואר מהכתובת', () => {
    renderAt('/library/admin/users?q=DAVID')
    expect(names()).toEqual(['דוד פרץ'])
  })

  test('אין התאמה — "לא נמצאו משתמשים" ו"נקה סינון"', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users?q=zzz')
    expect(screen.getByText('לא נמצאו משתמשים')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'נקה סינון' }).at(-1))
    expect(names()).toHaveLength(3)
  })

  test('כשל בטעינה בשרת — שגיאה ו"נסה שוב" (לא רשימה ריקה)', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users', { initialUsers: [], initialError: true })
    expect(screen.getByText('לא הצלחנו לטעון את רשימת המשתמשים')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /נסה שוב/ }))
    await screen.findByRole('button', { name: 'פתח את משה כהן' })
    expect(calls.map((c) => c.key)).toEqual(['GET /api/admin/users'])
  })

  test('קישור למשתמש שלא קיים — הודעה אחת, והכתובת מתנקה', async () => {
    renderAt('/library/admin/users?user=000000000000000000000000')
    await waitFor(() => expect(window.location.search).toBe(''))
    expect(screen.getAllByText('המשתמש לא נמצא ברשימה. ייתכן שנמחק.')).toHaveLength(1)
  })

  test('⋮: שלח הודעה, חסום מעריכה, ובסוף "מחק לצמיתות"; את עצמך אי אפשר למחוק', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users')
    await user.click(within(row('משה כהן')).getByRole('button', { name: /פעולות נוספות/ }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent.replace(/^[a-z_]+/, ''))).toEqual(['שלח הודעה', 'חסום מעריכה', 'מחק לצמיתות (החשבון שלך)'])
    expect(items[2]).toHaveAttribute('aria-disabled', 'true')
  })

  test('מחיקה: רק אחרי הקלדת הדואר; כמה עמודים יחזרו; אותו גוף כמו קודם; הפוקוס לשורה הבאה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users')
    await user.click(within(row('אברהם לוי')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: /למחוק לצמיתות את אברהם לוי/ })
    expect(within(dialog).getByText('40 עמודים שהושלמו ועוד 2 עמודים בעבודה יחזרו להיות פנויים.')).toBeInTheDocument()
    expect(within(dialog).getByText(/ההתקדמות של הספרים/)).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'מחק לצמיתות' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/הקלד את כתובת הדואר/), 'AVI@example.com')
    expect(confirm).toBeEnabled()
    routes['GET /api/admin/users'] = () => json({ success: true, users: USERS.filter((u) => u._id !== 'u2') })
    await user.click(confirm)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'פתח את אברהם לוי' })).toBeNull())
    expect(writes()).toEqual([{ key: 'DELETE /api/admin/users', body: '{"userId":"u2"}' }])
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'פתח את משה כהן' })))
  })
})

describe('מגירת משתמש', () => {
  test('נפתחת מהשורה ובכתובת; פרטים, תפקיד, צוותים, הגבלות, פעילות, ומחיקה אחרונה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users')
    await user.click(screen.getByRole('button', { name: 'פתח את דוד פרץ' }))
    const drawer = await screen.findByRole('dialog', { name: 'דוד פרץ' })
    expect(window.location.search).toBe('?user=u3')
    expect(within(drawer).getByText('לא אומת')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('שם')).toHaveValue('דוד פרץ')
    expect(within(drawer).getByRole('heading', { name: 'צוותים' })).toBeInTheDocument()
    expect(within(drawer).getByRole('heading', { name: 'הגבלות' })).toBeInTheDocument()
    expect(within(drawer).getByRole('switch', { name: /מתנדב תיקונים/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(drawer).getByRole('switch', { name: /מפקח/ })).toHaveAttribute('aria-checked', 'false')
    expect(within(drawer).getByRole('switch', { name: /חסום מעריכה/ })).toHaveAccessibleDescription(/מרחב עריכת הספרים/)
    const actions = within(drawer).getAllByRole('button').filter((b) => /שלח הודעה|מחק לצמיתות/.test(b.textContent))
    expect(actions.map((b) => b.textContent.replace(/^[a-z_]+/, ''))).toEqual(['שלח הודעה', 'מחק לצמיתות'])
    expect(within(drawer).getByRole('button', { name: 'שמור' })).toBeDisabled()
  })

  test('החשבון שלך: "מחק לצמיתות" מושבת אבל בר-פוקוס, וההסבר בשם', async () => {
    const drawer = await openDrawerOf('u1', 'משה כהן')
    const del = within(drawer).getByRole('button', { name: /מחק לצמיתות \(אי אפשר למחוק את החשבון שלך\)/ })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    expect(del).not.toBeDisabled()
    expect(within(drawer).getByText('החשבון שלך')).toBeInTheDocument()
  })

  test('שינוי תפקיד: הסבר בבורר, חלון שאומר מה יראה ומתי, PUT באותם שדות, והודעה שהתפקיד שונה', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    const roles = within(drawer).getByRole('group', { name: 'תפקידים' })
    expect(within(roles).getByRole('checkbox', { name: 'מנהל ספרים בלבד' })).toHaveAccessibleDescription(/רשימת הספרים בלבד/)
    expect(within(roles).getAllByRole('checkbox').filter((c) => c.checked)).toHaveLength(0)
    await user.click(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' }))
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    const confirm = await screen.findByRole('dialog', { name: 'לשנות את התפקיד למנהל ספרים?' })
    expect(within(confirm).getByText(/ספרים: ספרים, העלאות/)).toBeInTheDocument()
    expect(within(confirm).getByText(/כשהוא יתחבר מחדש/)).toBeInTheDocument()
    expect(within(confirm).queryByText(/משתמשים/)).toBeNull()
    expect(writes()).toHaveLength(0)
    await user.click(within(confirm).getByRole('button', { name: 'שנה תפקיד' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    // בלי dictaEditBlocked — שליחתו הייתה כותבת מחדש את סיבת החסימה
    expect(bodies()[0]).toEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: ['admin_books'], points: 1200 })
    expect(writes()[0].key).toBe('PUT /api/admin/users')
    expect(await screen.findByText('התפקיד של אברהם לוי שונה למנהל ספרים')).toBeInTheDocument()
    await waitFor(() => expect(within(row('אברהם לוי')).getAllByText('מנהל ספרים').length).toBeGreaterThan(0))
  })

  test('כמה תפקידים: מנהל ספרים + מנהל OCR — חלון עם האיחוד, PUT עם שניהם, ובשורה תג ראשי ו-"+1"', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    const roles = within(drawer).getByRole('group', { name: 'תפקידים' })
    await user.click(within(roles).getByRole('checkbox', { name: 'מנהל OCR' }))
    await user.click(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' }))
    expect(within(roles).getByRole('checkbox', { name: 'מנהל OCR' })).toBeChecked()
    expect(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' })).toBeChecked()
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    const confirm = await screen.findByRole('dialog', { name: 'לשנות את התפקידים למנהל ספרים ומנהל OCR?' })
    expect(within(confirm).getByText(/ספרים: ספרים, העלאות/)).toBeInTheDocument()
    expect(within(confirm).getByText(/תמלול שורות/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'שנה תפקידים' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(bodies()[0]).toEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: ['admin_books', 'admin_ocr'], points: 1200 })
    expect(await screen.findByText('התפקידים של אברהם לוי שונו למנהל ספרים ומנהל OCR')).toBeInTheDocument()
    await waitFor(() => expect(within(row('אברהם לוי')).getAllByText('מנהל ספרים').length).toBeGreaterThan(0))
    expect(within(row('אברהם לוי')).getAllByText('מנהל OCR').length).toBeGreaterThan(0) // ה-"+1" לקורא המסך
  })

  test('משתמש שכבר יש לו כמה תפקידים: מסומנים כולם במגירה, ומסונן תחת כל אחד', async () => {
    const multi = USERS.map((u) => (u._id === 'u3' ? { ...u, role: 'admin_books', roles: ['admin_books', 'admin_ocr'] } : u))
    renderAt('/library/admin/users?role=admin_ocr&user=u3', { initialUsers: multi })
    const drawer = await screen.findByRole('dialog', { name: 'דוד פרץ' })
    const roles = within(drawer).getByRole('group', { name: 'תפקידים' })
    expect(within(roles).getAllByRole('checkbox').filter((c) => c.checked)).toHaveLength(2)
    expect(within(roles).getByRole('checkbox', { name: 'מנהל OCR' })).toBeChecked()
    expect(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' })).toBeChecked()
    expect(within(drawer).getByRole('button', { name: 'שמור' })).toBeDisabled()
    expect(row('דוד פרץ')).toBeTruthy()
  })

  test('מנהל שמוריד את עצמו: גוף שני, מה ייעלם, ואזהרה', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u1', 'משה כהן')
    const roles = within(drawer).getByRole('group', { name: 'תפקידים' })
    // מנהל כללי מסומן — שאר התפקידים כלולים בו (כבויים) עד שמבטלים אותו
    expect(within(roles).getByRole('checkbox', { name: 'מנהל כללי' })).toBeChecked()
    expect(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' })).toBeDisabled()
    await user.click(within(roles).getByRole('checkbox', { name: 'מנהל כללי' }))
    await user.click(within(roles).getByRole('checkbox', { name: 'מנהל ספרים' }))
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    const confirm = await screen.findByRole('dialog', { name: /לשנות את התפקיד/ })
    expect(within(confirm).getByText('אתה תהיה מנהל ספרים. בניהול תראה:')).toBeInTheDocument()
    expect(within(confirm).getByText(/^לא תראה יותר: .*משתמשים/)).toBeInTheDocument()
    expect(within(confirm).getByText(/זה החשבון שלך/)).toBeInTheDocument()
  })

  test('ביטול בחלון התפקיד — שום בקשה', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    await user.click(within(within(drawer).getByRole('group', { name: 'תפקידים' })).getByRole('checkbox', { name: 'מנהל כללי' }))
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await user.click(within(await screen.findByRole('dialog', { name: /לשנות את התפקיד/ })).getByRole('button', { name: 'ביטול' }))
    expect(writes()).toHaveLength(0)
  })

  test('שגיאת שדה: דואר לא תקין — בלי בקשה', async () => {
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    const email = within(drawer).getByLabelText('כתובת דואר')
    await user.clear(email)
    await user.type(email, 'bad')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    expect(await within(drawer).findByText('כתובת הדואר לא תקינה.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  test('נקודות ענקיות ישנות לא חוסמות שינוי שם; השמור נשלח כמו שהוא', async () => {
    const user = userEvent.setup()
    const big = USERS.map((u) => (u._id === 'u3' ? { ...u, points: 12345678901 } : u))
    renderAt('/library/admin/users?user=u3', { initialUsers: big })
    const drawer = await screen.findByRole('dialog', { name: 'דוד פרץ' })
    const field = within(drawer).getByLabelText('שם')
    await user.clear(field)
    await user.type(field, 'דוד פרץ השני')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(bodies()[0]).toEqual({ userId: 'u3', name: 'דוד פרץ השני', email: 'david@example.com', roles: ['admin_books'], points: 12345678901 })
  })

  test('409 מהשרת — הודעה בעברית בתוך המגירה, והטיוטה נשמרת', async () => {
    routes['PUT /api/admin/users'] = () => json({ success: false, error: 'Email already in use' }, { status: 409 })
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    const email = within(drawer).getByLabelText('כתובת דואר')
    await user.clear(email)
    await user.type(email, 'avi@example.com')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'לשנות את כתובת הדואר?' })).getByRole('button', { name: 'שנה כתובת' }))
    expect(await within(drawer).findByText('כתובת הדואר הזו כבר שייכת למשתמש אחר.')).toBeInTheDocument()
    expect(email).toHaveValue('avi@example.com')
  })

  test('400 כשהדואר לא שונה — לא "דואר לא תקין", אלא ההודעה הכללית', async () => {
    routes['PUT /api/admin/users'] = () => json({ success: false, error: 'Bad' }, { status: 400 })
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.type(within(drawer).getByLabelText('שם'), ' א')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    expect(await within(drawer).findByText('לא הצלחנו לשמור את השינויים.')).toBeInTheDocument()
  })

  test('401 בשמירה — קישור "התחבר" בתוך המגירה', async () => {
    routes['PUT /api/admin/users'] = () => json({}, { status: 401 })
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.type(within(drawer).getByLabelText('שם'), ' א')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    expect(await within(drawer).findByRole('link', { name: 'התחבר' })).toHaveAttribute('href', expect.stringContaining('/auth/login'))
  })

  test('404 בשמירה — המשתמש כבר לא קיים: המגירה נסגרת, השורה יורדת, והודעה מתאימה', async () => {
    routes['PUT /api/admin/users'] = () => json({ success: false, error: 'User not found' }, { status: 404 })
    routes['GET /api/admin/users'] = () => json({ success: true, users: USERS.filter((u) => u._id !== 'u3') })
    const user = userEvent.setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.type(within(drawer).getByLabelText('שם'), ' א')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    expect(await screen.findByText(/המשתמש הזה כבר לא קיים/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /דוד פרץ/ })).toBeNull())
    expect(screen.queryByRole('button', { name: 'פתח את דוד פרץ' })).toBeNull()
  })

  test('"אחורה" עם שינוי שלא נשמר: "הישאר" — הטיוטה נשמרת; "צא בלי לשמור" — המגירה נסגרת', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users')
    await user.click(screen.getByRole('button', { name: 'פתח את דוד פרץ' }))
    const drawer = await screen.findByRole('dialog', { name: 'דוד פרץ' })
    await user.type(within(drawer).getByLabelText('שם'), ' טיוטה')
    act(() => { window.history.back() })
    const ask = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await user.click(within(ask).getByRole('button', { name: 'הישאר' }))
    await waitFor(() => expect(window.location.search).toBe('?user=u3'))
    expect(within(screen.getByRole('dialog', { name: 'דוד פרץ' })).getByLabelText('שם')).toHaveValue('דוד פרץ טיוטה')
    act(() => { window.history.back() })
    await user.click(within(await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })).getByRole('button', { name: 'צא בלי לשמור' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'דוד פרץ' })).toBeNull())
    expect(writes()).toHaveLength(0)
  })
})

describe('מגירת משתמש — צוותים, הגבלות והתור', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })
  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const later = async (ms = 6500) => { await act(async () => { vi.advanceTimersByTime(ms) }) }

  test('מתנדב תיקונים — POST לנקודת הקצה של התיקונים, אחרי כמה שניות', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    const sw = within(drawer).getByRole('switch', { name: /מתנדב תיקונים/ })
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(writes()).toHaveLength(0)
    await later()
    await waitFor(() => expect(writes()).toEqual([{ key: 'POST /api/corrections/admin/volunteers', body: '{"userId":"u3","isCorrectionsVolunteer":false}' }]))
  })

  test('מפקח — PUT עם isSupervisor; חסימה — עם dictaEditBlocked; כל אחד לבד, אחד אחרי השני', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    await user.click(within(drawer).getByRole('switch', { name: /מפקח/ }))
    await user.click(within(drawer).getByRole('switch', { name: /חסום מעריכה/ }))
    await later()
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(bodies()).toContainEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: [], points: 1200, isSupervisor: false })
    expect(bodies()).toContainEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: [], points: 1200, dictaEditBlocked: false })
  })

  test('סגירת הלשונית בזמן ההמתנה — אותה בקשה ב-keepalive, פעם אחת', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    await user.click(within(drawer).getByRole('switch', { name: /מפקח/ }))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    await later()
    expect(writes()).toHaveLength(1)
    expect(bodies()).toEqual([{ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: [], points: 1200, isSupervisor: false }])
    expect(fetch.mock.calls.at(-1)[1].keepalive).toBe(true)
  })

  test('ממתין: סימון ליד המתג, ו"בטל" שם — שום בקשה', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    const sw = within(drawer).getByRole('switch', { name: /מפקח/ })
    await user.click(sw)
    expect(sw).toHaveAccessibleDescription(/יישמר בעוד כמה שניות/)
    await user.click(within(drawer).getByRole('button', { name: 'בטל' }))
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).not.toHaveAccessibleDescription(/יישמר/)
    await later(10000)
    expect(writes()).toHaveLength(0)
  })

  test('"בטל" — לחיצה חוזרת על המתג בזמן ההמתנה: שום בקשה', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    const sw = within(drawer).getByRole('switch', { name: /מפקח/ })
    await user.click(sw)
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await later(10000)
    expect(writes()).toHaveLength(0)
  })

  test('תור: מתג ששולח בזמן ששמירת תפקיד באוויר — יוצא אחריה, עם התפקיד החדש', async () => {
    const gate = held()
    let first = true
    routes['PUT /api/admin/users'] = async (init) => {
      if (first) {
        first = false
        await gate.gate
      }
      return putOk(init)
    }
    const user = setup()
    const drawer = await openDrawerOf('u2', 'אברהם לוי')
    await user.click(within(drawer).getByRole('switch', { name: /מפקח/ }))
    await user.click(within(within(drawer).getByRole('group', { name: 'תפקידים' })).getByRole('checkbox', { name: 'מנהל ספרים' }))
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await user.click(within(await screen.findByRole('dialog', { name: /לשנות את התפקיד/ })).getByRole('button', { name: 'שנה תפקיד' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    await later() // הטיימר של המתג פג בזמן שהשמירה עוד באוויר
    expect(writes()).toHaveLength(1)
    await act(async () => { gate.release() })
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(bodies()[1]).toEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: ['admin_books'], points: 1200, isSupervisor: false })
  })

  test('סגירת המגירה כשמתג ממתין — נשלח מיד', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.click(within(drawer).getByRole('switch', { name: /מפקח/ }))
    expect(writes()).toHaveLength(0)
    await user.click(within(drawer).getByRole('button', { name: 'סגירה' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'דוד פרץ' })).toBeNull())
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(bodies()[0]).toMatchObject({ userId: 'u3', isSupervisor: true })
  })

  test('כשל במתג — המתג חוזר, והודעת שגיאה', async () => {
    routes['PUT /api/admin/users'] = () => json({ success: false }, { status: 500 })
    const user = setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    const sw = within(drawer).getByRole('switch', { name: /מפקח/ })
    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await later()
    expect(await screen.findByText('לא הצלחנו לעדכן את הצוות.')).toBeInTheDocument()
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
  })

  test('מחיקה מהמגירה כשמתג ממתין — המתג מתבטל, רק DELETE יוצא', async () => {
    const user = setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.click(within(drawer).getByRole('switch', { name: /מפקח/ }))
    await user.click(within(drawer).getByRole('button', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: /למחוק לצמיתות/ })
    expect(within(dialog).getByText('אין לו עמודים, כך שהספרים לא יושפעו.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/הקלד את כתובת הדואר/), 'david@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'דוד פרץ' })).toBeNull())
    await later(10000)
    expect(writes().map((w) => w.key)).toEqual(['DELETE /api/admin/users'])
    expect(screen.queryByText('לא הצלחנו לעדכן את הצוות.')).toBeNull()
  })

  test('סגירה בזמן "שומר…" — בלי "לצאת בלי לשמור?"; כשל אחרי הסגירה — הודעה עם "פתח שוב"', async () => {
    const gate = held()
    routes['PUT /api/admin/users'] = async () => {
      await gate.gate
      return json({ success: false }, { status: 500 })
    }
    const user = setup()
    const drawer = await openDrawerOf('u3', 'דוד פרץ')
    await user.type(within(drawer).getByLabelText('שם'), ' א')
    await user.click(within(drawer).getByRole('button', { name: 'שמור' }))
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /שומר/ })).toBeInTheDocument())
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'דוד פרץ' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeNull()
    await act(async () => { gate.release() })
    expect(await screen.findByText(/השינויים של דוד פרץ לא נשמרו/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'פתח שוב' })).toBeInTheDocument()
  })

  test('⋮ בשורה: "חסום מעריכה" עם "בטל" בהודעה — שום בקשה', async () => {
    const user = setup()
    renderAt('/library/admin/users')
    await user.click(within(row('דוד פרץ')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'חסום מעריכה' }))
    expect(await screen.findByText('דוד פרץ ייחסם מעריכה')).toBeInTheDocument()
    expect(within(row('דוד פרץ')).getAllByText('חסום מעריכה').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'בטל' }))
    expect(await screen.findByText('השינוי בוטל')).toBeInTheDocument()
    await later(10000)
    expect(writes()).toHaveLength(0)
  })

  test('⋮ בשורה: "בטל חסימה" — PUT אחרי כמה שניות, בלי לגעת בשאר', async () => {
    const user = setup()
    renderAt('/library/admin/users')
    await user.click(within(row('אברהם לוי')).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'בטל חסימה' }))
    await later()
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(bodies()[0]).toEqual({ userId: 'u2', name: 'אברהם לוי', email: 'avi@example.com', roles: [], points: 1200, dictaEditBlocked: false })
    expect(await screen.findByText('החסימה של אברהם לוי בוטלה')).toBeInTheDocument()
  })
})

describe('משתמשים — פוקוס אחרי מחיקה', () => {
  const removeUser = async (user, name) => {
    const target = USERS.find((u) => u.name === name)
    routes['GET /api/admin/users'] = () => json({ success: true, users: USERS.filter((u) => u._id !== target._id) })
    await user.click(within(row(name)).getByRole('button', { name: /פעולות נוספות/ }))
    await user.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog', { name: new RegExp(`למחוק לצמיתות את ${name}`) })
    await user.type(within(dialog).getByLabelText(/הקלד את כתובת הדואר/), target.email)
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: `פתח את ${name}` })).toBeNull())
  }

  test('משתמש באמצע — הפוקוס ל"פתח" של השורה הבאה', async () => {
    const user = userEvent.setup()
    // צופה שאינו ברשימה — כל השורות ניתנות למחיקה
    renderAt('/library/admin/users', { viewerId: 'u9' })
    const order = names()
    await removeUser(user, order[1])
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: `פתח את ${order[2]}` })))
  })

  test('המשתמש האחרון ברשימה — הפוקוס לשורה שלפניו', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/users', { viewerId: 'u9' })
    const order = names()
    await removeUser(user, order.at(-1))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: `פתח את ${order.at(-2)}` })))
  })

  test('המשתמש היחיד — הפוקוס לרשימה', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/library/admin/users')
    render(<ToastProvider><UsersScreen initialUsers={[USERS[1]]} viewerId="u1" /></ToastProvider>)
    await removeUser(user, 'אברהם לוי')
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('users-list')))
  })
})
