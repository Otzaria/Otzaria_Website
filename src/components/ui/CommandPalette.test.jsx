import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CommandPalette from './CommandPalette'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

function setup(overrides = {}) {
  const run = { find: vi.fn(), bold: vi.fn(), next: vi.fn(), finish: vi.fn() }
  const commands = [
    { id: 'find', label: 'חיפוש והחלפה', group: 'עריכה', shortcut: ['Ctrl', 'H'], icon: 'find_replace', run: run.find },
    { id: 'bold', label: 'הדגשה', group: 'עריכה', shortcut: ['Ctrl', 'B'], icon: 'format_bold', run: run.bold },
    { id: 'next', label: 'עמוד הבא', group: 'עמוד', run: run.next, disabled: true },
    { id: 'finish', label: 'סיום עמוד', group: 'עמוד', icon: 'check', run: run.finish }
  ]
  const onClose = vi.fn()
  render(<CommandPalette open onClose={onClose} commands={commands} {...overrides} />)
  return { run, onClose, input: screen.getByRole('combobox', { name: 'חיפוש פעולה' }) }
}

describe('CommandPalette', () => {
  it('סגור — לא מרונדר', () => {
    render(<CommandPalette open={false} onClose={() => {}} commands={[]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('דיאלוג מודאלי, פוקוס בשדה, רשימה מקובצת עם הפריט הראשון פעיל', () => {
    const { input } = setup()
    expect(screen.getByRole('dialog', { name: 'פקודות וכלים' })).toHaveAttribute('aria-modal', 'true')
    expect(input).toHaveFocus()
    expect(screen.getByRole('group', { name: 'עריכה' })).toBeInTheDocument()
    const first = screen.getByRole('option', { name: /חיפוש והחלפה/ })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
  })

  it('הקלדה מסננת (גם עם ניקוד)', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'הַדְגָּשָׁה' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /הדגשה/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(input, { target: { value: 'זזזז' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getAllByText('לא נמצאה פעולה מתאימה').length).toBeGreaterThan(0)
  })

  it('חצים מדלגים על מושבתת וגולשים; Enter סוגר ומריץ', async () => {
    const { input, run, onClose } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /סיום עמוד/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /חיפוש והחלפה/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(run.finish).toHaveBeenCalledTimes(1))
  })

  it('לחיצה על פקודה מושבתת לא מריצה; על זמינה — כן', async () => {
    const { run } = setup()
    fireEvent.click(screen.getByRole('option', { name: /עמוד הבא/ }))
    expect(run.next).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('option', { name: /הדגשה/ }))
    await waitFor(() => expect(run.bold).toHaveBeenCalled())
  })

  it('Esc סוגר', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
