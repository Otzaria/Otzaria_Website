// תפריט disclosure: aria-expanded/aria-controls, Esc סוגר ומחזיר פוקוס לכפתור רק כשהפוקוס היה בתפריט,
// Esc שכבר טופל (defaultPrevented) לא סוגר, לחיצה בחוץ סוגרת, ושינוי resetKey (ניווט) סוגר.
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDisclosureMenu } from './useDisclosureMenu'

function Menu({ resetKey = '/a' }) {
  const { isOpen, close, buttonProps, panelProps } = useDisclosureMenu(resetKey)
  return (
    <div>
      <button type="button" {...buttonProps}>תפריט</button>
      <div {...panelProps} hidden={!isOpen}>
        <a href="#x" onClick={close}>קישור</a>
      </div>
      <button type="button">בחוץ</button>
    </div>
  )
}

const trigger = () => screen.getByRole('button', { name: 'תפריט' })

describe('useDisclosureMenu', () => {
  test('aria-expanded מתחלף בלחיצה, ו-aria-controls מצביע על הפאנל', async () => {
    render(<Menu />)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    const panelId = trigger().getAttribute('aria-controls')
    expect(document.getElementById(panelId)).not.toBeNull()
    await userEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  test('Esc כשהפוקוס בתוך התפריט — סוגר ומחזיר פוקוס לכפתור', async () => {
    render(<Menu />)
    await userEvent.click(trigger())
    screen.getByRole('link', { name: 'קישור' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  test('Esc כשהפוקוס מחוץ לתפריט — סוגר בלי להזיז פוקוס', async () => {
    render(<Menu />)
    await userEvent.click(trigger())
    const outside = screen.getByRole('button', { name: 'בחוץ' })
    outside.focus()
    await userEvent.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(outside).toHaveFocus()
  })

  test('Esc שכבר טופל ע"י רכיב אחר (defaultPrevented) לא סוגר', async () => {
    render(<Menu />)
    await userEvent.click(trigger())
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    fireEvent(document, event)
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  test('לחיצה מחוץ לכפתור ולפאנל סוגרת; לחיצה בתוך הפאנל לא', async () => {
    render(<Menu />)
    await userEvent.click(trigger())
    fireEvent.pointerDown(document.getElementById(trigger().getAttribute('aria-controls')))
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'בחוץ' }))
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  test('close (קישור בפאנל) סוגר', async () => {
    render(<Menu />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('link', { name: 'קישור' }))
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  test('שינוי resetKey (ניווט) סוגר את התפריט', async () => {
    const { rerender } = render(<Menu resetKey="/a" />)
    await userEvent.click(trigger())
    rerender(<Menu resetKey="/b" />)
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })
})
