import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { res } from './testFixtures'

const { replace, push, confirmMock, alertMock } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), confirmMock: vi.fn(), alertMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: alertMock, showConfirm: confirmMock }) }))

import PagesGrid from './PagesGrid'

const id = (n) => `64b7f00000000000000000${String(n).padStart(2, '0')}`
const PAGES = [
  { id: id(1), daf: 'ב.', dafKey: '002a', state: 'open', pendingCount: 3, round: 1, nonVilna: false },
  { id: id(2), daf: 'ב:', dafKey: '002b', state: 'mine', pendingCount: 0, round: 1, nonVilna: false },
  { id: id(3), daf: 'ג.', dafKey: '003a', state: 'taken', pendingCount: 0, round: 1, nonVilna: false },
  { id: id(4), daf: 'ג:', dafKey: '003b', state: 'submitted', pendingCount: 0, round: 2, nonVilna: false },
  { id: id(5), daf: 'ד.', dafKey: '004a', state: 'approved', pendingCount: 0, round: 1, nonVilna: true },
  { id: id(6), daf: 'ד:', dafKey: '004b', state: 'closed', pendingCount: 0, round: 1, nonVilna: false },
]

function mockServer({ held = [id(2)], maxHeld = 5, claim = res(200, { leasedUntil: '2026-10-27T10:00:00Z' }) } = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' })
      if (url.includes('/overview'))
        return res(200, {
          books: [
            { slug: 'shabbat', masechet: 'שבת', order: 2 },
            { slug: 'berakhot', masechet: 'ברכות', order: 1 },
          ],
          me: {},
          canAdmin: false,
        })
      if (url.includes('/books/berakhot/pages')) return res(200, { book: { slug: 'berakhot', masechet: 'ברכות', pages: 6, pagesDone: 1 }, pages: PAGES, held, maxHeld })
      if (url.endsWith('/claim')) return claim
      throw new Error(url)
    })
  )
  return calls
}

beforeEach(() => {
  replace.mockReset()
  push.mockReset()
  alertMock.mockReset()
  confirmMock.mockReset().mockResolvedValue(true)
})
afterEach(() => vi.unstubAllGlobals())

const card = (daf) => screen.getAllByTestId('page-card').find((c) => c.textContent.includes(daf))

describe('PagesGrid', () => {
  it('בלי ?m= — המסכת הראשונה לפי הסדר, והכתובת מתעדכנת; כרטיס לכל מצב', async () => {
    mockServer()
    render(<PagesGrid slug={null} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/library/tzurat-hadaf/pages?m=berakhot'))
    await screen.findAllByTestId('page-card')
    expect(within(card('ב.')).getByRole('button', { name: /קח את העמוד/ })).toBeEnabled()
    expect(within(card('ב.')).getByText('3')).toBeInTheDocument()
    expect(within(card('ב:')).getByRole('link', { name: /המשך לבדוק/ })).toHaveAttribute('href', `/library/tzurat-hadaf/review?page=${id(2)}`)
    expect(within(card('ג.')).getByText(/מתנדב אחר/)).toBeInTheDocument()
    expect(within(card('ג:')).getByText(/סבב 2/)).toBeInTheDocument()
    expect(within(card('ג:')).getByRole('link', { name: /צפייה/ })).toBeInTheDocument()
    expect(within(card('ד.')).getByText('לא וילנא')).toBeInTheDocument()
    expect(card('ד:')).toHaveAttribute('data-state', 'closed')
    expect(screen.getByTestId('held-panel')).toHaveTextContent('העמודים שבידי (1 מתוך 5)')
  })

  it('לקיחת עמוד — אישור, POST claim, ומעבר לבדיקה', async () => {
    const calls = mockServer()
    render(<PagesGrid slug="berakhot" />)
    await screen.findAllByTestId('page-card')
    fireEvent.click(within(card('ב.')).getByRole('button', { name: /קח את העמוד/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/library/tzurat-hadaf/review?page=${id(1)}`))
    expect(calls.some((c) => c.url === `/api/tzurat-hadaf/pages/${id(1)}/claim` && c.method === 'POST')).toBe(true)
  })

  it('מחזיקים את המקסימום — "קח" מושבת עם הסבר; עמודים ממסכת אחרת ברשימה', async () => {
    mockServer({ held: [id(2), id(90), id(91)], maxHeld: 3 })
    render(<PagesGrid slug="berakhot" />)
    await screen.findAllByTestId('page-card')
    expect(within(card('ב.')).getByRole('button', { name: /קח את העמוד/ })).toBeDisabled()
    expect(screen.getByTestId('held-panel')).toHaveTextContent(/אפשר להחזיק עד 3 עמודים/)
    expect(within(screen.getByTestId('held-panel')).getAllByRole('link')).toHaveLength(3)
  })

  it('claim נכשל — הודעה, בלי מעבר', async () => {
    mockServer({ claim: res(409, { error: 'העמוד נלקח' }) })
    render(<PagesGrid slug="berakhot" />)
    await screen.findAllByTestId('page-card')
    fireEvent.click(within(card('ב.')).getByRole('button', { name: /קח את העמוד/ }))
    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('לא ניתן לקחת את העמוד', 'העמוד נלקח'))
    expect(push).not.toHaveBeenCalled()
  })
})
