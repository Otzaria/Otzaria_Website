// מזהים עם בקשה פתוחה: מסומנים בזמן הבקשה, ויורדים בסוף — גם כשהיא נכשלת.
import { describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBusyIds } from './useBusyIds'

describe('useBusyIds', () => {
  test('מסומנים בזמן הבקשה, ויורדים בסוף; מחזיר את התוצאה', async () => {
    const { result } = renderHook(() => useBusyIds())
    let release
    let pending
    act(() => {
      pending = result.current.track(['a', 'b'], () => new Promise((r) => { release = r }))
    })
    expect([...result.current.busy]).toEqual(['a', 'b'])
    let out
    await act(async () => {
      release(7)
      out = await pending
    })
    expect(out).toBe(7)
    expect(result.current.busy.size).toBe(0)
  })

  test('כשל — הסימון יורד והשגיאה עוברת הלאה', async () => {
    const { result } = renderHook(() => useBusyIds())
    let error
    await act(async () => {
      try {
        await result.current.track(['a'], async () => { throw new Error('x') })
      } catch (e) {
        error = e
      }
    })
    expect(error.message).toBe('x')
    expect(result.current.busy.size).toBe(0)
  })

  test('שתי בקשות על מזהים שונים — כל אחת מסירה רק את שלה', async () => {
    const { result } = renderHook(() => useBusyIds())
    let releaseA
    let a
    act(() => {
      a = result.current.track(['a'], () => new Promise((r) => { releaseA = r }))
      result.current.track(['b'], () => new Promise(() => {}))
    })
    await act(async () => {
      releaseA()
      await a
    })
    expect([...result.current.busy]).toEqual(['b'])
  })

  test('track יציב בין רינדורים', () => {
    const { result, rerender } = renderHook(() => useBusyIds())
    const first = result.current.track
    rerender()
    expect(result.current.track).toBe(first)
  })
})
