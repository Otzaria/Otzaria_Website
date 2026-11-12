// @vitest-environment node
import { test, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function worker() {
  const handlers = {}
  const match = vi.fn()
  const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
  const cache = { match }
  const clients = { claim: vi.fn(), get: vi.fn().mockResolvedValue({ url: 'https://site.test/library/books/book/1' }) }
  const context = { URL, Response, fetch, caches: { keys: async () => ['unrelated', 'otzaria-book-offline-v1-test'], open: async () => cache },
    self: { location: { origin: 'https://site.test' }, clients, skipWaiting: vi.fn(), addEventListener: (type, handler) => { handlers[type] = handler } },
  }
  vm.runInNewContext(readFileSync(new URL('../../../public/library/books/offline-worker.js', import.meta.url), 'utf8'), context)
  const dispatch = (path, options = {}) => {
    let promise
    handlers.fetch({ request: { url: `https://site.test${path}`, method: 'GET', mode: 'navigate', ...options }, clientId: 'editor', respondWith: value => { promise = value } })
    return promise
  }
  return { dispatch, match, fetch, clients }
}
test('serves only prepared editor navigations offline, with an explicit offline marker', async () => {
  const w = worker()
  w.match.mockImplementation(async path => path === '/library/books/book/1' ? new Response('<html><head></head><body>shell</body></html>') : undefined)
  const response = await w.dispatch('/library/books/book/1')
  expect(await response.text()).toContain('window.__OTZARIA_OFFLINE_BOOK__=true')
  await expect(w.dispatch('/library/books/book/2')).rejects.toThrow('offline')
})
test.each(['/api/page-content', '/api/auth/session', '/library/books/book', '/library/dashboard', '/plugins', '/library/books'])('never intercepts or caches %s', path => {
  const w = worker()
  expect(w.dispatch(path)).toBeUndefined()
  expect(w.match).not.toHaveBeenCalled()
})
test('does not substitute a cached shell for HTTP denial, logout redirect, or Shabbat response', async () => {
  for (const status of [302, 401, 403, 503]) {
    const w = worker()
    w.fetch.mockResolvedValue(new Response('denied', { status }))
    expect((await w.dispatch('/library/books/book/1')).status).toBe(status)
    expect(w.match).not.toHaveBeenCalled()
  }
})
test('serves hashed application assets after deployment but no assets to unrelated client pages', async () => {
  const w = worker()
  w.match.mockImplementation(async request => new Response(typeof request === 'string' ? 'shell' : 'cached script'))
  expect(await (await w.dispatch('/_next/static/chunk.js', { mode: 'cors' })).text()).toBe('cached script')
  expect(w.fetch).not.toHaveBeenCalled()
  w.clients.get.mockResolvedValue({ url: 'https://site.test/library/books/book' })
  await expect(w.dispatch('/_next/static/chunk.js', { mode: 'cors' })).rejects.toThrow('offline')
})
