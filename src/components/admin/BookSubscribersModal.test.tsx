import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookSubscribersModal from './BookSubscribersModal'

const showAlertMock = vi.fn()
let confirmedAction: (() => void) | null = null

vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({
    showAlert: showAlertMock,
    showConfirm: (_title: string, _message: string, onConfirm: () => void) => {
      confirmedAction = onConfirm
    },
  }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  showAlertMock.mockClear()
  confirmedAction = null
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('BookSubscribersModal', () => {
  it('renders nothing when closed and does not fetch', () => {
    const { container } = render(<BookSubscribersModal isOpen={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and displays the subscriber list when opened', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true, subscribers: [{ email: 'a@b.com', name: 'א' }] }),
    })
    render(<BookSubscribersModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/mailing-list')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('removes a subscriber from the list after a confirmed delete succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true, subscribers: [{ email: 'a@b.com', name: 'א' }] }),
    })
    render(<BookSubscribersModal isOpen={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument())

    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true }) })
    await userEvent.setup().click(screen.getByTitle('מחק מנוי'))

    expect(confirmedAction).not.toBeNull()
    await confirmedAction!()

    await waitFor(() => expect(screen.queryByText('a@b.com')).not.toBeInTheDocument())
    expect(showAlertMock).toHaveBeenCalledWith('הצלחה', 'המנוי הוסר בהצלחה')
  })

  it('calls onClose from the footer close button', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true, subscribers: [] }),
    })
    const onClose = vi.fn()
    render(<BookSubscribersModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('אין רשומים ברשימה זו עדיין.')).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('button', { name: 'סגור' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
