import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReminderHistoryList from './ReminderHistoryList'

describe('ReminderHistoryList', () => {
  it('בטעינה: הכותרת, שלד, ו"טוען היסטוריה…" לקורא המסך', () => {
    render(<ReminderHistoryList loading={true} history={[]} onDelete={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'תזכורות שנשלחו' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('טוען היסטוריה…')
  })

  it('ריקה: שורת הסבר (במקום כלום)', () => {
    render(<ReminderHistoryList loading={false} history={[]} onDelete={vi.fn()} />)
    expect(screen.getByText('עוד לא נשלחו תזכורות.')).toBeInTheDocument()
  })

  it('מציג פריטים: ספר, מי שלח, לכמה עורכים, ותג כשנשלחה לחלק מהעורכים', () => {
    const history = [
      { id: '1', bookName: 'ספר א', adminName: 'מנהל', recipientCount: 4, isPartial: true, timestamp: new Date().toISOString() },
      { id: '2', bookName: 'ספר ב', adminName: 'מנהל 2', recipientCount: 1, timestamp: new Date().toISOString() },
    ]
    render(<ReminderHistoryList loading={false} history={history} onDelete={vi.fn()} />)
    expect(screen.getByText('ספר א')).toBeInTheDocument()
    expect(screen.getByText('ספר ב')).toBeInTheDocument()
    expect(screen.getAllByText('לחלק מהעורכים')).toHaveLength(1)
    expect(screen.getByText(/4 עורכים/)).toBeInTheDocument()
    expect(screen.getByText(/עורך אחד/)).toBeInTheDocument()
  })

  it('"הסר מההיסטוריה" בתפריט ⋮ — קורא ל-onDelete עם הפריט', async () => {
    const onDelete = vi.fn()
    const item = { id: 'abc', bookName: 'ספר', adminName: 'מנהל', timestamp: new Date().toISOString() }
    render(<ReminderHistoryList loading={false} history={[item]} onDelete={onDelete} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'פעולות נוספות: ספר' }))
    await user.click(await screen.findByRole('menuitem', { name: 'הסר מההיסטוריה' }))
    expect(onDelete).toHaveBeenCalledWith(item)
  })

  it('שגיאה: ההודעה ו"נסה שוב"', async () => {
    const onRetry = vi.fn()
    render(<ReminderHistoryList loading={false} history={[]} onDelete={vi.fn()} error={{ message: 'לא הצלחנו לטעון את ההיסטוריה.' }} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את ההיסטוריה.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
