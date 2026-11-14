// תמונה ממוזערת: עם src — <img> דקורטיבי; כשל בטעינה או בלי src — האייקון, באותה מסגרת; src חדש — מנסה שוב.
import { describe, expect, test } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Thumb from './Thumb'
import { THUMB_TONES, thumbFrameClass } from './thumbStyles'

describe('Thumb', () => {
  test('עם src — תמונה דקורטיבית (alt ריק), טעינה עצלה', () => {
    const { container } = render(<Thumb src="/a.png" icon="menu_book" width={36} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '36')
    expect(img.className).toContain('object-top')
  })

  test('בלי src — האייקון במקום', () => {
    const { container } = render(<Thumb icon="extension" tone="tile" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('extension')
  })

  test('כשל בטעינה — האייקון; src חדש — מנסה שוב', () => {
    const { container, rerender } = render(<Thumb src="/a.png" icon="menu_book" />)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelector('img')).toBeNull()
    rerender(<Thumb src="/b.png" icon="menu_book" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/b.png')
  })

  test('המסגרת — לפי הגוון, עם המידה מבחוץ', () => {
    const { container } = render(<Thumb icon="menu_book" className="h-12 w-9" />)
    expect(container.firstChild.className).toBe(thumbFrameClass('cover', 'h-12 w-9'))
    expect(thumbFrameClass('tile')).toContain(THUMB_TONES.tile.frame)
  })

  test('תמונה שנכשלה לפני שהרכיב התחבר (לפני הידרציה) — האייקון', () => {
    const proto = window.HTMLImageElement.prototype
    const saved = ['complete', 'naturalWidth', 'currentSrc'].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)])
    Object.defineProperty(proto, 'complete', { configurable: true, get: () => true })
    Object.defineProperty(proto, 'naturalWidth', { configurable: true, get: () => 0 })
    Object.defineProperty(proto, 'currentSrc', { configurable: true, get() { return this.src } })
    try {
      const { container } = render(<Thumb src="/broken.png" icon="menu_book" />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.textContent).toContain('menu_book')
    } finally {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(proto, k, d)
        else delete proto[k]
      }
    }
  })
})
