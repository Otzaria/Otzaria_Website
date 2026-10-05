import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HELP_SEEN_KEY } from './ProofHelp'
import ProofEditor from './ProofEditor'

// השלבים של דף המתנדב (focus — lib/pageProof/stages.stageFocus) בעורך המלא: "מבנה" — הטקסט לקריאה בלבד ומעומעם, בסרגל
// רק מה שנוגע למבנה, והסריקה עם הכלים; "טקסט" — הסריקה בלי כלים והסרגל כולו; בלי focus (תוכנת-הספר) — הכול, כמו תמיד.

vi.mock('@/components/providers/DialogContext', () => {
  const api = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
  return { useDialog: () => api }
})

const L = (id, bbox, text, stream = 'main', extra = {}) => ({
  id,
  order: id,
  line_no: id - 1,
  bbox,
  text,
  text_ocr: text,
  stream,
  stream_src: 'auto',
  status: 'pending',
  words: text.split(' ').map((t) => ({ text: t, styles: [] })),
  ...extra,
})
const page = () => ({
  id: 'pgF',
  page: 5,
  revision: 1,
  imageUrl: '/api/page-proof/pages/pgF/image?v=1',
  doc: {
    page: 5,
    revision: 1,
    size: [1000, 1000],
    frames: [],
    links: [],
    lines: [L(1, [100, 100, 900, 140], 'אלף בית גימל', 'main', { para_start: true }), L(2, [100, 150, 900, 190], 'דלת הא וו')],
  },
})

const toolbar = () => screen.getByRole('toolbar', { name: 'כלי ההגהה' })
const flowRoot = (container) => container.querySelector('[data-proof-flow]')
const scan = () => screen.getByTestId('scan-panel')

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
})

describe('ProofEditor focus — שני השלבים', () => {
  it('"מבנה": הטקסט לקריאה בלבד ומעומעם, בסרגל בלי עיצוב/קישור/הצעות, והסריקה עם הכלים', () => {
    const { container } = render(<ProofEditor page={page()} persist={false} focus="structure" />)
    expect(flowRoot(container)).toHaveAttribute('aria-readonly', 'true')
    expect(container.querySelector('[data-focus-dim]')).not.toBeNull()
    const tb = within(toolbar())
    expect(tb.queryByRole('button', { name: 'מודגש' })).not.toBeInTheDocument()
    expect(tb.queryByRole('button', { name: 'קישור' })).not.toBeInTheDocument()
    expect(tb.queryByRole('button', { name: 'הצעות למילה' })).not.toBeInTheDocument()
    expect(tb.getByRole('button', { name: 'ביטול' })).toBeInTheDocument()
    expect(within(scan()).getByRole('button', { name: 'מסגרת חדשה' })).toBeInTheDocument()
  })

  it('"טקסט": הטקסט פתוח לעריכה, הסרגל כולו, והסריקה בלי כלים (לחיצה עליה — רק הסמן)', () => {
    const { container } = render(<ProofEditor page={page()} persist={false} focus="text" />)
    expect(flowRoot(container)).not.toHaveAttribute('aria-readonly')
    expect(container.querySelector('[data-focus-dim]')).toBeNull()
    expect(within(toolbar()).getByRole('button', { name: 'מודגש' })).toBeInTheDocument()
    expect(within(scan()).queryByRole('button', { name: 'מסגרת חדשה' })).not.toBeInTheDocument()
    expect(within(scan()).queryByRole('button', { name: /המסגרות נכונות/ })).not.toBeInTheDocument()
  })

  it('בלי focus (כמו בתוכנת-הספר) — הכול פתוח, כמו תמיד', () => {
    const { container } = render(<ProofEditor page={page()} persist={false} />)
    expect(flowRoot(container)).not.toHaveAttribute('aria-readonly')
    expect(within(toolbar()).getByRole('button', { name: 'מודגש' })).toBeInTheDocument()
    expect(within(scan()).getByRole('button', { name: 'מסגרת חדשה' })).toBeInTheDocument()
  })
})

// הבודק השני (docs/63 §4): הפעולות שהתקבלו מההגשה הקודמת (inherited) מסומנות בטקסט, עם הטקסט המקורי בריחוף, ובלוח
// הפרטים ← שינויים הן ברשימה נפרדת עם "החזר למקור"
describe('ProofEditor inherited — מה שהתקבל ממתנדב קודם', () => {
  const T1 = { kind: 'text', page: 5, ids: [1], value: 'אלף בית גימל דלת' }
  const P2 = { kind: 'para', page: 5, ids: [2], value: 'h2' }

  it('השורות מסומנות ("תוקן בידי מתנדב קודם" + המקור בריחוף), ובשינויים — רשימה נפרדת; "החזר למקור" מחליף את השינוי בפעולה הפוכה', async () => {
    let last = null
    const { container } = render(
      <ProofEditor page={page()} persist={false} initialOps={[T1, P2]} inherited={{ ops: [T1, P2], source: 'submission' }} actions={(a) => ((last = a), null)} />
    )
    const marked = container.querySelector('[data-line="1"][data-inherited="1"]')
    expect(marked).not.toBeNull()
    expect(marked.getAttribute('title')).toContain('תוקן בידי מתנדב קודם')
    expect(marked.getAttribute('title')).toContain('במקור: «אלף בית גימל»')
    expect(container.querySelector('[data-line="2"][data-inherited="1"]')).not.toBeNull()

    await userEvent.click(within(toolbar()).getByRole('button', { name: 'פרטים' }))
    await userEvent.click(screen.getByRole('tab', { name: /שינויים/ }))
    const theirs = screen.getByRole('list', { name: 'השינויים שהתקבלו' })
    expect(within(theirs).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(within(theirs).getAllByRole('button', { name: 'החזר למקור' })[0])
    // במקום התיקון של הקודם — הטקסט המקורי, מפורשות (כדי שההחזרה תגיע לספר גם אם ההגשה הקודמת כבר הוחלה שם)
    const pick = (o) => ({ kind: o.kind, page: o.page, ids: o.ids, value: o.value })
    expect(last.ops.map(pick)).toEqual([P2, { kind: 'text', page: 5, ids: [1], value: 'אלף בית גימל' }])
    expect(container.querySelector('[data-line="1"][data-inherited="1"]')).toBeNull()
    expect(container.querySelector('[data-line="1"]').textContent).toContain('אלף בית גימל')
  })

  it('בלי inherited — רשימה אחת, בלי סימון (כמו תמיד)', async () => {
    const { container } = render(<ProofEditor page={page()} persist={false} initialOps={[T1]} />)
    expect(container.querySelector('[data-inherited]')).toBeNull()
    await userEvent.click(within(toolbar()).getByRole('button', { name: 'פרטים' }))
    await userEvent.click(screen.getByRole('tab', { name: /שינויים/ }))
    expect(screen.queryByRole('list', { name: 'השינויים שהתקבלו' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'החזר למקור' })).not.toBeInTheDocument()
  })
})
