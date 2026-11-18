import { afterEach, describe, it, expect, vi } from 'vitest'
import { chooseSpriteSrc, OPEN_WAIT_MS, openingDeadline, planBookOpening, readSaveData, resetSpriteSrcCache, SPRITE_PRELOAD_MEDIA } from './goldenBookPlan'
import { SPRITE_AVIF_SRC, SPRITE_WEBP_SRC } from './goldenBookAssets'

describe('planBookOpening', () => {
  it('ברירת מחדל — מנגנים את הפתיחה', () => {
    expect(planBookOpening()).toBe('animate')
    expect(planBookOpening({ reducedMotion: false, saveData: false, hydrated: true })).toBe('animate')
  })

  it('reduced-motion או saveData — ספר פתוח סטטי', () => {
    expect(planBookOpening({ reducedMotion: true })).toBe('static')
    expect(planBookOpening({ saveData: true })).toBe('static')
  })

  it('רינדור צד-לקוח (ניווט אל דף הבית, לא hydration) — ספר פתוח סטטי', () => {
    expect(planBookOpening({ hydrated: false })).toBe('static')
  })
})

describe('openingDeadline', () => {
  it('נמדד מרגע ה-hydration, לא מתחילת הניווט', () => {
    expect(openingDeadline(0)).toBe(OPEN_WAIT_MS)
    // hydration מאוחר (Fast 4G, שרת dev) — עדיין יש חלון מלא לרצועה
    expect(openingDeadline(8000)).toBe(8000 + OPEN_WAIT_MS)
    expect(openingDeadline(500, 200)).toBe(700)
  })

  it('החלון קצר מספיק כדי שברשת איטית הספר הסגור לא יישאר זמן מביך', () => {
    expect(OPEN_WAIT_MS).toBeGreaterThan(0)
    expect(OPEN_WAIT_MS).toBeLessThanOrEqual(1500)
  })
})

describe('SPRITE_PRELOAD_MEDIA', () => {
  it('ההפך המדויק משאילתת reduced-motion — לא מוריד את הרצועה למי שביקש פחות תנועה', () => {
    expect(SPRITE_PRELOAD_MEDIA).toBe('(prefers-reduced-motion: no-preference)')
  })
})

describe('readSaveData', () => {
  it('true רק כש-connection.saveData הוא true', () => {
    expect(readSaveData({ connection: { saveData: true } })).toBe(true)
    expect(readSaveData({ connection: { saveData: false } })).toBe(false)
    expect(readSaveData({})).toBe(false)
    expect(readSaveData(undefined)).toBe(false)
  })
})

describe('chooseSpriteSrc', () => {
  afterEach(() => {
    resetSpriteSrcCache()
    vi.unstubAllGlobals()
  })

  const stubImage = (decodes: boolean) => {
    vi.stubGlobal('Image', class { src = ''; decode() { return decodes ? Promise.resolve() : Promise.reject(new Error('x')) } })
  }

  it('דפדפן שמפענח AVIF — רצועת ה-AVIF', async () => {
    stubImage(true)
    expect(await chooseSpriteSrc()).toBe(SPRITE_AVIF_SRC)
  })

  it('דפדפן שלא מפענח AVIF — גיבוי WebP', async () => {
    stubImage(false)
    expect(await chooseSpriteSrc()).toBe(SPRITE_WEBP_SRC)
  })

  it('התוצאה נשמרת — בדיקה אחת בלבד', async () => {
    stubImage(true)
    const first = chooseSpriteSrc()
    expect(chooseSpriteSrc()).toBe(first)
  })
})
