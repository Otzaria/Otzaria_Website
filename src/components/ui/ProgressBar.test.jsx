// פס התקדמות: role ו-aria נכונים, וגבולות — max=0, ערך שלילי, ערך מעבר ל-max.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressBar from './ProgressBar'

const fill = () => screen.getByRole('progressbar').firstChild

describe('ProgressBar', () => {
  test('ערכים, שם נגיש ו-valueText', () => {
    render(<ProgressBar value={30} max={120} label="התקדמות" valueText="30 מתוך 120 עמודים" />)
    const bar = screen.getByRole('progressbar', { name: 'התקדמות' })
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    expect(bar).toHaveAttribute('aria-valuemax', '120')
    expect(bar).toHaveAttribute('aria-valuetext', '30 מתוך 120 עמודים')
    expect(fill().style.width).toBe('25%')
  })

  test('max=0 — פס ריק, בלי חלוקה באפס', () => {
    render(<ProgressBar value={5} max={0} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(fill().style.width).toBe('0%')
  })

  test('ערך מעבר ל-max — מלא, לא יותר; ערך שלילי — 0', () => {
    const { rerender } = render(<ProgressBar value={500} max={100} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(fill().style.width).toBe('100%')
    rerender(<ProgressBar value={-3} max={100} label="x" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
