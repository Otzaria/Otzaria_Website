import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Tooltip from './Tooltip'

describe('Tooltip', () => {
  it('הרמז מחובר לרכיב כתיאור נגיש (aria-describedby → role="tooltip")', () => {
    render(<Tooltip content="פותח בחלון חדש"><a href="/x">קישור</a></Tooltip>)
    const link = screen.getByRole('link', { name: 'קישור' })
    expect(link).toHaveAccessibleDescription('פותח בחלון חדש')
    expect(document.getElementById(link.getAttribute('aria-describedby')!)).toHaveAttribute('role', 'tooltip')
  })

  it('שומר aria-describedby קיים של הרכיב', () => {
    render(
      <>
        <span id="extra">עוד</span>
        <Tooltip content="רמז"><button aria-describedby="extra">כפתור</button></Tooltip>
      </>
    )
    expect(screen.getByRole('button').getAttribute('aria-describedby')).toMatch(/^extra /)
  })

  it('Esc מסתיר (data-tip-dismissed), ויציאת הפוקוס מחזירה', () => {
    render(<Tooltip content="רמז"><button>כפתור</button></Tooltip>)
    const button = screen.getByRole('button')
    const host = button.closest('.tooltip-host')!
    button.focus()
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(button)
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  it('Esc מסתיר רמז בריחוף גם כשהפוקוס מחוץ לו, בלי להשפיע על רמז אחר', () => {
    render(<>
      <button>מחוץ לרמז</button>
      <Tooltip content="רמז פעיל"><a href="/x">קישור</a></Tooltip>
      <Tooltip content="רמז אחר"><a href="/y">אחר</a></Tooltip>
    </>)
    const outside = screen.getByRole('button')
    outside.focus()
    const host = screen.getByRole('link', { name: 'קישור' }).closest('.tooltip-host')!
    const other = screen.getByRole('link', { name: 'אחר' }).closest('.tooltip-host')!
    fireEvent.pointerEnter(host, { pointerType: 'mouse' })
    fireEvent.keyDown(outside, { key: 'Escape' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    expect(other).not.toHaveAttribute('data-tip-dismissed')
    expect(outside).toHaveFocus()
    fireEvent.pointerLeave(host, { pointerType: 'mouse' })
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  it('מכבד Esc שכבר טופל ואינו בולע Esc נוסף לאחר הסגירה', () => {
    render(<Tooltip content="רמז"><button>כפתור</button></Tooltip>)
    const host = screen.getByRole('button').closest('.tooltip-host')!
    fireEvent.pointerEnter(host, { pointerType: 'mouse' })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    fireEvent(document.body, handled)
    expect(host).not.toHaveAttribute('data-tip-dismissed')

    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true)
  })

  it('יציאת עכבר אחרי Esc לא מחזירה את הרמז כשהפוקוס עדיין על הכפתור', () => {
    render(<Tooltip content="רמז"><button>כפתור</button></Tooltip>)
    const button = screen.getByRole('button')
    const host = button.closest('.tooltip-host')!
    button.focus()
    fireEvent.pointerEnter(host, { pointerType: 'mouse' })
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.pointerLeave(host, { pointerType: 'mouse' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(button)
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  describe('מיקום (fixed) והיפוך', () => {
    afterEach(() => vi.restoreAllMocks())

    const rect = (top: number, height = 32) => ({ x: 100, y: top, left: 100, top, right: 132, bottom: top + height, width: 32, height, toJSON() {} }) as DOMRect

    function place(anchorTop: number) {
      render(<Tooltip content="רמז"><button>כפתור</button></Tooltip>)
      const host = screen.getByRole('button').closest('.tooltip-host') as HTMLElement
      const tip = host.querySelector('.tooltip') as HTMLElement
      const bubble = host.querySelector('.tooltip-bubble') as HTMLElement
      vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(rect(anchorTop))
      Object.defineProperty(tip, 'offsetHeight', { configurable: true, value: 8 })
      Object.defineProperty(bubble, 'offsetHeight', { configurable: true, value: 30 })
      Object.defineProperty(bubble, 'offsetWidth', { configurable: true, value: 80 })
      // ה-fixed נמדד במקום שבו הוצב (אין containing block מוזז)
      vi.spyOn(tip, 'getBoundingClientRect').mockImplementation(() => {
        const x = parseFloat(host.style.getPropertyValue('--tooltip-x'))
        const y = parseFloat(host.style.getPropertyValue('--tooltip-y'))
        return { x, y, left: x, top: y, right: x + 32, bottom: y + 8, width: 32, height: 8, toJSON() {} } as DOMRect
      })
      fireEvent.pointerEnter(host, { pointerType: 'mouse' })
      return host
    }

    it('מתחת לרכיב כשיש מקום — הקואורדינטות מהרכיב', () => {
      const host = place(100)
      expect(host.dataset.tipSide).toBe('bottom')
      expect(host.style.getPropertyValue('--tooltip-x')).toBe('100px')
      expect(host.style.getPropertyValue('--tooltip-y')).toBe('132px')
      expect(host.style.getPropertyValue('--tooltip-w')).toBe('32px')
    })

    it('מתהפך למעלה כשאין מקום מתחת (שורת המצב)', () => {
      const host = place(window.innerHeight - 30)
      expect(host.dataset.tipSide).toBe('top')
      expect(host.style.getPropertyValue('--tooltip-y')).toBe(`${window.innerHeight - 30 - 8}px`)
    })
  })

  it('דילוג על ההשהיה: רמז שכן שנפתח מיד אחרי שרמז גלוי נסגר — מוצג בלי השהיה', () => {
    render(<>
      <Tooltip content="א"><button>א</button></Tooltip>
      <Tooltip content="ב"><button>ב</button></Tooltip>
    </>)
    const [a, b] = screen.getAllByRole('button').map((el) => el.closest('.tooltip-host') as HTMLElement)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ visibility: 'visible' }) as CSSStyleDeclaration)
    fireEvent.pointerEnter(a, { pointerType: 'mouse' })
    fireEvent.pointerLeave(a, { pointerType: 'mouse' })
    fireEvent.pointerEnter(b, { pointerType: 'mouse' })
    expect(b).toHaveAttribute('data-tip-instant')
    vi.restoreAllMocks()
  })

  it('suppressed — מוסתר; אחרי השחרור נשאר מוסתר עד יציאת הפוקוס', () => {
    const { rerender } = render(<Tooltip content="רמז" suppressed><button>כפתור</button></Tooltip>)
    const host = screen.getByRole('button').closest('.tooltip-host')!
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    rerender(<Tooltip content="רמז" suppressed={false}><button>כפתור</button></Tooltip>)
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(screen.getByRole('button'))
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  it('compact — מחלקת הרמז הקומפקטי', () => {
    render(<Tooltip content="רמז" compact><button>כפתור</button></Tooltip>)
    expect(screen.getByRole('button').closest('.tooltip-host')).toHaveClass('tooltip-compact')
  })
})

