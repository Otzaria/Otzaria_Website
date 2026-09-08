import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MyMessagesModal from './MyMessagesModal'

describe('MyMessagesModal', () => {
  let onClose, onMessagesChanged, showAlert, isReadByUser

  const baseMessage = {
    id: 'm1',
    subject: 'נושא לדוגמה',
    content: 'תוכן ההודעה',
    status: 'sent',
    createdAt: '2025-03-15T09:05:00.000Z',
    allowReplies: true,
    replies: []
  }

  beforeEach(() => {
    onClose = vi.fn()
    onMessagesChanged = vi.fn()
    showAlert = vi.fn()
    isReadByUser = vi.fn().mockReturnValue(true)
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true })
    })
  })

  function setup(props = {}) {
    return render(
      <MyMessagesModal
        messages={[baseMessage]}
        isReadByUser={isReadByUser}
        currentUserId="user-1"
        onClose={onClose}
        onMessagesChanged={onMessagesChanged}
        showAlert={showAlert}
        {...props}
      />
    )
  }

  it('renders the empty state when there are no messages', () => {
    setup({ messages: [] })
    expect(screen.getByText('אין הודעות עדיין')).toBeInTheDocument()
  })

  it('renders the message list with subject and content', () => {
    setup()
    expect(screen.getByText('נושא לדוגמה')).toBeInTheDocument()
    expect(screen.getByText('תוכן ההודעה')).toBeInTheDocument()
  })

  it('opens a reply form when clicking the reply button', () => {
    setup()
    fireEvent.click(screen.getByText('השב'))
    expect(screen.getByPlaceholderText('כתוב תגובה...')).toBeInTheDocument()
  })

  it('submits a reply via POST /api/messages/reply with messageId and text, then refreshes messages', async () => {
    setup()
    fireEvent.click(screen.getByText('השב'))
    fireEvent.change(screen.getByPlaceholderText('כתוב תגובה...'), { target: { value: 'תגובה שלי' } })
    fireEvent.click(screen.getByText('שלח תגובה'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/messages/reply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ messageId: 'm1', reply: 'תגובה שלי' })
      })
    ))
    await waitFor(() => expect(onMessagesChanged).toHaveBeenCalledTimes(1))
    expect(showAlert).toHaveBeenCalledWith('הצלחה', 'התגובה נשלחה בהצלחה')
  })

  it('shows an error and does not call fetch when submitting an empty reply', () => {
    setup()
    fireEvent.click(screen.getByText('השב'))
    fireEvent.click(screen.getByText('שלח תגובה'))
    expect(showAlert).toHaveBeenCalledWith('שגיאה', 'נא לכתוב תגובה')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls onClose when clicking the close button', () => {
    setup()
    fireEvent.click(screen.getByText('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the backdrop but not when clicking inside the dialog', () => {
    const { container } = setup()
    fireEvent.click(screen.getByText('נושא לדוגמה'))
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = container.firstChild
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows "אתה" as the reply sender when the reply sender matches currentUserId', () => {
    setup({
      messages: [{
        ...baseMessage,
        replies: [{ id: 'r1', sender: 'user-1', content: 'תשובה', createdAt: '2025-03-16T10:00:00.000Z' }]
      }]
    })
    expect(screen.getByText('אתה')).toBeInTheDocument()
  })
})
