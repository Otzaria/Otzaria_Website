import { describe, expect, test } from 'vitest'
import {
  byteLength,
  chooseLeaveRoute,
  likelyTooLargeToSendOnLeave,
  KEEPALIVE_MAX_BYTES,
  BEACON_MAX_BYTES
} from './leaveSendRoute'

describe('leaveSendRoute', () => {
  test('byteLength סופר בתים ב-UTF-8 (עברית = 2 בתים לתו)', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('שלום')).toBe(8)
    expect(byteLength('')).toBe(0)
  })

  test('עד הסף — keepalive, מעליו — sendBeacon', () => {
    expect(chooseLeaveRoute(0)).toBe('keepalive')
    expect(chooseLeaveRoute(KEEPALIVE_MAX_BYTES)).toBe('keepalive')
    expect(chooseLeaveRoute(KEEPALIVE_MAX_BYTES + 1)).toBe('beacon')
  })

  test('גוף שנראה קצר באורך מחרוזת אבל עובר את הסף בבתים הולך ל-sendBeacon', () => {
    const hebrew = 'א'.repeat(40000) // 40000 תווים, 80000 בתים
    expect(hebrew.length).toBeLessThan(KEEPALIVE_MAX_BYTES)
    expect(chooseLeaveRoute(byteLength(hebrew))).toBe('beacon')
  })

  test('likelyTooLargeToSendOnLeave רק מעל מגבלת sendBeacon', () => {
    expect(likelyTooLargeToSendOnLeave(BEACON_MAX_BYTES)).toBe(false)
    expect(likelyTooLargeToSendOnLeave(BEACON_MAX_BYTES + 1)).toBe(true)
  })
})
