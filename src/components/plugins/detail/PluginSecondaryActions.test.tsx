import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PluginSecondaryActions from './PluginSecondaryActions'

const props = {
  onReport: vi.fn(),
  canEdit: false,
  loadingEdit: false,
  onEdit: vi.fn(),
  showSuspendToggle: false,
  isSuspended: false,
  suspending: false,
  onToggleSuspend: vi.fn()
}

describe('PluginSecondaryActions', () => {
  it('צופה רגיל: "מקור" בלשונית חדשה ו"דיווח למפתח" — בלי פעולות ניהול', async () => {
    const user = userEvent.setup()
    const onReport = vi.fn()
    render(<PluginSecondaryActions {...props} homepage="https://example.com" onReport={onReport} />)
    const source = screen.getByRole('link', { name: /מקור/ })
    expect(source).toHaveAttribute('href', 'https://example.com')
    expect(source).toHaveAttribute('target', '_blank')
    await user.click(screen.getByRole('button', { name: /דיווח למפתח/ }))
    expect(onReport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /ערוך/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /השהה מהחנות/ })).toBeNull()
  })

  it('בלי homepage — אין "מקור", הדיווח תמיד שם', () => {
    render(<PluginSecondaryActions {...props} />)
    expect(screen.queryByRole('link', { name: /מקור/ })).toBeNull()
    expect(screen.getByRole('button', { name: /דיווח למפתח/ })).toBeInTheDocument()
  })

  it('המעלה: עריכה והשהיה / החזרה', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onToggleSuspend = vi.fn()
    const { rerender } = render(
      <PluginSecondaryActions {...props} canEdit showSuspendToggle onEdit={onEdit} onToggleSuspend={onToggleSuspend} />
    )
    await user.click(screen.getByRole('button', { name: /ערוך/ }))
    await user.click(screen.getByRole('button', { name: /השהה מהחנות/ }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onToggleSuspend).toHaveBeenCalledOnce()

    rerender(<PluginSecondaryActions {...props} canEdit showSuspendToggle isSuspended suspending />)
    expect(screen.getByRole('button', { name: /מעדכן/ })).toBeDisabled()
  })
})

describe('PluginSecondaryActions — תוסף שירות', () => {
  it('"הגשות השירות" במקום "ערוך"', () => {
    render(<PluginSecondaryActions {...props} canEdit={false} serviceUrl="/plugins/p1/service" />)
    expect(screen.getByRole('link', { name: /הגשות השירות/ })).toHaveAttribute('href', '/plugins/p1/service')
    expect(screen.queryByRole('button', { name: /ערוך/ })).toBeNull()
  })
})
