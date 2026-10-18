import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NavDropdown from './NavDropdown'

const ITEMS = [
  { href: '/library/upload', label: 'העלה ספר חדש', icon: 'upload_file' },
  { href: '/library/info', label: 'הוסף מידע על ספרים', icon: 'info' },
  { href: '/library', label: 'דרכים נוספות לסיוע', more: true }
]

function setup() {
  render(<NavDropdown label="עזור לספרייה" items={ITEMS} />)
  const trigger = screen.getByRole('button', { name: /עזור לספרייה/ })
  return { trigger, root: trigger.closest('.nav-dropdown') }
}

describe('NavDropdown', () => {
  it('כפתור disclosure סגור, שמצביע על רשימת הקישורים', () => {
    const { trigger } = setup()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const panel = document.getElementById(trigger.getAttribute('aria-controls'))
    expect(panel).toContainElement(screen.getByRole('link', { name: 'העלה ספר חדש' }))
    expect(screen.getByRole('link', { name: 'דרכים נוספות לסיוע' })).toHaveAttribute('href', '/library')
  })

  it('לחיצה פותחת, לחיצה נוספת סוגרת', () => {
    const { trigger, root } = setup()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(root).toHaveAttribute('data-open', 'true')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('ריחוף בעכבר פותח, ויציאה סוגרת', () => {
    const { trigger, root } = setup()
    fireEvent.pointerEnter(root, { pointerType: 'mouse' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerLeave(root, { pointerType: 'mouse' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('Esc סוגר — גם מעל ריחוף — ומחזיר את הפוקוס לכפתור', () => {
    const { trigger, root } = setup()
    fireEvent.pointerEnter(root, { pointerType: 'mouse' })
    const link = screen.getByRole('link', { name: 'העלה ספר חדש' })
    link.focus()
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(root).toHaveAttribute('data-dismissed', 'true')
    expect(trigger).toHaveFocus()
  })

  it('Esc ברמת המסמך: תפריט שננעץ בלחיצה בלי פוקוס (Safari) נסגר, והפוקוס לא נגנב', () => {
    const { trigger, root } = setup()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(root).toHaveAttribute('data-dismissed', 'true')
    expect(document.activeElement).toBe(document.body)
  })

  it('Esc שרכיב אחר כבר טיפל בו (defaultPrevented) — לא סוגר', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    document.body.dispatchEvent(event)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('חץ למטה מהכפתור — לקישור הראשון; חיצים נעים בין הקישורים במעגל', () => {
    const { trigger } = setup()
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('link', { name: 'העלה ספר חדש' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' })
    expect(screen.getByRole('link', { name: 'דרכים נוספות לסיוע' })).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('לחיצה מחוץ לרכיב סוגרת את המצב הנעוץ', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
