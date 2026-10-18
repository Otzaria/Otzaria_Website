import { describe, it, expect } from 'vitest'
import { getAdjacentGuides, wikiTocItems } from './docsNav'

const NAV = [
  { slug: 'getting-started', title: 'התחלת העבודה' },
  { slug: 'library', title: 'הספרייה' },
  { slug: 'reading', title: 'קריאת ספר' }
]

describe('getAdjacentGuides', () => {
  it('דף באמצע — קודם ובא', () => {
    expect(getAdjacentGuides(NAV, 'library')).toEqual({ prev: NAV[0], next: NAV[2] })
  })

  it('הדף הראשון — בלי קודם', () => {
    expect(getAdjacentGuides(NAV, 'getting-started')).toEqual({ prev: null, next: NAV[1] })
  })

  it('הדף האחרון — בלי הבא', () => {
    expect(getAdjacentGuides(NAV, 'reading')).toEqual({ prev: NAV[1], next: null })
  })

  it('דף שאינו בסרגל — בלי שניהם', () => {
    expect(getAdjacentGuides(NAV, 'unknown')).toEqual({ prev: null, next: null })
  })

  it('ניווט ריק', () => {
    expect(getAdjacentGuides([], 'library')).toEqual({ prev: null, next: null })
  })
})

describe('wikiTocItems', () => {
  it('ממפה כותרות לעוגנים', () => {
    expect(wikiTocItems([{ text: 'במחשב', id: 'במחשב' }])).toEqual([{ href: '#במחשב', label: 'במחשב' }])
  })
})
