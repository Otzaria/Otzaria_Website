import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Loader from './Loader'

describe('Loader', () => {
  it('ברירת מחדל: role="status" עם aria-label "טוען…" וטקסט נסתר להכרזה', () => {
    render(<Loader />)
    const status = screen.getByRole('status', { name: 'טוען…' })
    expect(status.className).toContain('loader--md')
    expect(status.className).toContain('text-primary')
    expect(status.querySelector('.sr-only')).toHaveTextContent('טוען…')
    expect(status.querySelector('.loader-label')).toBeNull()
  })

  it('שלושה יהלומים ב-SVG דקורטיבי בתוך המחוון', () => {
    const { container } = render(<Loader />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelectorAll('.loader-dot')).toHaveLength(3)
  })

  it('label מותאם — גם בשם הנגיש וגם בטקסט', () => {
    render(<Loader label="טוען תוספים…" />)
    expect(screen.getByRole('status', { name: 'טוען תוספים…' })).toHaveTextContent('טוען תוספים…')
  })

  it('lg מציג כיתוב גלוי כברירת מחדל, ו-showLabel={false} מסתיר אותו', () => {
    const { rerender, container } = render(<Loader size="lg" label="טוען ספר…" />)
    expect(container.querySelector('.loader-label')).toHaveTextContent('טוען ספר…')
    rerender(<Loader size="lg" label="טוען ספר…" showLabel={false} />)
    expect(container.querySelector('.loader-label')).toBeNull()
    expect(container.querySelector('.sr-only')).toHaveTextContent('טוען ספר…')
  })

  it('inline — בצבע הטקסט של ההורה (בלי text-primary)', () => {
    render(<Loader size="inline" />)
    const status = screen.getByRole('status')
    expect(status.className).toContain('loader--inline')
    expect(status.className).not.toContain('text-primary')
  })

  it('decorative — aria-hidden, בלי role ובלי טקסט', () => {
    const { container } = render(<Loader size="inline" decorative />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root).not.toHaveAttribute('role')
    expect(root).toHaveTextContent('')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
