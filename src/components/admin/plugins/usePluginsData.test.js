// טעינת רשימות התוספים: תשובה ישנה לא דורסת שינוי מקומי, ורענון שקט שנכשל לא מחליף רשימה קיימת בשגיאה.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ listPlugins: vi.fn(), listCategories: vi.fn() }))
vi.mock('./pluginsApi', () => api)

import { usePluginsData } from './usePluginsData'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const PLUGIN = { _id: 'a', name: 'אלף', isSuspended: false }
const CATEGORIES = [{ id: 'c', name: 'כלים', plugins: [] }]

beforeEach(() => {
  api.listPlugins.mockReset()
  api.listCategories.mockReset()
  api.listPlugins.mockImplementation(async (status) => (status === 'approved' ? [PLUGIN] : []))
  api.listCategories.mockImplementation(async () => CATEGORIES)
})

async function ready(options) {
  const view = renderHook(() => usePluginsData(options))
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  return view
}

describe('usePluginsData', () => {
  test('שינוי מקומי בזמן רענון: התשובה הישנה נזרקת, ונטען מחדש', async () => {
    const { result } = await ready()
    const slow = deferred()
    api.listPlugins.mockImplementationOnce(() => slow.promise)

    let refreshing
    act(() => { refreshing = result.current.refresh() })
    act(() => result.current.setApproved((list) => list.map((p) => ({ ...p, isSuspended: true }))))
    expect(result.current.approved[0].isSuspended).toBe(true)

    // הטעינה החוזרת כבר רואה את השרת אחרי השינוי
    api.listPlugins.mockImplementation(async (status) => (status === 'approved' ? [{ ...PLUGIN, isSuspended: true }] : []))
    await act(async () => {
      slow.resolve([])
      await refreshing
    })
    expect(result.current.approved[0].isSuspended).toBe(true)
  })

  test('שני רענונים: התשובה של הראשון, שהגיעה אחרונה, לא דורסת', async () => {
    const { result } = await ready()
    const first = deferred()
    api.listPlugins.mockImplementationOnce(() => first.promise)
    api.listPlugins.mockImplementationOnce(() => first.promise)
    api.listPlugins.mockImplementation(async (status) => (status === 'approved' ? [{ ...PLUGIN, name: 'חדש' }] : []))

    let one
    await act(async () => {
      one = result.current.refresh()
      await result.current.refresh()
    })
    await act(async () => {
      first.resolve([{ ...PLUGIN, name: 'ישן' }])
      await one
    })
    expect(result.current.approved[0].name).toBe('חדש')
  })

  test('רענון שקט שנכשל: הרשימה נשארת, והודעה ולא מסך שגיאה', async () => {
    const onRefreshError = vi.fn()
    const { result } = await ready({ onRefreshError })
    api.listPlugins.mockImplementation(async () => { throw Object.assign(new Error('נפל'), { status: 500 }) })
    let ok
    await act(async () => { ok = await result.current.refresh() })
    expect(ok).toBe(false)
    expect(result.current.status).toBe('ready')
    expect(result.current.approved).toEqual([PLUGIN])
    expect(onRefreshError).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['התחברות שפגה', { sessionExpired: true, status: 401 }],
    ['אין הרשאה', { status: 403 }],
  ])('רענון שקט שנכשל ב%s — כן עובר למסך שגיאה', async (_, fields) => {
    const onRefreshError = vi.fn()
    const { result } = await ready({ onRefreshError })
    api.listPlugins.mockImplementation(async () => { throw Object.assign(new Error('x'), fields) })
    await act(async () => { await result.current.refresh() })
    expect(result.current.status).toBe('error')
    expect(onRefreshError).not.toHaveBeenCalled()
  })

  test('טעינה ראשונה שנכשלת — מסך שגיאה', async () => {
    api.listPlugins.mockImplementation(async () => { throw Object.assign(new Error('x'), { status: 500 }) })
    const { result } = renderHook(() => usePluginsData())
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  test('רענון שקט: כשל בקטגוריות לא מוחק את הקטגוריות שכבר נטענו', async () => {
    const { result } = await ready()
    api.listCategories.mockImplementation(async () => { throw new Error('נפל') })
    await act(async () => { await result.current.refresh() })
    expect(result.current.categories).toEqual(CATEGORIES)
  })

  test('כשל בקטגוריות בטעינה ראשונה לא חוסם', async () => {
    api.listCategories.mockImplementation(async () => { throw new Error('נפל') })
    const { result } = await ready()
    expect(result.current.categories).toBeNull()
  })
})
