import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { usePageTracking } from './usePageTracking'
import TextEditor from '../TextEditor'
import EditorStatusBar from './EditorStatusBar'
import FinishPageDialog from './FinishPageDialog'
import OcrWordReviewPanel from './OcrWordReviewPanel'
import { richFieldApi } from '@/lib/editor/editorField'
import { resetFieldHistories } from './fieldHistoryStore'
import { setWordReviewAccepted } from '@/lib/editor/ocrWordReview'

vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [500, 700], profile: null, status: 'idle' }) }))
const LAYOUT = { layoutVersion: 1, image: { width: 500, height: 700 }, toSource: [1, 0, 0, 0, 1, 0], lines: [
  { k: 1, order: 1, inText: true, stream: 'main', bbox: [0, 0, 500, 20], text: 'והנה היא פוסרת את הצרה', words: [[400, 490, .99], [300, 390, .99], [200, 290, .99], [100, 190, .99], [0, 90, .99]],
    lm: [{ i: 2, word: 'פוסרת', alts: [{ text: 'פוטרת', gain: 35.094 }] }] }
] }

function Page({ view = 'code', split = false, initialContent = 'והנה היא <b>פוסרת</b> את הצרה' }) {
  const ref = useRef(null)
  const [fields, setFields] = useState(split ? { right: 'והנה היא', left: '<b>פוסרת</b> את הצרה' } : { content: initialContent })
  const [active, setActive] = useState(null)
  const [panel, setPanel] = useState(false)
  const [finish, setFinish] = useState(false)
  const [decisions, setDecisions] = useState(null)
  const setText = (column, value) => setFields((f) => ({ ...f, [column]: value }))
  const t = usePageTracking({ bookPath: 'b', pageNumber: 3, imageUrl: '/p.jpg', twoColumns: split, activeTextarea: active,
    textContainerRef: ref, text: fields[active || (split ? 'right' : 'content')], textFields: fields, reviewDecisions: decisions })
  return <>
    <TextEditor ref={ref} content={fields.content || ''} rightColumn={fields.right || ''} leftColumn={fields.left || ''} twoColumns={split}
      rightColumnName="ימין" leftColumnName="שמאל" handleAutoSave={(v) => setText('content', v)} handleColumnChange={setText} setActiveTextarea={setActive}
      selectedFont="Arial" textZoom={18} columnWidth={50} onColumnResizeStart={() => {}} setTextZoom={() => {}} textAlign="right" textView={view} {...t.textEditorProps} />
    <EditorStatusBar tracking={t.tracking} suspectCount={t.review.count} acceptedCount={t.review.accepted.length} onSuspectsClick={() => setPanel(true)} />
    <button onClick={() => setFinish(true)}>סיום</button>
    {panel && <OcrWordReviewPanel review={t.review} textContainerRef={ref} onApplyText={setText}
      onSetAccepted={(s, accept) => setDecisions(setWordReviewAccepted(fields, decisions, s, 'r1', accept))} onClose={() => setPanel(false)} />}
    {finish && <FinishPageDialog bookTitle="ספר" pageNumber={3} suspectCount={t.review.count} acceptedCount={t.review.accepted.length} reviewStatus={t.review.status} textLineCount={1} saveStatus="saved"
      onClose={() => setFinish(false)} onSubmit={() => {}} onGoToSuspects={() => { setFinish(false); setPanel(true) }} />}
  </>
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
})
afterEach(() => { vi.unstubAllGlobals(); delete document.execCommand; localStorage.clear() })

it.each(['code', 'rich'])('approving removes highlights in either mode, updates finish, and keeps a route to undo (%s)', async (view) => {
  const { container } = render(<Page view={view} split />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  fireEvent.click(screen.getByRole('button', { name: 'המילה תקינה' }))
  await screen.findByRole('button', { name: /מילים שסומנו כתקינות: 1/ })
  if (view === 'code') expect(container.querySelector('[data-suspect]')).toBeNull()
  else await waitFor(() => expect([...CSS.highlights.keys()].some((k) => k.includes('sus'))).toBe(false))
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'מילים חשודות' }), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
  expect(screen.getByRole('dialog', { name: 'סיום עמוד' })).toHaveTextContent('לא נותרו מילים חשודות לבדיקה')
  fireEvent.click(screen.getByRole('button', { name: 'חזור לעריכה' }))
  fireEvent.click(screen.getByRole('button', { name: /מילים שסומנו כתקינות: 1/ }))
  fireEvent.click(screen.getByText('מילים שסומנו כתקינות (1)'))
  fireEvent.click(screen.getByRole('button', { name: 'החזר לבדיקה: פוסרת, מופע 1' }))
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  if (view === 'code') expect(container.querySelector('[data-text-mirror="left"] [data-suspect]')).toHaveTextContent('פוסרת')
  else await waitFor(() => expect([...CSS.highlights.entries()].some(([k, v]) => k.includes('sus') && v.ranges.some((r) => r.toString() === 'פוסרת'))).toBe(true))
})

it.each(['code', 'rich'])('model-only suspicion reaches both display modes, live counts, suggestions and undo (%s)', async (view) => {
  const { container } = render(<Page view={view} />)
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  if (view === 'code') expect(container.querySelector('[data-suspect]')).toHaveTextContent('פוסרת')
  else await waitFor(() => expect([...CSS.highlights.entries()].some(([k, v]) => k.includes('sus') && v.ranges.some((r) => r.toString() === 'פוסרת'))).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: /מילה אחת לבדיקה/ }))
  const panel = screen.getByRole('dialog', { name: 'מילים חשודות' })
  expect(within(panel).getByText('מודל השפה')).toBeInTheDocument()
  expect(within(panel).getByText('פוטרת')).toBeInTheDocument()
  expect(panel).not.toHaveTextContent('3509')
  fireEvent.click(within(panel).getByRole('button', { name: /פוסרת — טקסט/ }))
  const field = container.querySelector('textarea, [data-rich-textarea]')
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('פוסרת')
  fireEvent.click(within(panel).getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(field.value).toContain('<b>פוטרת</b>'))
  expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull()
  expect(panel).toHaveTextContent('אין כרגע מילים מסומנות לבדיקה')
  if (view === 'rich') {
    act(() => richFieldApi(field).undo())
    await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
    expect(field.value).toContain('<b>פוסרת</b>')
  }
})

it('counts and selects the inactive left column; finish opens the same list', async () => {
  const { container } = render(<Page view="code" split />)
  await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  expect(container.querySelector('[data-text-mirror="left"] [data-suspect]')).toHaveTextContent('פוסרת')
  fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
  expect(screen.getByRole('dialog', { name: 'סיום עמוד' })).toHaveTextContent('מילה חשודה אחת לבדיקה')
  fireEvent.click(screen.getByRole('button', { name: 'עבור אליהן' }))
  fireEvent.click(screen.getByRole('button', { name: /פוסרת — טור שמאל/ }))
  const left = container.querySelector('textarea[data-column="left"]')
  expect(left).toHaveFocus()
  expect(left.value.slice(left.selectionStart, left.selectionEnd)).toBe('פוסרת')
  fireEvent.click(screen.getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(left.value).toBe('<b>פוטרת</b> את הצרה'))
  expect(container.querySelector('textarea[data-column="right"]').value).toBe('והנה היא')
})

it('missing or still loading model data never claims all words have been checked', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  render(<Page />)
  fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
  expect(screen.queryByText('כל המילים החשודות נבדקו')).toBeNull()
  await screen.findByText('אין נתוני חשד מהזיהוי לעמוד')
})


it('a suggestion from a stale render cannot overwrite a changed live field', async () => {
  const { container } = render(<Page view="code" />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  const field = container.querySelector('textarea')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'טקסט שהשתנה לפני הרינדור')
  fireEvent.click(screen.getByRole('button', { name: 'החלף בפוטרת' }))
  expect(field.value).toBe('טקסט שהשתנה לפני הרינדור')
  expect(screen.getByText('הטקסט השתנה. בחרו שוב מילה מהרשימה המעודכנת.')).toBeInTheDocument()
})

it.each(['code', 'rich'])('Escape closes review after navigating to the other column and preserves editor focus (%s)', async (view) => {
  const { container } = render(<Page view={view} split />)
  const opener = await screen.findByRole('button', { name: /מילה אחת לבדיקה/ })
  act(() => opener.focus())
  fireEvent.click(opener)
  const panel = screen.getByRole('dialog', { name: 'מילים חשודות' })
  expect(panel).toContainElement(document.activeElement)

  fireEvent.click(within(panel).getByRole('button', { name: /פוסרת — טור שמאל/ }))
  const left = container.querySelector('[data-column="left"][role="textbox"], textarea[data-column="left"]')
  expect(left).toHaveFocus()
  expect(left.value.slice(left.selectionStart, left.selectionEnd)).toBe('פוסרת')
  fireEvent.keyDown(left, { key: 'Escape', code: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'מילים חשודות' })).toBeNull()
  expect(left).toHaveFocus()
  expect(left.value.slice(left.selectionStart, left.selectionEnd)).toBe('פוסרת')

  // Closing from inside the panel still returns focus to its original opener.
  act(() => opener.focus())
  fireEvent.click(opener)
  expect(screen.getByRole('dialog', { name: 'מילים חשודות' })).toContainElement(document.activeElement)
  fireEvent.keyDown(document.activeElement, { key: 'Escape', code: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'מילים חשודות' })).toBeNull()
  expect(opener).toHaveFocus()
})

it.each(['code', 'rich'])('reordering repeated words removes an ambiguous model suggestion from the live panel (%s)', async (view) => {
  const original = 'פתיחה אמר רב אמר רב סיום'
  const edited = 'פתיחה רב אמר רב אמר סיום'
  const layout = { ...LAYOUT, lines: [{ ...LAYOUT.lines[0], text: original, words: null,
    lm: [{ i: 3, word: 'אמר', alts: [{ text: 'אמרו', gain: 4 }] }] }] }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { layoutStatus: 'ok', layout, image: { matches: true } } }) })))
  const { container } = render(<Page view={view} initialContent={original} />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  const panel = screen.getByRole('dialog', { name: 'מילים חשודות' })
  expect(within(panel).getByRole('button', { name: 'החלף באמרו' })).toBeInTheDocument()
  fireEvent.click(within(panel).getByRole('button', { name: /אמר — טקסט/ }))
  const field = container.querySelector('textarea, [data-rich-textarea]')
  expect(field.selectionStart).toBe('פתיחה אמר רב '.length)

  // A normal full-text paste changes the order without changing occurrence counts.
  if (view === 'rich') {
    act(() => field.setSelectionRange(0, field.value.length))
    fireEvent(field, new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: edited }))
  } else fireEvent.change(field, { target: { value: edited } })

  expect(field.value).toBe(edited)
  await waitFor(() => expect(within(panel).queryByRole('button', { name: 'החלף באמרו' })).toBeNull())
  expect(panel).toHaveTextContent('אין כרגע מילים מסומנות לבדיקה')
  expect(screen.queryByRole('button', { name: /מילה אחת לבדיקה/ })).toBeNull()
  if (view === 'code') expect(container.querySelector('[data-suspect]')).toBeNull()
  else await waitFor(() => expect([...CSS.highlights.keys()].some((k) => k.includes('sus'))).toBe(false))
})

it('shows the proofreading reason and applies its suggestion through the book editor', async () => {
  const layout = { ...LAYOUT, lines: [{ ...LAYOUT.lines[0], lm: [], marks: [
    { i: 2, word: 'פוסרת', level: 'fix', p: .96, sugg: ['פוטרת'], why: ['חשד לפי ההקשר'] },
  ] }] }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
    success: true, data: { layoutStatus: 'ok', layout, image: { matches: true } },
  }) })))
  const { container } = render(<Page />)
  fireEvent.click(await screen.findByRole('button', { name: /מילה אחת לבדיקה/ }))
  const panel = screen.getByRole('dialog', { name: 'מילים חשודות' })
  expect(panel).toHaveTextContent('חשד לפי ההקשר')
  expect(panel).toHaveTextContent('96%')
  fireEvent.click(within(panel).getByRole('button', { name: 'החלף בפוטרת' }))
  await waitFor(() => expect(container.querySelector('textarea').value).toContain('<b>פוטרת</b>'))
  expect(panel).toHaveTextContent('אין כרגע מילים מסומנות לבדיקה')
})
