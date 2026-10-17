import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import GoldenBook from './GoldenBook'

// Image מדומה: decode() מצליח או נכשל לפי הנתיב, ונרשם מה נטען
let loaded: string[] = []
let failing = new Set<string>()
class FakeImage {
  src = ''
  fetchPriority = ''
  decode() {
    loaded.push(this.src)
    return failing.has(this.src) ? Promise.reject(new Error('fail')) : Promise.resolve()
  }
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
}

const book = () => screen.getByAltText('לוגו אוצריא')

// הרכיב מתקדם רק דרך promises של decode() (ב-FakeImage הם מתממשים מיד). מחכים ל-macrotask
// הבא בתוך act: עד אז כל שרשרת ה-then כבר רצה, ועדכוני ה-state נעשים בתוך act ומיושמים מיד.
// waitFor היה תלוי בשעון (שנייה אחת כברירת מחדל), ותחת עומס זה חרג והטסט נכשל.
const flushImageLoads = () => act(() => new Promise<void>((resolve) => { setTimeout(resolve, 0) }))

describe('GoldenBook', () => {
  beforeEach(() => {
    loaded = []
    failing = new Set()
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ה-HTML הראשון — הספר הסגור', () => {
    mockReducedMotion(false)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    render(<GoldenBook />)
    expect(book()).toHaveAttribute('src', '/home/golden-book-closed.webp')
  })

  it('reduced-motion: לא טוען את הרצועה, עובר לספר הפתוח וקורא ל-onOpened פעם אחת', async () => {
    mockReducedMotion(true)
    const onOpened = vi.fn()
    render(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    expect(book()).toHaveAttribute('src', '/home/golden-book.webp')
    expect(loaded).not.toContain('/home/golden-book-sprite.webp')
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('ניגון: בזמן הרצועה התמונה ב-opacity-0 (לא invisible), ובסופה — הספר הפתוח', async () => {
    mockReducedMotion(false)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const onOpened = vi.fn()
    const { container } = render(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    const sprite = container.querySelector('.golden-book-sprite') as HTMLElement
    expect(sprite).not.toBeNull()
    expect(book()).toHaveClass('opacity-0')
    expect(book()).not.toHaveClass('invisible')
    expect(sprite.style.backgroundImage).toContain('/home/golden-book-sprite.webp')
    // jsdom בלי AnimationEvent — React מאזין אז לשם עם הקידומת; שולחים את שניהם
    fireEvent.animationEnd(sprite)
    fireEvent(sprite, new Event('webkitAnimationEnd', { bubbles: true }))
    await flushImageLoads()
    expect(book()).toHaveAttribute('src', '/home/golden-book.webp')
    expect(container.querySelector('.golden-book-sprite')).toBeNull()
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('התמונה הפתוחה לא נטענה: לא מחליפים לתמונה שבורה, אבל הרצף ממשיך (onOpened)', async () => {
    mockReducedMotion(true)
    failing.add('/home/golden-book.webp')
    const onOpened = vi.fn()
    render(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    expect(onOpened).toHaveBeenCalledTimes(1)
    expect(book()).toHaveAttribute('src', '/home/golden-book-closed.webp')
  })

  it('פירוק לפני שהטעינה הסתיימה — בלי עדכון state אחרי unmount', async () => {
    mockReducedMotion(true)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<GoldenBook />)
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(errors).not.toHaveBeenCalled()
  })
})
