import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Stepper, { STEPPER_COMPLETE } from './Stepper'

const steps = [
  { id: 'book', label: 'ספר' },
  { id: 'recipients', label: 'נמענים' },
  { id: 'content', label: 'תוכן' },
]

describe('Stepper', () => {
  it('רשימה ממוספרת עם שם, והשלב הנוכחי מסומן aria-current="step"', () => {
    render(<Stepper label="שלבי שליחה" steps={steps} current="recipients" />)
    const list = screen.getByRole('list', { name: 'שלבי שליחה' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[0]).toHaveTextContent('ספר (הושלם)')
    expect(items[1]).toHaveTextContent('נמענים (השלב הנוכחי)')
    expect(items[2]).toHaveTextContent('3תוכן')
  })

  it('חזרה לשלב שהושלם — כפתור; קדימה — לא לחיץ', async () => {
    const onSelect = vi.fn()
    render(<Stepper label="שלבים" steps={steps} current="recipients" onSelect={onSelect} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(onSelect).toHaveBeenCalledWith('book')
  })

  it('בלי onSelect או כשמושבת — אין כפתורים', () => {
    const { rerender } = render(<Stepper label="שלבים" steps={steps} current="content" />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<Stepper label="שלבים" steps={steps} current="content" onSelect={() => {}} disabled />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  afterEach(() => vi.restoreAllMocks())

  it('ערך לא מוכר — השלב הראשון נוכחי, ואזהרה בפיתוח', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Stepper label="שלבים" steps={steps} current="nope" />)
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })

  it('הכול הושלם (STEPPER_COMPLETE) — אין שלב נוכחי, כולם "הושלם"', () => {
    render(<Stepper label="שלבים" steps={steps} current={STEPPER_COMPLETE} />)
    const items = screen.getAllByRole('listitem')
    expect(items.some((li) => li.hasAttribute('aria-current'))).toBe(false)
    expect(items[2]).toHaveTextContent('תוכן (הושלם)')
  })

  it('המחרוזות לקורא המסך — כפרמטרים', async () => {
    render(<Stepper label="שלבים" steps={steps} current="recipients" onSelect={() => {}} doneText="done" currentText="now" backTitle={(n) => `back ${n}`} />)
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('נמענים (now)')
    expect(screen.getByRole('button')).toHaveAttribute('title', 'back ספר')
  })
})
