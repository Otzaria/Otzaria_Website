/* global self, caches */
// Scope is /library/books/. Only explicitly prepared editor URLs have a fallback.
// No API responses, authentication, book listings, or other website pages are cached.
const PREFIX = 'otzaria-book-offline-v1-'
const editorPath = path => /^\/library\/books\/[^/]+\/[1-9]\d*\/?$/.test(path)
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
async function preparedCache(path) {
  for (const name of (await caches.keys()).reverse()) {
    if (!name.startsWith(PREFIX)) continue
    const cache = await caches.open(name)
    if (await cache.match(path)) return cache
  }
  return null
}
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate' && editorPath(url.pathname)) {
    event.respondWith((async () => {
      try { return await fetch(request) } catch (error) {
        const cache = await preparedCache(url.pathname)
        const shell = cache && await cache.match(url.pathname)
        if (!shell) throw error
        // This marker means the HTML came from local storage, even when navigator.onLine lies.
        const html = (await shell.text()).replace('<head>', '<head><script>window.__OTZARIA_OFFLINE_BOOK__=true</script>')
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
    })())
    return
  }
  if (!/^\/(?:_next\/static\/|fonts\/|uploads\/)/.test(url.pathname)) return
  event.respondWith((async () => {
    const client = event.clientId && await self.clients.get(event.clientId)
    const path = client && new URL(client.url).pathname
    const cache = path && editorPath(path) && await preparedCache(path)
    // Content-hashed assets remain usable after a deployment removes old chunks.
    const cached = cache && await cache.match(request)
    if (cached && url.pathname.startsWith('/_next/static/')) return cached
    try { return await fetch(request) } catch (error) {
      if (cached) return cached
      throw error
    }
  })())
})
