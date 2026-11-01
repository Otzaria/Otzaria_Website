import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import DisplaySettingsSheet, { DISPLAY_SHEET_ID } from './DisplaySettingsSheet'
import { DEFAULT_EDITOR_PREFS } from '@/hooks/editorPrefs'

// דף מינימלי: כפתור מתג (כמו ב-EditorTopBar), שדה טקסט, והגיליון כשהוא פתוח
function Page({ onClose = () => {} }) {
  const [open, setOpen] = useState(false)
  const close = () => { onClose(); setOpen(false) }
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls={open ? DISPLAY_SHEET_ID : undefined} onClick={() => setOpen((o) => !o)}>
        תצוגה
      </button>
      <textarea aria-label="טקסט" defaultValue="שורה" />
      {open && <DisplaySettingsSheet value={DEFAULT_EDITOR_PREFS} onChange={() => {}} onClose={close} />}
    </>
  )
}

const toggle = () => screen.getByRole('button', { name: 'תצוגה' })
const openSheet = () => { toggle().focus(); fireEvent.click(toggle()) }

describe('DisplaySettingsSheet — סגירה', () => {
  it('לחיצה על הטקסט סוגרת; הפוקוס לא חוזר לכפתור', () => {
    const onClose = vi.fn()
    render(<Page onClose={onClose} />)
    openSheet()
    expect(screen.getByRole('dialog')).toHaveFocus()
    fireEvent.pointerDown(screen.getByLabelText('טקסט'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toggle()).not.toHaveFocus()
  })

  it('לחיצה בתוך הגיליון לא סוגרת', () => {
    const onClose = vi.fn()
    render(<Page onClose={onClose} />)
    openSheet()
    fireEvent.pointerDown(screen.getByRole('radio', { name: 'ערב' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc סוגר והפוקוס חוזר לכפתור שפתח', () => {
    render(<Page />)
    openSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toggle()).toHaveFocus()
  })

  it('הכפתור נשאר מתג: לחיצה עליו כשהגיליון פתוח סוגרת ולא פותחת מחדש', () => {
    const onClose = vi.fn()
    render(<Page onClose={onClose} />)
    openSheet()
    fireEvent.pointerDown(toggle())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(toggle())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})
