import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LibraryChrome from './LibraryChrome'

let pathname = '/library'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

describe('LibraryChrome', () => {
  it('בדפי הספרייה — עם הפוטר', () => {
    pathname = '/library/books/abc'
    render(<LibraryChrome footer={<footer>פוטר</footer>}><p>תוכן</p></LibraryChrome>)
    expect(screen.getByText('פוטר')).toBeInTheDocument()
  })

  it('בעורך העמוד — בלי פוטר, ובעוטף שממלא את החלון', () => {
    pathname = '/library/books/abc/12'
    const { container } = render(<LibraryChrome footer={<footer>פוטר</footer>}><p>תוכן</p></LibraryChrome>)
    expect(screen.queryByText('פוטר')).not.toBeInTheDocument()
    expect(container.querySelector('[data-editor-route]')).toHaveClass('h-dvh', 'overflow-hidden')
  })
})
