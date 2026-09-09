import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReminderHistoryList from './ReminderHistoryList'

describe('ReminderHistoryList', () => {
  it('מציג ספינר טעינה כש-loading=true', () => {
    render(<ReminderHistoryList loading={true} history={[]} onDelete={vi.fn()} />)
    expect(screen.getByText('היסטוריית שליחות אחרונות')).toBeInTheDocument()
    expect(screen.getByText('טוען היסטוריה...')).toBeInTheDocument()
  })

  it('לא מציג כלום כשההיסטוריה ריקה ואין טעינה', () => {
    const { container } = render(<ReminderHistoryList loading={false} history={[]} onDelete={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('מציג פריטי היסטוריה עם תגיות דיקטה/חלקי ומספר ימים', () => {
    const history = [
      {
        id: '1',
        bookName: 'ספר א',
        adminName: 'מנהל',
        bookType: 'dicta',
        daysThreshold: 5,
        isPartial: true,
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        bookName: 'ספר ב',
        adminName: 'מנהל 2',
        bookType: 'regular',
        timestamp: new Date().toISOString(),
      },
    ]
    render(<ReminderHistoryList loading={false} history={history} onDelete={vi.fn()} />)
    expect(screen.getByText('ספר א')).toBeInTheDocument()
    expect(screen.getByText('ספר ב')).toBeInTheDocument()
    expect(screen.getByText('דיקטה')).toBeInTheDocument()
    expect(screen.getByText('נשלח לחלק מהמשתמשים')).toBeInTheDocument()
    expect(screen.getByText('5+ ימים')).toBeInTheDocument()
  })

  it('קורא ל-onDelete עם ה-id הנכון', async () => {
    const onDelete = vi.fn()
    const history = [{ id: 'abc', bookName: 'ספר', adminName: 'מנהל', bookType: 'regular', timestamp: new Date().toISOString() }]
    render(<ReminderHistoryList loading={false} history={history} onDelete={onDelete} />)
    await userEvent.setup().click(screen.getByTitle('מחק מההיסטוריה'))
    expect(onDelete).toHaveBeenCalledWith('abc')
  })
})
