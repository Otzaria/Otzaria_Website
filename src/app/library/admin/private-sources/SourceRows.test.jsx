import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTypeBadge, BookRow, SetRow } from './SourceRows'

const options = {
  statuses: { approved: { label: 'אושר', color: '#10b981' } },
  methods: { email: { label: 'מייל' } },
  platforms: {},
}

describe('FileTypeBadge', () => {
  it('מציג את סוג הקובץ', () => {
    render(<FileTypeBadge fileType="txt" />)
    expect(screen.getByText('txt')).toBeInTheDocument()
  })
})

describe('BookRow', () => {
  it('מציג כותרת, נתיב, וכפתור עריכה שמפעיל onEdit', async () => {
    const onEdit = vi.fn()
    const item = {
      bookTitle: 'ספר לדוגמה',
      bookPath: 'ספרים/הלכה/ספר.txt',
      fileType: 'txt',
      record: null,
    }
    render(<BookRow item={item} options={options} onEdit={onEdit} />)

    expect(screen.getByText('ספר לדוגמה')).toBeInTheDocument()
    expect(screen.getByText('ספרים/הלכה/ספר.txt')).toBeInTheDocument()
    expect(screen.getByText('ללא רשומה')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /עריכה/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('מציג את סטטוס הרשומה ותג "קרדיט חובה" כשקיימת רשומה', () => {
    const item = {
      bookTitle: 'ספר',
      bookPath: 'a.txt',
      fileType: 'txt',
      record: { status: 'approved', ownerName: 'בעלים', requireCredit: true },
    }
    render(<BookRow item={item} options={options} onEdit={vi.fn()} />)
    expect(screen.getByText('אושר')).toBeInTheDocument()
    expect(screen.getByText('בעלים')).toBeInTheDocument()
    expect(screen.getByText('קרדיט חובה')).toBeInTheDocument()
  })
})

describe('SetRow', () => {
  const setItem = {
    setName: 'סט לדוגמה',
    isManual: true,
    books: [{ bookPath: 'a.txt', bookTitle: 'ספר א', fileType: 'txt', hasOwnRecord: false }],
    record: null,
  }

  it('מוצג מכווץ כברירת מחדל, ומתרחב בלחיצה', async () => {
    const onToggle = vi.fn()
    render(
      <SetRow
        item={setItem}
        options={options}
        expanded={false}
        onToggle={onToggle}
        onEdit={vi.fn()}
        onEditMember={vi.fn()}
      />
    )
    expect(screen.getByText('סט לדוגמה')).toBeInTheDocument()
    expect(screen.getByText('ידני')).toBeInTheDocument()
    expect(screen.queryByText('ספר א')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /סט לדוגמה/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('כשמורחב מציג את חברי הסט, כולל כפתור "קיימת רשומה נפרדת"', async () => {
    const onEditMember = vi.fn()
    const expandedItem = {
      ...setItem,
      books: [{ bookPath: 'a.txt', bookTitle: 'ספר א', fileType: 'txt', hasOwnRecord: true }],
    }
    render(
      <SetRow
        item={expandedItem}
        options={options}
        expanded
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onEditMember={onEditMember}
      />
    )
    expect(screen.getByText('ספר א')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /קיימת רשומה נפרדת/ }))
    expect(onEditMember).toHaveBeenCalledWith(expandedItem.books[0])
  })

  it('מציג הודעה כשאין ספרים בסט', () => {
    render(
      <SetRow
        item={{ ...setItem, books: [] }}
        options={options}
        expanded
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onEditMember={vi.fn()}
      />
    )
    expect(screen.getByText(/אין ספרים בסט/)).toBeInTheDocument()
  })
})
