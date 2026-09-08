import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OutreachRow from './OutreachRow'

const statuses = { planned: { label: 'הולך ליצור קשר', color: '#8b5cf6' } }
const channels = { phone: { label: 'טלפון' } }

const baseItem = {
  _id: '1',
  contactName: 'ישראל ישראלי',
  instituteName: 'מכון א',
  contactPhone: '050-1234567',
  contactEmail: '',
  subject: 'ספר הלכה',
  status: 'planned',
  outreachBy: 'דוד',
  outreachDate: '2025-03-15',
  channel: 'phone',
}

describe('OutreachRow', () => {
  it('מציג את פרטי הפנייה הבסיסיים', () => {
    render(<OutreachRow item={baseItem} statuses={statuses} channels={channels} duplicates={[]} onEdit={vi.fn()} />)
    expect(screen.getByText('ישראל ישראלי')).toBeInTheDocument()
    expect(screen.getByText('(מכון א)')).toBeInTheDocument()
    expect(screen.getByText('הולך ליצור קשר')).toBeInTheDocument()
    expect(screen.getByText('דוד')).toBeInTheDocument()
    expect(screen.getByText('טלפון')).toBeInTheDocument()
    expect(screen.queryByText('פנייה כפולה')).not.toBeInTheDocument()
  })

  it('כפתור עריכה מפעיל onEdit', async () => {
    const onEdit = vi.fn()
    render(<OutreachRow item={baseItem} statuses={statuses} channels={channels} duplicates={[]} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /עריכה/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('מסמן "פנייה כפולה" (חמה) כשיש כפילות פתוחה או טרייה', () => {
    const duplicates = [{ _id: '2', isOpen: true, isRecent: false, reason: 'phone', status: 'planned' }]
    render(<OutreachRow item={baseItem} statuses={statuses} channels={channels} duplicates={duplicates} onEdit={vi.fn()} />)
    expect(screen.getByText('פנייה כפולה')).toBeInTheDocument()
  })

  it('מסמן "פנייה נוספת בעבר" (לא חמה) כשהכפילות סגורה ולא טרייה', () => {
    const duplicates = [{ _id: '2', isOpen: false, isRecent: false, reason: 'phone', status: 'refused' }]
    render(<OutreachRow item={baseItem} statuses={statuses} channels={channels} duplicates={duplicates} onEdit={vi.fn()} />)
    expect(screen.getByText('פנייה נוספת בעבר')).toBeInTheDocument()
    expect(screen.queryByText('פנייה כפולה')).not.toBeInTheDocument()
  })
})
