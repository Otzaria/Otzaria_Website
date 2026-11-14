import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { HELP_KEYS } from './HelpDialog'
import { fixtureItem, fixtureModel, res } from './testFixtures'

const { push, alertMock } = vi.hoisted(() => ({ push: vi.fn(), alertMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: alertMock, showConfirm: async () => true }) }))

import ReviewShell from './ReviewShell'

const PID = '64b7f00000000000000000aa'
const pageData = (over = {}) => ({
  page: {
    id: PID,
    slug: 'berakhot',
    masechet: 'ברכות',
    daf: 'ב.',
    dafKey: '002a',
    round: 1,
    version: '["b1",1]',
    nonVilna: false,
    state: 'mine',
    leasedUntil: '2026-10-27T10:00:00Z',
    scan: { url: `/api/tzurat-hadaf/pages/${PID}/image?side=scan`, w: 1000, h: 1400 },
    ours: { url: `/api/tzurat-hadaf/pages/${PID}/image?side=ours`, w: 1000, h: 1400 },
    model: fixtureModel(),
    ...over,
  },
  items: [fixtureItem({ id: 'it1', revision: 3 })],
  draft: null,
  prev: null,
  next: { id: '64b7f00000000000000000bb', daf: 'ב:' },
})

function mockServer(data = pageData(), { submit = res(200, { submission: 'sub1', points: 0 }) } = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
      if (url === `/api/tzurat-hadaf/pages/${PID}`) return res(200, data)
      if (url.endsWith('/claim')) return res(200, { leasedUntil: '2026-10-28T10:00:00Z' })
      if (url.endsWith('/submit')) return submit
      if (url.endsWith('/draft')) return res(200, { updatedAt: '2026-10-25T20:00:00Z' })
      if (url.endsWith('/release')) return res(200, { ok: true })
      throw new Error(url)
    })
  )
  return calls
}

beforeEach(() => {
  window.localStorage.setItem(HELP_KEYS.review, '1')
  push.mockReset()
  alertMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('ReviewShell', () => {
  it('הגשה על סבב ישן (409 stale) — לא "הוגשה", והעמוד נטען מחדש', async () => {
    const d = pageData({ round: 2 })
    d.draft = { stage: 'submit', state: { checks: { blocks: 'ok', headers: 'ok', edges: 'ok', size: 'ok' } }, updatedAt: '2026-10-25T19:00:00Z' }
    const calls = mockServer(d, { submit: res(409, { error: 'העמוד עודכן', code: 'stale' }) })
    render(<ReviewShell pageId={PID} />)
    await screen.findByTestId('stage-bar')
    fireEvent.click(screen.getByRole('button', { name: /הגשת הבדיקה/ }))
    await waitFor(() => expect(calls.filter((c) => c.url === `/api/tzurat-hadaf/pages/${PID}` && c.method === 'GET')).toHaveLength(2))
    expect(calls.find((c) => c.url.endsWith('/submit')).body.round).toBe(2)
    expect(screen.queryByTestId('submitted')).toBeNull()
    expect(alertMock).not.toHaveBeenCalled()
  })

  it('פתיחה מחדשת את ההחזקה; ארבעת השלבים עד ההגשה', async () => {
    const calls = mockServer()
    render(<ReviewShell pageId={PID} />)
    await screen.findByTestId('stage-bar')
    expect(calls.some((c) => c.url.endsWith('/claim') && c.method === 'POST')).toBe(true)
    // מבט כללי: שני הלוחות ותיבות השורות
    expect(screen.getByTestId('pane-scan').querySelectorAll('[data-line]')).toHaveLength(3)
    const hover = screen.getByTestId('pane-scan').querySelector('[data-line="g:1"]')
    fireEvent.mouseEnter(hover)
    expect(screen.getByTestId('pane-ours').querySelector('[data-line="g:1"]').className).toMatch(/ring-warning-500/)
    for (const g of screen.getAllByRole('group').filter((x) => x.closest('[data-check]'))) fireEvent.click(within(g).getByRole('button', { name: /תקין/ }))

    // שורות
    fireEvent.click(screen.getByRole('button', { name: /2\. שורות/ }))
    const row0 = document.querySelector('[data-line="g:0"]')
    fireEvent.click(within(row0).getByRole('button', { name: /המילה האחרונה למטה/ }))

    // נוסח
    fireEvent.click(screen.getByRole('button', { name: /3\. נוסח/ }))
    fireEvent.click(screen.getByRole('button', { name: /א"ר/ }))
    expect(screen.getByText(/1 מתוך 1 נענו/)).toBeInTheDocument()

    // דיווח והגשה
    fireEvent.click(screen.getByRole('button', { name: /4\. דיווח והגשה/ }))
    expect(within(screen.getByTestId('summary')).getByText('שורות שהוזזו').nextSibling).toHaveTextContent('1')
    fireEvent.change(screen.getByLabelText(/הערה למנהל/), { target: { value: 'נבדק' } })
    fireEvent.click(screen.getByRole('button', { name: /הגשת הבדיקה/ }))
    expect(await screen.findByTestId('submitted')).toHaveTextContent(/הוגשה/)
    const sub = calls.find((c) => c.url.endsWith('/submit'))
    expect(sub.body).toEqual({
      checks: { blocks: 'ok', headers: 'ok', edges: 'ok', size: 'ok' },
      lineOps: [{ op: 'start', block: 'g', line: 1, ref: 'ברכות ב.', wi: 2 }],
      itemAnswers: [{ item: 'it1', choice: 'b', revision: 3 }],
      manualItems: [],
      reports: [],
      note: 'נבדק',
      round: 1,
      version: '["b1",1]',
    })
    expect(screen.getByRole('link', { name: /לדף הבא: ב:/ })).toHaveAttribute('href', '/library/tzurat-hadaf/review?page=64b7f00000000000000000bb')
  })

  it('בלי כל הבדיקות — ההגשה מושבתת; "יש בעיה" פותח דיווח עם הקטגוריה', async () => {
    mockServer()
    render(<ReviewShell pageId={PID} />)
    await screen.findByTestId('stage-bar')
    const headers = document.querySelector('[data-check="headers"]')
    fireEvent.click(within(headers).getByRole('button', { name: /יש בעיה/ }))
    expect(await screen.findByLabelText('סוג הבעיה')).toHaveValue('header')
    fireEvent.change(screen.getByLabelText(/תיאור/), { target: { value: 'חסרה הכותרת' } })
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    fireEvent.click(screen.getByRole('button', { name: /4\. דיווח והגשה/ }))
    expect(within(screen.getByTestId('report-list')).getByText('חסרה הכותרת')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /הגשת הבדיקה/ })).toBeDisabled()
  })

  it('טיוטה מהשרת נטענת לשלב שנשמר; עמוד פנוי — צפייה בלבד וכפתור "קח"', async () => {
    const d = pageData({ state: 'open' })
    d.draft = { stage: 'submit', state: { note: 'מהטיוטה', reports: [], checks: {} }, updatedAt: '2026-10-25T19:00:00Z' }
    const calls = mockServer(d)
    render(<ReviewShell pageId={PID} />)
    await screen.findByTestId('stage-bar')
    expect(screen.getByTestId('stage-bar')).toHaveAttribute('data-stage', 'submit')
    expect(screen.getByLabelText(/הערה למנהל/)).toHaveValue('מהטיוטה')
    expect(screen.getByText(/העמוד אינו בידיכם/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /הגשת הבדיקה/ })).toBeNull()
    expect(calls.some((c) => c.url.endsWith('/claim'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /קח את העמוד/ }))
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/claim'))).toHaveLength(1))
  })

  it('עמוד שלא נמצא — הודעה וקישור לרשת', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(404, { error: 'לא נמצא' })))
    render(<ReviewShell pageId={PID} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('העמוד לא נמצא')
    expect(screen.getByRole('link', { name: /לרשת העמודים/ })).toBeInTheDocument()
  })
})

it('resumes persisted submission input after a failure without requiring new edits/checks', async () => {
  const data = { ...pageData(), processing: true }
  const calls = mockServer(data)
  render(<ReviewShell pageId={PID} />)
  fireEvent.click(await screen.findByRole('button', { name: 'המשך שמירת ההגשה' }))
  expect(await screen.findByTestId('submitted')).toBeInTheDocument()
  expect(calls.filter((c) => c.url.endsWith('/submit'))).toHaveLength(1)
  expect(calls.some((c) => c.url.endsWith('/draft'))).toBe(false)
})
