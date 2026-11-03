import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'

const ok = () => ({ ok: true, status: 200, json: async () => ({ success: true }) })
const failed = () => ({ ok: false, status: 500, json: async () => ({ error: 'נכשל' }) })
const snapshot = (content) => ({ bookPath: 'book', pageNumber: 1, content })
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const body = (fetchMock, index = -1) => JSON.parse(fetchMock.mock.calls.at(index)[1].body)

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test.each(['immediate', 'debounced'])('pagehide שולח את הגרסה האחרונה בתור (%s)', async (mode) => {
  const first = deferred()
  const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = renderHook(() => useAutoSave())
  await act(async () => {
    void result.current.saveNow(snapshot('ישן'))
    if (mode === 'immediate') void result.current.saveNow(snapshot('חדש'))
    else {
      result.current.save(snapshot('חדש'))
      await vi.advanceTimersByTimeAsync(2000)
    }
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(body(fetchMock).content).toBe('חדש')
  const newerRevision = body(fetchMock).saveRevision
  expect(newerRevision).toBeGreaterThan(JSON.parse(fetchMock.mock.calls[0][1].body).saveRevision)
  expect(fetchMock.mock.calls.at(-1)[1].keepalive).toBe(true)
  await act(async () => { first.resolve(ok()); await result.current.flush() })
  unmount()
})

test('retry שומר את אותו revision ואינו הופך שינוי ישן לחדש', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(failed()).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAutoSave())

  await act(async () => { expect(await result.current.saveNow(snapshot('תוכן'))).toBe(false) })
  const firstRevision = body(fetchMock).saveRevision
  await act(async () => { expect(await result.current.flush()).toBe(true) })

  expect(body(fetchMock).saveRevision).toBe(firstRevision)
})

test('flush מחכה לשמירה החדשה בלי להכניס כישלון ישן אחריה לתור', async () => {
  const newer = deferred()
  const fetchMock = vi.fn().mockResolvedValueOnce(failed()).mockImplementationOnce(() => newer.promise).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = renderHook(() => useAutoSave())
  await act(async () => { expect(await result.current.saveNow(snapshot('ישן'))).toBe(false) })
  await act(async () => { void result.current.saveNow(snapshot('חדש')) })
  await act(async () => {
    const flushed = result.current.flush()
    newer.resolve(ok())
    expect(await flushed).toBe(true)
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(body(fetchMock).content).toBe('חדש')
  expect(result.current.status).toBe('saved')
  unmount()
})

test('flush חוזר מחכה גם לשמירה שנמצאת בתור ועדיין לא התחילה', async () => {
  const older = deferred()
  const newer = deferred()
  const fetchMock = vi.fn().mockResolvedValueOnce(failed())
    .mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise)
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAutoSave())
  await act(async () => { await result.current.saveNow(snapshot('נכשל קודם')) })
  let flushed
  await act(async () => {
    void result.current.saveNow(snapshot('אמצע'))
    void result.current.saveNow(snapshot('אחרון'))
    flushed = result.current.flush()
    older.resolve(ok())
  })
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(result.current.status).toBe('saving')
  await act(async () => { newer.resolve(ok()); expect(await flushed).toBe(true) })
  expect(body(fetchMock).content).toBe('אחרון')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('הצלחה ישנה לא מאשרת גרסה חדשה שעדיין ממתינה ל-debounce', async () => {
  const first = deferred()
  const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAutoSave())
  await act(async () => { void result.current.saveNow(snapshot('ישן')) })
  act(() => result.current.save(snapshot('חדש')))
  await act(async () => { first.resolve(ok()) })
  expect(result.current.status).toBe('unsaved')
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(body(fetchMock).content).toBe('חדש')
})

test('beforeunload בודק את גודל הגרסה החדשה שבתור; הצלחה מנקה את המצב', async () => {
  const first = deferred()
  const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAutoSave())
  let last
  await act(async () => {
    void result.current.saveNow(snapshot('קצר'))
    last = result.current.saveNow(snapshot('א'.repeat(40000)))
  })
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await act(async () => { first.resolve(ok()); await last })
  const count = fetchMock.mock.calls.length
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(fetchMock).toHaveBeenCalledTimes(count)
})

test('כישלון ישן לא מחליף את הגרסה האחרונה, ו-flush מנסה שוב רק אותה', async () => {
  const first = deferred()
  const fetchMock = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(failed()).mockResolvedValue(ok())
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useAutoSave())
  let last
  await act(async () => {
    void result.current.saveNow(snapshot('ישן'))
    last = result.current.saveNow(snapshot('חדש'))
    first.resolve(failed())
    expect(await last).toBe(false)
  })
  expect(result.current.status).toBe('error')
  await act(async () => { expect(await result.current.flush()).toBe(true) })
  expect(body(fetchMock).content).toBe('חדש')
  expect(result.current.status).toBe('saved')
})
