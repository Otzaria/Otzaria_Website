import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationSubscriptionModal from './NotificationSubscriptionModal'

describe('NotificationSubscriptionModal', () => {
  let onClose, toggleSubscription

  beforeEach(() => {
    onClose = vi.fn()
    toggleSubscription = vi.fn().mockResolvedValue(undefined)
  })

  function setup(props = {}) {
    return render(
      <NotificationSubscriptionModal
        onClose={onClose}
        toggleSubscription={toggleSubscription}
        isSubscribed={false}
        loadingSub={false}
        {...props}
      />
    )
  }

  it('shows the unsubscribed state and its call-to-action', () => {
    setup()
    expect(screen.getByText('לא רשום')).toBeInTheDocument()
    expect(screen.getByText('אשר קבלת התראות')).toBeInTheDocument()
  })

  it('shows the subscribed state and its call-to-action', () => {
    setup({ isSubscribed: true })
    expect(screen.getByText('רשום לקבלת עדכונים')).toBeInTheDocument()
    expect(screen.getByText('בטל קבלת התראות')).toBeInTheDocument()
  })

  it('calls toggleSubscription when the action button is clicked', () => {
    setup()
    fireEvent.click(screen.getByText('אשר קבלת התראות'))
    expect(toggleSubscription).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is clicked', () => {
    setup()
    fireEvent.click(screen.getByText('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner and disables the action button while loadingSub is true', () => {
    setup({ loadingSub: true })
    expect(screen.queryByText('אשר קבלת התראות')).not.toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    // second button is the subscribe/unsubscribe action button
    expect(buttons[1]).toBeDisabled()
  })
})
