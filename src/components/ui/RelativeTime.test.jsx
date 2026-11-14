// זמן יחסי: הטקסט הגלוי יחסי, ב-title התאריך המלא, dateTime תקני; format ו-prefix; תאריך לא תקין — כלום.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import RelativeTime from './RelativeTime'
import { fullDateText } from '@/lib/adminTerms'

describe('RelativeTime', () => {
  test('היום — "היום", ובריחוף התאריך המלא', () => {
    const date = new Date()
    const { container } = render(<RelativeTime date={date} />)
    const time = container.querySelector('time')
    expect(time).toHaveTextContent('היום')
    expect(time).toHaveAttribute('title', fullDateText(date))
    expect(time).toHaveAttribute('dateTime', date.toISOString())
    expect(container.firstChild).toBe(time)
  })

  test('prefix — לפני הזמן, באותה שורה', () => {
    const { container } = render(<RelativeTime date={new Date()} prefix="עודכן" />)
    expect(container.firstChild).toHaveTextContent('עודכן היום')
    expect(container.querySelector('time')).toHaveTextContent('היום')
  })

  test('format — ניסוח אחר לטקסט הגלוי; ה-title נשאר התאריך המלא', () => {
    const date = '2026-01-05T10:00:00Z'
    const { container } = render(<RelativeTime date={date} format={() => '12:00'} />)
    expect(container.querySelector('time')).toHaveTextContent('12:00')
    expect(container.querySelector('time')).toHaveAttribute('title', fullDateText(date))
  })

  test('תאריך חסר או לא תקין — כלום', () => {
    expect(render(<RelativeTime date={null} />).container).toBeEmptyDOMElement()
    expect(render(<RelativeTime date="לא תאריך" />).container).toBeEmptyDOMElement()
  })
})
