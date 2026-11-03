import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MenuButton from './MenuButton'

function setup() {
  const a = vi.fn()
  const b = vi.fn()
  render(
    <MenuButton
      label="עוד כלים"
      items={[
        { id: 'a', label: 'ראשון', icon: 'undo', onSelect: a },
        { separator: true, id: 's' },
        { id: 'b', label: 'שני', glyph: 'H1', onSelect: b, shortcut: ['Ctrl', '1'] },
        { id: 'c', label: 'מושבת', icon: 'redo', disabled: true, onSelect: vi.fn() },
        { id: 'd', label: 'מסומן', icon: 'check', pressed: true, onSelect: vi.fn() }
      ]}
    />
  )
  return { a, b }
}

describe('MenuButton', () => {
  it('סגור כברירת מחדל; לחיצה פותחת תפריט, בחירה מפעילה וסוגרת', () => {
    const { b } = setup()
    const trigger = screen.getByRole('button', { name: 'עוד כלים' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'עוד כלים' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'מסומן' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('menuitem', { name: /שני/ }))
    expect(b).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('פריט מושבת לא מופעל; Esc סוגר ומחזיר פוקוס; חיצים מדלגים על מושבת', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'עוד כלים' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = screen.getByRole('menuitem', { name: 'ראשון' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: /שני/ })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /שני/ }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemcheckbox', { name: 'מסומן' })).toHaveFocus()

    fireEvent.click(screen.getByRole('menuitem', { name: 'מושבת' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('נפתח בעכבר: הפוקוס נשאר; ↓ נכנס לתפריט; Esc (ברמת המסמך) סוגר ומחזיר לכפתור', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'עוד כלים' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveFocus()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'ראשון' })).toHaveFocus()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('Esc כשהפוקוס מחוץ לתפריט ולכפתור (keepFocus — בעורך): סוגר, הפוקוס נשאר במקומו, וה-Esc לא מגיע הלאה', () => {
    render(<><textarea aria-label="עורך" /><MenuButton label="עוד" keepFocus items={[{ id: 'a', label: 'א', onSelect: vi.fn() }]} /></>)
    const editor = screen.getByRole('textbox', { name: 'עורך' })
    editor.focus()
    fireEvent.click(screen.getByRole('button', { name: 'עוד' }))
    const outer = vi.fn()
    editor.addEventListener('keydown', outer)
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor).toHaveFocus()
    expect(outer).not.toHaveBeenCalled()
  })

  it('הרמז של הכפתור מוסתר כל עוד התפריט פתוח, וגם מיד אחרי הסגירה', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'עוד כלים' })
    const host = trigger.closest('.tooltip-host')
    expect(host).not.toHaveAttribute('data-tip-dismissed')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(host).toHaveAttribute('data-tip-dismissed', 'true')
    fireEvent.blur(trigger)
    expect(host).not.toHaveAttribute('data-tip-dismissed')
  })

  it('פריט radio — menuitemradio עם aria-checked', () => {
    render(<MenuButton label="יישור" items={[{ id: 'j', label: 'שני הצדדים', radio: true, pressed: true, onSelect: vi.fn() }, { id: 'r', label: 'ימין', radio: true, pressed: false, onSelect: vi.fn() }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'יישור' }))
    expect(screen.getByRole('menuitemradio', { name: 'שני הצדדים' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'ימין' })).toHaveAttribute('aria-checked', 'false')
  })
})


describe('MenuButton — חזרה לעורך אחרי בחירה במקלדת', () => {
  it('נפתח בעכבר (keepFocus) מהעורך, ↓ + Enter: הפריט נבחר והפוקוס חוזר לעורך ולא ל-body', () => {
    const onSelect = vi.fn()
    render(<><textarea aria-label="עורך" /><MenuButton label="יישור" keepFocus items={[{ id: 'a', label: 'מרכז', radio: true, pressed: false, onSelect }]} /></>)
    const editor = screen.getByRole('textbox', { name: 'עורך' })
    editor.focus()
    fireEvent.click(screen.getByRole('button', { name: 'יישור' }))
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    const item = screen.getByRole('menuitemradio', { name: 'מרכז' })
    expect(item).toHaveFocus()
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(editor).toHaveFocus()
  })

  it('אותו מצב, Esc בתוך התפריט — חוזר לעורך', () => {
    render(<><textarea aria-label="עורך" /><MenuButton label="יישור" keepFocus items={[{ id: 'a', label: 'מרכז', onSelect: vi.fn() }]} /></>)
    const editor = screen.getByRole('textbox', { name: 'עורך' })
    editor.focus()
    fireEvent.click(screen.getByRole('button', { name: 'יישור' }))
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'מרכז' }), { key: 'Escape' })
    expect(editor).toHaveFocus()
  })
})
