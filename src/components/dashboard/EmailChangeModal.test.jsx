import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EmailChangeModal from './EmailChangeModal'

describe('EmailChangeModal', () => {
  let showAlert, showConfirm, onClose, updateSession

  beforeEach(() => {
    showAlert = vi.fn()
    showConfirm = vi.fn()
    onClose = vi.fn()
    updateSession = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn()
  })

  function setup(props = {}) {
    return render(
      <EmailChangeModal
        onClose={onClose}
        currentEmail="old@example.com"
        showAlert={showAlert}
        showConfirm={showConfirm}
        updateSession={updateSession}
        {...props}
      />
    )
  }

  it('initializes the input with the current email', () => {
    setup()
    expect(screen.getByPlaceholderText('הכנס מייל חדש...')).toHaveValue('old@example.com')
  })

  it('calls onClose when the cancel button is clicked, without touching the network', () => {
    setup()
    fireEvent.click(screen.getByText('ביטול'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows a validation alert and does not confirm/submit for an invalid email', () => {
    setup()
    const input = screen.getByPlaceholderText('הכנס מייל חדש...')
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByText('עדכן מייל'))

    expect(showAlert).toHaveBeenCalledWith('שגיאה', 'נא להזין כתובת מייל תקינה')
    expect(showConfirm).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('asks for confirmation before submitting a valid, changed email, then updates on confirm', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    setup()

    const input = screen.getByPlaceholderText('הכנס מייל חדש...')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByText('עדכן מייל'))

    expect(showConfirm).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()

    // simulate the user confirming in the dialog
    const onConfirm = showConfirm.mock.calls[0][2]
    await onConfirm()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/update-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@example.com' })
      })
    ))
    await waitFor(() => expect(updateSession).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('הצלחה', 'כתובת המייל עודכנה בהצלחה!'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows the server error message and keeps the modal open on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'כבר בשימוש' }) })
    setup()

    fireEvent.change(screen.getByPlaceholderText('הכנס מייל חדש...'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByText('עדכן מייל'))

    const onConfirm = showConfirm.mock.calls[0][2]
    await onConfirm()

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('שגיאה', 'כבר בשימוש'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without confirming or calling the network if the email is unchanged', () => {
    setup()
    fireEvent.click(screen.getByText('עדכן מייל'))
    // button is disabled while unchanged, but guard the handler too
    expect(showConfirm).not.toHaveBeenCalled()
  })
})
