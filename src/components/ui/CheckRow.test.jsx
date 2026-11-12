// תיבת סימון עם טקסט לחיץ: הטקסט הוא השם הנגיש, לחיצה עליו או רווח משנים, onChange מקבל ערך בוליאני,
// disabled חוסם, ומאפיינים נוספים (aria-describedby וכו') עוברים ל-input.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import CheckRow from './CheckRow'

function Harness({ onChange = () => {} }) {
  const [checked, setChecked] = useState(false)
  return <CheckRow checked={checked} onChange={(v) => { onChange(v); setChecked(v) }}>שלח גם במייל</CheckRow>
}

describe('CheckRow', () => {
  test('הטקסט הגלוי הוא השם הנגיש, ולחיצה עליו מסמנת ומבטלת', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'שלח גם במייל' })
    expect(box).not.toBeChecked()
    await userEvent.click(screen.getByText('שלח גם במייל'))
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith(true)
    await userEvent.click(screen.getByText('שלח גם במייל'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  test('רווח מהמקלדת משנה', async () => {
    render(<Harness />)
    await userEvent.tab()
    await userEvent.keyboard(' ')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  test('disabled — לא משתנה ולא קורא ל-onChange', async () => {
    const onChange = vi.fn()
    render(<CheckRow checked={false} disabled onChange={onChange}>נעול</CheckRow>)
    await userEvent.click(screen.getByText('נעול'))
    expect(screen.getByRole('checkbox', { name: 'נעול' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })

  test('מאפיינים נוספים עוברים ל-input', () => {
    render(<><p id="hint">הסבר</p><CheckRow checked onChange={() => {}} aria-describedby="hint">אפשרות</CheckRow></>)
    expect(screen.getByRole('checkbox', { name: 'אפשרות' })).toHaveAccessibleDescription('הסבר')
  })
})
