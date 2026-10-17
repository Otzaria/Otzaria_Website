import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import useWordmarkHandoff from './useWordmarkHandoff'

// IntersectionObserver מדומה: שומר את ה-callback ואת האפשרויות, כדי שהטסט "יחצה" את הסף בעצמו
let observers = []
class FakeIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.disconnected = false
    observers.push(this)
  }
  observe() {}
  disconnect() { this.disconnected = true }
  fire(entry) { this.callback([entry]) }
}

const rect = (bottom) => ({ top: bottom - 80, bottom, left: 0, right: 100, width: 100, height: 80 })

function Harness({ enabled = true, withSource = true }) {
  const targetRef = useRef(null)
  useWordmarkHandoff({ enabled, targetRef })
  return (
    <>
      <header>
        <span ref={targetRef}>אוצריא</span>
      </header>
      {withSource && <h1><span data-wordmark-handoff-source="">אוצריא</span></h1>}
    </>
  )
}

const state = () => document.documentElement.getAttribute('data-wordmark-handoff')

describe('useWordmarkHandoff', () => {
  beforeEach(() => {
    observers = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    // הכותרת: תחתית ב-60.8px (שבר פיקסל, כמו בפועל); המילה: מתחת לה
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.tagName === 'HEADER' ? rect(60.8) : rect(300)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('בראש הדף — hero, עם rootMargin בגובה הכותרת (מעוגל)', () => {
    render(<Harness />)
    expect(state()).toBe('hero')
    expect(observers.at(-1).options.rootMargin).toBe('-61px 0px 0px 0px')
  })

  it('המילה יצאה מעל ה-root — docked, גם בשבר הפיקסל שבין 60.8 ל-61', () => {
    render(<Harness />)
    observers.at(-1).fire({ isIntersecting: false, boundingClientRect: rect(60.89), rootBounds: { top: 61 } })
    expect(state()).toBe('docked')
    observers.at(-1).fire({ isIntersecting: true, boundingClientRect: rect(61.5), rootBounds: { top: 61 } })
    expect(state()).toBe('hero')
  })

  it('המילה מתחת ל-viewport (לא חותכת, מתחת) — hero', () => {
    render(<Harness />)
    observers.at(-1).fire({ isIntersecting: false, boundingClientRect: rect(1500), rootBounds: { top: 61 } })
    expect(state()).toBe('hero')
  })

  it('אין כותרת ראשית בדף — off (שם האתר מוצג), ובפירוק ה-attribute מוסר', () => {
    const { unmount } = render(<Harness withSource={false} />)
    expect(state()).toBe('off')
    unmount()
    expect(state()).toBeNull()
  })

  it('בפירוק — ה-observer מנותק וה-attribute מוסר', () => {
    const { unmount } = render(<Harness />)
    const observer = observers.at(-1)
    unmount()
    expect(observer.disconnected).toBe(true)
    expect(state()).toBeNull()
  })

  it('לא פעיל (דפים אחרים) — לא נוגע ב-<html>', () => {
    render(<Harness enabled={false} />)
    expect(state()).toBeNull()
    expect(observers).toHaveLength(0)
  })
})
