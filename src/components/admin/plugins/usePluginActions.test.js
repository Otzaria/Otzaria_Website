// יציאה מהמסך באמצע פעולה מרובה (השהה נבחרים): הבקשות שבאוויר מסתיימות, ואחריהן לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./pluginsApi', () => ({
  pluginAction: vi.fn(() => new Promise((resolve) => { pending.push(() => resolve({})) })),
}))
vi.mock('@/components/admin/shell/useAdminBadgeCounts', () => ({ refreshAdminBadgeCounts: vi.fn() }))

const { pluginAction } = await import('./pluginsApi')
const { usePluginActions } = await import('./usePluginActions')

describe('usePluginActions', () => {
  test('יציאה מהמסך באמצע "השהה" מרובה — לא נשלחות עוד בקשות', async () => {
    const data = { setPending: vi.fn(), setApproved: vi.fn(), setCategories: vi.fn(), refresh: vi.fn() }
    const { result, unmount } = renderHook(() => usePluginActions({
      data, toast: { show: vi.fn() }, confirm: vi.fn(async () => true), openApprove: vi.fn(), openEdit: vi.fn(),
    }))
    const plugins = Array.from({ length: 7 }, (_, i) => ({ _id: `p${i}`, name: `p${i}`, isSuspended: false }))
    let run
    act(() => { run = result.current.actions.suspend(plugins, { bulk: true }) })
    await act(async () => { await Promise.resolve() })
    expect(pluginAction).toHaveBeenCalledTimes(4)
    expect(result.current.bulkProgress).toEqual({ action: 'suspend', done: 0, total: 7 })
    unmount()
    for (const resolve of pending) resolve()
    await run
    expect(pluginAction).toHaveBeenCalledTimes(4)
  })
})

describe('usePluginActions — תקלה בשרת', () => {
  test('5xx עוצר את הפעולה המרובה; מה שנכשל או לא נשלח נשאר מסומן, וההודעה אומרת את הסיבה', async () => {
    pluginAction.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 503 })))
    const toast = { show: vi.fn() }
    const data = { setPending: vi.fn(), setApproved: vi.fn(), setCategories: vi.fn(), refresh: vi.fn() }
    const { result } = renderHook(() => usePluginActions({
      data, toast, confirm: vi.fn(async () => true), openApprove: vi.fn(), openEdit: vi.fn(),
    }))
    pluginAction.mockClear()
    const plugins = Array.from({ length: 7 }, (_, i) => ({ _id: `p${i}`, name: `p${i}`, isSuspended: false }))
    await act(async () => { await result.current.actions.suspend(plugins, { bulk: true }) })
    expect(pluginAction).toHaveBeenCalledTimes(4)
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.tone).toBe('error')
    expect(shown.message).toMatch(/נעצר: 3 תוספים לא עודכנו\..*אירעה שגיאה בשרת\.$/)
  })
})
