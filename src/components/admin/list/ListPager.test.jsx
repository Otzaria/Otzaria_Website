// עימוד הרשימה בניהול: עמוד אחד — כלום; אחרת ניווט עם שם נגיש, טווח "26–50 מתוך 1,077" (עם מפריד אלפים),
// prefix לפני הטווח, ובזמן פעולה מרובה (disabled) לחיצה לא מחליפה עמוד אבל הכפתור נשאר בסדר ה-Tab.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ListPager from './ListPager'

const PAGE = { page: 2, pageCount: 44, from: 26, to: 50, total: 1077 }

describe('ListPager', () => {
  test('עמוד אחד — לא מוצג כלום', () => {
    const { container } = render(<ListPager page={{ page: 1, pageCount: 1, from: 1, to: 3, total: 3 }} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('ניווט עם שם נגיש, וטווח עם מפריד אלפים', () => {
    render(<ListPager page={PAGE} onChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'מעבר בין עמודי הרשימה' })).toBeInTheDocument()
    expect(screen.getByText('26–50 מתוך 1,077')).toBeInTheDocument()
  })

  test('prefix לפני הטווח', () => {
    render(<ListPager page={PAGE} prefix="ספרים" onChange={() => {}} />)
    expect(screen.getByText('ספרים 26–50 מתוך 1,077')).toBeInTheDocument()
  })

  test('הבא / הקודם מעבירים עמוד', async () => {
    const onChange = vi.fn()
    render(<ListPager page={PAGE} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /הבא/ }))
    expect(onChange).toHaveBeenLastCalledWith(3)
    await userEvent.click(screen.getByRole('button', { name: /הקודם/ }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  test('disabled — לחיצה לא מחליפה עמוד, והכפתור נשאר נגיש בפוקוס', async () => {
    const onChange = vi.fn()
    render(<ListPager page={PAGE} onChange={onChange} disabled />)
    const next = screen.getByRole('button', { name: /הבא/ })
    expect(next).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(next)
    expect(onChange).not.toHaveBeenCalled()
    next.focus()
    expect(next).toHaveFocus()
  })
})
