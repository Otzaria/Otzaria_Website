import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import MessageUploaderDialog from './MessageUploaderDialog'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const recipient = { email: 'uploader@example.com', name: 'מעלה' }
const JSON_HEADERS = { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) }
const ok = (data: unknown) => ({ ok: true, status: 200, headers: JSON_HEADERS, json: async () => data })
const renderDialog = (ui: ReactNode) => render(<ToastProvider>{ui}</ToastProvider>)
const body = () => screen.getByRole('textbox', { name: 'תוכן ההודעה' })

describe('MessageUploaderDialog', () => {
  it('pre-fills the subject and recipient details', () => {
    renderDialog(<MessageUploaderDialog recipient={recipient} initialSubject="בנוגע לספר X" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('בנוגע לספר X')).toBeInTheDocument()
    expect(screen.getByText('uploader@example.com', { exact: false })).toBeInTheDocument()
  })

  it('keeps "שלח הודעה" disabled until there is a subject and a message', async () => {
    renderDialog(<MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={vi.fn()} />)
    const send = screen.getByRole('button', { name: /שלח הודעה/ })
    expect(send).toBeDisabled()
    await userEvent.setup().type(body(), 'תוכן')
    expect(send).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends directly with the uploader id (no users list), shows a toast and closes', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true }))
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={{ ...recipient, id: 'u7' }} initialSubject="נושא" onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(body(), 'תוכן ההודעה')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/messages/send-admin', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ recipientId: 'u7', subject: 'נושא', message: 'תוכן ההודעה', sendToAll: false }),
    }))
    expect(screen.getByRole('status')).toHaveTextContent('ההודעה נשלחה למעלה')
  })

  it('without an id — looks the user up by email first', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ success: true, users: [{ _id: 'u1', email: recipient.email }] }))
      .mockResolvedValueOnce(ok({ success: true }))
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(body(), 'תוכן')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/users')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).recipientId).toBe('u1')
  })

  it('shows an error in the dialog and keeps it open when no matching user is found', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, users: [] }))
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(body(), 'תוכן')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))
    expect((await screen.findByText('לא נמצא משתמש עם כתובת הדואר הזו.')).closest('[role=alert]')).not.toBeNull()
    expect(body()).toHaveValue('תוכן')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('login redirect (HTML instead of JSON) — an error in the dialog, not a success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, redirected: true, type: 'basic',
      headers: { get: () => 'text/html' }, json: async () => { throw new Error('not json') },
    })
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={{ ...recipient, id: 'u7' }} initialSubject="נושא" onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(body(), 'תוכן')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))
    expect((await screen.findByText(/פג תוקף ההתחברות/)).closest('[role=alert]')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText(/ההודעה נשלחה/)).not.toBeInTheDocument()
  })

  it('HTML 200 without a redirect flag — still an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => { throw new Error('x') } })
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={{ ...recipient, id: 'u7' }} initialSubject="נושא" onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(body(), 'תוכן')
    await user.click(screen.getByRole('button', { name: /שלח הודעה/ }))
    expect((await screen.findByText('לא הצלחנו לשלוח את ההודעה. נסה שוב.')).closest('[role=alert]')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose from the cancel button', async () => {
    const onClose = vi.fn()
    renderDialog(<MessageUploaderDialog recipient={recipient} initialSubject="נושא" onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
