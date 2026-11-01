import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { useCaretPosition } from './useCaretPosition'

const TEXT = 'בראשית ברא אלהים את השמים ואת הארץ'

const probe = { renders: 0, pos: null }
// דיווח החוצה ב-effect (לא בזמן render): effect בלי deps רץ אחרי כל commit
function useReport(caret) {
  useEffect(() => {
    probe.renders += 1
    probe.pos = caret
  })
}
function Controlled({ initial = TEXT }) {
  const [text, setText] = useState(initial)
  useReport(useCaretPosition('.editor-container'))
  return (
    <div className="editor-container">
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  )
}
function Uncontrolled() {
  useReport(useCaretPosition('.editor-container'))
  return (
    <div className="editor-container">
      <textarea defaultValue={TEXT} />
    </div>
  )
}

describe('useCaretPosition', () => {
  it('Enter באמצע גוש מפצל את השורה במקום הסמן, והסמן נשאר אחרי השבירה', async () => {
    const user = userEvent.setup()
    const { container } = render(<Controlled />)
    const ta = container.querySelector('textarea')
    const at = TEXT.indexOf('את')
    await user.click(ta)
    ta.setSelectionRange(at, at)
    await user.keyboard('{Enter}')
    expect(ta.value).toBe(`${TEXT.slice(0, at)}\n${TEXT.slice(at)}`)
    expect(ta.selectionStart).toBe(at + 1)
    await waitFor(() => expect(probe.pos).toMatchObject({ line: 2, totalLines: 2 }))
    // ועוד הקלדה אחרי ה-Enter נכנסת במקום הנכון
    await user.keyboard('א')
    expect(ta.value.slice(at, at + 3)).toBe('\nאא')
  })

  it('לא מעדכן state בתוך אירוע ה-input (שם render היה מחזיר ל-textarea את הערך הישן לפני onChange)', async () => {
    const { container } = render(<Uncontrolled />)
    const ta = container.querySelector('textarea')
    ta.focus()
    ta.value = `${TEXT.slice(0, 7)}\n${TEXT.slice(7)}`
    ta.setSelectionRange(8, 8)
    const before = probe.renders
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    // ה-microtasks שהדפדפן מריץ בין מאזין capture על document למאזין של React
    await Promise.resolve()
    await Promise.resolve()
    expect(probe.renders).toBe(before)
    // ...ומיד אחרי כן (frame הבא) המיקום מתעדכן
    await waitFor(() => expect(probe.pos).toMatchObject({ line: 2, totalLines: 2 }))
  })

  it('מתעלם מ-textarea מחוץ לתחום העורך', async () => {
    const { container } = render(
      <>
        <Uncontrolled />
        <textarea data-outside defaultValue={'א\nב\nג'} />
      </>
    )
    await waitFor(() => expect(probe.pos).toBe(null))
    const out = container.querySelector('[data-outside]')
    out.focus()
    out.setSelectionRange(4, 4)
    out.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    expect(probe.pos).toBe(null)
  })
})
