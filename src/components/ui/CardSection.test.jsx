// אזור בכרטיס: כותרת h2 שנותנת שם ל-section; פעולות והסבר; headingRef — הכותרת מקבלת פוקוס מתוכנה.
import { createRef } from 'react'
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import CardSection from './CardSection'

describe('CardSection', () => {
  test('הכותרת נותנת שם לאזור; הסבר ופעולות', () => {
    render(<CardSection title="מפתחות" description="הסבר" actions={<button type="button">רענן</button>}>תוכן</CardSection>)
    expect(screen.getByRole('region', { name: 'מפתחות' })).toHaveTextContent('תוכן')
    expect(screen.getByRole('heading', { level: 2, name: 'מפתחות' })).not.toHaveAttribute('tabindex')
    expect(screen.getByText('הסבר')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'רענן' })).toBeInTheDocument()
  })

  test('headingRef — הכותרת ניתנת לפוקוס מתוכנה (tabIndex=-1)', () => {
    const ref = createRef()
    render(<CardSection title="אזור" headingRef={ref}>x</CardSection>)
    expect(ref.current).toHaveAttribute('tabindex', '-1')
  })

  test('בלי כותרת — section בלי שם, בלי שורת כותרת', () => {
    const { container } = render(<CardSection testId="s">x</CardSection>)
    expect(container.querySelector('section')).not.toHaveAttribute('aria-labelledby')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
