import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EditPage from './page'
import { EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs } from '@/hooks/editorPrefs'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ path: 'book', pageNumber: '1' }) }))
vi.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => ({ status: 'authenticated', session: { user: { id: 'u', role: 'user', name: 'משתמש' } } }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: (_title, _message, cb) => cb?.() }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))
vi.mock('@/hooks/useAutoSave', () => ({ UNSAVED_LEAVE_MESSAGE: '', useAutoSave: () => ({ save, saveNow: vi.fn(), flush: vi.fn(), status: 'saved' }) }))
vi.mock('@/components/editor/v2/usePageTracking', () => ({ usePageTracking: () => ({ tracking: {}, textEditorProps: {}, imagePanelProps: {} }) }))
vi.mock('@/hooks/useLocalWordBoxes', () => ({ useLocalWordBoxes: () => ({}) }))
vi.mock('@/components/editor/v2/EditorShell', () => ({ default: ({ text, children }) => <div>{text}{children}</div> }))
vi.mock('@/components/editor/modals/FindReplaceDialog', () => ({ default: ({ handleRemoveDigits }) => <button onClick={handleRemoveDigits}>ניקוי ספרות</button> }))
vi.mock('@/components/editor/modals/SpellcheckDialog', () => ({ default: () => null }))
vi.mock('@/components/editor/modals/InfoDialog', () => ({ default: () => null }))
vi.mock('@/components/editor/modals/ShortcutsDialog', () => ({ default: () => null }))
vi.mock('@/components/dicta-tools/EmbedImageModal', () => ({ default: () => null }))

beforeEach(() => {
  // jsdom אינו מממש execCommand; מפעילים את מסלול התאימות של textarea בדפדפן ללא תמיכה.
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete document.execCommand
})

// TextEditor והשדות עצמם אמיתיים: ב-rich כל replaceRange מפעיל onChange מיד,
// לפני ש-React הספיק לרנדר עם הטור השני המעודכן.
const cases = ['rich', 'code'].flatMap((view) => [
  { view, right: 'ימין1', left: 'שמאל2', expectedRight: 'ימין', expectedLeft: 'שמאל' },
  { view, right: 'ימין', left: 'שמאל2', expectedRight: 'ימין', expectedLeft: 'שמאל' },
  { view, right: '<h2>ימין1</h2>', left: 'שמאל', expectedRight: '<h2>ימין</h2>', expectedLeft: 'שמאל' }
])

test.each(cases)('ניקוי ספרות שומר את שני הטורים העדכניים ($view, $right, $left)', async ({ view, right, left, expectedRight, expectedLeft }) => {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: view }))
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    json: async () => url.startsWith('/api/book/')
      ? { success: true, book: { name: 'ספר' }, pages: [{ number: 1, status: 'available' }] }
      : url.startsWith('/api/page-content?')
        ? { success: true, data: { id: 'p', twoColumns: true, rightColumn: right, leftColumn: left, status: 'available' } }
        : { success: true, data: {}, savedSearches: [], hiddenBooks: ['book'] }
  })))
  render(<EditPage />)
  await screen.findByRole('button', { name: 'ניקוי ספרות' })
  fireEvent.click(screen.getByRole('button', { name: 'ניקוי ספרות' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(document.querySelector('[data-column="right"]').value).toBe(expectedRight)
  expect(document.querySelector('[data-column="left"]').value).toBe(expectedLeft)
  expect(save.mock.calls.at(-1)[0]).toMatchObject({ rightColumn: expectedRight, leftColumn: expectedLeft, twoColumns: true })
})
