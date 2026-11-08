import { describe, it, expect } from 'vitest'
import { toDateInput } from './modalFormUtils'

describe('toDateInput', () => {
  it('מחזיר מחרוזת ריקה לערך חסר', () => {
    expect(toDateInput(null)).toBe('')
    expect(toDateInput(undefined)).toBe('')
    expect(toDateInput('')).toBe('')
  })

  it('מחזיר מחרוזת ריקה לתאריך לא תקין', () => {
    expect(toDateInput('not-a-date')).toBe('')
  })

  it('ממיר תאריך תקין לפורמט yyyy-mm-dd', () => {
    expect(toDateInput('2025-03-15T10:00:00.000Z')).toBe('2025-03-15')
  })

  it('מקבל גם אובייקט Date', () => {
    expect(toDateInput(new Date('2024-01-01T00:00:00.000Z'))).toBe('2024-01-01')
  })
})
