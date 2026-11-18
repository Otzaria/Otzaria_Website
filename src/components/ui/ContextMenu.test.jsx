import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContextMenu from './ContextMenu'

function setup(extra = {}) {
  const a = vi.fn()
  const b = vi.fn()
  const disabled = vi.fn()
  const onClose = vi.fn()
  render(
    <div>
      <button type="button">בחוץ</button>
      <ContextMenu
        x={300}
        y={200}
        label="פעולות על הטקסט"
        onClose={onClose}
        footer="רמז תחתון"
        items={[
          { id: 'off', label: 'מושבת', icon: 'flag', disabled: true, hint: 'הסבר למה', onSelect: disabled },
          { id: 'a', label: 'ראשון', icon: 'forum', hint: ['שורה אחת', 'שורה שתיים'], onSelect: a },
          { separator: true, id: 's' },
          { id: 'b', label: 'שני', shortcut: ['Ctrl', 'C'], onSelect: b },
        ]}
        {...extra}
      />
    </div>
  )
  return { a, b, disabled, onClose }
}

describe('ContextMenu', () => {
  it('תפריט נגיש עם פריטים, רמז ושורת עזרה; הפוקוס על הפריט הפעיל הראשון', async () => {
    setup()
    const menu = screen.getByRole('menu', { name: 'פעולות על הטקסט' })
    expect(menu).toHaveTextContent('רמז תחתון')
    const off = screen.getByRole('menuitem', { name: 'מושבת' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    expect(off).toHaveAccessibleDescription('הסבר למה')
    // רמז של כמה שורות — כל שורה רכיב נפרד, וכולן בתיאור הנגיש
    expect(screen.getByText('שורה אחת')).not.toHaveTextContent('שורה שתיים')
    expect(screen.getByRole('menuitem', { name: 'ראשון' })).toHaveAccessibleDescription(/שורה אחת.*שורה שתיים/)
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'ראשון' })).toHaveFocus())
  })

  it('חצים מסתובבים בין הפריטים (כולל המושבת), Home/End', async () => {
    setup()
    const first = screen.getByRole('menuitem', { name: 'ראשון' })
    await waitFor(() => expect(first).toHaveFocus())
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'שני' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'מושבת' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'שני' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'מושבת' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'שני' })).toHaveFocus()
  })

  it('בחירה: קודם onClose("select"), אחר כך הפעולה', () => {
    const order = []
    const onClose = vi.fn(() => order.push('close'))
    const a = vi.fn(() => order.push('a'))
    setup({ onClose, items: [{ id: 'a', label: 'ראשון', onSelect: a }] })
    fireEvent.click(screen.getByRole('menuitem', { name: 'ראשון' }))
    expect(onClose).toHaveBeenCalledWith('select')
    expect(order).toEqual(['close', 'a'])
  })

  it('פריט מושבת לא מפעיל ולא סוגר', () => {
    const { disabled, onClose } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'מושבת' }))
    expect(disabled).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape ו-Tab סוגרים', () => {
    const { onClose } = setup()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).toHaveBeenLastCalledWith('escape')
    fireEvent.keyDown(menu, { key: 'Tab' })
    expect(onClose).toHaveBeenLastCalledWith('tab')
  })

  it('לחיצה בחוץ סוגרת; לחיצה בתוך התפריט לא', () => {
    const { onClose } = setup()
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'ראשון' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'בחוץ' }))
    expect(onClose).toHaveBeenCalledWith('outside')
  })

  it('שינוי גודל החלון סוגר', () => {
    const { onClose } = setup()
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenCalledWith('dismiss')
  })
})
