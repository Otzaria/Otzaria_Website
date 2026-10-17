import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DonationButton, { DonationNote } from './DonationButton'

const LINK = { href: '/donate', label: 'תרומות', icon: 'volunteer_activism', hint: 'אין לאוצריא גוף מממן: אתה הכוח המניע שלה' }

describe('DonationButton', () => {
  it('הרמז מחובר לקישור כתיאור נגיש (aria-describedby → role="tooltip")', () => {
    render(<DonationButton link={LINK} />)
    const link = screen.getByRole('link', { name: 'תרומות' })
    expect(link).toHaveAttribute('href', '/donate')
    expect(link).toHaveAccessibleDescription(LINK.hint)
    expect(document.getElementById(link.getAttribute('aria-describedby'))).toHaveAttribute('role', 'tooltip')
  })

  it('Esc מסתיר את הבועה, ויציאת הפוקוס מחזירה אותה', () => {
    render(<DonationButton link={LINK} />)
    const link = screen.getByRole('link', { name: 'תרומות' })
    const host = link.closest('.tooltip-host')
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(link)
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  it('בלי hint — בלי בועה ובלי aria-describedby', () => {
    render(<DonationButton link={{ ...LINK, hint: undefined }} />)
    expect(screen.getByRole('link', { name: 'תרומות' })).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull()
  })
})

describe('DonationNote', () => {
  it('בתפריט הנייד — המשפט עצמו כקישור לדף התרומה, שסוגר את התפריט', () => {
    const onNavigate = vi.fn()
    render(<DonationNote link={LINK} onNavigate={onNavigate} />)
    const link = screen.getByRole('link', { name: LINK.hint })
    expect(link).toHaveAttribute('href', '/donate')
    fireEvent.click(link)
    expect(onNavigate).toHaveBeenCalled()
  })
})
