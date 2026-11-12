import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { preparePage, refreshPreparedScan } from './prepare'
import { pageKey, readRecord, writeRecord } from './store'
const key = pageKey('u', 'book', 1)
const record = () => ({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 1,
  book: { name: 'ספר' }, baseVersion: 'base', cacheName: 'previous-cache',
  data: { content: 'מקור', thumbnail: '/uploads/old.png', ocrReviewRevision: 'old' }, draft: { content: 'טיוטה חשובה' } })
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn() } })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_key, _options, callback) => callback({ name: _key })) } })
  vi.stubGlobal('caches', {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete navigator.serviceWorker; delete navigator.locks; delete window.isSecureContext })
test('a second preparation cannot race another tab into replacing its journal', async () => {
  navigator.locks.request.mockImplementation(async (_key, _options, callback) => callback(null))
  await expect(preparePage({ user: { id: 'u' }, bookPath: 'book', pageNumber: 1 })).rejects.toThrow('בלשונית אחרת')
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
})
test('preparation never replaces an already published draft', async () => {
  writeRecord(record())
  await expect(preparePage({ user: { id: 'u' }, bookPath: 'book', pageNumber: 1 })).rejects.toThrow()
  expect(readRecord(key).draft.content).toBe('טיוטה חשובה')
  expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
})
test('a failed replacement scan discards only its staging cache and retains the original copy', async () => {
  const previous = record()
  writeRecord(previous)
  const old = { keys: async () => ['/shell'], match: async () => new Response('shell') }
  const next = { put: vi.fn() }
  const remove = vi.fn()
  vi.stubGlobal('caches', { open: async name => name === previous.cacheName ? old : next, delete: remove })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network lost')))
  await expect(refreshPreparedScan(previous, { thumbnail: '/uploads/new.png', ocrReviewRevision: 'new' })).rejects.toThrow('network lost')
  expect(remove).toHaveBeenCalledTimes(1)
  expect(remove.mock.calls[0][0]).not.toBe(previous.cacheName)
  expect(readRecord(key)).toEqual(previous)
})
