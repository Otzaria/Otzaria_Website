import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { useOutsidePress } from './useOutsidePress'

function Panel({ enabled = true, onOutside, ignore }) {
  const { onPointerDownCapture } = useOutsidePress(enabled, onOutside, { ignore })
  return (
    <div>
      <button type="button">בחוץ</button>
      <button type="button" data-toggle="">מתג</button>
      <div data-testid="panel" onPointerDownCapture={onPointerDownCapture}>
        <button type="button">בפנים</button>
        {createPortal(<button type="button">בפורטל</button>, document.body)}
      </div>
    </div>
  )
}

describe('useOutsidePress', () => {
  it('לחיצה בחוץ → onOutside; בפנים ובפורטל של הפאנל — לא', () => {
    const onOutside = vi.fn()
    render(<Panel onOutside={onOutside} />)
    fireEvent.pointerDown(screen.getByText('בפנים'))
    fireEvent.pointerDown(screen.getByText('בפורטל'))
    expect(onOutside).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText('בחוץ'))
    expect(onOutside).toHaveBeenCalledTimes(1)
  })

  it('כמו ב-Next: המאזין של React יושב על document ונרשם לפני ההוק — לחיצה בפנים לא סוגרת', () => {
    const onOutside = vi.fn()
    const panel = document.createElement('div')
    const inner = document.createElement('button')
    panel.appendChild(inner)
    document.body.appendChild(panel)
    let handler = null
    // "React" — מאזין capture על document שנרשם ראשון ומפעיל את onPointerDownCapture של הפאנל
    const fakeReact = (e) => { if (panel.contains(e.target)) handler?.({ nativeEvent: e }) }
    document.addEventListener('pointerdown', fakeReact, true)
    function Hook({ setHandler }) {
      const { onPointerDownCapture } = useOutsidePress(true, onOutside)
      useEffect(() => setHandler(onPointerDownCapture))
      return null
    }
    try {
      render(<Hook setHandler={(h) => { handler = h }} />)
      fireEvent.pointerDown(inner)
      expect(onOutside).not.toHaveBeenCalled()
      fireEvent.pointerDown(document.body)
      expect(onOutside).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('pointerdown', fakeReact, true)
      panel.remove()
    }
  })

  it('לחיצה פנימית לא "דולפת" ללחיצה החיצונית הבאה', () => {
    const onOutside = vi.fn()
    render(<Panel onOutside={onOutside} />)
    fireEvent.pointerDown(screen.getByText('בפנים'))
    fireEvent.pointerDown(document.body)
    expect(onOutside).toHaveBeenCalledTimes(1)
  })

  it('ignore — לחיצה על המתג לא נחשבת "בחוץ"', () => {
    const onOutside = vi.fn()
    render(<Panel onOutside={onOutside} ignore={(t) => !!t.closest('[data-toggle]')} />)
    fireEvent.pointerDown(screen.getByText('מתג'))
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('כבוי — לא מאזין', () => {
    const onOutside = vi.fn()
    render(<Panel enabled={false} onOutside={onOutside} />)
    fireEvent.pointerDown(screen.getByText('בחוץ'))
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('לא בולע את הלחיצה', () => {
    render(<Panel onOutside={() => {}} />)
    const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    screen.getByText('בחוץ').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})
