import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Pager from './Pager'

describe('Pager', () => {
  test('עמוד יחיד — כלום; אחרת הקודם/הבא מושבתים בקצוות', () => {
    const { container, rerender } = render(<Pager page={1} pageCount={1} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    const onChange = vi.fn()
    rerender(<Pager page={1} pageCount={12} onChange={onChange} />)
    expect(screen.getByRole('navigation')).toHaveTextContent('עמוד 1 מתוך 12')
    expect(screen.getByText(/עמוד 1 מתוך 12/)).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: /הקודם/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /הבא/ }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})
