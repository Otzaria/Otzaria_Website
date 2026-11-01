import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import FloatingPanel from './FloatingPanel'

const pos = () => ({ x: 10, y: 10 })

/** opener — הכפתור שפותח את החלון; vanish — הכפתור נעלם עם הפתיחה (פריט בתפריט שנסגר) */
function Host({ vanish = false, withReturn = true, auto = false }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <textarea data-testid="editor" defaultValue="שלום עולם" />
      {!(vanish && open) && <button type="button" onClick={() => setOpen(true)}>פתח</button>}
      {open && (
        <FloatingPanel
          title="חיפוש"
          onClose={() => setOpen(false)}
          defaultPosition={pos}
          returnFocus={withReturn ? () => screen.getByTestId('editor') : undefined}
        >
          {/* auto — כמו בחיפוש והחלפה: autoFocus לוקח את הפוקוס כבר ב-commit, לפני ה-effect של החלון */}
          <input data-autofocus="" aria-label="חפש" autoFocus={auto} />
        </FloatingPanel>
      )}
    </div>
  )
}

const openAndEscape = () => {
  const opener = screen.getByRole('button', { name: 'פתח' })
  act(() => opener.focus())
  fireEvent.click(opener)
  const input = screen.getByLabelText('חפש')
  expect(document.activeElement).toBe(input)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByLabelText('חפש')).toBeNull()
  return opener
}

describe('FloatingPanel — חזרת הפוקוס בסגירה', () => {
  it('הפותח עדיין במסמך — הפוקוס חוזר אליו (גם כשיש returnFocus)', () => {
    render(<Host />)
    const opener = openAndEscape()
    expect(document.activeElement).toBe(opener)
  })

  it('הפותח נעלם (תפריט / חלון פקודות) — הפוקוס עובר ל-returnFocus, עם הסמן הקודם', () => {
    render(<Host vanish />)
    const ed = /** @type {HTMLTextAreaElement} */ (screen.getByTestId('editor'))
    ed.setSelectionRange(3, 3)
    openAndEscape()
    expect(document.activeElement).toBe(ed)
    expect(ed.selectionStart).toBe(3)
  })

  it('ילד עם autoFocus — הפותח האמיתי (לא השדה שבחלון) מקבל את הפוקוס בחזרה', () => {
    render(<Host auto />)
    const opener = openAndEscape()
    expect(document.activeElement).toBe(opener)
  })

  it('ילד עם autoFocus והפותח נעלם — הפוקוס עובר ל-returnFocus', () => {
    render(<Host auto vanish />)
    openAndEscape()
    expect(document.activeElement).toBe(screen.getByTestId('editor'))
  })

  it('בלי returnFocus והפותח נעלם — לא נזרקת שגיאה (ההתנהגות הקודמת)', () => {
    render(<Host vanish withReturn={false} />)
    openAndEscape()
    expect(document.activeElement).not.toBe(screen.getByTestId('editor'))
  })

  it('הפוקוס כבר מחוץ לחלון בסגירה — לא גונבים אותו', () => {
    render(<Host vanish />)
    const opener = screen.getByRole('button', { name: 'פתח' })
    act(() => opener.focus())
    fireEvent.click(opener)
    const other = document.createElement('input')
    document.body.appendChild(other)
    act(() => other.focus())
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(document.activeElement).toBe(other)
    other.remove()
  })
})
