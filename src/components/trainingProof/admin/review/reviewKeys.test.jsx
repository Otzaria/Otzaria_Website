import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi } from '../../testing/fakeApi'

// המקלדת בסקירה (בקשת בעל הפרויקט, 2026-10-28): זיהוי — 1 אשר · 2 תקן ואשר · 3/Delete דחה;
// נתב — 1–4 כתב (תיקון) · 0 פסול · Enter אשר · Delete דחה; ↑↓ בין השורות; לא בזמן הקלדה.

vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))

import OcrReview from './OcrReview'
import RouterReview from './RouterReview'

const ocr = (i) => ({
  id: `o${i}`, section: 'ocr', status: 'submitted', img: `/o${i}.png`, w: 600, h: 40, alias: 'ספר 4', page: 3,
  track: 'rashi', source: 'ocr', text: `שורה ${i}`, conf: 80, lineNo: i, ctx: null,
  result: { action: 'ok' }, volResult: null, adminFixed: false, vol: { id: 'v', name: 'רחל' }, submittedAt: null, rejectedCount: 0,
})
const rt = (i) => ({
  id: `r${i}`, section: 'router', status: 'submitted', img: `/r${i}.png`, w: 540, h: 54, alias: 'ספר 7', page: 1,
  pred: 'square', predP: 0.8, text: '', words: null, ctx: null, agrees: true,
  result: { label: 'square', bad: false }, adminFixed: false, vol: { id: 'v', name: 'רחל' }, submittedAt: null, rejectedCount: 0,
})

// השרת: הרשימה, ופריט שאושר/נדחה/תוקן יוצא ממנה בטעינה הבאה
function server(section, items) {
  let list = [...items]
  const gone = (ids) => (list = list.filter((x) => !ids.includes(x.id)))
  return fakeApi({
    'GET /api/admin/training-proof/review*': () => ({ status: 200, data: { items: list, total: list.length, page: 1, pages: 1, stats: { vols: [] } } }),
    'POST /api/admin/training-proof/review/decide': (b) => (gone(b.ids), { status: 200, data: { count: b.ids.length } }),
    'POST /api/admin/training-proof/review/fix': (b) => (gone([b.id]), { status: 200, data: { fixed: true } }),
  })
}
const posts = (calls, p) => calls.filter((c) => c.method === 'POST' && c.path === `/api/admin/training-proof/review/${p}`).map((c) => c.body)
const current = () => document.querySelector('[data-item][aria-current="true"]')?.getAttribute('data-item')

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
})

describe('סקירת זיהוי-הטקסט — מקלדת', () => {
  it('1 מאשר את השורה המסומנת, והבאה תופסת את מקומה בגלילה רכה', async () => {
    const { calls } = server('ocr', [ocr(0), ocr(1), ocr(2)])
    const user = userEvent.setup()
    render(<OcrReview />)
    await screen.findByText('שורה 0')
    expect(screen.getByTestId('tp-review-keys')).toHaveTextContent('אשר')
    expect(current()).toBe('o0')
    await user.keyboard('1')
    await waitFor(() => expect(posts(calls, 'decide')).toEqual([{ section: 'ocr', ids: ['o0'], decision: 'approve' }]))
    await waitFor(() => expect(screen.queryByText('שורה 0')).toBeNull())
    expect(current()).toBe('o1')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
    await user.keyboard('{ArrowDown}')
    expect(current()).toBe('o2')
    await user.keyboard('3')
    await waitFor(() => expect(posts(calls, 'decide').at(-1)).toEqual({ section: 'ocr', ids: ['o2'], decision: 'reject' }))
  })

  it('2 פותח "תקן ואשר" בשורה; Enter שומר, Esc מבטל; מקשים בתוך השדה לא מאשרים', async () => {
    const { calls } = server('ocr', [ocr(0), ocr(1)])
    const user = userEvent.setup()
    render(<OcrReview />)
    await screen.findByText('שורה 0')
    await user.keyboard('2')
    const box = await screen.findByLabelText('התיקון שלך:')
    expect(box).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('התיקון שלך:')).toBeNull()
    await user.keyboard('2')
    const box2 = await screen.findByLabelText('התיקון שלך:')
    await user.clear(box2)
    await user.type(box2, 'שורה 1 מתוקנת')
    expect(posts(calls, 'decide')).toEqual([])
    await user.keyboard('{Enter}')
    await waitFor(() => expect(posts(calls, 'fix')).toEqual([{ id: 'o0', mark: { action: 'fixed', text: 'שורה 1 מתוקנת' } }]))
  })

  it('4 = לא קריא, 5 = לנתב (במקום המתנדב); מקש של מה שהמתנדב כבר סימן — כלום', async () => {
    const bad = { ...ocr(2), result: { action: 'bad' } }
    const { calls } = server('ocr', [ocr(0), ocr(1), bad])
    const user = userEvent.setup()
    render(<OcrReview />)
    await screen.findByText('שורה 0')
    expect(screen.getByTestId('tp-review-keys')).toHaveTextContent('לא קריא')
    await user.keyboard('4')
    await waitFor(() => expect(posts(calls, 'fix')).toEqual([{ id: 'o0', mark: { action: 'bad' } }]))
    await waitFor(() => expect(current()).toBe('o1'))
    await user.keyboard('5')
    await waitFor(() => expect(posts(calls, 'fix').at(-1)).toEqual({ id: 'o1', mark: { action: 'router' } }))
    await waitFor(() => expect(current()).toBe('o2'))
    await user.keyboard('4')
    expect(posts(calls, 'fix')).toHaveLength(2)
  })

  it('לחיצה על שורה בוחרת אותה; ↑ בראש הרשימה נשאר בראש', async () => {
    server('ocr', [ocr(0), ocr(1)])
    const user = userEvent.setup()
    render(<OcrReview />)
    await screen.findByText('שורה 1')
    await user.click(screen.getByText('שורה 1'))
    expect(current()).toBe('o1')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(current()).toBe('o0')
  })
})

describe('סקירת נתב-הכתב — מקלדת', () => {
  it('2 = תיקון לרש"י; Enter = "אשר עם התיקון"; 0 = פסול; Delete = דחה', async () => {
    const { calls } = server('router', [rt(0), rt(1), rt(2)])
    const user = userEvent.setup()
    render(<RouterReview />)
    await waitFor(() => expect(current()).toBe('r0'))
    await user.keyboard('2')
    const row = document.querySelector('[data-item="r0"]')
    expect(within(row).getByText('תיקון שלך — עוד לא נשמר')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(posts(calls, 'fix')).toEqual([{ id: 'r0', mark: { label: 'rashi' } }]))
    await waitFor(() => expect(current()).toBe('r1'))
    await user.keyboard('{Enter}') // בלי תיקון — אישור רגיל
    await waitFor(() => expect(posts(calls, 'decide')).toEqual([{ section: 'router', ids: ['r1'], decision: 'approve' }]))
    await waitFor(() => expect(current()).toBe('r2'))
    await user.keyboard('0{Enter}')
    await waitFor(() => expect(posts(calls, 'fix').at(-1)).toEqual({ id: 'r2', mark: { bad: true } }))
  })

  it('Delete דוחה; 4 (מעורבת) לא פועל בשורה בלי מילים', async () => {
    const { calls } = server('router', [rt(0), rt(1)])
    const user = userEvent.setup()
    render(<RouterReview />)
    await waitFor(() => expect(current()).toBe('r0'))
    await user.keyboard('4')
    expect(within(document.querySelector('[data-item="r0"]')).queryByText('תיקון שלך — עוד לא נשמר')).toBeNull()
    await user.keyboard('{Delete}')
    await waitFor(() => expect(posts(calls, 'decide')).toEqual([{ section: 'router', ids: ['r0'], decision: 'reject' }]))
  })
})
