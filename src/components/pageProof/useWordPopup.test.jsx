import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { buildView } from '@/lib/pageProof/ops'
import { useWordPopup } from './useWordPopup'
import FlowEditor from './FlowEditor'

// עמוד קטן: בשורה 7 המילה 1 ("רבי") מסומנת — חלופות-זיהוי + שני סוגי חשד של
// מודל-השפה; המילה 0 ("אמר") אינה מסומנת.
const view = {
  lines: [
    {
      id: 7,
      text: 'אמר רבי יוחנן',
      alternatives: [{ i: 1, word: 'רבי', p: 0.35, alts: [{ text: 'רב', p: 0.4 }, { text: 'רבו', p: 0.15 }], other_p: 0.1 }],
      lm_flags: [{ i: 1, word: 'רבי', kinds: ['lm', 'rec'], lm: [{ text: 'רבה', gain: 1.2 }], rec: [{ text: 'רבו', gain: 0.8 }] }],
    },
  ],
}
const WORDS = ['אמר', 'רבי', 'יוחנן']

// רתמה: מחקה את FlowEditor (span data-line ובתוכו span data-w לכל מילה)
function Harness({ onPick = vi.fn(), readOnly = false }) {
  const pop = useWordPopup(view, { onPick, readOnly })
  return (
    <div>
      <div data-testid="text-scroll">
        <span data-line="7">
          {WORDS.map((w, i) => (
            <span
              key={i}
              data-w={i}
              data-testid={`w${i}`}
              onMouseEnter={(e) => pop.onWordEnter(7, i, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => pop.onWordLeave()}
            >
              {w}{' '}
            </span>
          ))}
        </span>
      </div>
      <div data-testid="scan-scroll" />
      <button type="button" onClick={() => pop.openKeyboard(7, 1)}>kbd</button>
      <button type="button" onClick={() => pop.onCaretMove(7, 1)}>caret-in</button>
      <button type="button" onClick={() => pop.onCaretMove(7, 2)}>caret-away</button>
      {pop.popup}
    </div>
  )
}

const popupEl = () => screen.queryByRole('listbox')
const advance = (ms) => act(() => vi.advanceTimersByTime(ms))

function openByHover() {
  fireEvent.mouseEnter(screen.getByTestId('w1'))
  advance(250)
  expect(popupEl()).toBeInTheDocument()
  return popupEl()
}

describe('useWordPopup — חלונית ההצעות למילה', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('נפתחת רק אחרי 250ms של ריחוף על מילה מסומנת', () => {
    render(<Harness />)
    fireEvent.mouseEnter(screen.getByTestId('w1'))
    advance(249)
    expect(popupEl()).toBeNull()
    advance(1)
    expect(popupEl()).toBeInTheDocument()
    expect(popupEl()).toHaveAccessibleName('הצעות למילה רבי')
  })

  it('נסגרת כשהעכבר עוזב את המילה בלי להיכנס לחלונית (180ms)', () => {
    render(<Harness />)
    openByHover()
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    advance(179)
    expect(popupEl()).toBeInTheDocument()
    advance(1)
    expect(popupEl()).toBeNull()
  })

  it('נשארת פתוחה במעבר מהמילה לחלונית, ונסגרת כשעוזבים את החלונית', () => {
    render(<Harness />)
    const pop = openByHover()
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    advance(100)
    fireEvent.mouseEnter(pop)
    advance(1000)
    expect(popupEl()).toBeInTheDocument()
    fireEvent.mouseLeave(pop)
    advance(180)
    expect(popupEl()).toBeNull()
  })

  it('עזיבה לפני 250ms — לא נפתחת; מילה בלי הצעות — לא נפתחת', () => {
    render(<Harness />)
    fireEvent.mouseEnter(screen.getByTestId('w1'))
    advance(200)
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    advance(500)
    expect(popupEl()).toBeNull()
    fireEvent.mouseEnter(screen.getByTestId('w0'))
    advance(500)
    expect(popupEl()).toBeNull()
  })

  it('Escape, מעבר לחלון אחר, הסתרת הלשונית וגלילת הטקסט — סוגרים מיד', () => {
    render(<Harness />)
    openByHover()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(popupEl()).toBeNull()

    openByHover()
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(popupEl()).toBeNull()

    openByHover()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    delete document.visibilityState
    expect(popupEl()).toBeNull()

    openByHover()
    fireEvent.scroll(screen.getByTestId('text-scroll'))
    expect(popupEl()).toBeNull()
  })

  it('גלילה של לוח אחר (הסריקה) או בתוך החלונית — לא סוגרת', () => {
    render(<Harness />)
    const pop = openByHover()
    fireEvent.scroll(screen.getByTestId('scan-scroll'))
    fireEvent.scroll(pop)
    expect(popupEl()).toBeInTheDocument()
  })

  it('בזמן גרירת בחירה (כפתור לחוץ) לא נפתחת; אחרי שחרור — כן, גם כשהשחרור היה מחוץ לחלון', () => {
    render(<Harness />)
    fireEvent.mouseDown(document.body, { button: 0 })
    fireEvent.mouseEnter(screen.getByTestId('w1'))
    advance(300)
    expect(popupEl()).toBeNull()
    fireEvent.mouseUp(document.body)
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    openByHover()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    fireEvent.mouseDown(document.body, { button: 0 })
    // השחרור היה מחוץ לחלון (אין mouseup) — תנועה בלי כפתור מאפסת
    fireEvent.mouseMove(document.body, { buttons: 0 })
    openByHover()
  })

  it('הסמן שעוזב את המילה סוגר; דיווח חוזר על אותו מקום — לא', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('caret-in'))
    openByHover()
    fireEvent.click(screen.getByText('caret-in'))
    expect(popupEl()).toBeInTheDocument()
    fireEvent.click(screen.getByText('caret-away'))
    expect(popupEl()).toBeNull()
  })

  it('בחירת הצעה בלחיצה: onPick(שורה, מילה, טקסט) והחלונית נסגרת', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    openByHover()
    fireEvent.click(screen.getByRole('option', { name: /רבה/ }))
    expect(onPick).toHaveBeenCalledWith(7, 1, 'רבה')
    expect(popupEl()).toBeNull()
  })

  it('פתיחה מהמקלדת: מיד, ↑↓ מסמנים, Enter מחליף — והמקשים אינם מגיעים לעורך', () => {
    const onPick = vi.fn()
    const editorKeys = vi.fn()
    render(<Harness onPick={onPick} />)
    const text = screen.getByTestId('text-scroll')
    text.addEventListener('keydown', editorKeys)
    fireEvent.click(screen.getByText('kbd'))
    expect(popupEl()).toBeInTheDocument()
    const opts = screen.getAllByRole('option')
    expect(opts.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    fireEvent.keyDown(text, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(text, { key: 'ArrowUp' })
    fireEvent.keyDown(text, { key: 'ArrowUp' })
    // גלישה מההתחלה לסוף
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(text, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(7, 1, 'רבה')
    expect(editorKeys).not.toHaveBeenCalled()
    expect(popupEl()).toBeNull()
  })

  it('פתיחה מהמקלדת אינה נסגרת מטיימר, ובמצב תצוגה-בלבד אי אפשר לבחור', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} readOnly />)
    fireEvent.click(screen.getByText('kbd'))
    advance(2000)
    expect(popupEl()).toBeInTheDocument()
    expect(screen.getByText(/תצוגה בלבד/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(onPick).not.toHaveBeenCalled()
  })

  it('פתיחה מהמקלדת: העכבר שעובר על המילה ועל החלונית ויוצא — אינו סוגר; ↑↓ ממשיכים לעבוד', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('kbd'))
    fireEvent.mouseEnter(screen.getByTestId('w1'))
    advance(300)
    fireEvent.mouseLeave(screen.getByTestId('w1'))
    advance(500)
    expect(popupEl()).toBeInTheDocument()
    fireEvent.mouseEnter(popupEl())
    fireEvent.mouseLeave(popupEl())
    advance(500)
    expect(popupEl()).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
  })
})

// עם העורך האמיתי: המילה מאבדת את ההצעות שלה (הוקלדה בה אות) בזמן שהחלונית
// פתוחה, העכבר יוצא, ואז Ctrl+Z מחזיר את ההצעות — החלונית לא צצה מחדש
describe('useWordPopup + FlowEditor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const P = 4
  const L = (id, text, extra = {}) => ({ id, order: id, line_no: id - 1, bbox: [100, id * 50, 900, id * 50 + 40], text, text_ocr: text, stream: 'main', status: 'pending', words: text.split(' ').map((t) => ({ text: t, styles: [] })), ...extra })
  const doc = { page: P, size: [1000, 2000], lines: [L(3, 'אמר רבי יוחנן', { para_start: true, alternatives: [{ i: 1, word: 'רבי', p: 0.4, alts: [{ text: 'רב', p: 0.4 }] }] }), L(4, 'מאי דכתיב')] }
  function Wrap({ view }) {
    const pop = useWordPopup(view, { onPick: vi.fn() })
    return (
      <>
        <FlowEditor view={view} tabKey="main" push={vi.fn(() => true)} onWordEnter={pop.onWordEnter} onWordLeave={pop.onWordLeave} />
        {pop.popup}
      </>
    )
  }

  it('נסגרת כשהמילה איבדה את ההצעות, ולא חוזרת ב-Ctrl+Z', () => {
    const v0 = buildView(doc)
    const v1 = buildView(doc, [{ kind: 'text', page: P, ids: [3], value: 'אמר רביק יוחנן' }])
    const { rerender } = render(<Wrap view={v0} />)
    const word = () => document.querySelector('[data-line="3"] [data-w="1"]')
    fireEvent.mouseEnter(word())
    advance(300)
    expect(popupEl()).toBeInTheDocument()
    rerender(<Wrap view={v1} />)
    expect(popupEl()).toBeNull()
    fireEvent.mouseLeave(word())
    advance(1000)
    rerender(<Wrap view={v0} />)
    advance(2000)
    expect(popupEl()).toBeNull()
  })
})
