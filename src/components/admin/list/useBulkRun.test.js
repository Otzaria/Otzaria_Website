// פעולה מרובה: מקביליות לפי פרמטר, התקדמות, "עצור", עצירה בכשל קטלני, ועצירה ביציאה מהמסך.
import { describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { runSummary, useBulkRun } from './useBulkRun'

/** worker שכל קריאה שלו ממתינה עד שמשחררים אותה ידנית */
function gated() {
  const calls = []
  const fn = (n) => new Promise((resolve, reject) => { calls.push({ n, resolve, reject }) })
  return { calls, fn }
}

describe('useBulkRun', () => {
  test('limit 1 — כל הפריטים, אחד אחרי השני; כישלון רגיל לא עוצר', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    const order = []
    let out
    await act(async () => {
      out = runSummary(await result.current.run([1, 2, 3], async (n) => {
        order.push(n)
        if (n === 2) throw new Error('x')
      }))
    })
    expect(order).toEqual([1, 2, 3])
    expect(out.ok).toEqual([1, 3])
    expect(out.failed).toEqual([2])
    expect(result.current.progress).toBeNull()
  })

  test('ברירת המחדל — 4 בקשות במקביל; limit לריצה גובר', async () => {
    const { result } = renderHook(() => useBulkRun())
    const four = gated()
    let pending
    act(() => { pending = result.current.run([1, 2, 3, 4, 5, 6], four.fn) })
    expect(four.calls.map((c) => c.n)).toEqual([1, 2, 3, 4])
    await act(async () => {
      while (four.calls.some((c) => !c.done)) {
        for (const c of four.calls) if (!c.done) { c.done = true; c.resolve() }
        await Promise.resolve()
      }
      await pending
    })
    const one = gated()
    act(() => { pending = result.current.run([1, 2, 3], one.fn, { limit: 1 }) })
    expect(one.calls).toHaveLength(1)
    await act(async () => {
      while (one.calls.some((c) => !c.done)) {
        for (const c of one.calls) if (!c.done) { c.done = true; c.resolve() }
        await Promise.resolve()
      }
      await pending
    })
  })

  test('progress — עם meta, done כולל כישלונות; showProgress=false — בלי progress', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    const g = gated()
    let pending
    act(() => { pending = result.current.run(['a', 'b'], g.fn, { meta: { action: 'hide' } }) })
    expect(result.current.progress).toEqual({ action: 'hide', done: 0, total: 2 })
    await act(async () => { g.calls[0].reject(new Error('x')) })
    expect(result.current.progress).toEqual({ action: 'hide', done: 1, total: 2 })
    await act(async () => {
      g.calls[1].resolve()
      await pending
    })
    expect(result.current.progress).toBeNull()

    act(() => { pending = result.current.run(['c'], g.fn, { showProgress: false }) })
    expect(result.current.progress).toBeNull()
    await act(async () => {
      g.calls[2].resolve()
      await pending
    })
  })

  test('אין הרשאה — עוצר מיד', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    let out
    await act(async () => {
      out = runSummary(await result.current.run([1, 2, 3], async (n) => {
        if (n === 1) throw Object.assign(new Error('x'), { status: 403 })
      }))
    })
    expect(out.failed).toEqual([1])
    expect(out.ok).toEqual([])
  })

  test('isFatal כפרמטר', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1, isFatal: (e) => e.message === 'stop' }))
    let out
    await act(async () => {
      out = await result.current.run([1, 2, 3], async (n) => {
        throw new Error(n === 2 ? 'stop' : 'x')
      })
    })
    expect(out.failed.map((f) => f.item)).toEqual([1, 2])
    expect(out.notAttempted).toEqual([3])
    expect(out.fatal.message).toBe('stop')
  })

  test('"עצור" — הבקשה שבאוויר מסתיימת, ואחריה לא נשלחות עוד', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    const order = []
    let out
    await act(async () => {
      out = runSummary(await result.current.run([1, 2, 3], async (n) => {
        order.push(n)
        if (n === 1) result.current.stop()
      }))
    })
    expect(order).toEqual([1])
    expect(out.stopped).toBe(true)
    expect(result.current.stopping).toBe(false)
  })

  test('stopRequested — אחרי "עצור", ומתאפס בריצה הבאה', async () => {
    const { result } = renderHook(() => useBulkRun())
    expect(result.current.stopRequested()).toBe(false)
    act(() => result.current.stop())
    expect(result.current.stopRequested()).toBe(true)
    expect(result.current.stopping).toBe(true)
    await act(async () => { await result.current.run([1], async () => {}) })
    expect(result.current.stopRequested()).toBe(false)
  })

  test('תקלה בשרת (500) — עוצר מיד; מה שלא נשלח חוזר ב-notAttempted', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    const order = []
    let out
    await act(async () => {
      out = runSummary(await result.current.run([1, 2, 3], async (n) => {
        order.push(n)
        throw Object.assign(new Error('x'), { status: 500 })
      }))
    })
    expect(order).toEqual([1])
    expect(out.notAttempted).toEqual([2, 3])
    expect(out.stopped).toBe(true)
    expect(out.lastError.status).toBe(500)
  })

  test.each([1, 4])('יציאה מהמסך באמצע (limit %i) — לא נשלחות עוד בקשות', async (limit) => {
    const { result, unmount } = renderHook(() => useBulkRun({ limit }))
    const g = gated()
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    let pending
    act(() => { pending = result.current.run(items, g.fn) })
    const started = g.calls.length
    expect(started).toBe(limit)
    unmount()
    for (const c of g.calls) c.resolve()
    const out = await pending
    expect(g.calls).toHaveLength(started)
    expect(out.notAttempted).toEqual(items.slice(started))
  })
  test('פריט בודד באמצע ריצה מרובה — לא מאפס את ה-progress ואת "עצור" שלה', async () => {
    const { result } = renderHook(() => useBulkRun({ limit: 1 }))
    const bulk = gated()
    const single = gated()
    let bulkPending
    let singlePending
    act(() => { bulkPending = result.current.run([1, 2, 3], bulk.fn, { meta: { action: 'hide' } }) })
    act(() => result.current.stop())
    act(() => { singlePending = result.current.run(['x'], single.fn, { showProgress: false }) })
    expect(single.calls).toHaveLength(1)
    await act(async () => {
      single.calls[0].resolve()
      await singlePending
    })
    expect(result.current.progress).toEqual({ action: 'hide', done: 0, total: 3 })
    expect(result.current.stopping).toBe(true)
    let out
    await act(async () => {
      bulk.calls[0].resolve()
      out = await bulkPending
    })
    expect(bulk.calls).toHaveLength(1)
    expect(out.notAttempted).toEqual([2, 3])
    expect(result.current.progress).toBeNull()
  })

  test.each([true, false])('run אחרי יציאה מהמסך (showProgress=%s) — לא שולח כלום', async (showProgress) => {
    const { result, unmount } = renderHook(() => useBulkRun())
    const run = result.current.run
    unmount()
    const calls = []
    const out = await run([1, 2], async (n) => { calls.push(n) }, { showProgress })
    expect(calls).toEqual([])
    expect(out.notAttempted).toEqual([1, 2])
    expect(result.current.stopRequested()).toBe(true)
  })
})
