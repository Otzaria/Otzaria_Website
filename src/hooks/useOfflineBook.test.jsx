import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOfflineBook } from './useOfflineBook'
import { pageKey, readRecord, writeRecord } from '@/lib/offlineBooks/store'

const key = pageKey('u', 'book', 1)
const snapshot = { bookPath: 'book', pageNumber: 1, content: 'עריכה חדשה', leftColumn: '', rightColumn: '', leftColumnName: 'שמאל', rightColumnName: 'ימין', twoColumns: false }
const success = () => ({ ok: true, status: 200, json: async () => ({ success: true, contentVersion: 'b'.repeat(64) }) })
const failure = status => ({ ok: false, status, json: async () => ({ error: 'השמירה נעצרה', ...(status === 409 ? { code: 'OFFLINE_CONFLICT' } : {}) }) })
let unmount

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (name, options, callback) => callback ? callback({ name }) : options({ name })) } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(503)))
  writeRecord({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 1,
    baseVersion: 'a'.repeat(64), book: { name: 'ספר' }, data: { content: 'מקור' }, draft: null })
})
afterEach(() => {
  unmount?.(); unmount = null
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear()
  delete navigator.locks; delete navigator.onLine
})

async function openCleanPage() {
  const view = renderHook(() => useOfflineBook({ userId: 'u', bookPath: 'book', pageNumber: 1 }))
  unmount = view.unmount
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(view.result.current.lock).toBe('owned')
  expect(fetch).not.toHaveBeenCalled()
  return view.result
}
const advance = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

test.each(['503', 'network'])('a new edit retries a transient %s failure after a clean mount, preserving its receipt', async failureKind => {
  const hook = await openCleanPage()
  if (failureKind === 'network') fetch.mockRejectedValueOnce(new TypeError('network unavailable'))
  act(() => hook.current.save(snapshot))
  await advance(2000)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(readRecord(key).draft.content).toBe(snapshot.content)
  fetch.mockResolvedValue(success())
  await advance(4999)
  expect(fetch).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body)
  expect(readRecord(key)).toMatchObject({ draft: null, inFlight: null, data: { content: snapshot.content } })
  await advance(300000)
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('repeated failures back off, and unmount cancels the next attempt', async () => {
  const hook = await openCleanPage()
  act(() => hook.current.save(snapshot))
  await advance(2000)
  await advance(5000)
  expect(fetch).toHaveBeenCalledTimes(2)
  await advance(9999)
  expect(fetch).toHaveBeenCalledTimes(2)
  await advance(1)
  expect(fetch).toHaveBeenCalledTimes(3)
  unmount(); unmount = null
  await advance(300000)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(readRecord(key).draft.content).toBe(snapshot.content)
})

test.each([401, 403, 409])('HTTP %s stops automatic retries and retains the local draft', async status => {
  const hook = await openCleanPage()
  fetch.mockResolvedValue(failure(status))
  act(() => hook.current.save(snapshot))
  await advance(302000)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(readRecord(key).draft.content).toBe(snapshot.content)
})

test('going offline suspends retries; reconnecting resumes the saved draft', async () => {
  const hook = await openCleanPage()
  act(() => hook.current.save(snapshot))
  await advance(2000)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  await advance(300000)
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockResolvedValue(success())
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(readRecord(key).draft).toBeNull()
})
