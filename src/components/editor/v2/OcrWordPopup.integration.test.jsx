import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { usePageTracking } from './usePageTracking'
import TextEditor from '../TextEditor'
import EditorStatusBar from './EditorStatusBar'
import OcrWordReviewPanel from './OcrWordReviewPanel'
import OcrWordPopup from './OcrWordPopup'
import { resetFieldHistories } from './fieldHistoryStore'
import { setWordReviewAccepted } from '@/lib/editor/ocrWordReview'

vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [500, 700], profile: null, status: 'idle' }) }))
const LAYOUT = { layoutVersion: 1, image: { width: 500, height: 700 }, toSource: [1, 0, 0, 0, 1, 0], lines: [
  { k: 1, order: 1, inText: true, stream: 'main', bbox: [0, 0, 500, 20], text: 'והנה היא פוסרת את הצרה', words: [[400, 490, .99], [300, 390, .99], [200, 290, .99], [100, 190, .99], [0, 90, .99]],
    lm: [{ i: 2, word: 'פוסרת', alts: [{ text: 'פוטרת', gain: 35.094 }] }] }
] }
// בלי פריסה אמיתית ב-jsdom: המילה המסומנת (span בשכבת המראה / טווח בתצוגה המעוצבת) — כאן על המסך
const WORD = { left: 300, right: 360, top: 200, bottom: 220, width: 60, height: 20, x: 300, y: 200 }
const FIELD = { left: 0, right: 900, top: 100, bottom: 700, width: 900, height: 600, x: 0, y: 100 }

function Page({ view = 'code', split = false, initialFields, withPanel = false }) {
  const ref = useRef(null)
  const [fields, setFields] = useState(initialFields || (split ? { right: 'והנה היא', left: '<b>פוסרת</b> את הצרה' } : { content: 'והנה היא <b>פוסרת</b> את הצרה' }))
  const [active, setActive] = useState(null)
  const [panel, setPanel] = useState(withPanel)
  const [decisions, setDecisions] = useState(null)
  const setText = (column, value) => setFields((f) => ({ ...f, [column]: value }))
  const accept = (s, ok) => setDecisions(setWordReviewAccepted(fields, decisions, s, 'r1', ok))
  const t = usePageTracking({ bookPath: 'b', pageNumber: 3, imageUrl: '/p.jpg', twoColumns: split, activeTextarea: active,
    textContainerRef: ref, text: fields[active || (split ? 'right' : 'content')], textFields: fields, reviewDecisions: decisions })
  return <>
    <TextEditor ref={ref} content={fields.content || ''} rightColumn={fields.right || ''} leftColumn={fields.left || ''} twoColumns={split}
      rightColumnName="ימין" leftColumnName="שמאל" handleAutoSave={(v) => setText('content', v)} handleColumnChange={setText} setActiveTextarea={setActive}
      selectedFont="Arial" textZoom={18} columnWidth={50} onColumnResizeStart={() => {}} setTextZoom={() => {}} textAlign="right" textView={view} {...t.textEditorProps} />
    <EditorStatusBar tracking={t.tracking} suspectCount={t.review.count} acceptedCount={t.review.accepted.length} onSuspectsClick={() => setPanel(true)} />
    {panel && <OcrWordReviewPanel review={t.review} textContainerRef={ref} onApplyText={setText} onSetAccepted={accept} onClose={() => setPanel(false)} />}
    <OcrWordPopup review={t.review} textContainerRef={ref} onApplyText={setText} onSetAccepted={accept} />
  </>
}

const fieldOf = (container, column) => container.querySelector(column
  ? `[data-column="${column}"][role="textbox"], textarea[data-column="${column}"]`
  : 'textarea, [data-rich-textarea]')
const popup = () => screen.queryByRole('dialog', { name: /הצעות למילה/ })
// לחיצה שמשאירה את הסמן במקום pos (כמו לחיצה אמיתית בשדה)
function clickAt(field, pos) {
  act(() => { field.focus(); field.setSelectionRange(pos, pos) })
  fireEvent.click(field)
}
async function ready(view, props) {
  const r = render(<Page view={view} {...props} />)
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  return r
}

beforeEach(() => {
  resetFieldHistories()
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { layoutStatus: 'ok', layout: LAYOUT, image: { matches: true } } }) })))
  vi.stubGlobal('Highlight', class { constructor(...ranges) { this.ranges = ranges } })
  vi.stubGlobal('CSS', { highlights: new Map() })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () { return this.hasAttribute('data-suspect') ? [WORD] : [] })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.matches('textarea, [data-rich-textarea]') ? FIELD : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
  })
  // בתצוגה המעוצבת כל טווח "נמצא" במקום המילה — rangeRects של הבקר
  Range.prototype.getClientRects = function () { return this.toString() ? [WORD] : [] }
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.execCommand; delete Range.prototype.getClientRects; localStorage.clear() })

const POS = 'והנה היא <b>פו'.length

it.each(['code', 'rich'])('clicking inside a marked word opens suggestions beside it; replace goes through the editor (%s)', async (view) => {
  const { container } = await ready(view)
  const field = fieldOf(container)
  clickAt(field, POS)
  const pop = await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })
  expect(field).toHaveFocus()
  expect(pop).toHaveTextContent('הצעת מודל השפה')
  expect(within(pop).getByText('מודל השפה')).toBeInTheDocument()
  // מתחת למילה, לא עליה
  await waitFor(() => expect(parseFloat(pop.style.top)).toBeGreaterThanOrEqual(WORD.bottom))
  expect(field.value).toContain('<b>פוסרת</b>')
  fireEvent.click(within(pop).getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(field.value).toBe('והנה היא <b>פוטרת</b> את הצרה'))
  expect(popup()).toBeNull()
  expect(field).toHaveFocus()
  expect(field.selectionStart).toBe(field.selectionEnd)
  await waitFor(() => expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull())
})

it.each(['code', 'rich'])('nothing changes without a click; clicking outside a marked word does not open (%s)', async (view) => {
  const { container } = await ready(view)
  const field = fieldOf(container)
  clickAt(field, 2)
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  expect(popup()).toBeNull()
  clickAt(field, POS)
  await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })
  clickAt(field, 2)
  expect(popup()).toBeNull()
  expect(field.value).toBe('והנה היא <b>פוסרת</b> את הצרה')
})

it.each(['code', 'rich'])('"the word is correct" uses the page decision and removes the highlight (%s)', async (view) => {
  const { container } = await ready(view)
  const field = fieldOf(container)
  clickAt(field, POS)
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })).getByRole('button', { name: 'המילה תקינה' }))
  await screen.findByRole('button', { name: /מילים שסומנו כתקינות: 1/ })
  expect(popup()).toBeNull()
  expect(field).toHaveFocus()
  expect(field.value).toBe('והנה היא <b>פוסרת</b> את הצרה')
  if (view === 'code') expect(container.querySelector('[data-suspect]')).toBeNull()
})

it.each(['code', 'rich'])('F8 selects the next marked word and focuses the popup; Escape returns to the text and keeps the panel (%s)', async (view) => {
  const { container } = await ready(view, { withPanel: true })
  const field = fieldOf(container)
  act(() => { field.focus(); field.setSelectionRange(0, 0) })
  fireEvent.keyDown(field, { key: 'F8', code: 'F8' })
  const pop = await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('פוסרת')
  await waitFor(() => expect(within(pop).getByRole('button', { name: 'החלף בפוטרת' })).toHaveFocus())
  fireEvent.keyDown(document.activeElement, { key: 'Escape', code: 'Escape' })
  expect(popup()).toBeNull()
  expect(field).toHaveFocus()
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('פוסרת')
  expect(screen.getByRole('dialog', { name: 'מילים חשודות' })).toBeInTheDocument()
})

it.each(['code', 'rich'])('typing closes the popup and the text is left as typed (%s)', async (view) => {
  const { container } = await ready(view)
  const field = fieldOf(container)
  clickAt(field, POS)
  await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })
  if (view === 'rich') fireEvent(field, new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'א' }))
  else fireEvent.change(field, { target: { value: 'והנה היא <b>פואסרת</b> את הצרה' } })
  await waitFor(() => expect(popup()).toBeNull())
})

it('hovering a marked word opens after a short delay and leaving closes it', async () => {
  const { container } = await ready('code')
  const field = fieldOf(container)
  fireEvent.mouseMove(field, { clientX: 320, clientY: 210 })
  expect(popup()).toBeNull()
  await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' }, { timeout: 2000 })
  expect(field).not.toHaveFocus()
  fireEvent.mouseMove(field, { clientX: 20, clientY: 600 })
  await waitFor(() => expect(popup()).toBeNull(), { timeout: 2000 })
})

it('works in the inactive left column of a split page', async () => {
  const { container } = await ready('code', { split: true })
  const left = fieldOf(container, 'left')
  clickAt(left, '<b>פו'.length)
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })).getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(left.value).toBe('<b>פוטרת</b> את הצרה'))
  expect(fieldOf(container, 'right').value).toBe('והנה היא')
})

it('a suggestion from a stale render cannot overwrite a changed live field', async () => {
  const { container } = await ready('code')
  const field = fieldOf(container)
  clickAt(field, POS)
  const pop = await screen.findByRole('dialog', { name: 'הצעות למילה פוסרת' })
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'טקסט שהשתנה לפני הרינדור')
  fireEvent.click(within(pop).getByRole('button', { name: 'החלף בפוטרת' }))
  expect(field.value).toBe('טקסט שהשתנה לפני הרינדור')
  expect(pop).toHaveTextContent('הטקסט השתנה')
})
