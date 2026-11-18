import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EditPage from './page'
import { pageKey, readRecord, writeRecord } from '@/lib/offlineBooks/store'
import { EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs } from '@/hooks/editorPrefs'
import { queryEditorField } from '@/lib/editor/editorField'

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
const nextData = { id: 'p', claimedById: 'u', content: 'טקסט חדש', thumbnail: '/uploads/new-scan.png', status: 'in-progress', claimedBy: 'u', twoColumns: false, rightColumn: '', leftColumn: '', rightColumnName: 'פנים', leftColumnName: 'פירוש', contentVersion: 'b'.repeat(64), ocrReviewRevision: 'new-scan', ocrWordReview: null }
beforeEach(() => {
  authState.offline = false
  history.replaceState(null, '', '/')
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
    if (String(url).startsWith('/api/book/book/editor?')) return { ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, data: nextData }) }
    if (String(url).includes('/uploads/new-scan.png')) return new Response('new scan', { headers: { 'content-type': 'image/png' } })
    throw new TypeError('unmocked endpoint')
  }))
  writeRecord({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 3, baseVersion: 'a'.repeat(64), cacheName: 'prepared-cache',
    book: { name: 'ספר', totalPages: 10 }, data: { ...nextData, content: 'טקסט ישן', thumbnail: '/uploads/old-scan.png', ocrReviewRevision: 'old-scan', claimedById: 'u' }, draft: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); history.replaceState(null, '', '/'); delete navigator.locks; delete navigator.onLine })

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
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(false)
  authState.offline = false
  view.rerender(<EditPage />)
  await screen.findByDisplayValue('טקסט חדש')
  expect(readRecord(key).baseVersion).toBe(nextData.contentVersion)
})

test.each(['clean', 'newer draft'])('disconnecting during a prepared page refresh retains the %s local copy', async version => {
  let rejectRead
  const pendingRead = new Promise((resolve, reject) => { rejectRead = reject })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  const expected = version === 'newer draft' ? 'טיוטה עדכנית במכשיר' : 'טקסט ישן'
  if (version === 'newer draft') act(() => writeRecord({ ...readRecord(key), draft: { content: expected } }))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => window.dispatchEvent(new Event('offline')))
  await act(async () => rejectRead(new TypeError('Failed to fetch')))
  await screen.findByDisplayValue(expected)
  expect(screen.queryByText('Failed to fetch')).toBeNull()
  expect(readRecord(key).data.thumbnail).toBe('/uploads/old-scan.png')
  expect(readRecord(key).baseVersion).toBe('a'.repeat(64))
})

test('disconnecting while downloading a refreshed scan keeps the prepared scan editable', async () => {
  let rejectScan
  const pendingScan = new Promise((resolve, reject) => { rejectScan = reject })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).includes('/uploads/new-scan.png') ? pendingScan : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/uploads/new-scan.png'))).toBe(true))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => window.dispatchEvent(new Event('offline')))
  await act(async () => rejectScan(new TypeError('Failed to fetch')))
  await screen.findByDisplayValue('טקסט ישן')
  expect(readRecord(key).data.thumbnail).toBe('/uploads/old-scan.png')
  expect(readRecord(key).baseVersion).toBe('a'.repeat(64))
  expect([...cacheStores.keys()]).toEqual(['prepared-cache'])
})

test.each([401, 403])('a completed HTTP %s denial remains an error even if the connection drops', async status => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => window.dispatchEvent(new Event('offline')))
  await act(async () => resolveRead({ ok: false, status, json: async () => ({ success: false, error: 'ההרשאה לשרת נדחתה' }) }))
  await screen.findByText('ההרשאה לשרת נדחתה')
  expect(screen.queryByDisplayValue('טקסט ישן')).toBeNull()
})

test.each([401, 403])('an HTTP %s denial with a lost body cannot restore the local editor', async status => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const endpoint = '/api/book/book/editor?'
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith(endpoint) ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith(endpoint))).toBe(true))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => window.dispatchEvent(new Event('offline')))
  await act(async () => resolveRead({ ok: false, status, json: async () => { throw new TypeError('Failed to fetch') } }))
  await screen.findByText('טעינת תוכן העמוד נכשלה')
  expect(screen.queryByDisplayValue('טקסט ישן')).toBeNull()
})

test('an HTTP 200 response whose body is lost on disconnect still restores the prepared copy', async () => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  act(() => window.dispatchEvent(new Event('offline')))
  await act(async () => resolveRead({ ok: true, status: 200, json: async () => { throw new TypeError('Failed to fetch') } }))
  await screen.findByDisplayValue('טקסט ישן')
  expect(screen.queryByText('Failed to fetch')).toBeNull()
})

test('a cancelled refresh cannot replace the local copy loaded by a newer session', async () => {
  let rejectRead
  const pendingRead = new Promise((resolve, reject) => { rejectRead = reject })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  const view = render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  act(() => writeRecord({ ...readRecord(key), data: { ...nextData, content: 'עותק מקומי עדכני' } }))
  authState.offline = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  view.rerender(<EditPage />)
  await screen.findByDisplayValue('עותק מקומי עדכני')
  await act(async () => rejectRead(new TypeError('Failed to fetch')))
  expect(screen.getByDisplayValue('עותק מקומי עדכני')).toBeInTheDocument()
  expect(screen.queryByText('Failed to fetch')).toBeNull()
  expect(readRecord(key).data.content).toBe('עותק מקומי עדכני')
})

test('report focus survives authentication refreshing the same prepared page', async () => {
  history.replaceState(null, '', '/library/books/book/3?report=0123456789abcdef01234567')
  authState.offline = true
  let resolveReport, resolveContent
  const pendingReport = new Promise(resolve => { resolveReport = resolve })
  const pendingContent = new Promise(resolve => { resolveContent = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => {
    if (String(url).startsWith('/api/page-reports/')) return pendingReport
    if (String(url).startsWith('/api/book/book/editor?')) return pendingContent
    return normalFetch(url)
  })
  const marker = '(מקור)[תיקון]'
  const content = `לפני ${marker} אחרי`
  writeRecord({ ...readRecord(key), data: { ...readRecord(key).data, content } })
  const view = render(<EditPage />)
  await screen.findByDisplayValue(content)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/page-reports/'))).toBe(true))
  authState.offline = false
  view.rerender(<EditPage />)
  await screen.findByText('טוען...')
  await act(async () => resolveReport({ ok: true, json: async () => ({ success: true, report: {
    bookPath: 'book', pageNumber: 3, column: 'content', original: 'מקור', proposed: 'תיקון',
  } }) }))
  await act(async () => resolveContent({ ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, data: { ...nextData, content } }) }))
  const field = await screen.findByDisplayValue(content)
  await screen.findByText('הסימון של הדיווח מסומן בטקסט.')
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
})

test('report action in the rich left column saves normally and Ctrl+Z restores it in one step', async () => {
  localStorage.clear()
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: 'rich' }))
  history.replaceState(null, '', '/library/books/book/3?report=0123456789abcdef01234567')
  const marker = '(מקור)[תיקון]'
  const leftColumn = `לפני <b>${marker}</b> אחרי`
  const updated = 'לפני <b>תיקון</b> אחרי'
  const data = { ...nextData, twoColumns: true, leftColumn, rightColumn: 'טור שלא משתנה' }
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation((url, options) => {
    if (String(url).startsWith('/api/page-reports/')) return Promise.resolve({ ok: true, json: async () => ({ success: true, report: {
      bookPath: 'book', pageNumber: 3, column: 'left', status: 'approved', original: 'מקור', proposed: 'תיקון',
    } }) })
    if (String(url).startsWith('/api/book/book/editor?')) return Promise.resolve({ ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, data }) })
    if (url === '/api/page-content' && options?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
    return normalFetch(url, options)
  })
  const view = render(<EditPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'החלף בתיקון' }, { timeout: 5000 }))
  const left = queryEditorField(view.container, 'left')
  expect(left.value).toBe(updated)
  expect(queryEditorField(view.container, 'right').value).toBe(data.rightColumn)
  const saved = () => fetch.mock.calls.filter(([url, options]) => url === '/api/page-content' && options?.method === 'POST').map(([, options]) => JSON.parse(options.body))
  await waitFor(() => expect(saved().at(-1)).toMatchObject({ leftColumn: updated, rightColumn: data.rightColumn }), { timeout: 3000 })
  fireEvent.keyDown(left, { key: 'z', code: 'KeyZ', ctrlKey: true })
  expect(left.value).toBe(leftColumn)
  await waitFor(() => expect(saved().at(-1)).toMatchObject({ leftColumn, rightColumn: data.rightColumn }), { timeout: 3000 })
}, 10000)

test('a blocked second tab never starts a refresh that could overwrite the owning editor', async () => {
  navigator.locks.request.mockImplementation(async (name, options, callback) => callback ? callback(null) : options({ name }))
  const previous = readRecord(key)
  render(<EditPage />)
  await screen.findByText(/עמוד זה פתוח לעריכה בלשונית אחרת/)
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(false)
  expect(readRecord(key)).toEqual(previous)
  expect(caches.open).not.toHaveBeenCalled()
})

test('a delayed GET cannot revert a newer acknowledged local copy while the owning editor loads', async () => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  // An already-running synchronization publishes its receipt while the GET is in flight.
  act(() => writeRecord({ ...readRecord(key), data: { ...nextData, content: 'עריכה חדשה שאושרה בשרת' }, baseVersion: 'c'.repeat(64), draft: null, inFlight: null }))
  await act(async () => resolveRead({ ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, data: { ...nextData, content: 'גרסה ישנה', contentVersion: 'a'.repeat(64) } }) }))
  await screen.findByDisplayValue('עריכה חדשה שאושרה בשרת')
  expect(readRecord(key).data.content).toBe('עריכה חדשה שאושרה בשרת')
  expect(readRecord(key).baseVersion).toBe('c'.repeat(64))
  expect(caches.open).not.toHaveBeenCalled()
})

test('unmount releases the edit lock and prevents a late GET from publishing to storage', async () => {
  let resolveRead
  const pendingRead = new Promise(resolve => { resolveRead = resolve })
  const normalFetch = fetch.getMockImplementation()
  fetch.mockImplementation(url => String(url).startsWith('/api/book/book/editor?') ? pendingRead : normalFetch(url))
  const previous = readRecord(key)
  const view = render(<EditPage />)
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).startsWith('/api/book/book/editor?'))).toBe(true))
  view.unmount()
  await act(async () => resolveRead({ ok: true, json: async () => ({ success: true, book: { name: 'ספר', totalPages: 10 }, data: nextData }) }))
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
