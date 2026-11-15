// כרטיס "הודעה על עמוד": ספר, עמוד (קישור), מדווח, ההודעה; "סמן כטופל" עם הערה, ו"פתח מחדש" אחרי שטופלה.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageCard from './MessageCard'
import { messageReport } from './testFixtures'

const renderCard = (report) => {
  const onDecide = vi.fn()
  render(<ul><MessageCard report={report} busy={false} error={null} onDecide={onDecide} /></ul>)
  return onDecide
}

describe('כרטיס הודעה', () => {
  test('ממתינה: פרטים, קישור לעורך, "סמן כטופל" עם הערה', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(messageReport())
    const card = screen.getByRole('listitem')
    expect(within(card).getByRole('heading')).toHaveTextContent('בראשית רבה')
    expect(within(card).getByRole('link', { name: /פתח את עמוד 7/ })).toHaveAttribute('href', '/library/books/bereshit-raba/7')
    expect(card).toHaveTextContent('יעקב לוי')
    expect(card).toHaveTextContent('חסרה שורה בסוף העמוד')
    expect(card).toHaveTextContent('פנוי')
    expect(within(card).queryByRole('button', { name: /פתח מחדש/ })).toBeNull()
    await user.type(within(card).getByRole('textbox', { name: /הערה למדווח/ }), 'הוספתי')
    await user.click(within(card).getByRole('button', { name: /סמן כטופל/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm1' }), 'handled', { note: 'הוספתי' })
  })

  test('טופלה: מי טיפל, הערת המנהל, ו"פתח מחדש"', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(messageReport({ status: 'handled', resolution: { note: 'תוקן', byName: 'דוד', at: '2026-11-12T10:00:00Z' } }))
    expect(screen.queryByRole('button', { name: /סמן כטופל/ })).toBeNull()
    expect(screen.getByText(/הוכרע בידי/)).toHaveTextContent('דוד')
    expect(screen.getByText(/הערת מנהל:/).parentElement).toHaveTextContent('תוקן')
    await user.click(screen.getByRole('button', { name: /פתח מחדש/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'reopen')
  })
})

test('אחרי "סמן כטופל" (הכרטיס נשאר) — הפוקוס עובר לכרטיס', async () => {
  const user = userEvent.setup()
  const onDecide = vi.fn()
  const { rerender } = render(<ul><MessageCard report={messageReport()} busy={false} error={null} onDecide={onDecide} /></ul>)
  await user.click(screen.getByRole('button', { name: /סמן כטופל/ }))
  rerender(<ul><MessageCard report={messageReport({ status: 'handled' })} busy={false} error={null} onDecide={onDecide} /></ul>)
  expect(screen.getByRole('listitem')).toHaveFocus()
})
