import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, ocrPublic } from '../testing/fakeApi'

// המילים החשודות ("המגיה") בזיהוי-הטקסט: "הצעת תיקון" מודגשת ו"בדוק" בקו מנוקד; לחיצה על מילה —
// החלופות; לחיצה על חלופה — העורך נפתח עם החלופה במקום המילה, ו-Enter שומר "תוקן" כרגיל.
// שום דבר לא מוחלף לבד, ושורה בלי סימונים — כמו קודם.

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => nav }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn() }) }))
vi.mock('../router/useInkWords', () => ({ useInkWords: () => null }))

import OcrScreen from './OcrScreen'

const MARKS = [
  { i: 0, word: 'שורה', level: 'check' },
  { i: 1, word: 'מספר', level: 'fix', sugg: ['מספד', 'מסםר'] },
]
const round = (items) => ({ round: 'r1', items, open: items.length, done: false })

function api(items) {
  return fakeApi({
    'GET /api/training-proof/round?section=ocr': () => ({ status: 200, data: round(items) }),
    'POST /api/training-proof/items/*': (body, path) => {
      const id = path.split('/')[4]
      return { status: 200, data: { item: ocrPublic(Number(id.slice(1)), { status: 'submitted', result: body, marks: MARKS }), skipped: false } }
    },
    'POST /api/training-proof/round/heartbeat': () => ({ status: 200, data: { open: 1 } }),
    'POST /api/training-proof/round/release': () => ({ status: 200, data: { released: 0 } }),
  })
}

const realRect = Element.prototype.getBoundingClientRect
beforeEach(() => {
  vi.clearAllMocks()
  window.scrollBy = vi.fn()
  Element.prototype.getBoundingClientRect = () => ({ top: 300, bottom: 500, height: 200, left: 0, right: 0, width: 0 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Element.prototype.getBoundingClientRect = realRect
})

describe('OcrScreen — המילים החשודות', () => {
  it('מסומנות לפי רמה; שורה בלי סימונים — טקסט רגיל', async () => {
    api([ocrPublic(0, { marks: MARKS }), ocrPublic(1, { marks: null })])
    render(<OcrScreen />)
    await screen.findByText('שורה 1 מתוך 2')
    const card = document.getElementById('tp-line-o0')
    expect(card.querySelector('[data-tp-mark="fix"]')).toHaveTextContent('מספר')
    expect(card.querySelector('[data-tp-mark="check"]')).toHaveTextContent('שורה')
    expect(card.querySelector('p')).toHaveTextContent('שורה מספר 0')
    const plain = document.getElementById('tp-line-o1')
    expect(plain.querySelector('[data-tp-mark]')).toBeNull()
    expect(within(plain).getByText('שורה מספר 1')).toBeInTheDocument()
  })

  it('לחיצה על חלופה פותחת את העורך עם החלופה, ו-Enter שומר "תוקן"', async () => {
    const { calls } = api([ocrPublic(0, { marks: MARKS })])
    const user = userEvent.setup()
    render(<OcrScreen />)
    await screen.findByText('שורה 1 מתוך 1')
    const card = document.getElementById('tp-line-o0')
    await user.click(card.querySelector('[data-tp-mark="fix"]'))
    expect(within(card).getByText(/הצעת תיקון/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'מספד' }))
    const ta = within(card).getByLabelText('הטקסט המתוקן')
    expect(ta).toHaveValue('שורה מספד 0')
    expect(calls.some((c) => c.path.endsWith('/mark'))).toBe(false) // עוד לא נשמר
    await user.keyboard('{Enter}')
    await waitFor(() => expect(calls.find((c) => c.path === '/api/training-proof/items/o0/mark')?.body).toEqual({ action: 'fixed', text: 'שורה מספד 0' }))
  })

  it('"בדוק" — בלי חלופות; בעורך — החלופות מתחת לשדה ומחליפות בו בלבד', async () => {
    const { calls } = api([ocrPublic(0, { marks: MARKS })])
    const user = userEvent.setup()
    render(<OcrScreen />)
    await screen.findByText('שורה 1 מתוך 1')
    const card = document.getElementById('tp-line-o0')
    await user.click(card.querySelector('[data-tp-mark="check"]'))
    expect(within(card).getByText(/השוו למילה בתמונה/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'מספד' })).toBeNull()
    await user.keyboard('2')
    const ta = within(card).getByLabelText('הטקסט המתוקן')
    expect(ta).toHaveValue('שורה מספר 0')
    await user.click(within(card).getByRole('button', { name: 'מסםר' }))
    expect(ta).toHaveValue('שורה מסםר 0')
    expect(ta).toHaveFocus()
    expect(calls.some((c) => c.path.endsWith('/mark'))).toBe(false)
    await user.keyboard('{Escape}')
    expect(within(card).queryByLabelText('הטקסט המתוקן')).toBeNull() // Esc — כמו קודם, בלי שינוי
    expect(card.querySelector('p')).toHaveTextContent('שורה מספר 0')
  })
})
