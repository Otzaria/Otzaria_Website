import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Section from './Section'
import Container, { containerClasses } from './Container'

describe('Section', () => {
  it('section עם שם נגיש מהכותרת (aria-labelledby) → landmark מסוג region', () => {
    render(
      <Section id="features" labelledBy="features-heading" anchor>
        <h2 id="features-heading">יכולות</h2>
      </Section>
    )
    const region = screen.getByRole('region', { name: 'יכולות' })
    expect(region).toHaveAttribute('id', 'features')
    // anchor-section — החוזה מול styles (עצירת הגלילה מתחת לכותרת הדביקה)
    expect(region).toHaveClass('anchor-section')
    expect(region).toHaveAttribute('data-spacing', 'default')
  })

  it('container — מכל ברוחב התוכן כברירת מחדל; false — בלי מכל', () => {
    const { container, rerender } = render(<Section><p>א</p></Section>)
    expect(container.querySelector('section > div > p')).not.toBeNull()
    rerender(<Section container={false}><p>א</p></Section>)
    expect(container.querySelector('section > p')).not.toBeNull()
  })

  it('spacing="top" — ריפוד עליון בלבד', () => {
    const { container } = render(<Section spacing="top" />)
    expect(container.querySelector('section')).toHaveAttribute('data-spacing', 'top')
  })
})

describe('Container', () => {
  it('רוחבים מטוקני layout.css (max-w-content / narrow), ממורכז; כל גודל שונה', () => {
    expect(containerClasses('content')).toMatch(/\bmax-w-content\b/)
    expect(containerClasses('narrow')).toMatch(/\bmax-w-narrow\b/)
    expect(containerClasses('narrow')).toMatch(/\bmx-auto\b/)
    expect(containerClasses('content')).not.toBe(containerClasses('narrow'))
  })

  it('as — אלמנט אחר', () => {
    render(<Container as="main" data-testid="m" />)
    expect(screen.getByTestId('m').tagName).toBe('MAIN')
  })
})
