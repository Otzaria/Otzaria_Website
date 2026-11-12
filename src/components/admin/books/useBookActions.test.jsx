// יציאה מהמסך באמצע "הסתר" מרובה: הבקשות שבאוויר מסתיימות, ואחריהן לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./booksApi', () => ({
  updateBook: vi.fn(() => new Promise((resolve) => { pending.push(resolve) })),
  deleteBook: vi.fn(),
  downloadBookPdf: vi.fn(),
  downloadBookText: vi.fn(),
}))

const { updateBook } = await import('./booksApi')
const { useBookActions } = await import('./useBookActions')

describe('useBookActions', () => {
  test('יציאה מהמסך באמצע פעולה מרובה — לא נשלחות עוד בקשות', async () => {
    const { result, unmount } = renderHook(() => useBookActions({
      setBooks: vi.fn(), toast: { show: vi.fn() }, confirm: vi.fn(), router: {}, refresh: vi.fn(), onDialog: vi.fn(), onOpenDrawer: vi.fn(),
    }))
    const books = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, isHidden: false }))
    let run
    act(() => { run = result.current.bulk(books, 'hide') })
    await act(async () => { await Promise.resolve() })
    expect(updateBook).toHaveBeenCalledTimes(4)
    expect(result.current.bulkProgress).toEqual({ action: 'hide', done: 0, total: 6 })
    unmount()
    for (const resolve of pending) resolve()
    await run
    expect(updateBook).toHaveBeenCalledTimes(4)
  })
})

describe('useBookActions — תקלה בשרת', () => {
  test('5xx עוצר את הפעולה המרובה; ההודעה — הסיכום ("נעצר") ואחריו הסיבה', async () => {
    updateBook.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 500 })))
    const toast = { show: vi.fn() }
    const { result } = renderHook(() => useBookActions({
      setBooks: vi.fn(), toast, confirm: vi.fn(), router: {}, refresh: vi.fn(), onDialog: vi.fn(), onOpenDrawer: vi.fn(),
    }))
    updateBook.mockClear()
    const books = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, isHidden: false }))
    await act(async () => { await result.current.bulk(books, 'hide') })
    expect(updateBook).toHaveBeenCalledTimes(4)
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.tone).toBe('error')
    expect(shown.message).toMatch(/נעצר — 2 ספרים לא עודכנו\..*אירעה שגיאה בשרת\.$/)
  })

  test('403 — עוצר, וההודעה היא ההסבר בלבד (כמו התחברות שפגה)', async () => {
    updateBook.mockImplementation(() => Promise.reject(Object.assign(new Error('אין לך הרשאה לפעולה הזו.'), { status: 403 })))
    const toast = { show: vi.fn() }
    const { result } = renderHook(() => useBookActions({
      setBooks: vi.fn(), toast, confirm: vi.fn(), router: {}, refresh: vi.fn(), onDialog: vi.fn(), onOpenDrawer: vi.fn(),
    }))
    updateBook.mockClear()
    await act(async () => { await result.current.bulk(Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, isHidden: false })), 'hide') })
    expect(updateBook).toHaveBeenCalledTimes(4)
    expect(toast.show.mock.calls.at(-1)[0]).toEqual({ tone: 'error', message: 'אין לך הרשאה לפעולה הזו.' })
  })
})
