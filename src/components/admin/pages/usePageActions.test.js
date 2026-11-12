// "שחרר נבחרים": תקלה בשרת (5xx) עוצרת את הריצה; יציאה מהמסך באמצע — לא נשלחות עוד בקשות.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('./pagesApi', () => ({
  releasePage: vi.fn(),
}))

const api = await import('./pagesApi')
const { usePageActions } = await import('./usePageActions')

const pages = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, bookName: 'ספר', number: i + 1, status: 'in-progress', claimedById: 'u1' }))
const setup = () => {
  const toast = { show: vi.fn() }
  const hook = renderHook(() => usePageActions({ onChanged: vi.fn(), toast, confirm: vi.fn(async () => true) }))
  return { ...hook, toast }
}

describe('usePageActions', () => {
  test('5xx עוצר את השחרור המרובה; מה שלא הושלם נשאר מסומן, וההודעה אומרת את הסיבה', async () => {
    api.releasePage.mockReset()
    api.releasePage.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 500 })))
    const { result, toast } = setup()
    let left
    await act(async () => { left = await result.current.actions.bulk('release', pages) })
    expect(api.releasePage).toHaveBeenCalledTimes(4)
    expect(left).toHaveLength(6)
    expect(toast.show.mock.calls.at(-1)[0].message).toMatch(/6 לא הושלמו: אירעה שגיאה בשרת/)
  })

  test('יציאה מהמסך באמצע — לא נשלחות עוד בקשות', async () => {
    api.releasePage.mockReset()
    const pending = []
    api.releasePage.mockImplementation(() => new Promise((resolve) => { pending.push(resolve) }))
    const { result, unmount } = setup()
    let run
    act(() => { run = result.current.actions.bulk('release', pages) })
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve({ outcome: 'updated' }) })
    expect(api.releasePage).toHaveBeenCalledTimes(4)
    unmount()
    for (const resolve of pending) resolve({ outcome: 'updated' })
    await run
    expect(api.releasePage).toHaveBeenCalledTimes(4)
  })
})
