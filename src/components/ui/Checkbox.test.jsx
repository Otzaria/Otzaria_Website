import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Checkbox from './Checkbox'

describe('Checkbox', () => {
  test('שם נגיש, מצב מעורב, ושינוי', () => {
    const onChange = vi.fn()
    render(<Checkbox label="בחר את חוות דעת" checked={false} indeterminate onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'בחר את חוות דעת' })
    expect(box).toBePartiallyChecked()
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledWith(true, expect.anything())
  })
})
