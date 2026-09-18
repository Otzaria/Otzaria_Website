import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import StatCircle from './StatCircle'

// IntersectionObserver מדומה שמאפשר "להכניס" את העיגול לתצוגה ידנית
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  observe() {}
  disconnect() {}
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  MockIntersectionObserver.instances = []
})

describe('StatCircle', () => {
  it('מציג מיד את המספר הסופי המדויק, התווית והאייקון', () => {
    render(<StatCircle icon="link" label="קישורים בין ספרים" value={5812829} />)
    expect(screen.getByTestId('stat-value')).toHaveTextContent('5,812,829')
    expect(screen.getByText('קישורים בין ספרים')).toBeInTheDocument()
    expect(screen.getByText('link')).toBeInTheDocument()
  })

  it('טקסט נגיש עם המספר הסופי גם בזמן אנימציה', () => {
    render(<StatCircle icon="menu_book" label="ספרים" value={7367} />)
    expect(screen.getByText('7,367', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('סופר מ-0 עד הערך המדויק כשנכנס לתצוגה', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    let now = 0
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    render(<StatCircle icon="download" label="הורדות" value={122836} />)
    // לפני כניסה לתצוגה — עדיין הערך הסופי (כמו ב-HTML מהשרת)
    expect(screen.getByTestId('stat-value')).toHaveTextContent('122,836')

    act(() => { MockIntersectionObserver.instances[0].trigger(true) })
    act(() => { frames.shift()!(now) })
    expect(screen.getByTestId('stat-value')).toHaveTextContent(/^0$/)

    now = 800
    act(() => { frames.shift()!(now) })
    const mid = screen.getByTestId('stat-value').textContent
    expect(mid).not.toBe('0')
    expect(mid).not.toBe('122,836')

    now = 5000
    act(() => { frames.shift()!(now) })
    expect(screen.getByTestId('stat-value')).toHaveTextContent('122,836')
    expect(frames).toHaveLength(0)
  })

  it('עם prefers-reduced-motion — אין אנימציה בכלל', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
    render(<StatCircle icon="extension" label="תוספים" value={42} />)
    expect(MockIntersectionObserver.instances).toHaveLength(0)
    expect(screen.getByTestId('stat-value')).toHaveTextContent('42')
  })
})
