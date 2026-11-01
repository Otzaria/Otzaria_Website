import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { useWordTracking, findTextarea, revealCaret } from './useWordTracking'

const W = (text, x0, x1, y) => ({ text, bbox: [x0, y, x1, y + 20] })
const SCAN = [
  { id: 0, stream: 'main', bbox: [10, 0, 300, 20], words: [W('בראשית', 220, 300, 0), W('ברא', 140, 210, 0), W('אלהים', 10, 130, 0)] },
  { id: 1, stream: 'main', bbox: [10, 40, 300, 60], words: [W('את', 250, 300, 40), W('השמים', 10, 240, 40)] }
]
const TEXT = 'בראשית ברא אלהים\nאת השמים'

let api
const keep = (a) => {
  api = a
}
function Harness({ scanLines = SCAN, column = 'content', enabled = true, two = false, onApi = keep }) {
  const ref = useRef(null)
  const a = useWordTracking({ containerRef: ref, column, scanLines, enabled })
  useEffect(() => {
    onApi(a)
  })
  return (
    <div ref={ref}>
      {two ? (
        <>
          <textarea data-column="right" defaultValue={TEXT} />
          <textarea data-column="left" defaultValue={'את השמים'} />
        </>
      ) : (
        <textarea defaultValue={TEXT} />
      )}
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
})
afterEach(() => vi.unstubAllGlobals())

const moveCaret = (ta, pos) => {
  ta.focus()
  ta.setSelectionRange(pos, pos)
  fireEvent.keyUp(ta, { key: 'ArrowLeft' })
}

describe('useWordTracking', () => {
  it('הסמן → שורה, מילה ותיבה בצילום; מעבר שורה מסומן', async () => {
    const { container } = render(<Harness />)
    const ta = container.querySelector('textarea')
    moveCaret(ta, TEXT.indexOf('ברא '))
    await waitFor(() => expect(api.track?.word).toBe(1))
    expect(api.track.line).toBe(0)
    expect(api.track.scanIndex).toBe(0)
    expect(api.track.wordBox).toEqual([140, 0, 210, 20])
    expect(api.track.kind).toBe('solid')
    moveCaret(ta, TEXT.indexOf('השמים'))
    await waitFor(() => expect(api.track.line).toBe(1))
    expect(api.lineChanged).toBe(true)
    // מילה אחרת באותה שורה — לא מעבר שורה
    moveCaret(ta, TEXT.indexOf('את '))
    await waitFor(() => expect(api.track.word).toBe(0))
    expect(api.lineChanged).toBe(false)
  })

  it('caretFromScan → הסמן בתחילת המילה ו-focus על ה-textarea', async () => {
    const { container } = render(<Harness />)
    const ta = container.querySelector('textarea')
    let ok
    act(() => {
      ok = api.caretFromScan(0, 2)
    })
    expect(ok).toBe(true)
    expect(document.activeElement).toBe(ta)
    expect(ta.selectionStart).toBe(TEXT.indexOf('אלהים'))
    await waitFor(() => expect(api.track?.word).toBe(2))
    expect(api.caretFromScan(7, 0)).toBe(false)
  })

  it('caretFromScan עם נקודת הלחיצה → המילה שבנקודה, גם כשהסמן כבר במוקד', async () => {
    const { container } = render(<Harness />)
    const ta = container.querySelector('textarea')
    moveCaret(ta, TEXT.indexOf('השמים'))
    act(() => {
      api.caretFromScan(0, null, { x: 170, y: 10 })
    })
    expect(document.activeElement).toBe(ta)
    expect(ta.selectionStart).toBe(TEXT.indexOf('ברא '))
    await waitFor(() => expect(api.track?.line).toBe(0))
    expect(api.track.word).toBe(1)
  })

  it('טקסט זורם (העמוד בשורה אחת): לחיצה על מילה בצילום → אותה מילה שהמעקב מסמן בה', async () => {
    // שש שורות צילום, 4 מילים בכל אחת; הטקסט — 24 מילים בשורה אחת
    const lines = Array.from({ length: 6 }, (_, i) => ({
      id: i, stream: 'main', paraEnd: i === 5, bbox: [10, i * 30, 310, i * 30 + 20],
      words: [0, 1, 2, 3].map((k) => ({ bbox: [235 - k * 75, i * 30, 310 - k * 75, i * 30 + 20] }))
    }))
    const flow = Array.from({ length: 24 }, (_, i) => `מילה${i}`).join(' ')
    function Flow() {
      const ref = useRef(null)
      const a = useWordTracking({ containerRef: ref, scanLines: lines })
      useEffect(() => {
        api = a
      })
      return <div ref={ref}><textarea defaultValue={flow} /></div>
    }
    const { container } = render(<Flow />)
    const ta = container.querySelector('textarea')
    for (const [line, word] of [[0, 0], [2, 1], [3, 3], [5, 2]]) {
      const b = lines[line].words[word].bbox
      act(() => {
        api.caretFromScan(line, word, { x: (b[0] + b[2]) / 2, y: b[1] + 10 })
      })
      expect(ta.selectionStart).toBe(flow.indexOf(`מילה${line * 4 + word}`))
      await waitFor(() => expect(api.track?.wordBox).toEqual(b))
    }
  })

  it('שני טורים — ה-textarea של הטור; כבוי — בלי מעקב', async () => {
    const { container, rerender } = render(<Harness two column="left" />)
    expect(findTextarea(container.firstChild, 'left')).toBe(container.querySelector('[data-column="left"]'))
    expect(findTextarea(container.firstChild, 'content')).toBe(container.querySelector('textarea'))
    moveCaret(container.querySelector('[data-column="left"]'), 0)
    await waitFor(() => expect(api.track?.line).toBe(0))
    rerender(<Harness two column="left" enabled={false} />)
    expect(api.track).toBeNull()
  })
})

describe('revealCaret', () => {
  // שדה מעוצב מדומה: המדידה (caretRowY) מה-API שלו, השדה עצמו הוא הגולל
  const field = (rowY, scrollTop = 0) => ({
    __richTextarea: { caretRowY: () => rowY - scrollTop },
    getBoundingClientRect: () => ({ top: 100, height: 400 }),
    clientTop: 0,
    clientHeight: 400,
    scrollHeight: 5000,
    scrollTop,
    scrollTo: vi.fn()
  })

  it('שורת הסמן נעמדת מול השורה שנלחצה; קפיצה רחוקה — מיידית', () => {
    const f = field(2000)
    expect(revealCaret(f, 10, { targetY: 450 })).toBe(true)
    expect(f.scrollTo).toHaveBeenCalledWith({ top: 1550, behavior: 'auto' })
  })

  it('קרוב — חלק, ו-prefers-reduced-motion — מיידי; נקודה מחוץ לחלון — אמצע', () => {
    const f = field(700)
    revealCaret(f, 10, { targetY: 450 })
    expect(f.scrollTo).toHaveBeenCalledWith({ top: 250, behavior: 'smooth' })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const g = field(700)
    revealCaret(g, 10, { targetY: 9999 })
    expect(g.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'auto' })
  })

  it('כבר במקום — בלי גלילה; בלי מדידה — false', () => {
    const f = field(2000, 1550)
    expect(revealCaret(f, 10, { targetY: 450 })).toBe(true)
    expect(f.scrollTo).not.toHaveBeenCalled()
    const g = field(0)
    g.__richTextarea.caretRowY = () => null
    expect(revealCaret(g, 10)).toBe(false)
    expect(revealCaret(null, 10)).toBe(false)
  })
})
