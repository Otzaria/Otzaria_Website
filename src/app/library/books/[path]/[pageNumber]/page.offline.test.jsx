import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import EditPage from './page'
import { pageKey, readRecord, writeRecord } from '@/lib/offlineBooks/store'
import { EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs } from '@/hooks/editorPrefs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ path: 'book', pageNumber: '3' }) }))
vi.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => ({ status: 'authenticated', session: { offline: true, user: { id: 'u', role: 'user', name: 'משתמש' } } }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))
vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [500, 700], profile: null, status: 'idle' }) }))
vi.mock('@/hooks/useLocalWordBoxes', () => ({ useLocalWordBoxes: () => ({}), canStartLocalWordDetection: () => false }))
vi.mock('@/components/editor/modals/InfoDialog', () => ({ default: () => null }))
const key = pageKey('u', 'book', 3)
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: 'code' }))
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, options, callback) => callback({ name: 'lock' })) } })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  writeRecord({ version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 3, baseVersion: 'v1',
    book: { name: 'ספר', totalPages: 10 }, data: { id: 'p', content: 'מקורי', thumbnail: '/uploads/page.jpg', status: 'in-progress', claimedById: 'u', twoColumns: true, rightColumn: 'ימין', leftColumn: 'שמאל', rightColumnName: 'פנים', leftColumnName: 'פירוש' },
    draft: { content: 'מקורי', twoColumns: true, rightColumn: 'טיוטת ימין', leftColumn: 'טיוטת שמאל', rightColumnName: 'פנים', leftColumnName: 'פירוש', saveRevision: 1, offlineSaveId: 'draft' },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); delete navigator.locks; delete navigator.onLine })

test('actual editor restores both columns and journals changes across unmount/remount without any POST', async () => {
  const first = render(<EditPage />)
  const right = await screen.findByDisplayValue('טיוטת ימין')
  expect(screen.getByDisplayValue('טיוטת שמאל')).toBeInTheDocument()
  fireEvent.change(right, { target: { value: 'תיקון אופליין' } })
  expect(readRecord(key).draft).toMatchObject({ rightColumn: 'תיקון אופליין', leftColumn: 'טיוטת שמאל', rightColumnName: 'פנים', leftColumnName: 'פירוש' })
  first.unmount()
  render(<EditPage />)
  await screen.findByDisplayValue('תיקון אופליין')
  expect(screen.getByDisplayValue('טיוטת שמאל')).toBeInTheDocument()
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
})

test('a full disk keeps the live text, warns before closing, and never claims that it was stored', async () => {
  render(<EditPage />)
  const field = await screen.findByDisplayValue('טיוטת ימין')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  fireEvent.change(field, { target: { value: 'קיים בזיכרון בלבד' } })
  expect(field).toHaveValue('קיים בזיכרון בלבד')
  expect(await screen.findByText(/האחסון המקומי מלא או חסום/, { exact: false })).toBeInTheDocument()
  expect(readRecord(key).draft.rightColumn).toBe('טיוטת ימין')
  const event = new Event('beforeunload', { cancelable: true })
  act(() => window.dispatchEvent(event))
  expect(event.defaultPrevented).toBe(true)
})
