import { describe, it, expect } from 'vitest'
import { planBookOpening, readSaveData } from './goldenBookPlan'

describe('planBookOpening', () => {
  it('ברירת מחדל — מנגנים את הפתיחה', () => {
    expect(planBookOpening()).toBe('animate')
    expect(planBookOpening({ reducedMotion: false, saveData: false })).toBe('animate')
  })

  it('reduced-motion או saveData — ספר פתוח סטטי, בלי להוריד את הרצועה', () => {
    expect(planBookOpening({ reducedMotion: true })).toBe('static')
    expect(planBookOpening({ saveData: true })).toBe('static')
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
