// בחירה תלויה-סינון: איפוס כשהמפתח משתנה (עם "הבחירה בוטלה" רק כשהיה משהו), נעילה בזמן פעולה, keep אחרי פעולה מרובה.
import { describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useKeyedSelection } from './useKeyedSelection'

const setup = (initial = { key: 'a', locked: false, announceReset: true }) =>
  renderHook(({ key, ...options }) => useKeyedSelection(key, options), { initialProps: initial })

describe('useKeyedSelection', () => {
  test('בחירה והסרה', () => {
    const { result } = setup()
    act(() => result.current.select(['1', '2'], true))
    act(() => result.current.select(['1'], false))
    expect([...result.current.ids]).toEqual(['2'])
    expect(result.current.clearedText).toBe('')
  })

  test('מפתח חדש — הבחירה מתאפסת ומוכרזת', () => {
    const { result, rerender } = setup()
    act(() => result.current.select(['1'], true))
    rerender({ key: 'b' })
    expect(result.current.ids.size).toBe(0)
    expect(result.current.clearedText).toBe('הבחירה בוטלה')
  })

  test('מפתח חדש בלי בחירה — אין הכרזה', () => {
    const { result, rerender } = setup()
    rerender({ key: 'b' })
    expect(result.current.clearedText).toBe('')
  })

  test('announceReset=false — מתאפסת בלי הכרזה', () => {
    const { result, rerender } = setup({ key: 'a', announceReset: false })
    act(() => result.current.select(['1'], true))
    rerender({ key: 'b', announceReset: false })
    expect(result.current.ids.size).toBe(0)
    expect(result.current.clearedText).toBe('')
  })

  test('בחירה חדשה מנקה את ההכרזה; clear מכריז', () => {
    const { result } = setup()
    act(() => result.current.select(['1'], true))
    act(() => result.current.clear())
    expect(result.current.ids.size).toBe(0)
    expect(result.current.clearedText).toBe('הבחירה בוטלה')
    act(() => result.current.select(['2'], true))
    expect(result.current.clearedText).toBe('')
  })

  test('נעולה (פעולה מרובה רצה) — בחירה וניקוי לא עושים כלום; keep כן', () => {
    const { result, rerender } = setup()
    act(() => result.current.select(['1', '2'], true))
    rerender({ key: 'a', locked: true })
    act(() => result.current.select(['3'], true))
    act(() => result.current.clear())
    expect([...result.current.ids]).toEqual(['1', '2'])
    act(() => result.current.keep(['2']))
    expect([...result.current.ids]).toEqual(['2'])
    expect(result.current.clearedText).toBe('')
  })
})
