import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PluginRatingsModal from './PluginRatingsModal'

const showAlertMock = vi.fn()
const showConfirmMock = vi.fn()

vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({
    showAlert: showAlertMock,
    showConfirm: showConfirmMock
  })
}))

const plugin = { _id: 'p1', name: 'תוסף לדוגמה' }

const ratingsResponse = {
  plugin: { ratingAvg: 4.5, ratingCount: 2, ratingVerifiedCount: 1, ratingScore: 4.2 },
  ratings: [
    {
      id: 'r1',
      value: 5,
      userName: 'משה',
      userEmail: 'moshe@example.com',
      verifiedInstall: true,
      isHidden: false,
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'r2',
      value: 4,
      userName: 'דוד',
      userEmail: 'david@example.com',
      verifiedInstall: false,
      isHidden: false,
      createdAt: '2024-02-01T00:00:00.000Z'
    }
  ]
}

beforeEach(() => {
  showAlertMock.mockClear()
  showConfirmMock.mockReset()
  global.fetch = vi.fn()
})

describe('PluginRatingsModal', () => {
  it('loads and displays the ratings list for the plugin', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ratingsResponse })
    render(<PluginRatingsModal plugin={plugin} onClose={vi.fn()} />)

    expect(global.fetch).toHaveBeenCalledWith('/api/admin/plugins/p1/ratings')
    await waitFor(() => expect(screen.getByText('משה')).toBeInTheDocument())
    expect(screen.getByText('דוד')).toBeInTheDocument()
    expect(screen.getByText('2 מדרגים')).toBeInTheDocument()
    expect(screen.getByText(`דירוגים: ${plugin.name}`)).toBeInTheDocument()
  })

  it('hides a rating after confirmation and updates the aggregate passed to onClose', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ratingsResponse })
    showConfirmMock.mockResolvedValueOnce(true)
    const updatedAggregate = { ratingAvg: 5, ratingCount: 1, ratingVerifiedCount: 0, ratingScore: 5 }
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aggregate: updatedAggregate,
        rating: { id: 'r1', isHidden: true }
      })
    })

    const onClose = vi.fn()
    render(<PluginRatingsModal plugin={plugin} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('משה')).toBeInTheDocument())

    const hideButtons = screen.getAllByRole('button', { name: /הסתר/ })
    await userEvent.setup().click(hideButtons[0])

    expect(showConfirmMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/plugins/p1/ratings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ratingId: 'r1', action: 'hide' })
      })
    ))

    // clicking the header close button should call onClose with the latest aggregate from the server
    await userEvent.setup().click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalledWith(updatedAggregate)
  })

  it('does not send a hide request when the confirmation is declined', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ratingsResponse })
    showConfirmMock.mockResolvedValueOnce(false)

    render(<PluginRatingsModal plugin={plugin} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('משה')).toBeInTheDocument())

    const hideButtons = screen.getAllByRole('button', { name: /הסתר/ })
    await userEvent.setup().click(hideButtons[0])

    expect(showConfirmMock).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1) // only the initial load, no PATCH
  })

  it('calls onClose with no aggregate when closed without changes', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...ratingsResponse, ratings: [] }) })
    const onClose = vi.fn()
    render(<PluginRatingsModal plugin={plugin} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('התוסף עדיין לא דורג')).toBeInTheDocument())

    await userEvent.setup().click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalledWith(null)
  })
})
