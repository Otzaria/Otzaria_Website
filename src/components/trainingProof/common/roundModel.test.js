import { describe, it, expect } from 'vitest'
import { progress, applySaved, countBy, nextIndex, isTypingTarget } from './roundModel'

const items = [
  { id: 'a', status: 'held', result: null },
  { id: 'b', status: 'submitted', result: { action: 'ok' } },
  { id: 'c', status: 'held', result: null },
]

describe('roundModel', () => {
  it('התקדמות: גם "דלג" נחשב', () => {
    expect(progress(items)).toEqual({ done: 1, total: 3 })
    const after = applySaved(items, 'a', { skipped: true })
    expect(after[0]).toMatchObject({ skipped: true, result: { action: 'skip' } })
    expect(progress(after)).toEqual({ done: 2, total: 3 })
  })

  it('שמירה מחליפה את הפריט במה שחזר מהשרת', () => {
    const after = applySaved(items, 'c', { item: { id: 'c', status: 'submitted', result: { action: 'bad' } } })
    expect(after[2].result.action).toBe('bad')
    expect(after[0]).toBe(items[0])
  })

  it('ספירה לפי פעולה, והשורה הבאה שלא טופלה', () => {
    const after = applySaved(items, 'a', { skipped: true })
    expect(countBy(after, (it) => it.result?.action)).toEqual({ skip: 1, ok: 1 })
    expect(nextIndex(items, 0)).toBe(2)
    expect(nextIndex(items, 2)).toBe(2)
  })

  it('שדה הקלדה — המקשים לא נתפסים', () => {
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
