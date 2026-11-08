// בזמן שחלון בפורטל פתוח — שאר ילדי body מקבלים inert; בסגירה משתחררים, אבל מי שהיה inert מקודם
// נשאר כך. ילדים שלא מוצגים (script/style) ומכריז המעבר של Next לא נוגעים בהם.
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useInertBackground } from './useInertBackground'

function Modal() {
  const ref = useRef<HTMLDivElement>(null)
  useInertBackground(ref)
  return createPortal(<div ref={ref} data-testid="modal">חלון</div>, document.body)
}

function addToBody(tag: string, attrs: Record<string, string> = {}) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

afterEach(() => { document.body.innerHTML = '' })

describe('useInertBackground', () => {
  test('ילדי body אחרים מקבלים inert בפתיחה ומשתחררים בסגירה; החלון עצמו לא', () => {
    const sibling = addToBody('main')
    const { unmount, getByTestId } = render(<Modal />)
    expect(sibling).toHaveAttribute('inert')
    expect(getByTestId('modal')).not.toHaveAttribute('inert')
    unmount()
    expect(sibling).not.toHaveAttribute('inert')
  })

  test('ילד שהיה inert לפני הפתיחה נשאר inert אחרי הסגירה', () => {
    const already = addToBody('aside', { inert: '' })
    const { unmount } = render(<Modal />)
    unmount()
    expect(already).toHaveAttribute('inert')
  })

  test('script, style ומכריז המעבר של Next לא מקבלים inert', () => {
    const script = addToBody('script')
    const style = addToBody('style')
    const announcer = addToBody('next-route-announcer')
    const { unmount } = render(<Modal />)
    expect(script).not.toHaveAttribute('inert')
    expect(style).not.toHaveAttribute('inert')
    expect(announcer).not.toHaveAttribute('inert')
    unmount()
  })

  test('אב שמכיל את החלון לא מקבל inert', () => {
    function Inline() {
      const ref = useRef<HTMLDivElement>(null)
      useInertBackground(ref)
      return <div ref={ref}>בתוך המכל</div>
    }
    const { container, unmount } = render(<Inline />)
    expect(container).not.toHaveAttribute('inert')
    unmount()
  })
})
