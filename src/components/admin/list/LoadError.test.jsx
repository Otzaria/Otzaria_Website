import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoadError from './LoadError'

vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

describe('LoadError', () => {
  test('התחברות שפגה: "התחבר", בלי "נסה שוב"', () => {
    render(<LoadError error={{ sessionExpired: true, status: 401 }} title="לא נטען" onRetry={() => {}} />)
    expect(screen.getByRole('link', { name: 'התחבר' })).toHaveAttribute('href', expect.stringContaining('/auth/login'))
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })

  test('403: "לראות את המסך" (לא "פעולה"), למי פונים, ובלי "נסה שוב"', () => {
    render(<LoadError error={{ status: 403, message: 'אין לך הרשאה לפעולה הזו.' }} title="לא נטען" onRetry={() => {}} />)
    expect(screen.getByRole('heading', { name: 'אין לך הרשאה לראות את המסך הזה' })).toBeInTheDocument()
    expect(screen.getByText(/פנה למנהל האתר/)).toBeInTheDocument()
    expect(screen.queryByText(/לפעולה הזו/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
  })

  test('הודעה שחוזרת על הכותרת — לא פעמיים; במקומה הסבר', () => {
    render(<LoadError error={{ status: 500, message: 'לא הצלחנו לטעון את הספרים.' }} title="לא הצלחנו לטעון את הספרים" onRetry={() => {}} />)
    expect(screen.getAllByText(/לא הצלחנו לטעון את הספרים/)).toHaveLength(1)
    expect(screen.getByText('ייתכן שזו תקלה זמנית. נסה שוב בעוד רגע.')).toBeInTheDocument()
  })

  test('כל שגיאה אחרת: "נסה שוב"', async () => {
    const onRetry = vi.fn()
    render(<LoadError error={{ status: 500, message: 'משהו נכשל' }} title="לא נטען" onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
