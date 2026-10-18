import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { render, screen, fireEvent, act } from '@testing-library/react'
import GoldenBook from './GoldenBook'
import { OPEN_WAIT_MS } from './goldenBookPlan'

const SPRITE = '/home/golden-book-sprite.webp'
const OPEN = '/home/golden-book.webp'
const CLOSED = '/home/golden-book-closed.webp'

// Image מדומה: decode() מצליח או נכשל לפי הנתיב, או ממתין (deferred) עד שהטסט משחרר אותו
let loaded: string[] = []
let failing = new Set<string>()
let deferred = new Map<string, () => void>()
let pending = new Set<string>()
class FakeImage {
  src = ''
  fetchPriority = ''
  decode() {
    loaded.push(this.src)
    if (failing.has(this.src)) return Promise.reject(new Error('fail'))
    if (pending.has(this.src)) return new Promise<void>((resolve) => { deferred.set(this.src, resolve) })
    return Promise.resolve()
  }
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
}

const book = () => screen.getByAltText('לוגו אוצריא')

// טעינת דף: ה-HTML מהשרת, ואז hydration — כמו בדפדפן. render() רגיל הוא רינדור צד-לקוח,
// כלומר ניווט צד-לקוח אל דף הבית (שם הספר מוצג פתוח, בלי אנימציה).
function hydrate(ui: ReactElement) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(ui)
  document.body.appendChild(container)
  return render(ui, { container, hydrate: true })
}

// הרכיב מתקדם רק דרך promises של decode() (ב-FakeImage הם מתממשים מיד). מחכים ל-macrotask
// הבא בתוך act: עד אז כל שרשרת ה-then כבר רצה, ועדכוני ה-state נעשים בתוך act ומיושמים מיד.
// waitFor היה תלוי בשעון (שנייה אחת כברירת מחדל), ותחת עומס זה חרג והטסט נכשל.
const flushImageLoads = () => act(() => new Promise<void>((resolve) => { setTimeout(resolve, 0) }))
// עם שעון מדומה — רק microtasks (setTimeout מדומה לא היה רץ)
const flushMicrotasks = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })

describe('GoldenBook', () => {
  beforeEach(() => {
    loaded = []
    failing = new Set()
    deferred = new Map()
    pending = new Set()
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ה-HTML הראשון — הספר הסגור', () => {
    mockReducedMotion(false)
    hydrate(<GoldenBook />)
    expect(book()).toHaveAttribute('src', CLOSED)
  })

  it('reduced-motion: לא טוען את הרצועה, עובר לספר הפתוח וקורא ל-onOpened פעם אחת', async () => {
    mockReducedMotion(true)
    const onOpened = vi.fn()
    hydrate(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    expect(book()).toHaveAttribute('src', OPEN)
    expect(loaded).not.toContain(SPRITE)
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('ניגון: בזמן הרצועה התמונה ב-opacity-0 (לא invisible), ובסופה — הספר הפתוח', async () => {
    mockReducedMotion(false)
    const onOpened = vi.fn()
    const { container } = hydrate(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    const sprite = container.querySelector('.golden-book-sprite') as HTMLElement
    expect(sprite).not.toBeNull()
    expect(book()).toHaveClass('opacity-0')
    expect(book()).not.toHaveClass('invisible')
    expect(sprite.style.backgroundImage).toContain(SPRITE)
    // jsdom בלי AnimationEvent — React מאזין אז לשם עם הקידומת; שולחים את שניהם
    fireEvent.animationEnd(sprite)
    fireEvent(sprite, new Event('webkitAnimationEnd', { bubbles: true }))
    await flushImageLoads()
    expect(book()).toHaveAttribute('src', OPEN)
    expect(container.querySelector('.golden-book-sprite')).toBeNull()
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('המועד נמדד מה-hydration ולא מתחילת הניווט: hydration מאוחר (5 שניות) — עדיין מנגנים', async () => {
    mockReducedMotion(false)
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    const { container } = hydrate(<GoldenBook />)
    await flushImageLoads()
    expect(container.querySelector('.golden-book-sprite')).not.toBeNull()
  })

  it('הרצועה לא פוענחה עד OPEN_WAIT_MS אחרי ה-hydration — הספר הפתוח, ופענוח מאוחר לא מנגן', async () => {
    mockReducedMotion(false)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const now = vi.spyOn(performance, 'now').mockReturnValue(200)
    pending.add(SPRITE)
    const onOpened = vi.fn()
    const { container } = hydrate(<GoldenBook onOpened={onOpened} />)
    await flushMicrotasks()
    // רגע לפני המועד — עדיין הספר הסגור, ממתינים לרצועה
    await act(async () => { vi.advanceTimersByTime(OPEN_WAIT_MS - 1) })
    expect(book()).toHaveAttribute('src', CLOSED)
    // המועד עבר — הספר הפתוח, בלי אנימציה
    now.mockReturnValue(200 + OPEN_WAIT_MS + 1)
    await act(async () => { vi.advanceTimersByTime(1) })
    await flushMicrotasks()
    expect(book()).toHaveAttribute('src', OPEN)
    expect(onOpened).toHaveBeenCalledTimes(1)
    // הרצועה מגיעה באיחור — לא מתחילים לנגן מעל הספר הפתוח
    await act(async () => { deferred.get(SPRITE)?.() })
    await flushMicrotasks()
    expect(container.querySelector('.golden-book-sprite')).toBeNull()
    expect(book()).toHaveAttribute('src', OPEN)
  })

  it('ניווט צד-לקוח (רינדור בלי hydration): הספר הפתוח, בלי הרצועה', async () => {
    mockReducedMotion(false)
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const onOpened = vi.fn()
    const { container } = render(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    expect(book()).toHaveAttribute('src', OPEN)
    expect(loaded).not.toContain(SPRITE)
    expect(container.querySelector('.golden-book-sprite')).toBeNull()
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('התמונה הפתוחה לא נטענה: לא מחליפים לתמונה שבורה, אבל הרצף ממשיך (onOpened)', async () => {
    mockReducedMotion(true)
    failing.add(OPEN)
    const onOpened = vi.fn()
    hydrate(<GoldenBook onOpened={onOpened} />)
    await flushImageLoads()
    expect(onOpened).toHaveBeenCalledTimes(1)
    expect(book()).toHaveAttribute('src', CLOSED)
  })

  it('פירוק לפני שהטעינה הסתיימה — בלי עדכון state אחרי unmount', async () => {
    mockReducedMotion(true)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = hydrate(<GoldenBook />)
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(errors).not.toHaveBeenCalled()
  })
})
