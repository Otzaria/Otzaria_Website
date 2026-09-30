import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BooksTable from './BooksTable'

const book = (over = {}) => ({
  gid: 'abcdef123456',
  title: 'ספר א',
  script: 'rashi',
  lineCount: 1200,
  doublePct: 10,
  pageCount: 40,
  double: 0,
  leased: 0,
  done: 10,
  submitted: 0,
  approved: 5,
  unexported: 0,
  recut: 0,
  status: 'active',
  ...over,
})

const renderTable = (books) =>
  render(<BooksTable books={books} busy={false} onDownload={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} onFilter={vi.fn()} />)

describe('BooksTable — ממתינים לזיהוי-מחדש', () => {
  it('מציג את מספר העמודים שממתינים לזיהוי-מחדש, עם הסבר הלולאה', () => {
    renderTable([book({ recut: 3 }), book({ gid: 'b2', title: 'ספר ב' })])
    expect(screen.getByText('ממתינים לזיהוי-מחדש: 3')).toBeInTheDocument()
    expect(screen.getAllByText(/ממתינים לזיהוי-מחדש: /)).toHaveLength(1)
    expect(screen.getByText(/והייבוא הבא של הספר יחזיר אותם להגהה במעבר שני/)).toBeInTheDocument()
  })

  it('בלי עמודים כאלה (או בלי השדה מהשרת) — לא מוצג דבר', () => {
    const { recut, ...noField } = book({ gid: 'b3', title: 'ספר ג' })
    void recut
    renderTable([book(), noField])
    expect(screen.queryByText(/ממתינים לזיהוי-מחדש/)).not.toBeInTheDocument()
  })
})
