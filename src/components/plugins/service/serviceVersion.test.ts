import { describe, it, expect } from 'vitest'
import { compareVersions, formatRange, isValidRange, parseVersion, versionInRange } from './serviceVersion'

describe('serviceVersion', () => {
  it('parseVersion — X.Y.Z בלבד, בלי אפסים מובילים', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('0.0.0')).toEqual([0, 0, 0])
    expect(parseVersion('01.2.3')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('1.2.3-beta')).toBeNull()
    expect(parseVersion('1.2.9999999')).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
  })

  it('compareVersions — מספרית, לא מילונית', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('x', '1.0.0')).toBeNull()
  })

  it('טווח: מינימום ≤ מקסימום, max null = ללא תקרה', () => {
    expect(isValidRange({ min: '1.0.0', max: null })).toBe(true)
    expect(isValidRange({ min: '2.0.0', max: '1.0.0' })).toBe(false)
    expect(versionInRange('1.5.0', { min: '1.0.0', max: '1.9.99' })).toBe(true)
    expect(versionInRange('2.0.0', { min: '1.0.0', max: '1.9.99' })).toBe(false)
    expect(versionInRange('0.9.0', { min: '1.0.0', max: null })).toBe(false)
    expect(versionInRange('99.0.0', { min: '1.0.0', max: null })).toBe(true)
    expect(versionInRange('bad', { min: '1.0.0', max: null })).toBe(false)
  })

  it('formatRange', () => {
    expect(formatRange({ min: '1.0.0', max: '1.9.99' })).toBe('1.0.0–1.9.99')
    expect(formatRange({ min: '1.0.0', max: null })).toBe('1.0.0 ומעלה')
  })
})
