import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import TzuratScreen from './TzuratScreen'
import ExportCard from './ExportCard'
import GuideEditorCard from './GuideEditorCard'
import UploadsSection from './UploadsSection'

// מסך צורת הדף: כותרת, שמונה לשוניות בשמות לפי המילון עם מונים מ-GET stats, הלשונית בכתובת (# ו-?tab=), "מצב"
// מתוך אותה תשובת stats (בקשה אחת), החבילות (השהה / המשך — אותו PATCH), ההעלאות האחרונות ("נסה שוב"), ההורדות
// (אותן בקשות ושם קובץ) ועורך ההנחיות (אותן בקשות; שינוי לא שמור — שאלה לפני מעבר לשונית).

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/pageProof/guide/GuideBody', () => ({ default: ({ html }) => <div data-testid="guide-body">{html}</div> }))

const wrap = (ui) => render(<ToastProvider>{ui}</ToastProvider>)

const API = '/api/admin/tzurat-hadaf'
const reply = (status, json) => ({ ok: status < 400, status, json: async () => json, blob: async () => new Blob(['{"type":"meta"}\n']) })

const STATS = {
  books: [
    { slug: 'shabbat', masechet: 'שבת', order: 2, pages: 314, pagesOpen: 300, pagesDone: 14, items: 900, itemsOpen: 800, itemsAgreed: 90, itemsDisputed: 10 },
    { slug: 'berakhot', masechet: 'ברכות', order: 1, pages: 125, pagesOpen: 25, pagesDone: 100, items: 400, itemsOpen: 100, itemsAgreed: 280, itemsDisputed: 20 },
  ],
  items: { byStatus: { open: 900, disputed: 30, agreed: 370 }, byKind: { g: 1000, r: 300 } },
  submissions: { byStatus: { submitted: 4, approved: 20 } },
  reports: { byStatus: { new: 3 } },
  volunteers: { total: 42, active7d: 11 },
  uploads: [],
}

function mockServer(extra = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET'
      calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null })
      for (const [k, fn] of Object.entries(extra)) if (`${method} ${url}`.startsWith(k)) return fn(init)
      if (url === `${API}/stats`) return reply(200, STATS)
      if (url === `${API}/batches`) return reply(200, { batches: [{ slug: 'berakhot', masechet: 'ברכות', order: 1, buildId: '5f143e8+v32', pages: 125, items: 400, status: 'active', importedAt: '2026-10-25T21:00:00Z' }] })
      if (url === `${API}/uploads`) return reply(200, { uploads: [{ id: 'u9', name: 'berakhot.zip', size: 300 * 1024 ** 2, status: 'failed', errors: ['images/002a.scan.png חסר'], startedAt: '2026-10-25T21:00:00Z' }] })
      if (url.startsWith(`${API}/batches/`) && method === 'PATCH') return reply(200, { batch: { status: JSON.parse(init.body).status } })
      if (url === `${API}/uploads/u9/retry`) return reply(202, {})
      return reply(404, { error: `לא צפוי ${method} ${url}` })
    })
  )
  return { calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/library/admin/tzurat-hadaf')
})
afterEach(async () => {
  // ההגנה על שינוי שלא נשמר מוסיפה רשומה להיסטוריה ומסירה אותה ב-history.back() (אסינכרוני) כשהמסך מתפרק.
  // מפרקים כאן (לפני הניקוי הכללי), ומחכים שה"אחורה" יסתיים — אחרת הוא נוחת בטסט הבא (hashchange ללשונית אחרת).
  const pending = window.history.state?.__unsavedGuard
  cleanup()
  vi.unstubAllGlobals()
  if (pending || window.history.state?.__unsavedGuard) {
    await new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true })
      setTimeout(resolve, 1000)
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 30))
})

describe('TzuratScreen', () => {
  it('כותרת אחת, שמונה לשוניות בשמות החדשים, ומונים מ-stats', async () => {
    const { calls } = mockServer()
    wrap(<TzuratScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'צורת הדף' })).toBeInTheDocument()
    await screen.findByTestId('overview-books')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual(['overview', 'uploads', 'disputes', 'submissions', 'reports', 'export', 'guide', 'tokens'])
    expect(screen.getByRole('tab', { name: /^מצב/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /מפתחות גישה/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /API/ })).toBeNull()
    expect(screen.getByRole('tab', { name: /מחלוקות/ }).textContent).toContain('30')
    expect(screen.getByRole('tab', { name: /הגשות/ }).textContent).toContain('4')
    expect(screen.getByRole('tab', { name: /דיווחים/ }).textContent).toContain('3')
    // stats נטען פעם אחת — גם בשביל המונים וגם בשביל "מצב"
    expect(calls.filter((c) => c.url === `${API}/stats`)).toHaveLength(1)
  })

  it('"מצב": מסכתות לפי הסדר, פילוח ומתנדבים', async () => {
    mockServer()
    wrap(<TzuratScreen />)
    const books = await screen.findByTestId('overview-books')
    const rows = within(books).getAllByTestId('overview-book')
    expect(rows.map((r) => within(r).getByRole('heading').textContent)).toEqual(['ברכות', 'שבת'])
    expect(rows[0].textContent).toContain('100 מתוך 125 עמודים הושלמו')
    expect(within(rows[0]).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(within(rows[0]).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '125')
    expect(screen.getByTestId('overview-volunteers').textContent).toBe('42 מתנדבים · 11 פעילים בשבוע האחרון')
    expect(screen.getByTestId('overview-counts').textContent).toContain('במחלוקת')
    expect(screen.getByTestId('overview-counts').textContent).toContain('רש"י')
  })

  it('מעבר בין לשוניות — רק הפעילה מוצגת, וה-hash מתעדכן', async () => {
    mockServer()
    wrap(<TzuratScreen />)
    await screen.findByTestId('overview-books')
    fireEvent.click(screen.getByRole('tab', { name: /הורדות/ }))
    expect(await screen.findByTestId('export-card')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-books')).toBeNull()
    expect(window.location.hash).toBe('#export')
    expect(screen.getByRole('tab', { name: /הורדות/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('נפתח בלשונית מה-hash (קישורים מלוח הניהול) ומ-?tab=', async () => {
    mockServer({ [`GET ${API}/tokens`]: () => reply(200, { tokens: [], active: 0, max: 5 }) })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#tokens')
    const { unmount } = wrap(<TzuratScreen />)
    expect(await screen.findByTestId('tokens-card')).toBeInTheDocument()
    unmount()
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf?tab=reports')
    wrap(<TzuratScreen />)
    expect(await screen.findByTestId('reports')).toBeInTheDocument()
  })

  it('⋮: "פתח את עמוד המתנדבים", ובטלפון גם הלשוניות המשניות', async () => {
    mockServer({ [`GET ${API}/guide`]: () => reply(200, { saved: null, default: '<p>א</p>', codes: {} }) })
    wrap(<TzuratScreen />)
    await screen.findByTestId('overview-books')
    const [phone] = screen.getAllByRole('button', { name: 'עוד' })
    await userEvent.click(phone)
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent.replace(/^[a-z_0-9]+/, ''))).toEqual(['חבילות', 'הורדות', 'הנחיות', 'מפתחות גישה', 'פתח את עמוד המתנדבים'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'הנחיות' }))
    expect(await screen.findByTestId('guide-editor')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'פתח את עמוד המתנדבים' }))
    expect(push).toHaveBeenCalledWith('/library/tzurat-hadaf')
  })

  it('הנחיות עם שינוי שלא נשמר — מעבר לשונית שואל; "הישאר" נשאר, "צא" עובר', async () => {
    mockServer({ [`GET ${API}/guide`]: () => reply(200, { saved: null, default: '<p>א</p>', codes: {} }) })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#guide')
    wrap(<TzuratScreen />)
    const area = await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    fireEvent.change(area, { target: { value: '<p>ב</p>' } })
    fireEvent.click(screen.getByRole('tab', { name: /^מצב/ }))
    let dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByTestId('guide-editor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^מצב/ }))
    dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'צא בלי לשמור' }))
    expect(await screen.findByTestId('overview-books')).toBeInTheDocument()
  })

  it('הכרעה מעדכנת את המונה מקומית — בלי GET stats נוסף', async () => {
    const { calls } = mockServer({
      [`GET ${API}/items`]: () => reply(200, { items: [{ id: 'i1', slug: 'berakhot', masechet: 'ברכות', daf: 'ב.', kind: 'g', question: 'replace', status: 'disputed', otz: ['אמר'], print: ['אמרו'] }], total: 1, page: 1, pages: 1 }),
      [`PATCH ${API}/items/i1`]: () => reply(200, { item: { id: 'i1', slug: 'berakhot', masechet: 'ברכות', daf: 'ב.', kind: 'g', question: 'replace', status: 'resolved', otz: ['אמר'], print: ['אמרו'], resolved: { verdict: 'print' } } }),
    })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#disputes')
    wrap(<TzuratScreen />)
    const card = await screen.findByTestId('admin-item')
    await waitFor(() => expect(screen.getByRole('tab', { name: /מחלוקות/ }).textContent).toContain('30'))
    fireEvent.click(within(card).getByRole('button', { name: 'כמו הדפוס' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /מחלוקות/ }).textContent).toContain('29'))
    expect(calls.filter((c) => c.url === `${API}/stats`)).toHaveLength(1)
  })

  it('שינוי ה-# בכתובת עם שינוי שלא נשמר — שואל; "הישאר" מחזיר את ה-#, "צא" עובר', async () => {
    mockServer({ [`GET ${API}/guide`]: () => reply(200, { saved: null, default: '<p>א</p>', codes: {} }) })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#guide')
    wrap(<TzuratScreen />)
    const area = await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    fireEvent.change(area, { target: { value: '<p>ב</p>' } })
    window.history.replaceState(window.history.state, '', '/library/admin/tzurat-hadaf#export')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    let dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByTestId('guide-editor')).toBeInTheDocument()
    expect(window.location.hash).toBe('#guide')
    window.history.replaceState(window.history.state, '', '/library/admin/tzurat-hadaf#export')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'צא בלי לשמור' }))
    expect(await screen.findByTestId('export-card')).toBeInTheDocument()
    // השינוי לא "נתקע": המעבר הבא לא שואל
    fireEvent.click(screen.getByRole('tab', { name: /^מצב/ }))
    expect(await screen.findByTestId('overview-books')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('מפתח חדש שעוד מוצג — מעבר לשונית מזהיר שלא יהיה אפשר לראות אותו שוב', async () => {
    mockServer({
      [`GET ${API}/tokens`]: () => reply(200, { tokens: [], active: 0, max: 5 }),
      [`POST ${API}/tokens`]: () => reply(201, { token: `tht_${'Q'.repeat(43)}`, item: { id: 'n1', name: 'צורת הדף', prefix: 'tht_QQQQ', scopes: ['read'], state: 'active' } }),
    })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#tokens')
    wrap(<TzuratScreen />)
    await screen.findByTestId('tokens-card')
    fireEvent.click(await screen.findByRole('button', { name: /צור מפתח/ }))
    await screen.findByTestId('token-reveal')
    // ההגנה פעילה (הרשומה הכפולה בהיסטוריה נוספה)
    await waitFor(() => expect(window.history.state?.__unsavedGuard).toBe(true))
    fireEvent.click(screen.getByRole('tab', { name: /^מצב/ }))
    const dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    expect(dialog.textContent).toContain('לא תוכל לראות אותו שוב')
    await userEvent.click(within(dialog).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByTestId('token-reveal')).toBeInTheDocument()
  })

  it('העלאה שרצה — מעבר לשונית שואל (ההעלאה תיעצר)', async () => {
    let release
    const hold = new Promise((r) => { release = r })
    mockServer({ [`POST ${API}/uploads`]: async () => { await hold; return reply(500, { error: 'תקלה' }) } })
    window.history.replaceState(null, '', '/library/admin/tzurat-hadaf#uploads')
    wrap(<TzuratScreen />)
    const input = await screen.findByLabelText('קובצי ZIP של צורת הדף')
    expect(input).toHaveAttribute('tabindex', '-1')
    const file = new File(['x'.repeat(20)], 'berakhot.zip', { type: 'application/zip' })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    await screen.findByRole('button', { name: 'מעלה…' })
    await waitFor(() => expect(window.history.state?.__unsavedGuard).toBe(true))
    fireEvent.click(screen.getByRole('tab', { name: /^מצב/ }))
    const dialog = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    expect(dialog.textContent).toContain('ההעלאה עוד רצה')
    await userEvent.click(within(dialog).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByTestId('upload-card')).toBeInTheDocument()
    release()
    await screen.findByRole('button', { name: 'העלה' })
  })

  it('שגיאה בטעינת stats — "מצב" מציג שגיאה ו"נסה שוב", בלי מונים', async () => {
    mockServer({ [`GET ${API}/stats`]: () => reply(500, { error: 'תקלה' }) })
    wrap(<TzuratScreen />)
    expect(await screen.findByText('לא הצלחנו לטעון את המצב')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /מחלוקות/ }).textContent).not.toMatch(/\d/)
  })
})

describe('UploadsSection', () => {
  it('חבילות: השהה ← אותו PATCH, השורה נשארת עם "מושהה"; העלאה שנכשלה: "נסה שוב"', async () => {
    const { calls } = mockServer()
    wrap(<UploadsSection />)
    const batches = await screen.findByTestId('batches')
    await within(batches).findByRole('button', { name: 'השהה את ברכות' })
    expect(within(batches).queryByText('מושהה')).toBeNull()
    fireEvent.click(within(batches).getByRole('button', { name: 'השהה את ברכות' }))
    await within(batches).findByText('מושהה')
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: `${API}/batches/berakhot`, body: { status: 'paused' } })
    expect(within(batches).getByRole('button', { name: 'המשך את ברכות' })).toBeInTheDocument()
    expect(within(batches).getAllByTestId('batch-row')).toHaveLength(1)

    const recent = screen.getByTestId('recent-uploads')
    expect(await within(recent).findByText('images/002a.scan.png חסר')).toBeInTheDocument()
    fireEvent.click(within(recent).getByRole('button', { name: 'נסה שוב את berakhot.zip' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === `${API}/uploads/u9/retry` && JSON.stringify(c.body) === '{}')).toBe(true))
  })
})

describe('ExportCard', () => {
  it('הורד את הקובץ ו"מאז" — אותן בקשות ושם קובץ; שגיאה מוצגת בעברית', async () => {
    mockServer({
      [`GET ${API}/export?`]: () => reply(403, { error: 'אין הרשאה' }),
      [`GET ${API}/export`]: () => reply(200, {}),
    })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const names = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download) })
    wrap(<ExportCard />)
    fireEvent.click(screen.getByRole('button', { name: /הורד את הקובץ/ }))
    await screen.findByText(/^הקובץ הורד/)
    expect(click).toHaveBeenCalledTimes(1)
    expect(names[0]).toMatch(/^tzurat-hadaf-export-\d{4}-\d{2}-\d{2}\.ndjson$/)
    expect(fetch.mock.calls[0][0]).toBe(`${API}/export`)

    fireEvent.click(screen.getByRole('checkbox', { name: /^תורמים/ }))
    fireEvent.change(screen.getByLabelText('רק מה שהשתנה מאז תאריך'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: /הורד מאז התאריך/ }))
    expect(await screen.findByText('אין לך הרשאה לפעולה הזו.')).toBeInTheDocument()
    const u = new URL(fetch.mock.calls.at(-1)[0], 'http://x')
    expect(u.searchParams.get('types')).toBe('decisions,anchors,checks,reports')
    expect(u.searchParams.get('parts')).toBe('decisions,anchors,checks,reports')
    expect(u.searchParams.get('since')).toBeTruthy()
    click.mockRestore()
  })

  it('התחברות שפגה (הפניה) — הודעה בעברית, ושום קובץ לא נשמר', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0, type: 'opaqueredirect', json: async () => null })))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    wrap(<ExportCard />)
    fireEvent.click(screen.getByRole('button', { name: /הורד את הקובץ/ }))
    expect(await screen.findByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeInTheDocument()
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual', cache: 'no-store' })
    expect(click).not.toHaveBeenCalled()
    click.mockRestore()
  })
})

describe('GuideEditorCard (צורת הדף)', () => {
  it('טוען, תצוגה מקדימה ושמירה — אותן בקשות מול api/admin/tzurat-hadaf/guide', async () => {
    const { calls } = mockServer({
      [`GET ${API}/guide`]: () => reply(200, { saved: null, default: '<section><h2>פתיחה</h2></section>', codes: { figures: ['[[איור:חיתוך]]'], buttons: [], values: [] } }),
      [`PUT ${API}/guide`]: (init) => (JSON.parse(init.body).preview ? reply(200, { preview: { html: 'PREVIEW', toc: [], unknown: [] } }) : reply(200, { ok: true, unknown: [] })),
    })
    const onDirty = vi.fn()
    wrap(<GuideEditorCard onDirty={onDirty} />)
    const area = await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    expect(area.value).toContain('פתיחה')
    expect(screen.getByRole('link', { name: 'פתח את הדף' }).getAttribute('href')).toBe('/docs/tzurat-hadaf')
    // אין נוסח שמור — אין "חזור לנוסח המקורי"
    expect(screen.queryByRole('button', { name: 'עוד פעולות להנחיות' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }))
    expect((await screen.findByTestId('guide-body')).textContent).toBe('PREVIEW')
    fireEvent.change(area, { target: { value: '<section><h2>חדש</h2></section>' } })
    expect(onDirty).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'שמור ועדכן את הדף' }))
    expect(await screen.findByText('דף ההנחיות עודכן.')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { html: '<section><h2>פתיחה</h2></section>', preview: true },
      { html: '<section><h2>חדש</h2></section>' },
    ])
  })

  it('שמירה: "לא נשמר" נעלם מיד (בלי GET נוסף); קודים שלא הוכרו — אזהרה שנשארת', async () => {
    const { calls } = mockServer({
      [`GET ${API}/guide`]: () => reply(200, { saved: null, default: '<p>א</p>', codes: {} }),
      [`PUT ${API}/guide`]: () => reply(200, { html: '<p>ב [[לא:ידוע]]</p>', at: '2026-11-06T10:00:00Z', unknown: ['[[לא:ידוע]]'] }),
    })
    const onDirty = vi.fn()
    wrap(<GuideEditorCard onDirty={onDirty} />)
    const area = await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    fireEvent.change(area, { target: { value: '<p>ב [[לא:ידוע]]</p>' } })
    expect(screen.getByText('יש שינויים שלא נשמרו')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'שמור ועדכן את הדף' })
    fireEvent.click(save)
    expect(await screen.findByText('דף ההנחיות עודכן.')).toBeInTheDocument()
    expect(screen.queryByText('יש שינויים שלא נשמרו')).toBeNull()
    expect(onDirty).toHaveBeenLastCalledWith(false)
    expect(calls.filter((c) => c.method === 'GET' && c.url === `${API}/guide`)).toHaveLength(1)
    expect(screen.getByText('קודים שלא הוכרו')).toBeInTheDocument()
    expect(screen.getByText('[[לא:ידוע]]')).toBeInTheDocument()
    // "כבוי" בלי disabled — הפוקוס לא נזרק
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).not.toBeDisabled()
    // יש עכשיו נוסח שמור — ⋮ מופיע
    expect(screen.getByRole('button', { name: 'עוד פעולות להנחיות' })).toBeInTheDocument()
  })

  it('"בטל שינויים" — חוזר לנוסח השמור בלי בקשה; הוספת קוד במקום הסמן', async () => {
    const { calls } = mockServer({
      [`GET ${API}/guide`]: () => reply(200, { saved: { html: '<p>שמור</p>' }, default: '<p>מקורי</p>', codes: { figures: ['[[איור:חיתוך]]'], buttons: [{ code: '[[כפתור:שמור]]', text: 'שמור' }], values: [] } }),
    })
    wrap(<GuideEditorCard />)
    const area = await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    expect(area.value).toBe('<p>שמור</p>')
    // הסמן אחרי "<p>" — הקוד נכנס שם
    area.setSelectionRange(3, 3)
    fireEvent.click(screen.getByRole('button', { name: '[[איור:חיתוך]]' }))
    expect(area.value).toBe('<p>[[איור:חיתוך]]שמור</p>')
    area.setSelectionRange(area.value.length, area.value.length)
    fireEvent.click(screen.getByRole('button', { name: '[[כפתור:שמור]]' }))
    expect(area.value).toBe('<p>[[איור:חיתוך]]שמור</p>[[כפתור:שמור]]')
    fireEvent.click(screen.getByRole('button', { name: 'בטל שינויים' }))
    expect(area.value).toBe('<p>שמור</p>')
    expect(screen.queryByText('יש שינויים שלא נשמרו')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('חזור לנוסח המקורי — מ-⋮, דיאלוג אדום, ואז DELETE', async () => {
    const { calls } = mockServer({
      [`GET ${API}/guide`]: () => reply(200, { saved: { html: '<p>שמור</p>', byName: 'מנהל' }, default: '<p>מקורי</p>', codes: {} }),
      [`DELETE ${API}/guide`]: () => reply(200, { ok: true }),
    })
    wrap(<GuideEditorCard />)
    await screen.findByLabelText('תוכן דף ההנחיות (HTML)')
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות להנחיות' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'חזור לנוסח המקורי' }))
    const dialog = await screen.findByRole('dialog', { name: 'לחזור לנוסח המקורי?' })
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'חזור לנוסח המקורי' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === `${API}/guide`)).toBe(true))
    // מקומית: הנוסח המקורי בעורך, ⋮ נעלם, והפוקוס בכותרת האזור
    await waitFor(() => expect(screen.getByLabelText('תוכן דף ההנחיות (HTML)').value).toBe('<p>מקורי</p>'))
    expect(screen.queryByRole('button', { name: 'עוד פעולות להנחיות' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'דף ההנחיות למתנדבים' })))
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1)
  })
})
