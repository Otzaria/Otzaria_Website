// מגירה: dialog עם שם ותיאור, Esc / רקע / ✕ סוגרים, ו-dismissible=false — רק פעולה מפורשת סוגרת.
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Drawer from './Drawer'

describe('Drawer', () => {
  test('dialog מודאלי עם כותרת ותיאור, header ו-footer', () => {
    render(<Drawer title="חוות דעת" subtitle="ראשונים" header={<p>לשוניות</p>} footer={<button type="button">שמור</button>} onClose={() => {}}>תוכן</Drawer>)
    const dialog = screen.getByRole('dialog', { name: 'חוות דעת' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('ראשונים')
    expect(screen.getByText('לשוניות')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שמור' })).toBeInTheDocument()
  })

  test('Esc, ✕ ולחיצה על הרקע — סוגרים', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Drawer title="ספר" onClose={onClose}><button type="button">בפנים</button></Drawer>)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'סגירה' }))
    fireEvent.click(document.querySelector('[aria-hidden="true"].absolute'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  test('dismissible=false — בלי ✕, ו-Esc והרקע לא סוגרים', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Drawer title="ספר" dismissible={false} onClose={onClose}>תוכן</Drawer>)
    expect(screen.queryByRole('button', { name: 'סגירה' })).toBeNull()
    await user.keyboard('{Escape}')
    fireEvent.click(document.querySelector('[aria-hidden="true"].absolute'))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('wide — רוחב אחד בלבד (בלי שתי מחלקות רוחב סותרות)', () => {
    const { rerender } = render(<Drawer title="סקירה" onClose={() => {}}>תוכן</Drawer>)
    expect(screen.getByRole('dialog').className).toContain('sm:w-[min(38rem')
    rerender(<Drawer title="סקירה" wide onClose={() => {}}>תוכן</Drawer>)
    const cls = screen.getByRole('dialog').className
    expect(cls).toContain('sm:w-[min(96rem')
    expect(cls).not.toContain('sm:w-[min(38rem')
  })
})
