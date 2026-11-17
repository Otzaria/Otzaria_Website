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

test.each(['pending', 'complete'])('restarts after the same page reloads with a %s request', async phase => {
  const pending = deferred()
  const fetchReport = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(report)
  const view = mount(fetchReport)
  if (phase === 'complete') {
    await act(async () => pending.resolve(report))
    await advance(500)
    expect(view.result.current.state.phase).toBe('found')
  }
  view.rerender({ ready: false })
  replaceField()
  view.rerender({ ready: true })
  await act(async () => pending.resolve(report))
  await advance(510)
  expect(view.result.current.state.phase).toBe('found')
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(marker)
  expect(fetchReport).toHaveBeenCalledTimes(2)
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
