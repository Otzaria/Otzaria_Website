import { pageKey, readRecord, rememberOwner, writeRecord } from './store'

export const CACHE_PREFIX = 'otzaria-book-offline-v1-'
export function offlineSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window && Boolean(navigator.locks) && Boolean(crypto.randomUUID)
}
export async function preparePage(args) {
  if (!offlineSupported()) throw new Error('הדפדפן אינו תומך בעריכה אופליין. נסו דפדפן מעודכן בחיבור HTTPS.')
  const key = pageKey(args.user.id, args.bookPath, args.pageNumber)
  return navigator.locks.request(`prepare:${key}`, { ifAvailable: true }, async lock => {
    if (!lock || readRecord(key)) throw new Error('העמוד כבר הוכן או נמצא בהכנה בלשונית אחרת. רעננו כדי לפתוח את העותק הקיים.')
    return preparePageContents(args)
  })
}
async function preparePageContents({ user, bookPath, pageNumber, book, data }) {
  if (!offlineSupported()) throw new Error('הדפדפן אינו תומך בעריכה אופליין. נסו דפדפן מעודכן בחיבור HTTPS.')
  if (!data.contentVersion) throw new Error('יש לרענן את העמוד לפני הכנת עותק אופליין.')
  const registration = await navigator.serviceWorker.register('/library/books/offline-worker.js', {
    scope: '/library/books/', updateViaCache: 'none',
  })
  await Promise.race([
    new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting || registration.active
      if (worker?.state === 'activated') return resolve()
      const changed = () => {
        if (worker.state === 'activated') { worker.removeEventListener('statechange', changed); resolve() }
        if (worker.state === 'redundant') { worker.removeEventListener('statechange', changed); reject(new Error('התקנת מצב אופליין נכשלה')) }
      }
      worker.addEventListener('statechange', changed)
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('הכנת מצב אופליין ארכה זמן רב. נסו שוב.')), 20000)),
  ])
  const href = `/library/books/${encodeURIComponent(bookPath)}/${pageNumber}`
  const cacheName = CACHE_PREFIX + crypto.randomUUID()
  const cache = await caches.open(cacheName)
  try {
    const shell = await fetch(href, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000) })
    if (!shell.ok || new URL(shell.url).pathname !== href || !shell.headers.get('content-type')?.includes('text/html')) throw new Error('לא ניתן להכין את העמוד. בדקו את ההתחברות ונסו שוב.')
    const html = await shell.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const urls = new Set()
    const add = (raw, base = location.origin) => {
      const url = new URL(raw, base)
      if (url.origin === location.origin && (/^\/_next\/static\//.test(url.pathname) || /^\/fonts\//.test(url.pathname))) urls.add(url.href)
    }
    doc.querySelectorAll('script[src],link[rel="stylesheet"][href],link[as="font"][href]').forEach(el => add(el.src || el.href))
    // Include chunks/fonts already used by this editor, including lazy runtime dependencies.
    performance.getEntriesByType('resource').forEach(entry => add(entry.name))
    document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(el => add(el.src || el.href))
    const done = new Set()
    while (urls.size > done.size) {
      const batch = [...urls].filter(url => !done.has(url)).slice(0, 6)
      await Promise.all(batch.map(async url => {
        const res = await fetch(url, { cache: 'reload', signal: AbortSignal.timeout(20000) })
        if (!res.ok || res.redirected || res.headers.get('content-type')?.includes('text/html')) throw new Error('הורדת קובצי העורך נכשלה. נסו שוב.')
        if (url.split('?')[0].endsWith('.css')) {
          const css = await res.clone().text()
          for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
            if (!match[1].startsWith('data:')) add(match[1], url)
          }
        }
        await cache.put(url, res)
        done.add(url)
      }))
    }
    if (!data.thumbnail) throw new Error('צילום העמוד חסר; לא ניתן להכין עותק אופליין מלא.')
    const scanUrl = new URL(data.thumbnail, location.origin)
    if (scanUrl.origin !== location.origin) throw new Error('צילום העמוד אינו זמין לשמירה אופליין.')
    const scan = await fetch(scanUrl.href, { cache: 'reload', signal: AbortSignal.timeout(30000) })
    if (!scan.ok || !scan.headers.get('content-type')?.startsWith('image/')) throw new Error('הורדת צילום העמוד נכשלה.')
    await cache.put(scanUrl.href, scan)
    // Publish the navigation shell last; half-completed preparations never appear ready.
    await cache.put(href, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    const record = { version: 1, key: pageKey(user.id, bookPath, pageNumber),
      user: { id: String(user.id), name: user.name || 'משתמש' }, bookPath, pageNumber, book,
      data, baseVersion: data.contentVersion, cacheName, href, draft: null, problem: null,
    }
    rememberOwner(user.id)
    writeRecord(record)
    // Denial is normal: browsers may evict storage; explain this in the UI and offer export.
    void navigator.storage?.persist?.().catch(() => {})
    return record
  } catch (error) {
    await caches.delete(cacheName)
    throw error
  }
}

// A changed scan is staged in a new cache. Failure leaves the previous offline copy intact.
export async function refreshPreparedScan(record, server) {
  if (record.data.thumbnail === server.thumbnail && record.data.ocrReviewRevision === server.ocrReviewRevision) return record.cacheName
  const cacheName = CACHE_PREFIX + crypto.randomUUID()
  try {
    const old = await caches.open(record.cacheName)
    const next = await caches.open(cacheName)
    for (const request of await old.keys()) await next.put(request, await old.match(request))
    const url = new URL(server.thumbnail, location.origin)
    if (url.origin !== location.origin) throw new Error('צילום השרת אינו זמין לשמירה מקומית')
    // Unique query prevents a service-worker fallback from passing an old scan off as a fresh one.
    url.searchParams.set('offline-refresh', crypto.randomUUID())
    const response = await fetch(url, { cache: 'reload', signal: AbortSignal.timeout(30000) })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('לא ניתן לעדכן את צילום העמוד. נסו שוב בחיבור יציב.')
    await next.put(new URL(server.thumbnail, location.origin).href, response)
    return cacheName
  } catch (error) { await caches.delete(cacheName); throw error }
}
