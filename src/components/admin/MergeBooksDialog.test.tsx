import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MergeBooksDialog from './MergeBooksDialog'

const showAlertMock = vi.fn()

vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({
    showAlert: showAlertMock,
  }),
}))

const fetchMock = vi.fn()

const books = [
  { id: 'b1', name: 'ספר א', category: 'כללי' },
  { id: 'b2', name: 'ספר ב', category: 'כללי' },
  { id: 'b3', name: 'ספר ג', category: 'כללי' },
]

beforeEach(() => {
  showAlertMock.mockClear()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('MergeBooksDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MergeBooksDialog isOpen={false} books={books} onClose={vi.fn()} onMergeComplete={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('selects books, reorders them, and submits with the ordered ids and name', async () => {
    const onClose = vi.fn()
    const onMergeComplete = vi.fn()
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true }) })

    render(
      <MergeBooksDialog isOpen={true} books={books} onClose={onClose} onMergeComplete={onMergeComplete} />
    )

    const user = userEvent.setup()

    // בחירת שני ספרים מרשימת המקור, לפי סדר בחירה: ב' ואז א'
    await user.click(screen.getByText('ספר ב'))
    await user.click(screen.getByText('ספר א'))

    // בעמודה הימנית אמור להופיע סדר: ב', א'
    expect(screen.getByText('שם הספר המאוחד החדש')).toBeInTheDocument()

    // הזז את א' למעלה (index 1 -> 0), כך שהסדר יהפוך ל: א', ב'
    const upButtons = screen.getAllByText('arrow_upward')
    await user.click(upButtons[1])

    await user.type(screen.getByPlaceholderText('לדוגמה: אוסף כתבים מלא'), 'ספר מאוחד')

    const submitButton = screen.getByRole('button', { name: 'בצע מיזוג עכשיו' })
    expect(submitButton).not.toBeDisabled()
    await user.click(submitButton)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/books/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookIds: ['b1', 'b2'],
        newName: 'ספר מאוחד',
        isHidden: false,
      }),
    })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onMergeComplete).toHaveBeenCalledTimes(1)
    expect(showAlertMock).toHaveBeenCalledWith('הצלחה', 'הספרים מוזגו בהצלחה!')
  })

  it('disables submit and shows a warning when fewer than 2 books are selected', async () => {
    render(
      <MergeBooksDialog isOpen={true} books={books} onClose={vi.fn()} onMergeComplete={vi.fn()} />
    )
    const submitButton = screen.getByRole('button', { name: 'בצע מיזוג עכשיו' })
    expect(submitButton).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancel closes without calling the merge API', async () => {
    const onClose = vi.fn()
    render(
      <MergeBooksDialog isOpen={true} books={books} onClose={onClose} onMergeComplete={vi.fn()} />
    )
    const user = userEvent.setup()
    await user.click(screen.getByText('ספר א'))
    await user.click(screen.getByRole('button', { name: 'ביטול' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes a book from the merge list', async () => {
    render(
      <MergeBooksDialog isOpen={true} books={books} onClose={vi.fn()} onMergeComplete={vi.fn()} />
    )
    const user = userEvent.setup()
    await user.click(screen.getByText('ספר א'))
    await user.click(screen.getByText('ספר ב'))

    // כפתור close הראשון בעמודה הימנית שייך לספר הראשון ברשימת המיזוג (ספר א')
    const removeButtons = screen.getAllByText('close')
    await user.click(removeButtons[0])

    // ספר א' חוזר להיות זמין לבחירה מחדש מרשימת המקור
    expect(screen.getAllByText('ספר א')).toHaveLength(1)
  })
})
