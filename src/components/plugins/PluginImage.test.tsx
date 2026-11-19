import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import PluginImage, { PLUGIN_IMAGE_FALLBACK } from './PluginImage'

describe('PluginImage', () => {
  it('מציג את תמונת התוסף, alt ריק כברירת מחדל ו-lazy', () => {
    const { container } = render(<PluginImage src="/api/plugins/p1/image" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('src', '/api/plugins/p1/image')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('מבקש גרסת כרטיס באייקונים קטנים ושומר את המקור בכותרת פרטי התוסף', () => {
    const source = '/api/plugins/0123456789abcdef01234567/image?pending=1'
    const { container, rerender } = render(<PluginImage src={source} size="md" />)
    expect(container.querySelector('img')).toHaveAttribute('src', source + '&size=card')
    rerender(<PluginImage src={source} size="hero" />)
    expect(container.querySelector('img')).toHaveAttribute('src', source)
  })

  it('priority — eager ובעדיפות גבוהה', () => {
    const { container } = render(<PluginImage src="/x.webp" priority />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img.getAttribute('fetchpriority') ?? img.getAttribute('fetchPriority')).toBe('high')
  })

  it('בלי src — הלוגו של אוצריא כחלופה', () => {
    const { container } = render(<PluginImage src="" />)
    expect(container.querySelector('img')).toHaveAttribute('src', PLUGIN_IMAGE_FALLBACK)
    expect(container.firstElementChild).toHaveAttribute('data-fallback')
  })

  it('כשל טעינה — עובר לחלופה', () => {
    const { container } = render(<PluginImage src="/missing.webp" alt="שם" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('src', PLUGIN_IMAGE_FALLBACK)
    expect(img).toHaveAttribute('alt', 'שם')
  })
})

describe('PluginImage — גודל hero ו-bleed (ראש עמוד התוסף)', () => {
  it('hero: 96 → 120 (sm) → 168 (lg), ו-width/height של 168', () => {
    const { container } = render(<PluginImage src="/x.png" size="hero" bleed />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.className).toContain('size-(--plugin-icon-size-hero-sm)')
    expect(tile.className).toContain('lg:size-(--plugin-icon-size-hero)')
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toHaveAttribute('width', '168')
    expect(img).toHaveClass('scale-110')
  })

  it('בלי bleed — התמונה בגודל האריח', () => {
    const { container } = render(<PluginImage src="/x.png" size="lg" />)
    expect(container.querySelector('img')).not.toHaveClass('scale-110')
  })
})
