import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import NewBookForm from './NewBookForm'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const response = (titles = ['משנה תורה']) => ({ ok: true, json: async () => ({ success: true, titles }) })
const enterTitle = (title) => fireEvent.change(screen.getByPlaceholderText('שם הספר המדויק'), { target: { value: title } })

test('click and Enter cannot bypass a pending library check', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolve = r })))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  enterTitle('משנה תרה')
  const next = screen.getByRole('button', { name: 'המשך' })
  expect(next).toBeDisabled()
  fireEvent.click(next)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(onCreate).not.toHaveBeenCalled()
  await act(async () => resolve(response()))
  expect(next).toBeEnabled()
  fireEvent.click(next)
  expect(onCreate).not.toHaveBeenCalled()
  expect(screen.getByText('להמשיך עם השם שהוזן')).toBeInTheDocument()
})

test('an exact library title can continue after loading', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  await act(async () => {})
  enterTitle('משנה תורה')
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(onCreate).toHaveBeenCalledWith('משנה תורה')
})

test.each(['suggestion', 'override'])('unknown titles require choosing a %s', async (choice) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  await act(async () => {})
  enterTitle('משנה תרה')
  fireEvent.click(screen.getByText('המשך'))
  expect(onCreate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: choice === 'suggestion' ? 'משנה תורה' : 'להמשיך עם השם שהוזן' }))
  expect(onCreate).toHaveBeenCalledWith(choice === 'suggestion' ? 'משנה תורה' : 'משנה תרה')
})

test('editing the title clears the previous warning', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  await act(async () => {})
  enterTitle('משנה תרה')
  fireEvent.click(screen.getByText('המשך'))
  enterTitle('משנה תורה')
  expect(screen.queryByText('להמשיך עם השם שהוזן')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('המשך'))
  expect(onCreate).toHaveBeenCalledWith('משנה תורה')
})

test.each([
  ['network', () => Promise.reject(new Error('Offline'))],
  ['HTTP', () => Promise.resolve({ ok: false, json: async () => ({ success: true, titles: ['משנה תורה'] }) })],
  ['API', () => Promise.resolve({ ok: true, json: async () => ({ success: false }) })],
  ['invalid data', () => Promise.resolve({ ok: true, json: async () => ({ success: true, titles: [null] }) })],
])('%s failure enables fallback and explains that the title was not checked', async (_name, fetchImpl) => {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  await act(async () => {})
  expect(screen.getByRole('status')).toHaveTextContent('לא ניתן לטעון את רשימת הספרים')
  expect(screen.getByText('המשך')).toBeDisabled()
  enterTitle('ספר חסר')
  fireEvent.click(screen.getByText('המשך'))
  expect(onCreate).toHaveBeenCalledWith('ספר חסר')
})

test('a stalled request times out and allows fallback', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })))
  const onCreate = vi.fn()
  render(<NewBookForm onCreate={onCreate} onClose={() => {}} />)
  enterTitle('ספר חסר')
  await act(async () => vi.advanceTimersByTimeAsync(15_000))
  expect(screen.getByRole('status')).toHaveTextContent('לא ניתן לטעון את רשימת הספרים')
  fireEvent.click(screen.getByText('המשך'))
  expect(onCreate).toHaveBeenCalledWith('ספר חסר')
})

test('closing the form aborts the request and clears its timeout', () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn(() => new Promise(() => {}))
  vi.stubGlobal('fetch', fetchMock)
  const { unmount } = render(<NewBookForm onCreate={() => {}} onClose={() => {}} />)
  const signal = fetchMock.mock.calls[0][1].signal
  unmount()
  expect(signal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
