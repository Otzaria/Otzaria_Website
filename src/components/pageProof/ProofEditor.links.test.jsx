import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HELP_SEEN_KEY } from './ProofHelp'
import { setDomSelection } from './flowDom'
import ProofEditor from './ProofEditor'

// "בטל קישור" — מהמספר שאחרי המילה בטקסט (חלונית הקישור) ומלוח הקישורים — לכל סוג של קישור, ו"החזר
// לאוטומטי" (בעל הפרויקט, 2026-10-05). הכלל עצמו — lib/pageProof/linkCancel.js (ובדיקותיו); כאן — החיבור
// בעורך: מה נכנס לרשימת-הפעולות (= מה שנשלח), ו-Ctrl+Z.

vi.mock('@/components/providers/DialogContext', () => {
  const api = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
  return { useDialog: () => api }
})

const P = 9
const W = (text) => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, styles: [] }))
const L = (id, text, extra = {}) => ({
  id,
  order: id,
  line_no: id - 1,
  bbox: [100, id * 60, 900, id * 60 + 40],
  text,
  text_ocr: text,
  stream: 'main',
  stream_src: 'auto',
  status: 'pending',
  words: W(text),
  ...extra,
})
// קישורים: הערה 4 ← גוף 1 (אוטומטי); הערה 5 ← גוף 2 (ידני — מתנדב קודם); הערה 6 — "אין קישור" (בוטל קודם)
const makePage = () => ({
  id: 'pg1',
  page: P,
  revision: 1,
  imageUrl: '/api/page-proof/pages/pg1/image?v=1',
  doc: {
    page: P,
    revision: 1,
    size: [1000, 1400],
    lines: [
      L(1, 'אמר רבי יוחנן', { para_start: true }),
      L(2, 'משום רבי שמעון'),
      L(3, 'ועוד פסקה שנייה', { para_start: true }),
      L(4, 'א רבי יוחנן', { stream: 'notes', para_start: true }),
      L(5, 'ב משום רבי', { stream: 'notes', para_start: true }),
      L(6, 'ג עוד הערה', { stream: 'notes', para_start: true }),
    ],
    frames: [],
    links: [
      { from_line: 4, to_line: 1, to_page: P, kind: 'note', conf: 0.8, src: 'auto', from_words: [0, 0], to_words: [2, 2] },
      { from_line: 5, to_line: 2, to_page: P, kind: 'note', conf: 1, src: 'human', from_words: [0, 0], to_words: [0, 0] },
      { from_line: 6, to_line: null, to_page: null, kind: 'link', conf: 1, src: 'human' },
    ],
    streams: [
      { key: 'main', he: 'ראשי', color: '#1a56db' },
      { key: 'notes', he: 'הערות', color: '#0e7f3c' },
    ],
  },
})

let lastArgs
const actions = (args) => {
  lastArgs = args
  return <span data-testid="actions">{args.ops.length}</span>
}
const opsNow = () => lastArgs.ops.map(({ kind, ids, value }) => ({ kind, ids, value }))
const editor = () => screen.getByRole('textbox', { name: /טקסט הזרם/ })
const setup = (props = {}) => render(<ProofEditor page={makePage()} draftKey="page-proof-draft:pg1:1:links" actions={actions} {...props} />)

async function caretAt(anchor, focus = anchor) {
  setDomSelection(editor(), { anchor, focus })
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 40))
  })
}

// המספר ① אחרי המילה בטקסט ← חלונית הקישור
const badge = (lineId, n) => editor().querySelector(`[data-line="${lineId}"] [data-link-n="${n}"]`)
function openPopover(lineId, n) {
  fireEvent.click(badge(lineId, n))
  return screen.getByRole('dialog', { name: `קישור ${n}` })
}
const drawer = () => screen.getByRole('complementary', { name: 'פרטים' })
const openLinks = () => {
  fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
  fireEvent.click(within(drawer()).getByRole('tab', { name: 'קישורים' }))
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
})

describe('ProofEditor — בטל קישור', { timeout: 30000 }, () => {
  it('המספר שבטקסט ← חלונית: הקישור, "עבור לצד השני", "✓ נכון"; קישור שבוטל קודם — בלי מספר', () => {
    setup()
    // ① בגוף (שורה 1, מילה 2) ו-② (שורה 2); לשורת ההערה 6 שבוטלה — אין מספר כלל
    expect(badge(1, 1)).toHaveAttribute('data-badge', '①')
    expect(badge(2, 2)).toHaveAttribute('data-badge', '②')
    expect(editor().querySelectorAll('[data-link-n]')).toHaveLength(2)
    const pop = openPopover(1, 1)
    expect(pop).toHaveTextContent('קישור · הערה · אוטומטי 80%')
    expect(pop).toHaveTextContent('4: «א»')
    expect(within(pop).getByRole('button', { name: '✓ נכון' })).toBeInTheDocument()
    fireEvent.click(within(pop).getByRole('button', { name: '✓ נכון' }))
    expect(opsNow()).toEqual([{ kind: 'link_ok', ids: undefined, value: { src_line: 4, page: P } }])
    expect(screen.queryByRole('dialog', { name: 'קישור 1' })).toBeNull()
    // לחיצה שנייה על אותו מספר סוגרת; Esc סוגר
    openPopover(2, 2)
    fireEvent.click(badge(2, 2))
    expect(screen.queryByRole('dialog', { name: 'קישור 2' })).toBeNull()
    openPopover(2, 2)
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'קישור 2' })).toBeNull()
  })

  it('קישור אוטומטי ← מהחלונית "בטל קישור" = link_del; Ctrl+Z מחזיר', () => {
    setup()
    const pop = openPopover(1, 1)
    fireEvent.click(within(pop).getByRole('button', { name: /בטל קישור/ }))
    expect(opsNow()).toEqual([{ kind: 'link_del', ids: undefined, value: { src_line: 4, page: P } }])
    expect(badge(1, 1)).toBeNull()
    expect(screen.getByText(/הקישור בוטל — "החזר לאוטומטי" בלוח הפרטים/)).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toEqual([])
    expect(badge(1, 1)).not.toBeNull()
  })

  it('קישור ידני של מתנדב קודם ← מהחלונית "בטל קישור" = link_del (גם לו)', () => {
    setup()
    const pop = openPopover(2, 2)
    expect(pop).toHaveTextContent('אושר')
    expect(within(pop).queryByRole('button', { name: '✓ נכון' })).toBeNull()
    fireEvent.click(within(pop).getByRole('button', { name: /בטל קישור/ }))
    expect(opsNow()).toEqual([{ kind: 'link_del', ids: undefined, value: { src_line: 5, page: P } }])
  })

  it('קישור שנוסף עכשיו ← "בטל קישור" מוריד את ה-link_add עצמו: לא link_add ולא link_del נשלחים', async () => {
    setup()
    // הערה 6 (שהקישור שלה בוטל קודם) ← Ctrl+K ← גוף שורה 3 ← Ctrl+K
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt({ lineId: 6, offset: 0 }, { lineId: 6, offset: 1 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    fireEvent.click(screen.getByRole('tab', { name: /ראשי/ }))
    await caretAt({ lineId: 3, offset: 1 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    expect(opsNow().map((o) => o.kind)).toEqual(['link_add'])
    const n = Number(editor().querySelector('[data-line="3"] [data-link-n]').getAttribute('data-link-n'))
    const pop = openPopover(3, n)
    expect(pop).toHaveTextContent('נוסף עכשיו')
    fireEvent.click(within(pop).getByRole('button', { name: /בטל קישור/ }))
    expect(opsNow()).toEqual([])
    expect(screen.getByText('הקישור בוטל (Ctrl+Z מחזיר אותו)')).toBeInTheDocument()
    // Ctrl+Z מחזיר את הקישור החדש
    fireEvent.keyDown(document.body, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow().map((o) => o.kind)).toEqual(['link_add'])
  })

  it('קישור חדש שהחליף קישור אוטומטי ← "בטל קישור": ה-link_add יורד ובאותו צעד link_del לישן — הוא לא חוזר בשקט', async () => {
    setup()
    // הערה 4 (מקושרת אוטומטית לשורה 1) ← קישור חדש לשורה 3 (מחליף — באישור)
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt({ lineId: 4, offset: 0 }, { lineId: 4, offset: 1 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    fireEvent.click(screen.getByRole('tab', { name: /ראשי/ }))
    await caretAt({ lineId: 3, offset: 1 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    await waitFor(() => expect(opsNow().map((o) => o.kind)).toEqual(['link_add']))
    expect(badge(1, 1)).toBeNull()
    const n = Number(editor().querySelector('[data-line="3"] [data-link-n]').getAttribute('data-link-n'))
    fireEvent.click(within(openPopover(3, n)).getByRole('button', { name: /בטל קישור/ }))
    expect(opsNow()).toEqual([{ kind: 'link_del', ids: undefined, value: { src_line: 4, page: P } }])
    expect(editor().querySelector('[data-line="1"] [data-link-n]')).toBeNull()
    expect(editor().querySelector('[data-line="3"] [data-link-n]')).toBeNull()
    // Ctrl+Z אחד — חזרה לקישור החדש
    fireEvent.keyDown(document.body, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow().map((o) => o.kind)).toEqual(['link_add'])
  })

  it('לוח הקישורים: "בטל קישור" לכל קישור; "החזר לאוטומטי" — לקישור שבוטל עכשיו (הפעולה יורדת) ולקישור שבוטל קודם (link_reset)', async () => {
    setup()
    openLinks()
    const list = () => within(drawer())
    // שני קישורים בעמוד, ואחד שבוטל קודם
    expect(list().getByText('קישורים בעמוד (2)')).toBeInTheDocument()
    expect(list().getByText('קישורים שבוטלו (1)')).toBeInTheDocument()
    fireEvent.click(list().getAllByRole('button', { name: /בטל קישור/ })[0])
    expect(opsNow()).toEqual([{ kind: 'link_del', ids: undefined, value: { src_line: 4, page: P } }])
    expect(list().getByText('קישורים שבוטלו (2)')).toBeInTheDocument()
    // בוטל עכשיו (אוטומטי) ← "החזר לאוטומטי" מוריד את ה-link_del: כלום לא נשלח
    const now = drawer().querySelector('[data-cancelled-link="4"]')
    fireEvent.click(within(now).getByRole('button', { name: /החזר לאוטומטי/ }))
    expect(opsNow()).toEqual([])
    expect(screen.getByText('הקישור הוחזר')).toBeInTheDocument()
    // בוטל קודם ← link_reset; "ביטול" מוריד אותו
    const before = () => drawer().querySelector('[data-cancelled-link="6"]')
    fireEvent.click(within(before()).getByRole('button', { name: /החזר לאוטומטי/ }))
    expect(opsNow()).toEqual([{ kind: 'link_reset', ids: undefined, value: { src_line: 6, page: P } }])
    await waitFor(() => expect(within(before()).getByText(/יחזור לאוטומטי/)).toBeInTheDocument())
    fireEvent.click(within(before()).getByRole('button', { name: 'ביטול' }))
    expect(opsNow()).toEqual([])
  })

  it('תצוגה בלבד: החלונית נפתחת, אבל "בטל קישור" חסום', () => {
    setup({ readOnly: true })
    const pop = openPopover(1, 1)
    expect(within(pop).getByRole('button', { name: /בטל קישור/ })).toBeDisabled()
    expect(within(pop).queryByRole('button', { name: '✓ נכון' })).toBeNull()
  })
})
