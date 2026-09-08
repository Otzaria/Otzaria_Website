import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SubscriptionReminderModal from './SubscriptionReminderModal'

describe('SubscriptionReminderModal', () => {
  let onClose, toggleSubscription

  beforeEach(() => {
    onClose = vi.fn()
    toggleSubscription = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  function setup(props = {}) {
    return render(
      <SubscriptionReminderModal
        onClose={onClose}
        toggleSubscription={toggleSubscription}
        loadingSub={false}
        {...props}
      />
    )
  }

  it('calls toggleSubscription then onClose when "register now" is clicked', async () => {
    setup()
    fireEvent.click(screen.getByText('רשום אותי עכשיו'))

    await waitFor(() => expect(toggleSubscription).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts a dismiss request to the server and closes when declining', async () => {
    setup()
    fireEvent.click(screen.getByText('לא מעוניין (הזכר לי שוב בעוד שבוע)'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/user/notifications/dismiss',
      expect.objectContaining({ method: 'POST' })
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(toggleSubscription).not.toHaveBeenCalled()
  })

  it('still closes even if the dismiss request fails', async () => {
    global.fetch.mockRejectedValue(new Error('network down'))
    setup()
    fireEvent.click(screen.getByText('לא מעוניין (הזכר לי שוב בעוד שבוע)'))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows a spinner and disables the register button while loadingSub is true', () => {
    setup({ loadingSub: true })
    expect(screen.queryByText('רשום אותי עכשיו')).not.toBeInTheDocument()
    // the register button is the first of the two action buttons
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toBeDisabled()
  })
})
