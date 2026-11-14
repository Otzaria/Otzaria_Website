import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FastTrack from './FastTrack'
import { HELP_KEYS } from './HelpDialog'
import { fixtureItem, res } from './testFixtures'

// המסלול המהיר מול שרת מדומה: fast (תור של תשובות), answer, flag.
function mockServer({ fast = [], answer = [] } = {}) {
  const calls = []
  const fn = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
    if (url.startsWith('/api/tzurat-hadaf/fast')) return fast.shift() || res(200, { item: null, stats: { open: 0, mine: 0, mineAgreed: 0 }, needPractice: false })
    if (/\/items\/[^/]+\/answer$/.test(url)) return answer.shift() || res(200, { status: 'recorded', points: 0 })
    if (/\/items\/[^/]+\/flag$/.test(url)) return res(200, { ok: true })
    throw new Error(`fetch לא צפוי: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const fastRes = (item, extra = {}) => res(200, { item, stats: { open: 10, mine: 2, mineAgreed: 1 }, needPractice: false, ...extra })

beforeEach(() => {
  window.localStorage.setItem(HELP_KEYS.fast, '1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('FastTrack', () => {
  it('מקש 1 בוחר, Enter שולח — בלי לגלות אם צדקתם — ונטען הכרטיס הבא', async () => {
    const calls = mockServer({ fast: [fastRes(fixtureItem({ revision: 4 })), fastRes(fixtureItem({ id: '64b7f0000000000000000002', ctxBefore: ['שני'] }))] })
    render(<FastTrack />)
    await screen.findByText('אמר רבי')
    expect(screen.getByTestId('crop-frame')).toHaveStyle({ left: '40%', width: '20%' })
    expect(screen.getByTestId('stat-open')).toHaveTextContent('10')
    fireEvent.keyDown(window, { key: '1' })
    expect(screen.getByRole('button', { name: /אמר רבי/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('context').querySelector('mark')).toHaveTextContent('אמר רבי')
    fireEvent.keyDown(window, { key: 'Enter' })
    await screen.findByTestId('flash')
    expect(screen.getByTestId('flash')).toHaveTextContent('נשמר — תודה')
    const post = calls.find((c) => c.method === 'POST')
    expect(post.url).toBe('/api/tzurat-hadaf/items/64b7f0000000000000000001/answer')
    expect(post.body).toEqual({ choice: 'a', via: 'fast', revision: 4 })
    expect(calls.find((c) => c.url.includes('/fast')).url).toContain('stats=1')
    await waitFor(() => expect(document.querySelector('[data-item="64b7f0000000000000000002"]')).not.toBeNull())
    const lastFast = calls.filter((c) => c.url.includes('/fast')).pop()
    expect(lastFast.url).toContain('exclude=64b7f0000000000000000001')
    expect(lastFast.url).not.toContain('stats=1')
    expect(screen.queryByText(/נכון/)).toBeNull()
  })

  it('"משהו אחר" שולח טקסט; מקשים בתוך השדה לא נתפסים', async () => {
    const calls = mockServer({ fast: [fastRes(fixtureItem())] })
    render(<FastTrack />)
    const input = await screen.findByLabelText(/משהו אחר/)
    fireEvent.change(input, { target: { value: 'אמר ר\'' } })
    fireEvent.keyDown(input, { key: '1' })
    expect(screen.getByRole('button', { name: /אמר רבי/ })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST').body).toEqual({ choice: 'other', text: "אמר ר'", via: 'fast' })
  })

  it('N מדלג (עם exclude), U מסמן "לא ברור", 409 ממשיך הלאה בשקט', async () => {
    const calls = mockServer({
      fast: [fastRes(fixtureItem()), fastRes(fixtureItem({ id: '64b7f0000000000000000002' }))],
      answer: [res(409, { error: 'נסגר', code: 'closed' })],
    })
    render(<FastTrack />)
    await screen.findByText('אמר רבי')
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(calls.filter((c) => c.url.includes('/fast')).length).toBe(2))
    expect(calls[calls.length - 1].url).toContain('exclude=64b7f0000000000000000001')
    await waitFor(() => expect(document.querySelector('[data-item="64b7f0000000000000000002"]')).not.toBeNull())
    fireEvent.keyDown(window, { key: 'u' })
    expect(screen.getByRole('button', { name: /לא ברור/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(window, { key: 'Enter' })
    await screen.findByText(/השאלה כבר הוכרעה/)
  })

  it('החיתוך לא מראה את המקום → flag', async () => {
    const calls = mockServer({ fast: [fastRes(fixtureItem())] })
    render(<FastTrack />)
    fireEvent.click(await screen.findByRole('button', { name: /החיתוך לא מראה/ }))
    await screen.findByText(/הסימון נרשם/)
    expect(calls.find((c) => c.url.endsWith('/flag')).body).toEqual({ reason: 'crop' })
  })

  it('needPractice — הזמנה לתרגול; אין שאלות — הודעת סיום', async () => {
    mockServer({ fast: [fastRes(null, { needPractice: true })] })
    const { unmount } = render(<FastTrack />)
    expect(await screen.findByRole('link', { name: /לתרגול/ })).toHaveAttribute('href', '/library/tzurat-hadaf/practice')
    unmount()
    mockServer({ fast: [fastRes(null)] })
    render(<FastTrack />)
    expect(await screen.findByTestId('empty')).toHaveTextContent(/אין כרגע שאלות/)
  })

  it('רש"י ותוספות פתוחים לכולם', async () => {
    mockServer({ fast: [fastRes(fixtureItem())] })
    render(<FastTrack />)
    await screen.findByText('אמר רבי')
    expect(screen.getByRole('radio', { name: 'רש"י' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'תוספות' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'גמרא' })).toBeEnabled()
    expect(screen.queryByText(/אני קורא כתב רש"י/)).toBeNull()
  })

  it('403 — הודעה על אימות האימייל', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.includes('overview') ? res(403, { error: 'x' }) : res(403, { error: 'אין הרשאה' }))))
    render(<FastTrack />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/אימייל מאומתת/)
  })
})
