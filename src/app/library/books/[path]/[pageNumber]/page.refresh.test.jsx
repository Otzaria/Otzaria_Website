import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import EditPage from './page'
import { pageKey, readRecord, writeRecord } from '@/lib/offlineBooks/store'
import { EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs } from '@/hooks/editorPrefs'

const authState = vi.hoisted(() => ({ offline: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ path: 'book', pageNumber: '3' }) }))
vi.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => ({ status: 'authenticated', session: { offline: authState.offline, user: { id: 'u', role: 'user', name: 'משתמש' } } }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))
vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [500, 700], profile: null, status: 'idle' }) }))
vi.mock('@/hooks/useLocalWordBoxes', () => ({ useLocalWordBoxes: () => ({}), canStartLocalWordDetection: () => false }))
vi.mock('@/components/editor/modals/InfoDialog', () => ({ default: () => null }))
const key = pageKey('u', 'book', 3)
const cacheStores = new Map()
const cacheKey = request => new URL(typeof request === 'string' ? request : request.url, location.origin).href
const nextData = { id: 'p', content: 'טקסט חדש', thumbnail: '/uploads/new-scan.png', status: 'in-progress', claimedBy: 'u', twoColumns: false, rightColumn: '', leftColumn: '', rightColumnName: 'פנים', leftColumnName: 'פירוש', contentVersion: 'b'.repeat(64), ocrReviewRevision: 'new-scan', ocrWordReview: null }
beforeEach(() => {
  authState.offline = false
  localStorage.clear()
  cacheStores.clear()
  cacheStores.set('prepared-cache', new Map([
    [cacheKey('/uploads/old-scan.png'), new Response('old scan')],
    [cacheKey('/library/books/book/3'), new Response('<html>shell</html>')],
  ]))
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: 'code' }))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (name, options, callback) => callback ? callback({ name }) : options({ name })) } })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('caches', {
    open: vi.fn(async name => {
      if (!cacheStores.has(name)) cacheStores.set(name, new Map())
      const values = cacheStores.get(name)
      return { keys: async () => [...values.keys()], match: async url => values.get(cacheKey(url))?.clone(), put: async (url, response) => values.set(cacheKey(url), response.clone()) }
    }),
    delete: vi.fn(async name => cacheStores.delete(name)),
  })
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (String(url).startsWith('/api/book/book?')) return { ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, pages: [{ number: 3, status: 'in-progress', claimedById: 'u', claimedBy: 'משתמש', thumbnail: nextData.thumbnail }] }) }
    if (String(url).startsWith('/api/page-content?')) return { ok: true, json: async () => ({ success: true, data: nextData }) }
    if (String(url).includes('/uploads/new-scan.png')) return new Response('new scan', { headers: { 'content-type': 'image/png' } })
    throw new TypeError('unmocked endpoint')
  }))
  writeRecord({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 3, baseVersion: 'a'.repeat(64), cacheName: 'prepared-cache',
    book: { name: 'ספר', totalPages: 10 }, data: { ...nextData, content: 'טקסט ישן', thumbnail: '/uploads/old-scan.png', ocrReviewRevision: 'old-scan', claimedById: 'u' }, draft: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete navigator.locks; delete navigator.onLine })

test('online reload of a clean prepared page must update the cached scan before publishing its new thumbnail', async () => {
  render(<EditPage />)
  await waitFor(() => expect(readRecord(key).data.thumbnail).toBe('/uploads/new-scan.png'), { timeout: 5000 })
  await screen.findByDisplayValue('טקסט חדש', {}, { timeout: 5000 })
  expect(readRecord(key).baseVersion).toBe(nextData.contentVersion)
  const cached = await (await caches.open(readRecord(key).cacheName)).match(nextData.thumbnail)
  expect(await cached.text()).toBe('new scan')
  expect(cacheStores.has('prepared-cache')).toBe(false)
})

test('a clean local fallback refreshes once real authentication finishes loading', async () => {
  authState.offline = true
  const view = render(<EditPage />)
  await screen.findByDisplayValue('טקסט ישן')
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/page-content?'))).toBe(false)
  authState.offline = false
  view.rerender(<EditPage />)
  await screen.findByDisplayValue('טקסט חדש')
  expect(readRecord(key).baseVersion).toBe(nextData.contentVersion)
})

test('a blocked second tab never starts a refresh that could overwrite the owning editor', async () => {
  navigator.locks.request.mockImplementation(async (name, options, callback) => callback ? callback(null) : options({ name }))
  const previous = readRecord(key)
  render(<EditPage />)
  await screen.findByText(/עמוד זה פתוח לעריכה בלשונית אחרת/)
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/page-content?'))).toBe(false)
  expect(readRecord(key)).toEqual(previous)
  expect(caches.open).not.toHaveBeenCalled()
})

test('a delayed GET cannot revert a newer acknowledged local copy while the owning editor loads', async () => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/page-content?') ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/page-content?'))).toBe(true))
  // An already-running synchronization publishes its receipt while the GET is in flight.
  act(() => writeRecord({ ...readRecord(key), data: { ...nextData, content: 'עריכה חדשה שאושרה בשרת' }, baseVersion: 'c'.repeat(64), draft: null, inFlight: null }))
  await act(async () => resolveRead({ ok: true, json: async () => ({ success: true, data: { ...nextData, content: 'גרסה ישנה', contentVersion: 'a'.repeat(64) } }) }))
  await screen.findByDisplayValue('עריכה חדשה שאושרה בשרת')
  expect(readRecord(key).data.content).toBe('עריכה חדשה שאושרה בשרת')
  expect(readRecord(key).baseVersion).toBe('c'.repeat(64))
  expect(caches.open).not.toHaveBeenCalled()
})

test('unmount releases the edit lock and prevents a late GET from publishing to storage', async () => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/page-content?') ? pendingRead : normalFetch(url))
  const previous = readRecord(key)
  const view = render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/page-content?'))).toBe(true))
  view.unmount()
  await act(async () => resolveRead({ ok: true, json: async () => ({ success: true, data: nextData }) }))
  expect(readRecord(key)).toEqual(previous)
  expect(caches.open).not.toHaveBeenCalled()
})

test('a failed scan refresh leaves the old offline version intact instead of publishing incomplete metadata', async () => {
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).includes('/uploads/new-scan.png') ? Promise.reject(new TypeError('scan unavailable')) : normalFetch(url))
  const previous = readRecord(key)
  render(<EditPage />)
  await screen.findByText(/לא ניתן לעדכן את עותק האופליין/)
  expect(readRecord(key)).toEqual(previous)
  expect([...cacheStores.keys()]).toEqual(['prepared-cache'])
})
