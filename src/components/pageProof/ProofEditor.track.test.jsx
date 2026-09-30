import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HELP_SEEN_KEY } from './ProofHelp'
import { setDomSelection } from './flowDom'
import ProofEditor from './ProofEditor'

// הסריקה עוקבת אחרי הסמן: מה ProofEditor מעביר ל-ScanPanel (currentLineId,
// currentWord, caretY). ScanPanel מוחלף כאן ברכיב שרושם את ה-props שלו — מה
// שהסריקה עושה בהם נבדק אצלה.

const scan = vi.hoisted(() => ({ renders: [] }))
vi.mock('./ScanPanel', () => ({
  default: function ScanStub(props) {
    scan.renders.push(props)
    return <div data-testid="scan-panel" />
  },
}))
vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn(async () => false) }),
}))

const last = () => scan.renders[scan.renders.length - 1]
const tracked = () => {
  const p = last()
  return { lineId: p.currentLineId, word: p.currentWord, y: p.caretY }
}

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
  status: 'pending',
  words: W(text),
  ...extra,
})
const page = {
  id: 'pg1',
  page: P,
  revision: 1,
  imageUrl: '/x.png',
  doc: {
    page: P,
    revision: 1,
    size: [1000, 1400],
    lines: [L(1, 'אמר רבי יוחנן', { para_start: true }), L(2, 'משום רבי שמעון'), L(3, 'ועוד פסקה שנייה', { para_start: true })],
    frames: [],
    links: [],
    streams: [{ key: 'main', he: 'ראשי', color: '#1a56db' }],
  },
}

// פריסה מדומה (jsdom אינו מחשב פריסה): הלוחות זה לצד זה, אזור-הגלילה של הטקסט
// בין 80 ל-700, וראש הסמן בשורה n — ב-60+40n (ובשורה 3 אחרי התו ה-8 — שורה נראית
// אחת למטה, כאילו השורה נשברה בטקסט)
const rect = (top, bottom, left = 0, right = 100) => ({ top, bottom, left, right, height: bottom - top, width: right - left, x: left, y: top })
let caretShift = 0
const layout = { scan: rect(0, 800, 0, 500), text: rect(0, 800, 510, 1000) }
const proto = window.Range.prototype
const hadRangeRect = Object.hasOwn(proto, 'getBoundingClientRect')
const origRangeRect = proto.getBoundingClientRect

beforeEach(() => {
  scan.renders = []
  caretShift = 0
  layout.scan = rect(0, 800, 0, 500)
  layout.text = rect(0, 800, 510, 1000)
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
  proto.getBoundingClientRect = function () {
    const el = this.startContainer.nodeType === 1 ? this.startContainer : this.startContainer.parentElement
    const seg = el?.closest?.('[data-line]')
    if (!seg) return rect(0, 0, 0, 0)
    // המקום בשורה: הטקסט שמתחילת הקטע ועד הנקודה
    const r = document.createRange()
    r.setStart(seg, 0)
    r.setEnd(this.startContainer, this.startOffset)
    const at = Number(seg.dataset.start || 0) + r.toString().length
    const id = Number(seg.dataset.line)
    const top = 60 + 40 * id + (id === 3 && at > 8 ? 42 : 0) + caretShift
    return rect(top, top + 26, 600, 600)
  }
})
afterEach(() => {
  if (hadRangeRect) proto.getBoundingClientRect = origRangeRect
  else delete proto.getBoundingClientRect
})

function setup(props = {}) {
  render(<ProofEditor page={page} draftKey="page-proof-draft:pg1:1:track" persist={false} {...props} />)
  const editor = screen.getByRole('textbox', { name: /טקסט הזרם/ })
  const scanPane = screen.getByTestId('scan-panel').parentElement
  const textPane = screen.getByRole('region', { name: 'טקסט העמוד' }).parentElement
  scanPane.getBoundingClientRect = () => layout.scan
  textPane.getBoundingClientRect = () => layout.text
  document.querySelector('[data-proof-text-scroll]').getBoundingClientRect = () => rect(80, 700, 510, 1000)
  return { editor }
}

// מהלך בטקסט: הבחירה בדפדפן זזה (מקלדת/עכבר) ← selectionchange
async function caretAt(editor, anchor, focus = anchor) {
  setDomSelection(editor, { anchor, focus })
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 40))
  })
}

describe('ProofEditor — הסריקה עוקבת אחרי הסמן', { timeout: 30000 }, () => {
  it('מהלך בטקסט: השורה, המילה שבסמן, וראש השורה של הסמן על המסך (caretY)', async () => {
    const { editor } = setup()
    expect(tracked()).toEqual({ lineId: null, word: -1, y: null })
    await caretAt(editor, { lineId: 2, offset: 6 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 2, word: 1, y: 140 }))
    // אותה שורת-סריקה, שורה נראית אחת למטה (השורה נשברה בטקסט) — ראש השורה של הסמן עצמו
    await caretAt(editor, { lineId: 3, offset: 12 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 3, word: 2, y: 222 }))
    // סוף המילה הראשונה (הסמן צמוד אליה) — היא המילה, בשורה הנראית הראשונה
    await caretAt(editor, { lineId: 3, offset: 4 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 3, word: 0, y: 180 }))
  })

  it('סמן ברווח שאינו צמוד למילה — אין מילה (currentWord מינוס 1)', async () => {
    const doc = { ...page.doc, lines: [L(1, 'אמר  רבי', { para_start: true })] }
    const { editor } = setup({ page: { ...page, doc } })
    await caretAt(editor, { lineId: 1, offset: 4 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 1, word: -1, y: 100 }))
  })

  it('לחיצה על הסריקה: הסמן והמילה עוברים לשם, אבל caretY = null — הסריקה לא זזה מתחת לעכבר', async () => {
    const { editor } = setup()
    await caretAt(editor, { lineId: 1, offset: 1 })
    await waitFor(() => expect(tracked().y).toBe(100))
    act(() => last().onPickLine(3, { wordIndex: 1 }))
    await waitFor(() => expect(tracked()).toEqual({ lineId: 3, word: 1, y: null }))
    // העורך מקבל מיקוד (Tab) ומציב את אותה בחירה — זה לא מהלך בטקסט
    fireEvent.focus(editor)
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise((r) => setTimeout(r, 40))
    })
    // פעולה מהסרגל על המילה (מודגש) מציבה שוב את אותה בחירה — עדיין לא מהלך
    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(tracked()).toEqual({ lineId: 3, word: 1, y: null })
    // מהלך אמיתי בטקסט — שוב caretY
    await caretAt(editor, { lineId: 2, offset: 0 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 2, word: 0, y: 140 }))
  })

  it('caretY = null כשהלוחות זה מעל זה (מסך צר), וכשהסמן כולו מחוץ לאזור-הגלילה של הטקסט', async () => {
    const { editor } = setup()
    layout.scan = rect(0, 400, 0, 1000)
    layout.text = rect(410, 900, 0, 1000)
    await caretAt(editor, { lineId: 2, offset: 1 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 2, word: 0, y: null }))
    layout.scan = rect(0, 800, 0, 500)
    layout.text = rect(0, 800, 510, 1000)
    caretShift = 700
    await caretAt(editor, { lineId: 1, offset: 1 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 1, word: 0, y: null }))
    caretShift = 0
    await caretAt(editor, { lineId: 1, offset: 5 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 1, word: 1, y: 100 }))
  })

  it('הקלדה בתוך מילה אינה מרנדרת את הסריקה מעבר לשינוי בטקסט עצמו; רווח שמפצל מילה — מילה חדשה', async () => {
    const { editor } = setup()
    await caretAt(editor, { lineId: 1, offset: 5 })
    await waitFor(() => expect(tracked()).toEqual({ lineId: 1, word: 1, y: 100 }))
    const type = async (data) => {
      act(() => {
        editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data }))
      })
      // הסמן במודל מתעדכן מ-selectionchange (העורך הציב אותו אחרי הרינדור), ואחריו פריים
      await act(async () => {
        document.dispatchEvent(new Event('selectionchange'))
        await new Promise((r) => setTimeout(r, 60))
      })
    }
    const n0 = scan.renders.length
    await type('ב')
    await type('ג')
    // רינדור אחד לכל אות — בגלל הטקסט שהשתנה (view); הסמן זז בתוך אותה מילה, באותה שורה
    expect(scan.renders.length - n0).toBe(2)
    expect(tracked()).toEqual({ lineId: 1, word: 1, y: 100 })
    await type(' ')
    await waitFor(() => expect(tracked()).toEqual({ lineId: 1, word: 2, y: 100 }))
  })

  it('מעבר ללשונית אחרת — אין סמן: בלי שורה, בלי מילה ובלי caretY', async () => {
    const doc = { ...page.doc, lines: [...page.doc.lines, L(4, 'הערה אחת', { stream: 'notes', para_start: true })] }
    const { editor } = setup({ page: { ...page, doc } })
    await caretAt(editor, { lineId: 2, offset: 1 })
    await waitFor(() => expect(tracked().lineId).toBe(2))
    fireEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await waitFor(() => expect(tracked()).toEqual({ lineId: null, word: -1, y: null }))
  })
})
