import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PageRangeFields from './PageRangeFields'

describe('PageRangeFields', () => {
  test('שני שדות עם שם נגיש, placeholder של סוף הספר, ושינוי שמסנן תווים שאינם ספרות', () => {
    const onChange = vi.fn()
    render(<PageRangeFields value={{ from: '', to: '' }} onChange={onChange} total={120} />)
    const from = screen.getByRole('textbox', { name: 'מעמוד' })
    const to = screen.getByRole('textbox', { name: 'עד עמוד' })
    expect(from).toHaveAttribute('placeholder', '1')
    expect(to).toHaveAttribute('placeholder', '120')
    fireEvent.change(from, { target: { value: '1a2' } })
    expect(onChange).toHaveBeenCalledWith({ from: '12', to: '' })
  })

  test('שגיאה — הודעה, ורק השדה השגוי מסומן', () => {
    render(<PageRangeFields value={{ from: '9', to: '3' }} onChange={() => {}} error="עמוד הסוף לפני עמוד ההתחלה." errorField="to" hint="יועלו 3 עמודים" />)
    expect(screen.getByRole('alert')).toHaveTextContent('עמוד הסוף לפני עמוד ההתחלה.')
    expect(screen.getByRole('textbox', { name: 'עד עמוד' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: 'מעמוד' })).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('יועלו 3 עמודים')).toBeInTheDocument()
  })

  test('disabled — שני השדות כבויים', () => {
    render(<PageRangeFields value={{ from: '', to: '' }} onChange={() => {}} disabled />)
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled()
  })
})
