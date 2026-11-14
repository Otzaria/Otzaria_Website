import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, fireEvent } from '@testing-library/react'
import { useScanFollow, caretLineMidY } from './useScanFollow'

const rect = (top, left, width, height) => ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top })

let el
let ta
beforeEach(() => {
  document.body.innerHTML = ''
  el = document.createElement('div')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('data-scan-overlay', '')
  el.appendChild(svg)
  document.body.appendChild(el)
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 400 })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 2000 })
  el.getBoundingClientRect = () => rect(0, 0, 300, 400)
  // התמונה מתחילה 16px מתחת לראש התוכן, 10px משמאל
  svg.getBoundingClientRect = () => rect(16 - el.scrollTop, 10, 600, 800)
  el.scrollTo = vi.fn(({ top }) => {
    el.scrollTop = top
  })
  ta = document.createElement('textarea')
  ta.style.lineHeight = '30px'
  ta.style.paddingTop = '10px'
  ta.style.borderTopWidth = '0px'
  document.body.appendChild(ta)
  ta.getBoundingClientRect = () => rect(0, 400, 300, 400)
})

const track = (line, lineBox, wordBox = null) => ({ line, word: 0, scanIndex: line, lineBox, wordBox, kind: 'solid', lineCount: 10, lineWords: 3, lineEstimated: false })

describe('useScanFollow', () => {
  it('caretLineMidY: בלי mirror — לפי גובה השורה והריפוד של ה-textarea', () => {
    expect(caretLineMidY(ta, 3)).toBe(10 + 90 + 15)
    expect(caretLineMidY(null, 3)).toBeNull()
  })

  it('השורה בצילום נגללת מול שורת הסמן; במעבר שורה — חלק', () => {
    const p = { scrollRef: { current: el }, track: track(3, [100, 500, 200, 540]), lineChanged: true, zoom: 1, getTextarea: () => ta }
    renderHook((props) => useScanFollow(props), { initialProps: p })
    // אמצע השורה 520 + היסט 16 − אמצע הסמן 115
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 421, left: 0, behavior: 'smooth' })
  })

  it('זום וקנה מידה של המקור נלקחים בחשבון; מילה מחוץ לחלון — גלילה אופקית', () => {
    const p = { scrollRef: { current: el }, track: track(3, [100, 250, 200, 270], [400, 250, 450, 270]), lineChanged: false, zoom: 2, scale: [0.5, 0.5], getTextarea: () => ta }
    renderHook((props) => useScanFollow(props), { initialProps: p })
    // y: 260·0.5·2 + 16 − 115 = 161; x: המילה ב-410..460 במסך, החלון עד 300−24 → הזזה של 460−276
    const call = el.scrollTo.mock.calls[0][0]
    expect(call.top).toBe(161)
    expect(call.left).toBe(10 + 450 - (300 - 24))
    expect(call.behavior).toBe('auto')
  })

  it('גלגלת על הצילום משהה את המעקב לרגע', () => {
    const p = { scrollRef: { current: el }, track: track(1, [100, 100, 200, 130]), lineChanged: true, zoom: 1, getTextarea: () => ta }
    const { rerender } = renderHook((props) => useScanFollow(props), { initialProps: p })
    el.scrollTo.mockClear()
    fireEvent.wheel(el)
    rerender({ ...p, track: track(5, [100, 900, 200, 930]) })
    expect(el.scrollTo).not.toHaveBeenCalled()
  })

  it('אותה שורה בצילום (הסמן ירד שורה רק בטקסט) — הצילום נשאר במקומו', () => {
    const p = { scrollRef: { current: el }, track: track(3, [100, 500, 200, 540]), lineChanged: true, zoom: 1, getTextarea: () => ta }
    const { rerender } = renderHook((props) => useScanFollow(props), { initialProps: p })
    el.scrollTo.mockClear()
    // שורת טקסט אחרת, אותה שורה בצילום (scanIndex 3), מילה אחרת
    rerender({ ...p, track: { ...track(4, [100, 500, 200, 540], [120, 500, 160, 540]), scanIndex: 3 }, lineChanged: false })
    expect(el.scrollTo).not.toHaveBeenCalled()
    // שורה אחרת בצילום — מיישרים
    rerender({ ...p, track: track(6, [100, 700, 200, 740]) })
    expect(el.scrollTo).toHaveBeenCalled()
  })

  it('גלילת הטקסט — הצילום מתיישר רק כשהגלילה נעצרת, ולא בכל אירוע', () => {
    vi.useFakeTimers()
    try {
      const p = { scrollRef: { current: el }, track: track(3, [100, 500, 200, 540]), lineChanged: true, zoom: 1, getTextarea: () => ta, textContainerRef: { current: document.body } }
      renderHook((props) => useScanFollow(props), { initialProps: p })
      el.scrollTo.mockClear()
      // הטקסט נגלל — הסמן זז 100px למעלה במסך
      ta.getBoundingClientRect = () => rect(-100, 400, 300, 400)
      for (let i = 0; i < 5; i++) {
        fireEvent.scroll(ta)
        vi.advanceTimersByTime(50)
      }
      expect(el.scrollTo).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(el.scrollTo).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('בלי שכבה / בלי תיבת שורה — לא גוללים', () => {
    el.innerHTML = ''
    renderHook(() => useScanFollow({ scrollRef: { current: el }, track: track(1, [0, 0, 1, 1]), zoom: 1, getTextarea: () => ta }))
    renderHook(() => useScanFollow({ scrollRef: { current: el }, track: { ...track(1, null) }, zoom: 1, getTextarea: () => ta }))
    expect(el.scrollTo).not.toHaveBeenCalled()
  })
})
