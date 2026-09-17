import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DirectInstallButton from './DirectInstallButton'
import type { DirectInstallState } from './useDirectInstall'

const idleState: DirectInstallState = { phase: 'idle', pluginId: null, error: null, updated: false }

describe('DirectInstallButton', () => {
  it('shows the idle label and calls onInstall when clicked', async () => {
    const onInstall = vi.fn()
    render(
      <DirectInstallButton pluginId="p1" installState={idleState} onInstall={onInstall} className="btn" />
    )
    const button = screen.getByRole('button', { name: 'התקנה ישירה' })
    await userEvent.click(button)
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('shows the waiting spinner and disables the button only for its own plugin', () => {
    const waiting: DirectInstallState = { phase: 'waiting', pluginId: 'p1', error: null, updated: false }
    render(
      <DirectInstallButton pluginId="p1" installState={waiting} onInstall={vi.fn()} className="btn" />
    )
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('מתקין...')).toBeInTheDocument()
  })

  it('ignores install state belonging to a different plugin', () => {
    const waitingOther: DirectInstallState = { phase: 'waiting', pluginId: 'other-plugin', error: null, updated: false }
    render(
      <DirectInstallButton pluginId="p1" installState={waitingOther} onInstall={vi.fn()} className="btn" />
    )
    // הכפתור הזה לא באמצע ההתקנה של תוסף אחר — נשאר פעיל ומציג את הטקסט הרגיל
    expect(screen.getByRole('button')).not.toBeDisabled()
    expect(screen.getByText('התקנה ישירה')).toBeInTheDocument()
  })

  it('shows the failure message for its own plugin', () => {
    const failed: DirectInstallState = { phase: 'failure', pluginId: 'p1', error: 'boom', updated: false }
    render(
      <DirectInstallButton pluginId="p1" installState={failed} onInstall={vi.fn()} className="btn" />
    )
    expect(screen.getByText('ההתקנה נכשלה - לחץ שוב לנסיון נוסף')).toBeInTheDocument()
  })
})
