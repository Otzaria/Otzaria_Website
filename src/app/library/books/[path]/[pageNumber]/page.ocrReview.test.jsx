import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import EditPage from './page'
import { EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs } from '@/hooks/editorPrefs'
import { editorFieldHistory } from '@/components/editor/v2/textareaHistory'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ path: 'book', pageNumber: '3' }) }))
vi.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => ({ status: 'authenticated', session: { user: { id: 'u', role: 'user', name: 'משתמש' } } }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))
vi.mock('@/components/providers/LoadingContext', () => ({ useLoading: () => ({ startLoading: vi.fn(), stopLoading: vi.fn() }) }))
vi.mock('@/hooks/useAutoSave', () => ({ UNSAVED_LEAVE_MESSAGE: '', useAutoSave: () => ({ save, saveNow: vi.fn(), flush: vi.fn(), status: 'saved' }) }))
vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [500, 700], profile: null, status: 'idle' }) }))
vi.mock('@/hooks/useLocalWordBoxes', () => ({ useLocalWordBoxes: () => ({}), canStartLocalWordDetection: () => false }))
vi.mock('@/components/editor/v2/EditorShell', () => ({ default: ({ text, statusBar, children }) => <div>{text}{statusBar}{children}</div> }))
vi.mock('@/components/editor/modals/FindReplaceDialog', () => ({ default: () => null }))
vi.mock('@/components/editor/modals/SpellcheckDialog', () => ({ default: () => null }))
vi.mock('@/components/editor/modals/InfoDialog', () => ({ default: () => null }))
vi.mock('@/components/editor/modals/ShortcutsDialog', () => ({ default: () => null }))
vi.mock('@/components/dicta-tools/EmbedImageModal', () => ({ default: () => null }))

let pageContentData

beforeEach(() => {
  pageContentData = { id: 'p', content: 'היא <b>פוסרת</b> את הצרה', thumbnail: '/p.jpg', status: 'available', ocrReviewRevision: 'result-1' }
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn((_cmd, _showUi, text) => {
    const field = document.activeElement
    const value = field.value.slice(0, field.selectionStart) + text + field.value.slice(field.selectionEnd)
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, value)
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    return true
  }) })
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => {
    if (url.startsWith('/api/book/')) return { success: true, book: { name: 'ספר' }, pages: [{ number: 3, status: 'available' }] }
    if (url.startsWith('/api/page-content?')) return { success: true, data: pageContentData }
    if (url.startsWith('/api/page-content/ocr-data?')) return { success: true, data: { layoutStatus: 'ok', image: { matches: true }, layout: {
      layoutVersion: 1, image: { width: 500, height: 700 }, toSource: [1, 0, 0, 0, 1, 0], lines: [
        { k: 0, inText: true, order: 1, stream: 'main', bbox: [0, 0, 500, 20], text: 'היא פוסרת את הצרה', words: null, lm: [{ i: 1, word: 'פוסרת', alts: [{ text: 'פוטרת', gain: 35.094 }] }] }
      ] } } }
    return { success: true, data: {}, hiddenBooks: ['book'], savedSearches: [] }
  } })))
})

test.each(['rich', 'code'])('approve without changing text; reload preserves approval and restore returns highlight/count (%s)', async (view) => {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: view }))
  const first = render(<EditPage />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  fireEvent.click(screen.getByRole('button', { name: 'המילה תקינה' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull())
  expect(first.container.querySelector('[data-suspect]')).toBeNull()
  const saved = save.mock.calls.at(-1)[0]
  expect(saved.content).toBe(pageContentData.content)
  expect(saved.ocrWordReview).toMatchObject({ version: 1, revision: 'result-1', accepted: [1] })
  expect(screen.getByText('מילים שסומנו כתקינות (1)')).toBeInTheDocument()

  pageContentData = { ...pageContentData, ...JSON.parse(JSON.stringify(saved)) }
  first.unmount()
  render(<EditPage />)
  const count = await screen.findByRole('button', { name: /מילים שסומנו כתקינות/ })
  fireEvent.click(count)
  await screen.findByText('מילים שסומנו כתקינות (1)')
  expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull()
  fireEvent.click(screen.getByText('מילים שסומנו כתקינות (1)'))
  fireEvent.click(screen.getByRole('button', { name: 'החזר לבדיקה: פוסרת, מופע 1' }))
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  expect(save.mock.calls.at(-1)[0].ocrWordReview.accepted).toEqual([])
})

test('approval is occurrence-specific across columns and survives subsequent column autosave', async () => {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: 'code' }))
  pageContentData = { ...pageContentData, content: '', twoColumns: true, rightColumn: 'פתיחה שלומ3', leftColumn: 'סיום שלומ3' }
  const { container } = render(<EditPage />)
  fireEvent.click(await screen.findByRole('button', { name: /2 מילים לבדיקה/ }))
  fireEvent.click(screen.getByRole('button', { name: /שלומ3 — טור שמאל/ }))
  fireEvent.click(screen.getByRole('button', { name: 'המילה תקינה' }))
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  expect(container.querySelector('[data-text-mirror="left"] [data-suspect]')).toBeNull()
  expect(container.querySelector('[data-text-mirror="right"] [data-suspect]')).toHaveTextContent('שלומ3')
  const approved = save.mock.calls.at(-1)[0].ocrWordReview
  fireEvent.change(container.querySelector('textarea[data-column="right"]'), { target: { value: 'הקדמה פתיחה שלומ3' } })
  expect(save.mock.calls.at(-1)[0]).toMatchObject({ rightColumn: 'הקדמה פתיחה שלומ3', ocrWordReview: approved })
  expect(screen.getByRole('button', { name: /מילה אחת לבדיקה/ })).toBeInTheDocument()
})

test('approval from a stale live field is refused without saving a decision', async () => {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: 'code' }))
  const { container } = render(<EditPage />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(container.querySelector('textarea'), 'טקסט חדש')
  fireEvent.click(screen.getByRole('button', { name: 'המילה תקינה' }))
  expect(screen.getByText('הטקסט השתנה. בחרו שוב מילה מהרשימה המעודכנת.')).toBeInTheDocument()
  expect(save).not.toHaveBeenCalled()
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); delete document.execCommand })

test.each(['rich', 'code'])('actual book page: model-only suspect, autosave, undo and restored count (%s)', async (view) => {
  localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, serializeEditorPrefs({ textView: view }))
  const { container } = render(<EditPage />)
  const button = await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  fireEvent.click(button)
  expect(screen.getByRole('dialog', { name: 'מילים חשודות' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(save.mock.calls.at(-1)[0]).toMatchObject({ bookPath: 'book', pageNumber: 3, content: 'היא <b>פוטרת</b> את הצרה', twoColumns: false })
  expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull()
  const field = container.querySelector('textarea, [data-rich-textarea]')
  act(() => { expect(editorFieldHistory(field).undo()).toBe(true) })
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  expect(save.mock.calls.at(-1)[0].content).toBe('היא <b>פוסרת</b> את הצרה')
})
