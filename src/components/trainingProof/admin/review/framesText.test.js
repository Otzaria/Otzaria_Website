import { describe, expect, it } from 'vitest'
import { approveBookLabel, approveConfirm, approveMarkedLabel } from './framesText'

describe('framesText — יחיד ורבים', () => {
  it('עמוד אחד — בלי "1 העמודים"', () => {
    expect(approveBookLabel(1)).toBe('אשר את העמוד')
    expect(approveMarkedLabel(1)).toBe('אשר את העמוד שסומן')
    expect(approveConfirm(1, 'ספר 3')).toEqual({ title: 'לאשר עמוד אחד בספר 3?', message: 'העמוד ייכנס לקובץ הבא שתורידו לתחנה, כמסגרות מאושרות.' })
  })
  it('כמה עמודים — עם המספר', () => {
    expect(approveBookLabel(12)).toBe('אשר את 12 העמודים')
    expect(approveMarkedLabel(3)).toBe('אשר את כל העמודים שסומנו (3)')
    expect(approveConfirm(4, 'ספר 3').title).toBe('לאשר 4 עמודים בספר 3?')
  })
})
