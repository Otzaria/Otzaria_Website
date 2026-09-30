import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HELP_SEEN_KEY } from './ProofHelp'
import { LAYOUT_KEY } from '@/lib/pageProof/layout'
import { HINTS } from '@/lib/pageProof/flowEdit'
import { readDomSelection, setDomSelection } from './flowDom'
import ProofEditor from './ProofEditor'
import { CHAR_STYLE_BUTTONS } from './ProofToolbar'

// החלונות (אישור/הודעה) — מדומים, כדי לבחור מה המשתמש עונה
const dlg = vi.hoisted(() => ({ confirm: false, api: null }))
vi.mock('@/components/providers/DialogContext', () => {
  const api = { showAlert: vi.fn(), showConfirm: vi.fn(async () => dlg.confirm) }
  dlg.api = api
  return { useDialog: () => api }
})

// המעטפת: הסרגל, הסריקה, הטקסט הזורם, שורת-המצב ולוח הפרטים — מחוברים.
// הרכיבים עצמם נבדקים כל אחד בנפרד; כאן — החיבורים ביניהם.

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
const makePage = (lines) => ({
  id: 'pg1',
  page: P,
  revision: 1,
  imageUrl: '/api/page-proof/pages/pg1/image?v=1',
  doc: {
    page: P,
    revision: 1,
    size: [1000, 1400],
    lines: lines || [
      L(1, 'אמר רבי יוחנן', { para_start: true }),
      L(2, 'משום רבי שמעון'),
      L(3, 'ועוד פסקה שנייה', { para_start: true }),
      L(4, 'רבי יוחנן. בעל הגמרא', { stream: 'notes', para_start: true }),
      L(5, '12', { stream: 'header' }),
    ],
    frames: [],
    links: [],
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

function setup(props = {}) {
  lastArgs = null
  const page = props.page || makePage()
  const utils = render(<ProofEditor page={page} draftKey="page-proof-draft:pg1:1:x" actions={actions} {...props} />)
  const editor = () => screen.getByRole('textbox', { name: /טקסט הזרם/ })
  return { ...utils, page, editor }
}

async function caretAt(editor, anchor, focus = anchor) {
  setDomSelection(editor, { anchor, focus })
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 40))
  })
}

const opsNow = () => lastArgs.ops.map(({ kind, ids, value }) => ({ kind, ids, value }))

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
})

// העורך המלא (סריקה + טקסט + סרגל) כבד יחסית ב-jsdom; בהרצת כל הטסטים
// במקביל על מחשב עמוס 5 השניות של ברירת-המחדל אינן מספיקות
describe('ProofEditor — המעטפת', { timeout: 30000 }, () => {
  it('סרגל, סריקה, לשוניות-זרמים, טקסט ושורת-מצב; actions מקבל את הפעולות והאישורים', () => {
    const { editor } = setup()
    expect(screen.getByRole('toolbar', { name: 'כלי ההגהה' })).toBeInTheDocument()
    expect(screen.getByTestId('scan-panel')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([expect.stringContaining('ראשי'), expect.stringContaining('הערות'), expect.stringContaining('ריהוט')])
    expect(editor()).toHaveTextContent('אמר רבי יוחנן')
    expect(editor()).not.toHaveTextContent('בעל הגמרא')
    expect(screen.getByText('אין שינויים')).toBeInTheDocument()
    expect(lastArgs.approval).toEqual({ approved: 0, total: 3 })
    expect(lastArgs.untouched).toEqual([1, 2, 3, 4])
  })

  it('B בסרגל ← פעולת styles למילה שבסמן; Ctrl+Z (לפי e.code, גם בפריסה עברית) מבטל', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    expect(screen.getByText('שורה 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    expect(opsNow()).toEqual([{ kind: 'styles', ids: [1], value: { style: 'b', words: [1, 1], on: true } }])
    expect(editor().querySelector('[data-line="1"] [data-w="1"]')).toHaveClass('font-bold')
    fireEvent.keyDown(editor(), { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toEqual([])
    fireEvent.keyDown(document.body, { key: 'ט', code: 'KeyY', ctrlKey: true })
    expect(opsNow()).toHaveLength(1)
  })

  it('הקלדה בטקסט ← text; Ctrl+Enter מאשר את הפסקה ועובר לבאה; שורת-המצב סופרת', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 3, offset: 4 })
    act(() => {
      editor().dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'ה' }))
    })
    expect(opsNow()).toEqual([{ kind: 'text', ids: [3], value: 'ועודה פסקה שנייה' }])
    // ביטול: הסמן חוזר למקום השינוי (ולא לתחילת המילה); חזרה — אחרי האות
    fireEvent.keyDown(editor(), { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(readDomSelection(editor())).toEqual({ anchor: { lineId: 3, offset: 4 }, focus: { lineId: 3, offset: 4 } })
    fireEvent.keyDown(editor(), { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })
    expect(readDomSelection(editor())).toEqual({ anchor: { lineId: 3, offset: 5 }, focus: { lineId: 3, offset: 5 } })
    await caretAt(editor(), { lineId: 1, offset: 0 })
    fireEvent.keyDown(editor(), { key: 'Enter', code: 'Enter', ctrlKey: true })
    expect(opsNow().slice(1)).toEqual([
      { kind: 'line_ok', ids: [1], value: undefined },
      { kind: 'line_ok', ids: [2], value: undefined },
    ])
    expect(screen.getByText('אושרו 1 מתוך 3 פסקאות')).toBeInTheDocument()
    expect(editor().querySelector('[data-para="1:0"]')).toHaveAttribute('data-approved', '1')
    // ביטול האישור מה-✓
    fireEvent.click(editor().querySelector('[data-para="1:0"] [data-gutter]'))
    expect(opsNow().map((o) => o.kind)).toEqual(['text'])
  })

  it('קישור: מילה בהערות ← Ctrl+K ← לשונית ראשי ← מילה ← Ctrl+K = link_add עם טווחי-מילים', async () => {
    const { editor } = setup()
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 10 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    expect(screen.getByText(/נבחר: «/)).toHaveTextContent('רבי יוחנן.')
    // באותו זרם — שגיאה, בלי פעולה
    await caretAt(editor(), { lineId: 4, offset: 12 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    expect(screen.getByText('קישור הוא בין שני זרמים שונים')).toBeInTheDocument()
    expect(opsNow()).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: /ראשי/ }))
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    expect(opsNow()).toEqual([{ kind: 'link_add', ids: [4, 1], value: { from_words: [0, 1], to_words: [1, 1], kind: 'note' } }])
    // הקישור מסומן בטקסט במספר קטן
    expect(editor().querySelector('[data-line="1"] [data-w="1"] [data-badge="①"]')).toBeInTheDocument()
  })

  it('Esc מבטל קישור ממתין (ומסמן שטיפל — חלון שמעליו לא נסגר)', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'קישור' }))
    expect(screen.getByRole('button', { name: 'השלמת הקישור' })).toBeInTheDocument()
    const outer = vi.fn((e) => e.defaultPrevented)
    window.addEventListener('keydown', outer)
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
    window.removeEventListener('keydown', outer)
    expect(outer).toHaveReturnedWith(true)
    expect(screen.getByRole('button', { name: 'קישור' })).toBeInTheDocument()
  })

  it('תיקון חיתוך: הטקסט של השורה ננעל ("ממתינה לזיהוי מחדש")', () => {
    const { editor } = setup({ initialOps: [{ kind: 'bbox', page: P, ids: [2], value: [100, 120, 900, 162] }], persist: false })
    const seg = editor().querySelector('[data-line="2"]')
    expect(seg).toHaveAttribute('contenteditable', 'false')
    expect(seg).toHaveAttribute('data-label', 'ממתינה לזיהוי מחדש')
    expect(lastArgs.approval.total).toBe(3)
  })

  it('מעבר שני: שורות שזוהו מחדש מסומנות, עם פס-הודעה', () => {
    const page = makePage([L(1, 'אמר רבי', { para_start: true, recheck: true }), L(2, 'יוחנן')])
    const { editor } = setup({ page })
    expect(screen.getByText(/שורה אחת זוהתה מחדש ומסומנת בצהוב/)).toBeInTheDocument()
    expect(editor().querySelector('[data-line="1"]')).toHaveAttribute('data-recheck', '1')
    expect(editor().querySelector('[data-line="2"]')).not.toHaveAttribute('data-recheck')
  })

  it('תצוגה בלבד: הטקסט לא ניתן לעריכה, כלי-העריכה מושבתים, הפעולות מוצגות', () => {
    const { editor } = setup({ readOnly: true, initialOps: [{ kind: 'text', page: P, ids: [1], value: 'אמר רב יוחנן' }] })
    expect(editor()).toHaveAttribute('contenteditable', 'false')
    expect(editor()).toHaveTextContent('אמר רב יוחנן')
    expect(screen.getByRole('button', { name: 'מודגש' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeDisabled()
    expect(lastArgs.ops).toHaveLength(1)
  })

  it('טיוטה נשמרת במפתח draftKey', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'נטוי' }))
    const saved = JSON.parse(window.localStorage.getItem('page-proof-draft:pg1:1:x'))
    expect(saved.ops.map((o) => o.kind)).toEqual(['styles'])
  })

  it('החלפת צדדים וגודל הטקסט נשמרים ב-pageProof.layout', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'החלפת צדדים — הסריקה והטקסט' }))
    fireEvent.click(screen.getByRole('button', { name: 'הגדלת הטקסט' }))
    expect(JSON.parse(window.localStorage.getItem(LAYOUT_KEY))).toMatchObject({ swap: true, fontSize: 22 })
    expect(screen.getByTestId('scan-panel').parentElement).toHaveStyle({ order: '3' })
  })

  it('לוח הפרטים: קישורים, שורה (לפי הסמן), עמוד, שינויים', async () => {
    const page = makePage()
    page.doc.links = [{ from_line: 4, to_line: 1, to_page: P, kind: 'note', conf: 0.8, src: 'auto', from_words: [0, 1], to_words: [2, 2] }]
    const { editor } = setup({ page })
    fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    const drawer = screen.getByRole('complementary', { name: 'פרטים' })
    fireEvent.click(within(drawer).getByText('✓ נכון'))
    expect(opsNow()).toEqual([{ kind: 'link_ok', ids: undefined, value: { src_line: 4, page: P } }])
    // לחיצה על צד-הגוף של הקישור ← הסמן עובר לשורה 1
    fireEvent.click(within(drawer).getByRole('button', { name: /1: «יוחנן»/ }))
    await waitFor(() => expect(screen.getByText('שורה 1')).toBeInTheDocument())
    fireEvent.click(within(drawer).getByRole('tab', { name: 'שורה' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'לא-שורה (הסרה)' }))
    expect(opsNow().at(-1)).toEqual({ kind: 'status', ids: [1], value: 'removed' })
    expect(editor()).not.toHaveTextContent('אמר רבי יוחנן')
    fireEvent.click(within(drawer).getByRole('tab', { name: 'עמוד' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'שחזור' }))
    expect(editor()).toHaveTextContent('אמר רבי יוחנן')
    fireEvent.click(within(drawer).getByRole('tab', { name: /שינויים/ }))
    expect(within(drawer).getByText(/3 פעולות/)).toBeInTheDocument()
  })
})

describe('ProofEditor — תיקוני הביקורת', { timeout: 30000 }, () => {
  it('Ctrl+Z עובד גם כשהמיקוד על תיבת-סימון בלוח הפרטים; לא בשדה-טקסט ולא בתוך חלון מודאלי', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    const drawer = screen.getByRole('complementary', { name: 'פרטים' })
    fireEvent.click(within(drawer).getByRole('tab', { name: 'שורה' }))
    const mixed = within(drawer).getByRole('checkbox', { name: 'שורה מעורבת-כתבים' })
    fireEvent.click(mixed)
    expect(opsNow()).toEqual([{ kind: 'mixed_line', ids: [1], value: 1 }])
    fireEvent.keyDown(mixed, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toEqual([])
    fireEvent.keyDown(mixed, { key: 'ט', code: 'KeyY', ctrlKey: true })
    expect(opsNow()).toHaveLength(1)
    // שדה-טקסט: Ctrl+Z של הדפדפן עצמו — העורך לא נוגע
    const why = within(drawer).getByPlaceholderText(/למה לא בטוח/)
    fireEvent.keyDown(why, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toHaveLength(1)
    // חלון מודאלי (העזרה) — מדלגים
    fireEvent.click(screen.getByRole('button', { name: /עזרה/ }))
    const help = screen.getByRole('dialog', { name: 'מה עושים בעמוד?' })
    fireEvent.keyDown(within(help).getByRole('button', { name: 'הבנתי, מתחילים' }), { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toHaveLength(1)
  })

  it('קישור שני מאותה שורת-הערה — רק אחרי אישור ("להחליף את הקישור?"), ולא בשקט', async () => {
    const page = makePage()
    page.doc.links = [{ from_line: 4, to_line: 2, to_page: P, kind: 'note', conf: 1, src: 'human', from_words: [0, 0], to_words: [0, 0] }]
    const { editor } = setup({ page })
    const link = async (confirm) => {
      dlg.confirm = confirm
      fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
      await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 3 })
      fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
      fireEvent.click(screen.getByRole('tab', { name: /ראשי/ }))
      await caretAt(editor(), { lineId: 1, offset: 5 })
      await act(async () => {
        fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
      })
    }
    await link(false)
    expect(dlg.api.showConfirm).toHaveBeenCalledWith('להחליף את הקישור?', expect.stringContaining('①'), null, 'החלפה', 'ביטול')
    expect(opsNow()).toEqual([])
    expect(screen.getByText('הקישור הקודם נשאר; הקישור החדש לא נוסף')).toBeInTheDocument()
    await link(true)
    expect(opsNow()).toEqual([{ kind: 'link_add', ids: [4, 1], value: { from_words: [0, 0], to_words: [1, 1], kind: 'note' } }])
    expect(screen.getByText(/^הקישור הוחלף/)).toBeInTheDocument()
  })

  it('Ctrl+Enter בלשונית "ריהוט הדף" — אין פסקאות לאישור: רמז, בלי line_ok נסתר', async () => {
    const { editor } = setup()
    fireEvent.click(screen.getByRole('tab', { name: /ריהוט/ }))
    await caretAt(editor(), { lineId: 5, offset: 1 })
    fireEvent.keyDown(editor(), { key: 'Enter', code: 'Enter', ctrlKey: true })
    expect(opsNow()).toEqual([])
    expect(screen.getByText(HINTS.furnitureApprove)).toBeInTheDocument()
  })

  it('זרם ← "ריהוט הדף · כותרת עמוד" (גם כשהעמוד לא הביא אותו באוצר-המילים): השורה עוברת ללשונית "ריהוט הדף"', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 2, offset: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'זרם לשורות' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /ריהוט הדף · כותרת עמוד/ }))
    expect(opsNow()).toEqual([{ kind: 'stream', ids: [2], value: 'header' }])
    expect(screen.getByText('השורה עברה לריהוט הדף («כותרת עמוד» — לא נכנס לספר); היא מופיעה עכשיו בלשונית «ריהוט הדף»')).toBeInTheDocument()
    expect(editor()).not.toHaveTextContent('משום רבי שמעון')
    fireEvent.click(screen.getByRole('tab', { name: /ריהוט/ }))
    expect(editor()).toHaveTextContent('משום רבי שמעון')
  })

  it('סגנון-פסקה חדש מהסרגל (סעיף ממוספר) — פעולת para לכל שורות הפסקה, והסרגל מציג אותו', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 2, offset: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'סגנון הפסקה' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'סעיף ממוספר' }))
    expect(opsNow()).toEqual([{ kind: 'para', ids: [1, 2], value: 'list' }])
    await caretAt(editor(), { lineId: 1, offset: 2 })
    expect(screen.getByRole('button', { name: 'סגנון הפסקה' })).toHaveTextContent('סעיף ממוספר')
    expect(editor().querySelector('[data-para="1:0"]')).toHaveClass('text-justify')
  })

  it('בחירת הצעה למילה ← הסמן בסוף המילה שהוחלפה (ההקלדה הבאה אחריה)', async () => {
    const page = makePage([L(1, 'אמר רבי יוחנן', { para_start: true, alternatives: [{ i: 1, word: 'רבי', p: 0.3, alts: [{ text: 'רב', p: 0.7 }] }] }), L(2, 'משום')])
    const { editor } = setup({ page })
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.keyDown(editor(), { key: 'ArrowDown', code: 'ArrowDown', altKey: true })
    const option = await screen.findByRole('option', { name: /רב/ })
    fireEvent.click(option)
    expect(opsNow()).toEqual([{ kind: 'text', ids: [1], value: 'אמר רב יוחנן' }])
    await waitFor(() => expect(readDomSelection(editor())).toEqual({ anchor: { lineId: 1, offset: 6 }, focus: { lineId: 1, offset: 6 } }))
  })
})

// קישור שהצד השני שלו בעמוד אחר של הספר: הצד הראשון כאן, השני בחלון של העמוד האחר (קריאה
// בלבד, GET של שורות-העמוד — בלי שום בקשה אחרת)
describe('ProofEditor — קישור לעמוד אחר', { timeout: 30000 }, () => {
  const FAR = [
    { id: 101, line_no: 0, order: 1, stream: 'main', para_start: true, para_style: null, text: 'והלכה כרבי יוחנן' },
    { id: 102, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: null, text: 'הערה בעמוד הבא' },
  ]
  let calls
  beforeEach(() => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push([url, init?.method || 'GET'])
        return { status: 200, json: async () => ({ success: true, page: 10, revision: 1, lines: FAR }) }
      })
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('Ctrl+K בהערה ← "עמוד 10" ← מילה בגוף שם = link_add עם to_page/to_line_no/to_text; ביטול מהפרטים, Ctrl+Z מחזיר', async () => {
    const { editor } = setup({ page: { ...makePage(), gid: 'g1' } })
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 10 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    const bar = screen.getAllByTestId('other-page-buttons')[0]
    fireEvent.click(within(bar).getByRole('button', { name: 'עמוד 10' }))

    const dialog = await screen.findByRole('dialog', { name: /הצד השני של הקישור/ })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'יוחנן' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opsNow()).toEqual([
      { kind: 'link_add', ids: [4, 101], value: { from_words: [0, 1], to_words: [2, 2], kind: 'note', to_page: 10, to_line_no: 0, to_text: 'והלכה כרבי יוחנן' } },
    ])
    // רק קריאה אחת, GET של שורות העמוד האחר
    expect(calls).toEqual([['/api/page-proof/books/g1/pages/10/lines', 'GET']])
    expect(screen.queryByText(/נבחר: «/)).toBeNull()

    // בפרטים: "עמוד 10, שורה 1: «…»", ו"ביטול הקישור" מסיר את הפעולה עצמה
    fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    const drawer = screen.getByRole('complementary', { name: 'פרטים' })
    expect(within(drawer).getByText(/עמוד 10, שורה 1: «והלכה כרבי יוחנן»/)).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: /ביטול הקישור/ }))
    expect(opsNow()).toEqual([])
    fireEvent.keyDown(document.body, { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow().map((o) => o.kind)).toEqual(['link_add'])
    // המספר שבטקסט (הצד שבעמוד הזה) מראה לאן הקישור הולך
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    const badge = editor().querySelector('[data-line="4"] [data-badge="①"]')
    expect(badge.getAttribute('title')).toMatch(/עמוד 10, שורה 1/)
  })

  // עורך שמוטמע מחוץ לאתר (תוכנת-הספר): העמוד האחר נטען דרך loadOtherPage ולא מהאתר
  const openFarPage = async (editor) => {
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 10 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    fireEvent.click(within(screen.getAllByTestId('other-page-buttons')[0]).getByRole('button', { name: 'עמוד 10' }))
    return screen.findByRole('dialog', { name: /הצד השני של הקישור/ })
  }

  it('loadOtherPage: העמוד האחר נטען דרכו — פעם אחת, בלי fetch לאתר — והקישור נוסף כרגיל', async () => {
    const loadOtherPage = vi.fn(async (gid, n) => ({ page: n, lines: FAR }))
    const { editor } = setup({ page: { ...makePage(), gid: 'g1' }, loadOtherPage })
    const dialog = await openFarPage(editor)
    fireEvent.click(await within(dialog).findByRole('button', { name: 'יוחנן' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(loadOtherPage.mock.calls).toEqual([['g1', 10]])
    expect(calls).toEqual([])
    expect(opsNow()).toEqual([
      { kind: 'link_add', ids: [4, 101], value: { from_words: [0, 1], to_words: [2, 2], kind: 'note', to_page: 10, to_line_no: 0, to_text: 'והלכה כרבי יוחנן' } },
    ])
  })

  it('loadOtherPage שנכשל — ההודעה שלו בחלון, והחלון נשאר פתוח', async () => {
    const loadOtherPage = vi.fn(async () => {
      throw new Error('עמוד 10 לא נמצא בספר')
    })
    const { editor } = setup({ page: { ...makePage(), gid: 'g1' }, loadOtherPage })
    const dialog = await openFarPage(editor)
    expect(await within(dialog).findByText('עמוד 10 לא נמצא בספר')).toBeInTheDocument()
    expect(calls).toEqual([])
    expect(screen.getByRole('dialog', { name: /הצד השני של הקישור/ })).toBeInTheDocument()
  })

  it('בלי gid (עמוד שלא הגיע מהאתר) ובתצוגה-בלבד — אין כפתורי "עמוד אחר"', async () => {
    const { editor } = setup()
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 10 })
    fireEvent.keyDown(editor(), { key: 'ל', code: 'KeyK', ctrlKey: true })
    expect(screen.getByText(/נבחר: «/)).toBeInTheDocument()
    expect(screen.queryByTestId('other-page-buttons')).toBeNull()
  })
})

// קיצורי-המקלדת בכל פריסה: עברית (e.key 'ז' — ולא 'z'), עברית בלי e.code (מקלדת
// וירטואלית / שולחן-עבודה מרוחק), ו-AZERTY (המקש שכתוב עליו Z הוא KeyW)
describe('ProofEditor — קיצורי-מקלדת בפריסה עברית', { timeout: 30000 }, () => {
  const heb = (key, code, extra = {}) => ({ key, code, ctrlKey: true, ...extra })

  it('Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — עם המקש הפיזי, וגם בלי e.code', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    expect(opsNow()).toHaveLength(1)
    for (const code of ['KeyZ', '', 'Unidentified']) {
      fireEvent.keyDown(editor(), heb('ז', code))
      expect(opsNow()).toEqual([])
      fireEvent.keyDown(editor(), heb('ט', code === 'KeyZ' ? 'KeyY' : code))
      expect(opsNow()).toHaveLength(1)
    }
    // Ctrl+Shift+Z — חזרה (בפריסה עברית Shift נותן אות לטינית גדולה, או את האות העברית)
    fireEvent.keyDown(editor(), heb('ז', ''))
    expect(opsNow()).toEqual([])
    fireEvent.keyDown(editor(), heb('ז', '', { shiftKey: true }))
    expect(opsNow()).toHaveLength(1)
    // גם כשהמיקוד מחוץ לטקסט (בסריקה, בגוף הדף)
    fireEvent.keyDown(screen.getByTestId('scan-panel'), heb('ז', 'KeyZ'))
    expect(opsNow()).toEqual([])
    fireEvent.keyDown(document.body, heb('ט', ''))
    expect(opsNow()).toHaveLength(1)
  })

  it('Ctrl+B / Ctrl+I / Ctrl+K / Ctrl+Enter בפריסה עברית', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.keyDown(editor(), heb('נ', 'KeyB'))
    expect(opsNow()).toEqual([{ kind: 'styles', ids: [1], value: { style: 'b', words: [1, 1], on: true } }])
    fireEvent.keyDown(editor(), heb('ן', ''))
    expect(opsNow()[1]).toEqual({ kind: 'styles', ids: [1], value: { style: 'i', words: [1, 1], on: true } })
    // Ctrl+Enter (גם Enter שבמקלדת המספרים) — אישור הפסקה
    fireEvent.keyDown(editor(), { key: 'Enter', code: 'NumpadEnter', ctrlKey: true })
    expect(opsNow().slice(2).map((o) => o.kind)).toEqual(['line_ok', 'line_ok'])
    // Ctrl+K בלי e.code — הצד הראשון של קישור
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await caretAt(editor(), { lineId: 4, offset: 0 }, { lineId: 4, offset: 10 })
    fireEvent.keyDown(editor(), heb('ל', ''))
    expect(screen.getByText(/נבחר: «/)).toHaveTextContent('רבי יוחנן.')
  })

  it('AZERTY: המקש שכתוב עליו Z מבטל; המקש שבמקום הפיזי של Z (W) — לא', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    fireEvent.keyDown(editor(), heb('w', 'KeyZ'))
    expect(opsNow()).toHaveLength(1)
    fireEvent.keyDown(editor(), heb('z', 'KeyW'))
    expect(opsNow()).toEqual([])
  })

  it('AltGr (Ctrl+Alt) אינו קיצור', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    fireEvent.keyDown(editor(), heb('ז', 'KeyZ', { altKey: true }))
    expect(opsNow()).toHaveLength(1)
  })
})

describe('ProofEditor — "חיבור לפסקה הקודמת" שליד הפסקה', { timeout: 30000 }, () => {
  it('מופיע בפסקה שבה הסמן (לא בראשונה); לחיצה = Backspace בתחילתה; Ctrl+Z מבטל', async () => {
    const { editor } = setup()
    await caretAt(editor(), { lineId: 1, offset: 2 })
    expect(editor().querySelector('[data-join]')).toBeNull() // הפסקה הראשונה — אין לאן לחבר
    await caretAt(editor(), { lineId: 3, offset: 4 })
    const join = within(editor().querySelector('[data-para="3:0"]')).getByRole('button', { name: 'חיבור לפסקה הקודמת' })
    expect(join).toHaveAttribute('title', expect.stringMatching(/Backspace בתחילת הפסקה/))
    fireEvent.click(join)
    expect(opsNow()).toEqual([{ kind: 'para_start', ids: [3], value: 0 }])
    expect(editor().querySelector('[data-para="3:0"]')).toBeNull() // אוחדה עם הקודמת
    fireEvent.keyDown(editor(), { key: 'ז', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toEqual([])
    expect(editor().querySelector('[data-para="3:0"]')).not.toBeNull()
  })

  it('בתצוגה בלבד — אין כפתור', async () => {
    const { editor } = setup({ readOnly: true })
    await caretAt(editor(), { lineId: 3, offset: 4 })
    expect(editor().querySelector('[data-join]')).toBeNull()
  })
})

// נקודות-ההרחבה לעורך שמוטמע מחוץ לאתר (תוכנת-הספר) — מקשים, ביטול כשאין היסטוריה מקומית,
// וגובה הלוחות. בלי ה-props האלה (האתר) הכול כמו קודם — ראו כל הטסטים שלמעלה
describe('ProofEditor — נקודות-הרחבה: מקשים, ביטול וגובה', { timeout: 30000 }, () => {
  const toolbarButton = (name) => within(screen.getByRole('toolbar', { name: 'כלי ההגהה' })).getByRole('button', { name })

  it('onExtraKey נקרא ראשון, עם {inFlow, inField, inModal}; true — העורך לא ממשיך (Ctrl+Z לא מבטל); false — ממשיך', async () => {
    let handled = true
    const onExtraKey = vi.fn(() => handled)
    const { editor } = setup({ onExtraKey })
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    expect(opsNow()).toHaveLength(1)

    fireEvent.keyDown(editor(), { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(onExtraKey).toHaveBeenCalledTimes(1)
    const [ev, ctx] = onExtraKey.mock.calls[0]
    expect(ev.code).toBe('KeyZ')
    expect(ctx).toEqual({ inFlow: true, inField: false, inModal: false })
    expect(opsNow()).toHaveLength(1)

    handled = false
    fireEvent.keyDown(editor(), { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(onExtraKey).toHaveBeenCalledTimes(2)
    expect(opsNow()).toEqual([])
    // גם מקשים שהעורך עצמו לא מטפל בהם מגיעים אליו (למשל Alt+1)
    fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', altKey: true })
    expect(onExtraKey.mock.calls[2][0].code).toBe('Digit1')
    expect(onExtraKey.mock.calls[2][1]).toEqual({ inFlow: false, inField: false, inModal: false })
  })

  it('onUndoEmpty / onRedoEmpty — רק כשההיסטוריה של העורך ריקה; canUndoEmpty משאיר את כפתור-הביטול פעיל', async () => {
    const onUndoEmpty = vi.fn()
    const onRedoEmpty = vi.fn()
    const { editor } = setup({ onUndoEmpty, onRedoEmpty, canUndoEmpty: true })
    expect(toolbarButton('ביטול')).toBeEnabled()
    expect(toolbarButton('חזרה')).toBeDisabled()
    fireEvent.click(toolbarButton('ביטול'))
    expect(onUndoEmpty).toHaveBeenCalledTimes(1)

    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    fireEvent.keyDown(editor(), { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(opsNow()).toEqual([])
    expect(onUndoEmpty).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(editor(), { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(onUndoEmpty).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(editor(), { key: 'y', code: 'KeyY', ctrlKey: true })
    expect(opsNow()).toHaveLength(1)
    expect(onRedoEmpty).not.toHaveBeenCalled()
    fireEvent.keyDown(editor(), { key: 'y', code: 'KeyY', ctrlKey: true })
    expect(onRedoEmpty).toHaveBeenCalledTimes(1)
  })

  it('בתצוגה בלבד — אין ביטול, וגם לא onUndoEmpty; בלי canUndoEmpty הכפתור מושבת כשאין היסטוריה', () => {
    const onUndoEmpty = vi.fn()
    setup({ readOnly: true, onUndoEmpty, canUndoEmpty: true })
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
    expect(onUndoEmpty).not.toHaveBeenCalled()
  })

  it('בלי canUndoEmpty — כמו באתר: אין היסטוריה, הכפתור מושבת', () => {
    setup({ onUndoEmpty: vi.fn() })
    expect(toolbarButton('ביטול')).toBeDisabled()
  })

  it('גובה הלוחות: 100vh פחות --proof-chrome — ברירת-המחדל 12.5rem, כמו באתר', () => {
    const { container } = setup()
    const panes = container.querySelector('[data-proof-panes]')
    expect(panes).not.toBeNull()
    expect(panes.className).toContain('lg:h-[calc(100vh_-_var(--proof-chrome,12.5rem))]')
  })
})

// המשבצות לדף עוטף (תוכנת-הספר): שורות נעולות נוספות, לשוניות בלוח הפרטים, תצוגת-טקסט אחרת,
// הבחירה, כפתורי עיצוב-תווים, תפריט "⋯", ושכבה/פעולות לסריקה. בלעדיהן (האתר) — כמו קודם
describe('ProofEditor — נקודות-הרחבה: משבצות', { timeout: 30000 }, () => {
  it('lockedExtra: הטקסט של השורות האלה נעול, כמו שורה שממתינה לזיהוי-מחדש', () => {
    const { editor } = setup({ lockedExtra: [1] })
    expect(editor().querySelector('[data-line="1"]')).toHaveAttribute('contenteditable', 'false')
    expect(editor().querySelector('[data-line="1"]')).toHaveAttribute('data-locked', '1')
    expect(editor().querySelector('[data-line="2"]')).not.toHaveAttribute('data-locked')
  })

  it('בלי lockedExtra — שום שורה אינה נעולה', () => {
    const { editor } = setup()
    expect(editor().querySelectorAll('[data-locked]')).toHaveLength(0)
  })

  it('extraTabs: לשונית נוספת בלוח הפרטים, אחרי הקבועות, עם מה שהעורך יודע (השורה שבסמן)', async () => {
    const extraTabs = [
      { id: 'tag', label: 'תיוג', render: (ctx) => <p data-testid="tag-tab">שורה שבסמן: {ctx.caretLine?.id ?? 'אין'}</p> },
      { id: 'links', label: 'כפולה', render: () => <p>לא אמור להופיע</p> },
    ]
    const { editor } = setup({ extraTabs })
    await caretAt(editor(), { lineId: 2, offset: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    const drawer = screen.getByRole('complementary', { name: 'פרטים' })
    expect(within(drawer).getAllByRole('tab').map((t) => t.textContent)).toEqual(['קישורים', 'שורה', 'עמוד', 'שינויים', 'תיוג'])
    fireEvent.click(within(drawer).getByRole('tab', { name: 'תיוג' }))
    expect(within(drawer).getByTestId('tag-tab')).toHaveTextContent('שורה שבסמן: 2')
  })

  it('textView: מה שמוצג בלוח-הטקסט — עם העורך הזורם (flow) ו-goTo לשורה', async () => {
    const textView = ({ flow, tabKey, goTo }) => (
      <div data-testid="own-view" data-tab={tabKey}>
        <button type="button" onClick={() => goTo(3)}>
          לשורה 3
        </button>
        {flow}
      </div>
    )
    const { editor } = setup({ textView })
    expect(screen.getByTestId('own-view')).toHaveAttribute('data-tab', 'main')
    expect(editor()).toHaveTextContent('אמר רבי יוחנן')
    fireEvent.click(screen.getByRole('button', { name: 'לשורה 3' }))
    expect(await screen.findByText('שורה 3')).toBeInTheDocument()
  })

  it('textView שמחליף את העורך — אין עורך זורם', () => {
    setup({ textView: () => <pre data-testid="codes">קודי אוצריא</pre> })
    expect(screen.getByTestId('codes')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /טקסט הזרם/ })).toBeNull()
  })

  it('onSelectionChange: הבחירה בטקסט (השורות שבה), וגם מהסריקה', async () => {
    const onSelectionChange = vi.fn()
    const { editor } = setup({ onSelectionChange })
    // מהסריקה: ScanPanel מדווח את הבחירה ההתחלתית (ריקה)
    expect(onSelectionChange).toHaveBeenCalledWith({ from: 'scan', lineIds: [], fid: null })
    await caretAt(editor(), { lineId: 1, offset: 2 }, { lineId: 2, offset: 3 })
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: 'text', anchor: { lineId: 1, offset: 2 }, focus: { lineId: 2, offset: 3 }, lineIds: [1, 2] })
    )
    await caretAt(editor(), { lineId: 3, offset: 0 })
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ from: 'text', lineIds: [3] }))
  })

  it('charStyleButtons: כפתורים נוספים לעיצוב-תווים (למשל "מרווח") — פעולת styles כרגיל', async () => {
    const charStyleButtons = [...CHAR_STYLE_BUTTONS, { key: 'spaced', sign: 'א ב', he: 'מרווח' }]
    const { editor } = setup({ charStyleButtons })
    await caretAt(editor(), { lineId: 1, offset: 5 })
    fireEvent.click(screen.getByRole('button', { name: 'מרווח' }))
    expect(opsNow()).toEqual([{ kind: 'styles', ids: [1], value: { style: 'spaced', words: [1, 1], on: true } }])
  })

  it('בלי charStyleButtons — הכפתורים של האתר, בלי "מרווח"', () => {
    setup()
    expect(screen.getByRole('button', { name: 'מודגש' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'מרווח' })).toBeNull()
  })

  it('moreMenu: תפריט "⋯" בסרגל, והבחירה חוזרת לדף העוטף; בלעדיו — אין תפריט', async () => {
    const onSelect = vi.fn()
    setup({ moreMenu: { items: [{ key: 'reanalyze', label: 'ניתוח-מחדש של העמוד' }], onSelect } })
    fireEvent.click(screen.getByRole('button', { name: 'עוד פעולות' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'ניתוח-מחדש של העמוד' }))
    expect(onSelect).toHaveBeenCalledWith('reanalyze')
  })

  it('בלי moreMenu — אין "עוד פעולות"', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'עוד פעולות' })).toBeNull()
  })

  it('scanOverlay עובר לסריקה (שכבה ב-SVG)', () => {
    setup({ scanOverlay: <circle data-testid="own-mark" cx="10" cy="10" r="5" /> })
    expect(screen.getByTestId('own-mark').closest('[data-layer="extra"]')).not.toBeNull()
  })
})
