// יציאה מהמסך באמצע פרסום מרובה: הבקשה שבאוויר מסתיימת (בזו אחר זו), ואחריה לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./bookInfoApi', () => ({
  postLegacy: vi.fn(() => new Promise((resolve) => { pending.push(() => resolve({ prUrl: 'u', prNumber: 1 })) })),
}))

const { postLegacy } = await import('./bookInfoApi')
const { useLegacyActions } = await import('./useLegacyActions')

describe('useLegacyActions', () => {
  test('יציאה מהמסך באמצע פרסום מרובה — לא נשלחות עוד בקשות', async () => {
    const { result, unmount } = renderHook(() => useLegacyActions({
      data: { items: [], setItems: vi.fn() }, fieldsFor: () => ['name'], clearFields: vi.fn(),
      toast: { show: vi.fn(), dismiss: vi.fn() }, confirm: vi.fn(async () => true),
    }))
    const rows = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]
    let run
    act(() => { run = result.current.actions.bulkPublish(rows) })
    await act(async () => { await Promise.resolve() })
    expect(postLegacy).toHaveBeenCalledTimes(1)
    expect(result.current.progress).toEqual({ done: 0, total: 3 })
    unmount()
    pending[0]()
    await run
    expect(postLegacy).toHaveBeenCalledTimes(1)
  })
})

describe('useLegacyActions — תקלה בשרת', () => {
  test('5xx עוצר את הפרסום המרובה בלי לנעול את המסך; הסיבה בכרטיס ובהודעה', async () => {
    postLegacy.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 500 })))
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result } = renderHook(() => useLegacyActions({
      data: { items: [], setItems: vi.fn() }, fieldsFor: () => ['name'], clearFields: vi.fn(), toast, confirm: vi.fn(async () => true),
    }))
    postLegacy.mockClear()
    await act(async () => { await result.current.actions.bulkPublish([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]) })
    expect(postLegacy).toHaveBeenCalledTimes(1)
    expect(result.current.locked).toBeNull()
    expect(result.current.errors.get('r1')).toBe('אירעה שגיאה בשרת.')
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.message).toBe('לא נפתחו בקשות · הצעה אחת לא נפתחה — הסיבה כתובה בה · הפעולה נעצרה. אירעה שגיאה בשרת.')
  })
})

describe('useLegacyActions — סגירת הלשונית בזמן ה"בטל"', () => {
  test('מחיקה שממתינה — אותה בקשה ב-keepalive, פעם אחת', () => {
    postLegacy.mockReset()
    postLegacy.mockImplementation(async () => ({ success: true }))
    const { result } = renderHook(() => useLegacyActions({
      data: { items: [], setItems: vi.fn() }, fieldsFor: () => ['name'], clearFields: vi.fn(),
      toast: { show: vi.fn(), dismiss: vi.fn() }, confirm: vi.fn(),
    }))
    act(() => result.current.actions.remove({ id: 'r1', changedFields: ['name', 'author'] }))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(postLegacy.mock.calls).toEqual([['delete', [{ changeId: 'r1', fields: ['name'] }], { keepalive: true }]])
    expect(result.current.deleting.size).toBe(0)
  })
})
