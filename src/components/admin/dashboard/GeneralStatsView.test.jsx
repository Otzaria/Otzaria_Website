// "מצב כללי": מספרים מעוצבים, פס התקדמות נגיש, "—" במקום undefined, ומצב "לא נטען".
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import { buildGeneralStats } from '@/lib/adminDashboard'
import GeneralStatsView from './GeneralStatsView'

const DATA = { books: 132, hiddenBooks: 85, totalPages: 19955, completedPages: 3870, inProgressPages: 14429, users: 2259, appReportsWeek: 425 }

describe('GeneralStatsView', () => {
  test('מנהל כללי — כל המספרים ופס ההתקדמות', () => {
    render(<GeneralStatsView stats={buildGeneralStats('admin', DATA)} />)
    expect(screen.getByRole('heading', { level: 2, name: 'מצב כללי' })).toBeInTheDocument()
    expect(screen.getByText('משתמשים')).toBeInTheDocument()
    expect(screen.getByText('2,259')).toBeInTheDocument()
    expect(screen.getByText('85 לא מוצגים באתר')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: '3,870 מתוך 19,955 עמודים הושלמו' })
    expect(bar).toHaveAttribute('aria-valuenow', '19.4')
    expect(bar).toHaveAttribute('aria-valuetext', '19.4%')
  })

  test('שש פריטים — רשת של 2/3/6, כך שאף פריט לא נשאר לבד בשורה', () => {
    const { container } = render(<GeneralStatsView stats={buildGeneralStats('admin', DATA)} />)
    expect(container.querySelector('dl').className).toMatch(/@xl:grid-cols-3 .*@5xl:grid-cols-6/)
  })

  test('נתונים חסרים — "—" ובלי undefined', () => {
    const { container } = render(<GeneralStatsView stats={buildGeneralStats('admin_books', {})} />)
    expect(container).not.toHaveTextContent('undefined')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('משתמשים')).not.toBeInTheDocument()
  })

  test('כשל — משפט אחד ו"נסה שוב"', () => {
    render(<GeneralStatsView stats={buildGeneralStats('admin', {})} failed />)
    expect(screen.getByText('לא הצלחנו לטעון את המספרים הכלליים')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument()
  })

  test('מנהל ספרים בלבד — קישור לניהול הספרים', () => {
    render(<GeneralStatsView stats={buildGeneralStats('admin_books_only', DATA)} showBooksLink />)
    expect(screen.getByRole('link', { name: 'לניהול הספרים' })).toHaveAttribute('href', '/library/admin/books')
  })
})
