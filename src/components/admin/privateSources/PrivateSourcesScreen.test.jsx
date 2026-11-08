import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import PrivateSourcesScreen from './PrivateSourcesScreen'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: 'דוד' } } }) }))

const ok = (body, status = 200) => ({
  ok: status < 400, status, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body,
})
// מה ש-fetch רגיל היה מקבל אחרי הפניה לדף ההתחברות: 200 עם HTML
const loginPage = () => ({
  ok: true, status: 200, type: 'basic', redirected: true, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new SyntaxError('<') },
})
// הלשונית נשמרת בכתובת (?tab=) — כל טסט מתחיל מהכתובת הנקייה
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

const SOURCES = {
  success: true,
  items: [
    { kind: 'book', category: 'הלכה', bookTitle: 'ספר א', bookPath: 'MoreBooks/הלכה/א.txt', fileType: 'txt', record: { status: 'ok', ownerName: 'מוסר' } },
    { kind: 'book', category: 'הלכה', bookTitle: 'ספר ב', bookPath: 'MoreBooks/הלכה/ב.txt', fileType: 'txt', record: null },
  ],
  orphans: [{ bookTitle: 'ספר ישן', bookPath: 'MoreBooks/old.txt' }],
  manualSets: { s1: { label: 'סט ידני', bookPaths: ['a', 'b'] } },
  books: [],
  options: { statuses: { ok: { label: 'אושר', color: '#0a0' } }, methods: {}, platforms: {} },
}
const OUTREACH = {
  success: true,
  items: [{ _id: 'o1', contactName: 'ישראל', status: 'open', outreachBy: 'דוד' }],
  statuses: { open: { label: 'פתוחה', color: '#00a' } },
  channels: {},
}

function mockServer(extra = () => null) {
  const calls = []
  vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined, cache: options.cache, redirect: options.redirect })
    const custom = extra(url, options)
    if (custom) return Promise.resolve(custom)
    if (url.startsWith('/api/admin/institute-outreach')) return Promise.resolve(ok(OUTREACH))
    if (url.startsWith('/api/admin/private-sources/config')) return Promise.resolve(ok({ success: true, value: JSON.parse(options.body).value }))
    return Promise.resolve(ok(SOURCES))
  }))
  return calls
}
const renderIt = () => render(<ToastProvider><PrivateSourcesScreen /></ToastProvider>)

describe('מסך מקורות פרטיים', () => {
  it('טוען מקורות ופניות באותן בקשות, לשוניות עם מונה, וסינון בצ\'יפים', async () => {
    const calls = mockServer()
    renderIt()
    expect(await screen.findByRole('button', { name: 'ספר א' })).toBeInTheDocument()
    expect(calls.map((c) => [c.url, c.method, c.cache])).toEqual(expect.arrayContaining([
      ['/api/admin/private-sources', 'GET', 'no-store'],
      ['/api/admin/institute-outreach', 'GET', 'no-store'],
    ]))
    expect(screen.getByRole('heading', { level: 1, name: 'מקורות פרטיים' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /מקורות/ })).toHaveTextContent('1')
    await userEvent.click(screen.getByRole('button', { name: /לא תועדו/ }))
    expect(screen.queryByRole('button', { name: 'ספר א' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ספר ב' })).toBeInTheDocument()
  })

  it('מחיקת רשומה נטושה — דיאלוג אישור ואז DELETE ?path=', async () => {
    const calls = mockServer((url, o) => (o.method === 'DELETE' ? ok({ success: true }) : null))
    renderIt()
    await userEvent.click(await screen.findByRole('button', { name: 'מחק את פרטי המקור של ספר ישן' }))
    const dialog = await screen.findByRole('dialog')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'מחק' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    expect(calls.find((c) => c.method === 'DELETE').url).toBe(`/api/admin/private-sources?path=${encodeURIComponent('MoreBooks/old.txt')}`)
    expect(calls.find((c) => c.method === 'DELETE').redirect).toBe('manual')
    expect(await screen.findByText('פרטי המקור נמחקו')).toBeInTheDocument()
  })

  it('מחיקה באוויר — "מוחק…", ולחיצה נוספת לא פותחת אישור שני ולא שולחת DELETE שני', async () => {
    let resolveDelete
    const calls = mockServer((url, o) => (o.method === 'DELETE' ? new Promise((r) => { resolveDelete = r }) : null))
    renderIt()
    await userEvent.click(await screen.findByRole('button', { name: 'מחק את פרטי המקור של ספר ישן' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'מחק' }))
    const button = await screen.findByRole('button', { name: 'מחק את פרטי המקור של ספר ישן' })
    await waitFor(() => expect(button).toHaveTextContent('מוחק…'))
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(button)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
    await act(async () => resolveDelete(ok({ success: true })))
    expect(await screen.findByText('פרטי המקור נמחקו')).toBeInTheDocument()
  })

  it('מחיקה כשההתחברות פגה — לא "הרשומה נמחקה": הודעה עם "התחבר"', async () => {
    mockServer((url, o) => (o.method === 'DELETE' ? loginPage() : null))
    renderIt()
    await userEvent.click(await screen.findByRole('button', { name: 'מחק את פרטי המקור של ספר ישן' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'מחק' }))
    expect(await screen.findByText(/פג תוקף ההתחברות/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    expect(screen.queryByText('פרטי המקור נמחקו')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מחק את פרטי המקור של ספר ישן' })).toBeInTheDocument()
  })

  it('טעינה כשההתחברות פגה — "פג תוקף ההתחברות" עם "התחבר" (מקורות ופניות)', async () => {
    mockServer(() => loginPage())
    renderIt()
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /פניות/ }))
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /הגדרות/ }))
    expect(screen.getAllByRole('link', { name: 'התחבר' }).length).toBeGreaterThan(1)
  })

  it('הגדרות: טעינה שנכשלה — "נסה שוב" טוען שוב (לא "רענן את הדף")', async () => {
    let failSources = true
    mockServer((url) => (url.startsWith('/api/admin/private-sources') && failSources ? ok({ error: 'Internal Server Error' }, 500) : null))
    renderIt()
    await userEvent.click(await screen.findByRole('tab', { name: /הגדרות/ }))
    expect(screen.queryByText(/לרענן את הדף/)).not.toBeInTheDocument()
    const retry = await screen.findByRole('button', { name: 'נסה שוב לטעון את סטים' })
    failSources = false
    await userEvent.click(retry)
    expect(await screen.findByText('סט ידני')).toBeInTheDocument()
  })

  it('"סנכרן עם GitHub" מ-⋮ — GET ?refresh=1', async () => {
    const calls = mockServer()
    renderIt()
    await screen.findByRole('button', { name: 'ספר א' })
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'סנכרן עם GitHub' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/admin/private-sources?refresh=1')).toBe(true))
    expect(await screen.findByText('הרשימה סונכרנה עם GitHub')).toBeInTheDocument()
  })

  it('סנכרון: "מסנכרן עם GitHub…" בזמן הריצה; כישלון — טוסט, והרשימה והאזהרה הקודמת נשארות', async () => {
    let resolveSync
    mockServer((url) => {
      if (url === '/api/admin/private-sources?refresh=1') return new Promise((r) => { resolveSync = r })
      if (url === '/api/admin/private-sources') return ok({ ...SOURCES, githubError: true, githubErrorMessage: 'GitHub לא ענה' })
      return null
    })
    renderIt()
    await screen.findByRole('button', { name: 'ספר א' })
    expect(screen.getByText('GitHub לא ענה')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'סנכרן עם GitHub' }))
    expect(await screen.findByText('מסנכרן עם GitHub…')).toBeInTheDocument()
    await act(async () => resolveSync(ok({ error: 'Internal Server Error' }, 500)))
    expect(await screen.findByText('הסנכרון עם GitHub נכשל. נסה שוב.')).toBeInTheDocument()
    expect(screen.queryByText('מסנכרן עם GitHub…')).not.toBeInTheDocument()
    expect(screen.getByText('GitHub לא ענה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ספר א' })).toBeInTheDocument()
  })

  it('פניות: "פנייה חדשה" בכותרת, ושמירה באותו גוף כמו קודם', async () => {
    const calls = mockServer((url, o) => (url === '/api/admin/institute-outreach' && o.method === 'POST'
      ? ok({ success: true, record: { _id: 'o2', contactName: '', status: 'open' } }) : null))
    renderIt()
    await userEvent.click(await screen.findByRole('tab', { name: /פניות/ }))
    expect(await screen.findByRole('button', { name: 'ישראל' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'פנייה חדשה' }))
    await userEvent.click(await screen.findByRole('button', { name: /^save\s*שמור$|^שמור$/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')
    expect(post.url).toBe('/api/admin/institute-outreach')
    expect(post.body).toMatchObject({ outreachBy: 'דוד', confirmDuplicate: false })
    expect(post.redirect).toBe('manual')
    expect(await screen.findByText('הפנייה נשמרה')).toBeInTheDocument()
  })

  it('פניות: 409 עם כפילות חוזר לחלון (לא שגיאה); שגיאת שמירה — החלון נשאר פתוח עם הודעה בעברית', async () => {
    let n = 0
    mockServer((url, o) => {
      if (url !== '/api/admin/institute-outreach' || o.method !== 'POST') return null
      n += 1
      return n === 1
        ? ok({ duplicate: true, error: 'כפילות', duplicates: [{ _id: 'o1', contactName: 'ישראל', status: 'open' }] }, 409)
        : ok({ error: 'Internal Server Error' }, 500)
    })
    renderIt()
    await userEvent.click(await screen.findByRole('tab', { name: /פניות/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'פנייה חדשה' }))
    await userEvent.click(await screen.findByRole('button', { name: /^save\s*שמור$|^שמור$/ }))
    await waitFor(() => expect(n).toBe(1))
    expect(screen.queryByText('הפנייה נשמרה')).not.toBeInTheDocument()
    expect(screen.queryByText(/הפעולה נכשלה|לא הצלחנו לשמור/)).not.toBeInTheDocument()
    const save = await screen.findByRole('button', { name: /שמור/ })
    await userEvent.click(save)
    expect(await screen.findByText('לא הצלחנו לשמור את הפנייה.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /שמור/ })).toBeInTheDocument()
  })

  it('הגדרות: חמש רשימות; עריכת מצבי פניות שומרת במפתח של הפניות', async () => {
    const calls = mockServer()
    renderIt()
    await userEvent.click(await screen.findByRole('tab', { name: /הגדרות/ }))
    for (const name of ['סטים', 'מצבי מקור', 'אופני אישור', 'פלטפורמות', 'מצבי פניות']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText('סט ידני')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'ערוך את מצבי פניות' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'ערוך את מצבי פניות' }))
    await userEvent.click(await screen.findByRole('button', { name: /שמור שינויים/ }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/admin/private-sources/config')).toBe(true))
    const post = calls.find((c) => c.url === '/api/admin/private-sources/config')
    expect(post.method).toBe('POST')
    expect(post.body).toEqual({ key: 'institute_outreach_statuses', value: OUTREACH.statuses })
    expect(post.redirect).toBe('manual')
  })

  it('הגדרות: "שמור שינויים" — "שומר…" עד התשובה, ולחיצה נוספת לא שולחת שוב', async () => {
    let resolveSave
    const calls = mockServer((url) => (url === '/api/admin/private-sources/config' ? new Promise((r) => { resolveSave = r }) : null))
    renderIt()
    await userEvent.click(await screen.findByRole('tab', { name: /הגדרות/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'ערוך את מצבי מקור' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'ערוך את מצבי מקור' }))
    await userEvent.click(await screen.findByRole('button', { name: /שמור שינויים/ }))
    const saving = await screen.findByRole('button', { name: /שומר…/ })
    expect(saving).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(saving)
    expect(calls.filter((c) => c.url === '/api/admin/private-sources/config')).toHaveLength(1)
    expect(calls.find((c) => c.url === '/api/admin/private-sources/config').body).toEqual({ key: 'private_source_statuses', value: SOURCES.options.statuses })
    await act(async () => resolveSave(ok({ success: true, value: SOURCES.options.statuses })))
    expect(await screen.findByText('מצבי מקור: השינויים נשמרו')).toBeInTheDocument()
  })
})
