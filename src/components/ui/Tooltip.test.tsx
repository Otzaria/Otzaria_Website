import { describe, it, expect } from 'vitest'
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
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(button)
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })
})
