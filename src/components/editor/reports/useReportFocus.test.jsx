import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useReportFocus } from './useReportFocus'

vi.mock('@/lib/editorUtils', () => ({ getTextareaCaretTop: () => 500 }))

const report = { bookPath: 'book', pageNumber: 3, column: 'content', original: 'מקור', proposed: 'תיקון' }
const marker = '(מקור)[תיקון]'
let root, field, containerRef
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const advance = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

function mount(fetchReport, options) {
  return renderHook(({ ready = true, pageNumber = 3 } = {}) => useReportFocus({
    containerRef, ready, bookPath: 'book', pageNumber, fetchReport,
  }), options)
}

function replaceField() {
  field = document.createElement('textarea')
  field.value = `לפני ${marker} אחרי`
  field.scrollIntoView = vi.fn()
  root.replaceChildren(field)
}

beforeEach(() => {
  vi.useFakeTimers()
  history.replaceState(null, '', '/library/books/book/3?report=0123456789abcdef01234567')
  root = document.createElement('div')
  document.body.appendChild(root)
  containerRef = { current: root }
  replaceField()
})

afterEach(() => {
  root.remove()
  history.replaceState(null, '', '/')
  vi.useRealTimers()
})

test('restarts after the same page reloads while the first request is still pending', async () => {
  const pending = deferred()
  const fetchReport = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(report)
  const view = mount(fetchReport)
  view.rerender({ ready: false })
  replaceField()
  view.rerender({ ready: true })
  await act(async () => pending.resolve(report))
  await advance(510)
  expect(view.result.current.state.phase).toBe('found')
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
  expect(fetchReport).toHaveBeenCalledTimes(2)
})

// ההתנהגות הישנה (איתור מחדש בכל ready false→true) גנבה את הסמן ממי שכבר עובד במקום אחר
test('does not re-select after the first outcome when the same page reloads', async () => {
  const fetchReport = vi.fn().mockResolvedValue(report)
  const view = mount(fetchReport)
  await advance(510)
  expect(view.result.current.state.phase).toBe('found')
  view.rerender({ ready: false })
  replaceField()
  const other = document.createElement('textarea')
  root.appendChild(other)
  other.focus()
  view.rerender({ ready: true })
  await advance(2000)
  expect(fetchReport).toHaveBeenCalledTimes(1)
  expect(other).toHaveFocus()
  expect(field.selectionStart).toBe(field.selectionEnd)
})

test('focuses again after a page change or a new report id', async () => {
  const fetchReport = vi.fn().mockResolvedValue(report)
  const view = mount(fetchReport)
  await advance(510)
  fetchReport.mockResolvedValue({ ...report, pageNumber: 4 })
  view.rerender({ pageNumber: 4 })
  replaceField()
  await advance(510)
  expect(fetchReport).toHaveBeenCalledTimes(2)
  expect(view.result.current.state.phase).toBe('found')
  history.replaceState(null, '', '/library/books/book/4?report=aaaaaaaaaaaaaaaaaaaaaaaa')
  view.rerender({ ready: false, pageNumber: 4 })
  view.rerender({ ready: true, pageNumber: 4 })
  replaceField()
  await advance(510)
  expect(fetchReport).toHaveBeenCalledTimes(3)
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
})

test('rehighlight still re-selects after the first outcome', async () => {
  const view = mount(vi.fn().mockResolvedValue(report))
  await advance(510)
  field.setSelectionRange(0, 0)
  act(() => view.result.current.rehighlight())
  await advance(20)
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
  expect(view.result.current.state.phase).toBe('found')
})

test('dismiss is not undone by a same-page reload', async () => {
  const fetchReport = vi.fn().mockResolvedValue(report)
  const view = mount(fetchReport)
  await advance(510)
  act(() => view.result.current.dismiss())
  view.rerender({ ready: false })
  view.rerender({ ready: true })
  await advance(1000)
  expect(view.result.current.state).toBeNull()
  expect(fetchReport).toHaveBeenCalledTimes(1)
})

function openModal() {
  const modal = document.createElement('div')
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  document.body.appendChild(modal)
  return modal
}

test('gives up silently after the modal wait cap', async () => {
  const modal = openModal()
  const view = mount(vi.fn().mockResolvedValue(report))
  await advance(29000)
  expect(view.result.current.state.phase).toBe('loading')
  await advance(2000)
  expect(view.result.current.state).toBeNull()
  modal.remove()
  await advance(1000)
  expect(field.selectionStart).toBe(field.selectionEnd)
})

test('gives up when the user typed in the editor while the modal was open', async () => {
  const modal = openModal()
  const view = mount(vi.fn().mockResolvedValue(report))
  await advance(800)
  act(() => { field.dispatchEvent(new Event('input', { bubbles: true })) })
  modal.remove()
  await advance(500)
  expect(view.result.current.state).toBeNull()
  expect(field).not.toHaveFocus()
})

test('is navigation-only: never writes the field value or fires input/change', async () => {
  const before = field.value
  const onInput = vi.fn()
  const onChange = vi.fn()
  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)
  const valueSet = vi.spyOn(field, 'value', 'set')
  const view = mount(vi.fn().mockResolvedValue(report))
  await advance(510)
  act(() => view.result.current.rehighlight())
  await advance(20)
  expect(view.result.current.state.phase).toBe('found')
  expect(valueSet).not.toHaveBeenCalled()
  expect(onInput).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
  expect(field.value).toBe(before)
})

test('StrictMode effect cleanup does not suppress the surviving request', async () => {
  const view = mount(vi.fn().mockResolvedValue(report), { wrapper: StrictMode })
  await advance(510)
  expect(view.result.current.state.phase).toBe('found')
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
})

test.each(['fetch', 'settle', 'found'])('dismissal during %s prevents a late highlight or reopening', async phase => {
  const pending = deferred()
  const fetchReport = vi.fn(() => pending.promise)
  const view = mount(fetchReport)
  if (phase !== 'fetch') await act(async () => pending.resolve(report))
  if (phase === 'found') await advance(500)
  act(() => view.result.current.dismiss())
  await act(async () => pending.resolve(report))
  await advance(1000)
  expect(view.result.current.state).toBeNull()
  expect(field.scrollIntoView).not.toHaveBeenCalled()
  expect(fetchReport).toHaveBeenCalledTimes(1)
})

test('ignores an old page response and cancels its pending scroll', async () => {
  const pending = deferred()
  const fetchReport = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue({ ...report, pageNumber: 4 })
  const view = mount(fetchReport)
  view.rerender({ pageNumber: 4 })
  await act(async () => pending.resolve(report))
  await advance(500)
  expect(view.result.current.state).toMatchObject({ phase: 'found', report: { pageNumber: 4 } })
  view.rerender({ ready: false, pageNumber: 5 })
  await advance(10)
  expect(field.scrollIntoView).not.toHaveBeenCalled()
  expect(view.result.current.state).toBeNull()
})

test('waits for an open modal and focuses the reported column after it closes', async () => {
  field.setAttribute('data-column', 'right')
  const left = field.cloneNode()
  left.setAttribute('data-column', 'left')
  left.value = field.value
  left.scrollIntoView = vi.fn()
  root.appendChild(left)
  const modal = document.createElement('div')
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  document.body.appendChild(modal)
  const view = mount(vi.fn().mockResolvedValue({ ...report, column: 'left' }))
  await advance(800)
  expect(view.result.current.state.phase).toBe('loading')
  expect(left).not.toHaveFocus()
  modal.remove()
  await advance(310)
  expect(view.result.current.state.phase).toBe('found')
  expect(left).toHaveFocus()
  expect(left.value.slice(left.selectionStart, left.selectionEnd)).toBe(marker)
})
