// התור של useConflictParts: הכרעה שמגיעה בזמן שהסבב מחכה לטעינה מחדש לא נשארת תקועה.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const scheduled = []
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: () => 't', dismiss: () => {} }) }))
vi.mock('@/components/admin/list/useDeferredActions', () => ({
  useDeferredActions: () => ({ schedule: (_k, run) => scheduled.push(run), cancel: () => true }),
}))
vi.mock('./conflictsApi', () => ({ loadConflictDiff: vi.fn(), resolveConflictPart: vi.fn() }))

import { loadConflictDiff, resolveConflictPart } from './conflictsApi'
import { useConflictParts } from './useConflictParts'

const mk = (n) => ({ before: `b${n}`, after: `a${n}`, fullBefore: `fb${n}`, fullAfter: `fa${n}` })
const book = { _id: 'bk', title: 'ספר' }
const deferredPromise = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  scheduled.length = 0
  vi.resetAllMocks()
})

describe('useConflictParts — תור הכרעות', () => {
  test('הכרעה שנוספה בזמן שהסבב מחכה לטעינה אחרי כשל — לא נשארת בתור, והסבב הבא עובד', async () => {
    const [c1, c2] = [mk(1), mk(2)]
    loadConflictDiff.mockResolvedValueOnce({ changes: [c1, c2], changeCount: 2 })
    const onError = vi.fn()
    const { result } = renderHook(() => useConflictParts(book, { onError }))
    await act(async () => { await result.current.load() })

    resolveConflictPart.mockRejectedValueOnce(new Error('נכשל'))
    const reload = deferredPromise()
    loadConflictDiff.mockReturnValueOnce(reload.promise)
    act(() => result.current.resolvePart(c1, 'after'))
    act(() => result.current.resolvePart(c2, 'before'))
    await act(async () => { scheduled[0]() }) // נכשל ועכשיו ממתין לטעינה מחדש
    await act(async () => { scheduled[1]() }) // מגיעה בזמן הטעינה (drain מחזיר את ההבטחה הקיימת)
    await act(async () => { reload.resolve({ changes: [c1, c2], changeCount: 2 }) })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(resolveConflictPart).toHaveBeenCalledTimes(1) // התור אופס, בלי שליחה "יתומה" אחרי הכשל

    // הסבב הבא לא תקוע בגלל הבטחה ישנה
    resolveConflictPart.mockResolvedValueOnce({ resolved: false, conflictCount: 1 })
    act(() => result.current.resolvePart(c2, 'before'))
    await act(async () => { scheduled[2]() })
    expect(resolveConflictPart).toHaveBeenCalledTimes(2)
  })

  test('כשל בשמירה: התור מתרוקן, בלי לולאה אינסופית', async () => {
    const c1 = mk(1)
    const onError = vi.fn()
    loadConflictDiff.mockResolvedValue({ changes: [c1], changeCount: 1 })
    resolveConflictPart.mockRejectedValue(new Error('נכשל'))
    const { result } = renderHook(() => useConflictParts(book, { onError }))
    await act(async () => { await result.current.load() })
    act(() => result.current.resolvePart(c1, 'after'))
    await act(async () => { scheduled[0]() })
    expect(resolveConflictPart).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
