import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Ltr from './Ltr'

describe('Ltr', () => {
  it('bdi בכיוון LTR שאינו נשבר', () => {
    render(<p>מחשב <Ltr>Windows 10 / 11</Ltr></p>)
    const term = screen.getByText('Windows 10 / 11')
    expect(term.tagName).toBe('BDI')
    expect(term).toHaveAttribute('dir', 'ltr')
    expect(term.className).toBe('whitespace-nowrap')
  })

  it('className מתווסף', () => {
    render(<Ltr className="font-mono">uname -m</Ltr>)
    expect(screen.getByText('uname -m')).toHaveClass('whitespace-nowrap', 'font-mono')
  })
})
