import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import FramesEditor from './FramesEditor'

// העורך בשלושת המצבים: ציור בגרירה על מקום ריק (ה-9), הזזה ושינוי-גודל מקצה (ה-8), מקשי התפקיד/הזרם/
// ממשיך/מחיקה, סדר-הקריאה (O), Enter, ומצב קריאה-בלבד שלא משנה דבר. התמונה לא נטענת ב-jsdom, ולכן
// אין רשת-דיו — ההצמדה עצמה נבדקת ב-inkSnap.test.js.

const W = 1000
const H = 1400
const STREAMS = [
  { id: 's1', name: 'פנים', role: 'body' },
  { id: 's2', name: 'רש"י', role: 'commentary' },
]
const page = (frames) => ({ id: 'p1', w: W, h: H, img: '/x.jpg', page: 3, state: 'proposed', frames })
const F1 = { fid: 'f1', kind: 'text', role: 'body', box: [100, 100, 500, 700], stream: 's1', ord: 1, cont: false, src: 'auto' }
const F2 = { fid: 'f2', kind: 'text', role: 'commentary', box: [600, 100, 900, 700], stream: 's2', ord: 2, cont: false, src: 'auto' }

// המשטח בגודל 500×700 פיקסלי-מסך = חצי מהעמוד
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 700, right: 500, bottom: 700, x: 0, y: 0 })
})

const surface = () => screen.getByTestId('page-surface')
const at = (x, y) => ({ clientX: x / 2, clientY: y / 2, button: 0, pointerId: 1 })
function dragOn(from, to) {
  fireEvent.pointerDown(surface(), at(...from))
  fireEvent.pointerMove(surface(), at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2))
  fireEvent.pointerMove(surface(), at(...to))
  fireEvent.pointerUp(surface(), at(...to))
}
const lastFrames = (fn) => fn.mock.calls.filter((c) => c[1].save).at(-1)?.[0]
const key = (code, extra = {}) => act(() => void fireEvent.keyDown(window, { code, key: code.replace(/^(Digit|Key)/, ''), ...extra }))

describe('FramesEditor — edit', () => {
  it('גרירה על מקום ריק מציירת מסגרת חדשה (n1), נבחרת, ונשמרת', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={STREAMS} onChange={onChange} snap={false} />)
    dragOn([550, 900], [950, 1300])
    const fr = lastFrames(onChange)
    expect(fr).toHaveLength(2)
    expect(fr[1]).toMatchObject({ fid: 'n1', role: 'body', stream: 's1', ord: 2, src: 'human', box: [550, 900, 950, 1300] })
    expect(screen.getByTestId('frame-panel')).toBeTruthy()
  })

  it('לחיצה קטנה על מקום ריק — לא מסגרת', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={STREAMS} onChange={onChange} snap={false} />)
    dragOn([550, 900], [554, 903])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('גרירת מסגרת מזיזה אותה; גרירת הקצה הימני מגדילה רק אותו', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={STREAMS} onChange={onChange} snap={false} />)
    dragOn([300, 400], [340, 420])
    expect(lastFrames(onChange)[0].box).toEqual([140, 120, 540, 720])
    dragOn([540, 400], [600, 400])
    expect(lastFrames(onChange)[0].box).toEqual([140, 120, 600, 720])
    expect(lastFrames(onChange)[0].src).toBe('human')
  })

  it('המקשים: 3 = הערות, Alt+2 = זרם שני, C = ממשיך, 8 = ריהוט (בלי זרם), Delete', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1, F2])} streams={STREAMS} onChange={onChange} snap={false} />)
    fireEvent.pointerDown(surface(), at(300, 400))
    fireEvent.pointerUp(surface(), at(300, 400))
    key('Digit3')
    expect(lastFrames(onChange)[0].role).toBe('notes')
    key('Digit2', { altKey: true })
    expect(lastFrames(onChange)[0].stream).toBe('s2')
    key('KeyC')
    expect(lastFrames(onChange)[0].cont).toBe(true)
    key('Digit8')
    expect(lastFrames(onChange)[0]).toMatchObject({ role: 'furniture', stream: null, cont: false })
    key('Delete', { key: 'Delete' })
    expect(lastFrames(onChange).map((f) => f.fid)).toEqual(['f2'])
    expect(lastFrames(onChange)[0].ord).toBe(1)
  })

  it('Ctrl+Z מבטל את השינוי האחרון', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={STREAMS} onChange={onChange} snap={false} />)
    dragOn([300, 400], [340, 420])
    key('KeyZ', { ctrlKey: true })
    expect(lastFrames(onChange)[0].box).toEqual(F1.box)
  })

  it('סדר הקריאה: O, לחיצה על השנייה ואז הראשונה — מתהפך', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1, F2])} streams={STREAMS} onChange={onChange} snap={false} />)
    key('KeyO')
    expect(screen.getByTestId('editor-hint').textContent).toMatch(/סדר הקריאה/)
    fireEvent.pointerDown(surface(), at(750, 400))
    fireEvent.pointerDown(surface(), at(300, 400))
    const fr = lastFrames(onChange)
    expect(Object.fromEntries(fr.map((f) => [f.fid, f.ord]))).toEqual({ f1: 2, f2: 1 })
  })

  it('Enter = onConfirm עם המסגרות הנוכחיות', () => {
    const onConfirm = vi.fn()
    render(<FramesEditor page={page([F1])} streams={STREAMS} onConfirm={onConfirm} snap={false} />)
    key('Enter', { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith([F1])
  })

  it('המספר של המסגרת מוצג מעליה, והצעת המודל מקווקוות', () => {
    render(<FramesEditor page={page([F1, { ...F2, src: 'human' }])} streams={STREAMS} snap={false} />)
    const labels = screen.getAllByTestId('frame-label').map((l) => l.textContent)
    expect(labels).toEqual(['1 · פנים 1', '2 · רש"י 1'])
    const [a, b] = screen.getAllByTestId('frame')
    expect(a.style.border).toMatch(/dashed/)
    expect(b.style.border).toMatch(/solid/)
  })
})

describe('FramesEditor — הסוג לפי הזרם', () => {
  const S3 = [...STREAMS, { id: 'x1', name: 'הגהות', role: 'notes', added: true }]
  const pickF1 = () => {
    fireEvent.pointerDown(surface(), at(300, 400))
    fireEvent.pointerUp(surface(), at(300, 400))
  }

  it('בחירת זרם בלוח — המסגרת מקבלת את הסוג שלו', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={S3} onChange={onChange} snap={false} />)
    pickF1()
    fireEvent.click(screen.getAllByTestId('stream-button').find((b) => b.textContent.includes('הגהות')))
    expect(lastFrames(onChange)[0]).toMatchObject({ stream: 'x1', role: 'notes', src: 'human' })
    expect(screen.getByTestId('kind-note').textContent).toMatch(/נקבע לפי הזרם/)
  })

  it('מקש של סוג (2 = פירוש) מעביר לזרם מהסוג הזה; 5 = כותרת בתוך אותו זרם', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1])} streams={S3} onChange={onChange} snap={false} />)
    pickF1()
    key('Digit2')
    expect(lastFrames(onChange)[0]).toMatchObject({ role: 'commentary', stream: 's2' })
    key('Digit5')
    expect(lastFrames(onChange)[0]).toMatchObject({ role: 'heading', stream: 's2' })
  })

  it('מסגרת בתפקיד שלא מתאים לזרם — מוצגת בסוג של הזרם בטעינה, בלי שמירה', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([{ ...F1, role: 'notes' }])} streams={S3} onChange={onChange} snap={false} />)
    expect(screen.getAllByTestId('frame')[0].style.getPropertyValue('--c')).toBe('#2a5bd7')
    expect(onChange.mock.calls.filter((c) => c[1].save)).toHaveLength(0)
  })

  it('הסוג של זרם השתנה (streams חדש) — המסגרות שלו מתעדכנות, בלי שמירה', () => {
    const onChange = vi.fn()
    const F3 = { ...F1, fid: 'f3', stream: 'x1', role: 'notes', ord: 2 }
    const { rerender } = render(<FramesEditor page={page([F1, F3])} streams={S3} onChange={onChange} snap={false} />)
    const next = S3.map((s) => (s.id === 'x1' ? { ...s, role: 'commentary' } : s))
    rerender(<FramesEditor page={page([F1, F3])} streams={next} onChange={onChange} snap={false} />)
    const last = onChange.mock.calls.at(-1)
    expect(last[1]).toMatchObject({ save: false, reason: 'roles' })
    expect(last[0].map((f) => f.role)).toEqual(['body', 'commentary'])
  })
})

describe('FramesEditor — סדר הקריאה תוך כדי עבודה', () => {
  const F3 = { fid: 'f3', kind: 'text', role: 'body', box: [100, 800, 500, 1300], stream: 's1', ord: 3, cont: false, src: 'auto' }
  const ords = (fr) => Object.fromEntries(fr.map((f) => [f.fid, f.ord]))

  it('בלי מצב "סדר": "מוקדם יותר"/"מאוחר יותר" בלוח, ו-Alt+↑/↓', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1, F2, F3])} streams={STREAMS} onChange={onChange} snap={false} />)
    fireEvent.pointerDown(surface(), at(750, 400))
    fireEvent.pointerUp(surface(), at(750, 400))
    fireEvent.click(screen.getByTestId('order-earlier'))
    expect(ords(lastFrames(onChange))).toEqual({ f1: 2, f2: 1, f3: 3 })
    expect(screen.getByTestId('editor-hint').textContent).not.toMatch(/לחצו על המסגרות/)
    key('ArrowDown', { key: 'ArrowDown', altKey: true })
    key('ArrowDown', { key: 'ArrowDown', altKey: true })
    expect(ords(lastFrames(onChange))).toEqual({ f1: 1, f2: 3, f3: 2 })
    expect(screen.getByTestId('order-later').disabled).toBe(true)
  })

  it('להעביר למקום, ובתוך הזרם — לפני הקודמת בזרם', () => {
    const onChange = vi.fn()
    render(<FramesEditor page={page([F1, F2, F3])} streams={STREAMS} onChange={onChange} snap={false} />)
    fireEvent.pointerDown(surface(), at(300, 1000))
    fireEvent.pointerUp(surface(), at(300, 1000))
    fireEvent.change(screen.getByTestId('order-place'), { target: { value: '1' } })
    expect(ords(lastFrames(onChange))).toEqual({ f1: 2, f2: 3, f3: 1 })
    fireEvent.click(screen.getByTestId('stream-later'))
    expect(ords(lastFrames(onChange))).toEqual({ f1: 1, f2: 3, f3: 2 })
  })

  it('רשימת הסדר בעמוד — לפי הסדר, ולחיצה על שורה בוחרת את המסגרת', () => {
    render(<FramesEditor page={page([F2, F1])} streams={STREAMS} snap={false} />)
    const rows = screen.getAllByTestId('order-row')
    expect(rows.map((r) => r.textContent)).toEqual(['1פנים 1', '2רש"י 1'])
    fireEvent.click(rows[1])
    expect(screen.getByTestId('frame-panel')).toBeTruthy()
    expect(screen.getAllByTestId('order-row')[1].getAttribute('aria-current')).toBe('true')
  })
})

describe('FramesEditor — readOnly / review', () => {
  it('קריאה בלבד: אין ציור, אין מקשים, אבל אפשר לבחור ולראות', () => {
    const onChange = vi.fn()
    render(<FramesEditor mode="readOnly" page={page([F1])} streams={STREAMS} onChange={onChange} />)
    dragOn([550, 900], [950, 1300])
    fireEvent.pointerDown(surface(), at(300, 400))
    key('Digit3')
    key('Delete', { key: 'Delete' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('קריאה בלבד')).toBeTruthy()
    expect(screen.queryByTestId('snap-toggle')).toBeNull()
  })

  it('סקירה: עורכים כמו המתנדב, ההשוואה מצוירת, ואין "זרם חדש"', () => {
    const onChange = vi.fn()
    const { container } = render(
      <FramesEditor mode="review" page={page([F1])} streams={STREAMS} onChange={onChange} onAddStream={vi.fn()} compare={[F2]} snap={false} />
    )
    expect(container.querySelectorAll('.border-dashed.border-outline')).toHaveLength(1)
    fireEvent.pointerDown(surface(), at(300, 400))
    fireEvent.pointerUp(surface(), at(300, 400))
    expect(screen.queryByText('זרם חדש לספר')).toBeNull()
    key('Digit2')
    expect(lastFrames(onChange)[0].role).toBe('commentary')
  })
})
