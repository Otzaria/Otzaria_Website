// חלון ניהול הקיצורים: צירוף שכבר משויך לפעולה אחרת נחסם בהודעה בעברית (גם בהוספה וגם בשמירה)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ShortcutsDialog from './ShortcutsDialog'

vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm: vi.fn() }) }))

const actions = [
  { id: 'bold', label: 'מודגש' },
  { id: 'italic', label: 'נטוי' },
]

function setup(shortcuts) {
  const saveShortcuts = vi.fn()
  const onClose = vi.fn()
  render(
    <ShortcutsDialog isOpen onClose={onClose} availableActions={actions} shortcuts={shortcuts} saveShortcuts={saveShortcuts} resetToDefaults={vi.fn()} />
  )
  return { saveShortcuts, onClose }
}

const record = (init) => {
  fireEvent.click(screen.getByRole('button', { name: 'מקשים' }))
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

describe('ShortcutsDialog — כפילויות', () => {
  it('הוספת צירוף שכבר תפוס — הודעת שגיאה ולא נוסף', () => {
    const { saveShortcuts } = setup({ bold: 'Ctrl+KeyB' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'italic' } })
    record({ key: 'b', code: 'KeyB', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'הוספה' }))
    expect(screen.getByRole('alert')).toHaveTextContent('כבר משמש את "מודגש"')
    fireEvent.click(screen.getByRole('button', { name: 'שמירת השינויים' }))
    expect(saveShortcuts).toHaveBeenCalledWith({ bold: 'Ctrl+KeyB' })
  })

  it('צירוף פנוי — נוסף ונשמר', () => {
    const { saveShortcuts } = setup({ bold: 'Ctrl+KeyB' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'italic' } })
    record({ key: 'i', code: 'KeyI', altKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'הוספה' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'שמירת השינויים' }))
    expect(saveShortcuts).toHaveBeenCalledWith({ bold: 'Ctrl+KeyB', italic: 'Alt+KeyI' })
  })

  it('מפה שמורה עם כפילות — השמירה נחסמת עם הודעה', () => {
    const { saveShortcuts, onClose } = setup({ bold: 'Ctrl+KeyB', italic: 'Ctrl+KeyB' })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת השינויים' }))
    expect(screen.getByRole('alert')).toHaveTextContent('מוגדר ליותר מפעולה אחת')
    expect(saveShortcuts).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ShortcutsDialog — צירופים שמורים ו-Esc', () => {
  it.each([
    [{ key: 'z', code: 'KeyZ', ctrlKey: true }, 'Ctrl+Z'],
    [{ key: 'Backspace', code: 'Backspace' }, 'Backspace'],
    [{ key: 'Enter', code: 'Enter' }, 'Enter'],
  ])('צירוף שמור לא נקלט — הודעה בעברית (%#)', (init, shown) => {
    const { saveShortcuts } = setup({ bold: 'Ctrl+KeyB' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'italic' } })
    record(init)
    expect(screen.getByRole('alert')).toHaveTextContent(`הצירוף ${shown} שמור לפעולות עריכה בסיסיות`)
    expect(screen.getByRole('button', { name: 'הוספה' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'שמירת השינויים' }))
    expect(saveShortcuts).toHaveBeenCalledWith({ bold: 'Ctrl+KeyB' })
  })

  it('Esc בזמן הקלטה — מבטל את ההקלטה בלי לקלוט ובלי לסגור את החלון', () => {
    const { onClose } = setup({ bold: 'Ctrl+KeyB' })
    record({ key: 'Escape', code: 'Escape' })
    expect(screen.getByRole('button', { name: 'מקשים' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('צירוף פנוי אחרי צירוף שמור — ההודעה נעלמת', () => {
    setup({})
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'italic' } })
    record({ key: 'v', code: 'KeyV', ctrlKey: true })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    record({ key: 'i', code: 'KeyI', altKey: true })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
