import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import LibraryInfoPage from './page'
vi.mock('@/components/layout/Header', () => ({ default: () => null }))
vi.mock('@/components/ui/LoadingSpinner', () => ({ default: () => <div>loading</div> }))

describe('book info source refresh and bounded rendering', () => {
  it('renders at most 100 of 7814 rows while searching across the complete library', async () => {
    const rows = Array.from({ length: 7814 }, (_, i) => {
      const approved = { bookName: `ספר ${String(i).padStart(5, '0')}`, authorName: '', generationName: null, subGenerationName: null, startYear: null, endYear: null }
      return { id: String(i), approved, effective: approved, pending: null }
    })
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ success: true, rows, generationOptions: [], subGenerationOptionsByGeneration: {}, unresolvedEdits: [{ id: 'removed', book: 'ספר שהוסר', lastError: 'הספר הוסר; ההצעה נשמרה לבדיקה', prUrl: 'https://github.com/x/pull/3' }] }) })
    const { container } = render(<LibraryInfoPage />)
    expect(await screen.findByText('ספר 00000')).toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(100)
    expect(screen.getByText(/הספר הוסר; ההצעה נשמרה/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(screen.getByText('ספר 00100')).toBeInTheDocument()
    // fireEvent.change ולא userEvent.type: הקלדה תו-תו מסננת את 7,814 השורות מחדש בכל תו
    // (9 רינדורים), וזה חרג ממגבלת 5 השניות תחת עומס. הטסט בודק את התוצאה, לא את ההקלדה.
    fireEvent.change(screen.getByPlaceholderText('חיפוש לפי ספר/מחבר'), { target: { value: 'ספר 07813' } })
    await waitFor(() => expect(screen.getByText('ספר 07813')).toBeInTheDocument())
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
    vi.restoreAllMocks()
    // 7,814 שורות: רינדור, מעבר עמוד וסינון. בהרצה המלאה (234 קבצים במקביל) זה חרג מ-5 השניות
    // של ברירת המחדל (נמדד: 7.1 שניות), ולכן מגבלה מפורשת.
  }, 20000)
})
