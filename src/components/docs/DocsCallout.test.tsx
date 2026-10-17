import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsCallout from './DocsCallout'

describe('DocsCallout', () => {
  it('role=note, אייקון דקורטיבי, וצבע לפי תפקיד', () => {
    render(<DocsCallout tone="caution" icon="warning" title="זהירות:"><p>טקסט</p></DocsCallout>)
    const note = screen.getByRole('note')
    expect(note.className).toContain('bg-error-container')
    expect(note).toHaveTextContent('זהירות:')
    expect(note.querySelector('.material-symbols-outlined')).toHaveAttribute('aria-hidden', 'true')
  })

  it('ברירת המחדל — info', () => {
    render(<DocsCallout icon="info">מידע</DocsCallout>)
    expect(screen.getByRole('note').className).toContain('bg-info-container')
  })
})
