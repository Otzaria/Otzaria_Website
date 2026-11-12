import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { refreshPreparedPage } from './prepare'
import { pageKey, readRecord, writeRecord } from './store'

const key = pageKey('u', 'book', 1)
const baseline = () => ({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 1,
  book: { name: 'ספר' }, baseVersion: 'v1', cacheName: 'previous-cache', href: '/library/books/book/1',
  data: { content: 'מקור', contentVersion: 'v1', thumbnail: '/uploads/old.png', ocrReviewRevision: 'old' }, draft: null })
const server = () => ({ content: 'חדש מהשרת', contentVersion: 'v2', thumbnail: '/uploads/new.png', ocrReviewRevision: 'new' })
const image = () => new Response('new scan', { headers: { 'content-type': 'image/png' } })
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
let stores
let held
const ownsEditLock = () => held
const refresh = (previous = baseline(), data = server()) => refreshPreparedPage(previous, data, { ownsEditLock })
const absolute = request => new URL(typeof request === 'string' ? request : request.url, location.origin).href

beforeEach(() => {
  held = true
  localStorage.clear()
  stores = new Map([['previous-cache', new Map([
    [absolute('/library/books/book/1'), new Response('<html>shell</html>')],
    [absolute('/uploads/old.png'), new Response('old scan')],
  ])]])
  vi.stubGlobal('caches', {
    open: vi.fn(async name => {
      if (!stores.has(name)) stores.set(name, new Map())
      const values = stores.get(name)
      return {
        keys: async () => [...values.keys()],
        match: async request => values.get(absolute(request))?.clone(),
        put: async (request, response) => { values.set(absolute(request), response.clone()) },
      }
    }),
    delete: vi.fn(async name => stores.delete(name)),
  })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, callback) => callback({ name: _name })) } })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => image()))
  writeRecord(baseline())
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete navigator.locks })

test.each(['/uploads/new.png', '/uploads/old.png'])('publishes the matching scan and text together when the server image is %s', async thumbnail => {
  const next = await refresh(baseline(), { ...server(), thumbnail })
  expect(readRecord(key)).toEqual(next)
  expect(next).toMatchObject({ baseVersion: 'v2', data: { thumbnail, content: 'חדש מהשרת', ocrReviewRevision: 'new' } })
  expect(next.cacheName).not.toBe('previous-cache')
  const cache = await caches.open(next.cacheName)
  expect(await (await cache.match(thumbnail)).text()).toBe('new scan')
  expect(await (await cache.match(next.href)).text()).toBe('<html>shell</html>')
  expect(stores.has('previous-cache')).toBe(false)
  expect(new URL(fetch.mock.calls[0][0]).searchParams.has('offline-refresh')).toBe(true)
})

test('text-only refresh reuses the prepared scan without copying or downloading assets', async () => {
  const next = await refresh(baseline(), { ...baseline().data, content: 'טקסט מעודכן', contentVersion: 'v2' })
  expect(next.cacheName).toBe('previous-cache')
  expect(next.data.content).toBe('טקסט מעודכן')
  expect(fetch).not.toHaveBeenCalled()
  expect(caches.open).not.toHaveBeenCalled()
})

test('a blocked tab cannot publish a response, even when the journal is clean', async () => {
  held = false
  expect(await refresh()).toEqual(baseline())
  expect(navigator.locks.request).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(readRecord(key)).toEqual(baseline())
})

test('an old GET cannot roll back a newer receipt already stored by another sync', async () => {
  const latest = { ...baseline(), baseVersion: 'v3', data: { ...baseline().data, content: 'סונכרן מאז', contentVersion: 'v3' } }
  writeRecord(latest)
  expect(await refresh()).toEqual(latest)
  expect(readRecord(key)).toEqual(latest)
  expect(fetch).not.toHaveBeenCalled()
})

test.each(['draft', 'inFlight'])('refresh never rebases a pending %s, even without another journal change', async field => {
  const previous = { ...baseline(), [field]: { content: 'טרם אושר' } }
  writeRecord(previous)
  expect(await refresh(previous)).toEqual(previous)
  expect(readRecord(key)).toEqual(previous)
  expect(fetch).not.toHaveBeenCalled()
})

test.each(['draft', 'receipt', 'lock', 'removed'])('a %s change during scan download discards staging and preserves the current journal', async change => {
  const requested = deferred()
  const response = deferred()
  fetch.mockImplementationOnce(() => { requested.resolve(); return response.promise })
  const pending = refresh()
  await requested.promise
  if (change === 'draft') writeRecord({ ...baseline(), draft: { content: 'עריכה בזמן ההורדה' } })
  if (change === 'receipt') writeRecord({ ...baseline(), baseVersion: 'v3', data: { ...baseline().data, content: 'סונכרן מאז' } })
  if (change === 'lock') held = false
  if (change === 'removed') localStorage.removeItem(key)
  const current = readRecord(key)
  response.resolve(image())
  expect(await pending).toEqual(current)
  expect(readRecord(key)).toEqual(current)
  expect([...stores.keys()]).toEqual(['previous-cache'])
})

test('refresh checks the journal after acquiring the sync lock, not before a queued receipt', async () => {
  const acquired = deferred()
  navigator.locks.request.mockImplementationOnce(async (_name, callback) => { await acquired.promise; return callback() })
  const pending = refresh()
  const latest = { ...baseline(), baseVersion: 'receipt', data: { ...baseline().data, content: 'שמירה אושרה' } }
  writeRecord(latest)
  acquired.resolve()
  expect(await pending).toEqual(latest)
  expect(fetch).not.toHaveBeenCalled()
})

test('a failed scan download leaves the old complete offline copy ready', async () => {
  fetch.mockRejectedValueOnce(new TypeError('connection lost'))
  await expect(refresh()).rejects.toThrow('connection lost')
  expect(readRecord(key)).toEqual(baseline())
  expect([...stores.keys()]).toEqual(['previous-cache'])
  expect(await (await (await caches.open('previous-cache')).match('/uploads/old.png')).text()).toBe('old scan')
})

test('quota failure during publication retains the old journal and removes only the unused scan cache', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  await expect(refresh()).rejects.toThrow('quota')
  expect(readRecord(key)).toEqual(baseline())
  expect([...stores.keys()]).toEqual(['previous-cache'])
})

test('failure to delete the old cache cannot undo a successful publication', async () => {
  caches.delete.mockRejectedValueOnce(new Error('cleanup failed'))
  const next = await refresh()
  expect(readRecord(key)).toEqual(next)
  expect(next.baseVersion).toBe('v2')
  expect(stores.has(next.cacheName)).toBe(true)
})
