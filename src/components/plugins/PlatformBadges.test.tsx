import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlatformBadges from './PlatformBadges'

describe('PlatformBadges', () => {
  it('מציג תגית לכל פלטפורמה נתמכת, בסדר הקנוני', () => {
    render(<PlatformBadges platforms={['macos', 'windows']} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['desktop_windowsWindows', 'laptop_macmacOS'])
    expect(screen.getByRole('list').getAttribute('aria-label')).toBe('פלטפורמות נתמכות: Windows, macOS')
  })

  it('אינו מציג דבר לתוסף שלא הגביל את עצמו (ברירת המחדל בכרטיס)', () => {
    const { container } = render(<PlatformBadges platforms={[]} />)
    expect(container.innerHTML).toBe('')
    const full = render(<PlatformBadges platforms={['windows', 'linux', 'macos', 'android', 'ios']} />)
    expect(full.container.innerHTML).toBe('')
  })

  it('מציג "כל הפלטפורמות" בדף התוסף כשאין הגבלה', () => {
    render(<PlatformBadges platforms={undefined} showAllLabel />)
    expect(screen.getByText('כל הפלטפורמות')).toBeTruthy()
  })

  it('מתעלם מערכים לא מוכרים', () => {
    render(<PlatformBadges platforms={['android', 'web']} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
