import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrollDelta, revealCard } from './calmScroll'

// גלילה רגועה: לא זזים כשהשורה כולה נראית; כשלא — היא עולה תמיד לאותו מקום מתחת לכותרת

const rect = (top, height = 200) => ({ top, bottom: top + height })

describe('scrollDelta', () => {
  it('השורה כולה נראית — לא זזים', () => {
    expect(scrollDelta(rect(300), 900, { top: 128 })).toBe(0)
    expect(scrollDelta(rect(128), 900, { top: 128 })).toBe(0)
    expect(scrollDelta(rect(684), 900, { top: 128, bottom: 16 })).toBe(0)
  })

  it('חלקה מתחת לתחתית — עולה למקום הקבוע, לא למרכז', () => {
    expect(scrollDelta(rect(700), 900, { top: 128 })).toBe(572)
    expect(scrollDelta(rect(1500), 900, { top: 128 })).toBe(1372)
  })

  it('מעל המקום הקבוע (↑, או מוסתרת בכותרת) — יורדת אליו', () => {
    expect(scrollDelta(rect(40), 900, { top: 128 })).toBe(-88)
    expect(scrollDelta(rect(-500), 900, { top: 128 })).toBe(-628)
  })

  it('כרטיס גבוה מהחלון — ראשו במקום הקבוע', () => {
    expect(scrollDelta(rect(200, 1000), 900, { top: 128 })).toBe(72)
  })
})

describe('revealCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  const card = (top) => {
    const el = document.createElement('article')
    el.style.scrollMarginTop = '128px'
    el.getBoundingClientRect = () => ({ top, bottom: top + 200, height: 200 })
    return el
  }
  const sticky = (height) => {
    const el = document.createElement('div')
    el.style.position = 'sticky'
    el.style.top = '0px'
    el.getBoundingClientRect = () => ({ height })
    return el
  }

  it('גלילה רכה, ובלי אנימציה למי שביקש פחות תנועה', () => {
    window.scrollBy = vi.fn()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    revealCard(card(800))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 672, behavior: 'smooth' })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    revealCard(card(800))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 672, behavior: 'auto' })
  })

  it('נראית — אין קריאה לגלילה בכלל', () => {
    window.scrollBy = vi.fn()
    revealCard(card(300))
    expect(window.scrollBy).not.toHaveBeenCalled()
  })

  it('כותרת דביקה גבוהה (טלפון) — המקום הקבוע מתחתיה', () => {
    window.scrollBy = vi.fn()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    revealCard(card(800), { stickies: [sticky(60), sticky(190), null] })
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 800 - 202, behavior: 'smooth' })
  })
})
