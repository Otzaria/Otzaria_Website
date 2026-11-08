// צ'יפ "פתח" בשורת רשימה: רגיל — כפתור עם שם נגיש מ-label; decorative — מחוץ ל-Tab ולקורא המסך
// (כשבשורה כבר יש כפתור נגיש שפותח), אבל עדיין לחיץ בעכבר ומציג את label כ-title.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OpenChip from './OpenChip'

describe('OpenChip', () => {
  test('רגיל: כפתור עם שם נגיש, בסדר ה-Tab, לחיצה קוראת ל-onClick', async () => {
    const onClick = vi.fn()
    render(<OpenChip label="פתח את חוות דעת" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'פתח את חוות דעת' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('decorative: מוסתר מקורא המסך ומחוץ ל-Tab, title במקום aria-label, ועדיין לחיץ', async () => {
    const onClick = vi.fn()
    render(<><button type="button">שם הספר</button><OpenChip label="פתח את הספר" decorative onClick={onClick} /></>)
    expect(screen.queryByRole('button', { name: 'פתח את הספר' })).not.toBeInTheDocument()
    const chip = screen.getByTitle('פתח את הספר')
    expect(chip).toHaveAttribute('aria-hidden', 'true')
    expect(chip).toHaveAttribute('tabindex', '-1')
    expect(chip).not.toHaveAttribute('aria-label')
    await userEvent.tab()
    await userEvent.tab()
    expect(chip).not.toHaveFocus()
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('disabled: לא קורא ל-onClick', async () => {
    const onClick = vi.fn()
    render(<OpenChip label="פתח" disabled onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'פתח' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
