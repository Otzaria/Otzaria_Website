import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import IconTile from './IconTile'
import Badge from './Badge'

describe('IconTile', () => {
  it('דקורטיבי (aria-hidden) עם גליף בגודל לפי size', () => {
    const { container } = render(<IconTile icon="search" size="lg" />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile).toHaveAttribute('aria-hidden', 'true')
    expect(tile.className).toContain('text-(length:--icon-size-lg)')
    expect(tile).toHaveTextContent('search')
  })

  it('custom — אייקון מותאם (מסכה) במקום גליף', () => {
    const { container } = render(<IconTile custom="donate" />)
    expect(container.querySelector('.app-icon-donate')).not.toBeNull()
  })
})

describe('Badge', () => {
  it('טקסט על רקע טונלי לפי tone, בלי אלמנט אינטראקטיבי', () => {
    const { container } = render(<Badge tone="success" icon="check">מאושר</Badge>)
    const badge = container.firstElementChild as HTMLElement
    expect(badge).toHaveTextContent('מאושר')
    expect(badge.className).toContain('bg-success-container')
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('button, a')).toBeNull()
  })
})
