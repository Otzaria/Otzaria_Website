import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageUploaderDialog from './MessageUploaderDialog'

const showAlertMock = vi.fn()

vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({ showAlert: showAlertMock }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  showAlertMock.mockClear()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const recipient = { email: 'uploader@example.com', name: 'מעלה' }

describe('MessageUploaderDialog', () => {
  it('pre-fills the subject and recipient details', () => {
    render(
      <MessageUploaderDialog recipient={recipient} initialSubject="בנוגע לספר X" onClose={vi.fn()} />
    )
    expect(screen.getByDisplayValue('בנוגע לספר X')).toBeInTheDocument()
    expect(screen.getByText('uploader@example.com', { exact: false })).toBeInTheDocument()
  })

  it('shows a validation error and does not call fetch when the message body is empty', async () => {
    render(
      <MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={vi.fn()} />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /שלח הודעה/ }))
    expect(showAlertMock).toHaveBeenCalledWith('שגיאה', 'נא למלא את כל השדות')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks up the user by email, sends the message, and closes on success', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ success: true, users: [{ _id: 'u1', email: recipient.email }] }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) })

    const onClose = vi.fn()
    render(
      <MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />
    )

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('כתוב את ההודעה שלך כאן...'), 'תוכן ההודעה')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/users')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/messages/send-admin', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        recipientId: 'u1',
        subject: 'נושא',
        message: 'תוכן ההודעה',
        sendToAll: false,
      }),
    }))
    expect(showAlertMock).toHaveBeenCalledWith('הצלחה', 'ההודעה נשלחה בהצלחה')
  })

  it('shows an error and does not close when no matching user is found', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true, users: [] }),
    })
    const onClose = vi.fn()
    render(
      <MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />
    )
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('כתוב את ההודעה שלך כאן...'), 'תוכן')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))

    await waitFor(() => expect(showAlertMock).toHaveBeenCalledWith('שגיאה', 'לא נמצא משתמש עם כתובת אימייל זו'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose from the cancel button', async () => {
    const onClose = vi.fn()
    render(
      <MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
