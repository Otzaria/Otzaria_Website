import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import NewWindowHint from './NewWindowHint'

describe('NewWindowHint', () => {
  it('הנוסח לקורא מסך, מוסתר חזותית', () => {
    const { container } = render(<NewWindowHint />)
    expect(container.firstElementChild).toHaveClass('sr-only')
    expect(container.textContent).toBe(' (נפתח בחלון חדש)')
  })

  it('עם יעד', () => {
    const { container } = render(<NewWindowHint destination="ב-GitHub" />)
    expect(container.textContent).toBe(' ב-GitHub (נפתח בחלון חדש)')
  })
})
