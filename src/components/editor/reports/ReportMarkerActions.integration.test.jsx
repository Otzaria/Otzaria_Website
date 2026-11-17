import { it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useReportFocus } from './useReportFocus'
import { useReportMarkerActions } from './useReportMarkerActions'
vi.mock('@/lib/editorUtils', () => ({ getTextareaCaretTop: () => 0 }))
afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); delete document.execCommand; vi.restoreAllMocks() })
it.each(['unchanged', 'prefix inserted', 'chosen marker removed'])('marker action preserves intended occurrence: %s', async (scenario) => {
  const root = document.createElement('div')
  const el = document.createElement('textarea')
  root.appendChild(el); document.body.appendChild(root)
  const marker = '(שלמם)[שלום]'
  const first = `ראשון ${marker} סוף ראשון`
  const second = `\nשני ${marker} סוף שני`
  el.value = first + second
  const rep = { status: 'approved', bookPath: 'book', pageNumber: 1, column: 'content', original: 'שלמם', proposed: 'שלום', offset: 6, contextBefore: 'ראשון ', contextAfter: ' סוף ראשון' }
  const fetchReport = vi.fn(async () => rep)
  const containerRef = { current: root }
  const applyColumnText = vi.fn((column, text) => { el.value = text })
  document.execCommand = vi.fn(() => false)
  window.history.replaceState({}, '', '/?report=000000000000000000000001')
  const { result } = renderHook(() => {
    const focus = useReportFocus({ containerRef, ready: true, bookPath: 'book', pageNumber: 1, fetchReport })
    const run = useReportMarkerActions({ focus, applyColumnText })
    return { focus, run }
  })
  await waitFor(() => expect(result.current.focus.state?.phase).toBe('found'))
  expect(result.current.focus.state.hit.start).toBe(6)
  if (scenario === 'chosen marker removed') el.value = `ראשון שלום סוף ראשון${second}`
  else if (scenario === 'prefix inserted') el.value = `כותרת נוספת\n${el.value}`
  let changed
  act(() => { changed = result.current.run({ id: 'replace' }) })
  if (scenario === 'chosen marker removed') expect(el.value).toBe(`ראשון שלום סוף ראשון${second}`)
  expect(changed).toBe(scenario !== 'chosen marker removed')
  if (scenario === 'chosen marker removed') expect(applyColumnText).not.toHaveBeenCalled()
  else expect(applyColumnText).toHaveBeenCalledTimes(1)
  expect(el.value).toContain(second)
  if (scenario === 'chosen marker removed') {
    expect(result.current.focus.state).toMatchObject({ phase: 'missing', hit: null })
    act(() => { expect(result.current.run({ id: 'replace' })).toBe(false) })
    expect(applyColumnText).not.toHaveBeenCalled()
    act(() => result.current.focus.rehighlight())
    expect(result.current.focus.state.phase).toBe('found')
    act(() => { expect(result.current.run({ id: 'replace' })).toBe(true) })
    expect(el.value).toBe('ראשון שלום סוף ראשון\nשני שלום סוף שני')
  }
})
