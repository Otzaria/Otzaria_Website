// ההכרעות על דיווחים: הגנה מלחיצה כפולה (שתי קריאות לפני שה-busy מתעדכן — בקשה אחת), והחזרה למצב רגיל אחרי כשל.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const decidePageReport = vi.hoisted(() => vi.fn())
vi.mock('./pageReportsApi', () => ({ decidePageReport }))
vi.mock('@/components/admin/shell/useAdminBadgeCounts', () => ({ refreshAdminBadgeCounts: vi.fn() }))

import { usePageReportActions } from './usePageReportActions'

const report = { _id: 'r1', kind: 'book_error', status: 'pending', bookName: 'בראשית רבה', pageNumber: 12 }
const setup = () => {
  const data = { setData: vi.fn(), refresh: vi.fn(async () => true) }
  const toast = { show: vi.fn() }
  const { result } = renderHook(() => usePageReportActions({ query: { kind: 'book_error', status: 'all' }, data, toast, beforeRemove: vi.fn() }))
  return { result, data, toast }
}

beforeEach(() => { decidePageReport.mockReset() })

describe('usePageReportActions', () => {
  test('שתי הכרעות על אותו דיווח באותו רינדור (לחיצה כפולה / A ואז לחיצה) — בקשה אחת', async () => {
    let resolve
    decidePageReport.mockImplementation(() => new Promise((r) => { resolve = r }))
    const { result } = setup()
    let first
    let second
    await act(async () => {
      first = result.current.decide(report, 'approve', { applyToText: false })
      second = result.current.decide(report, 'approve', { applyToText: true })
    })
    expect(decidePageReport).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ report: { status: 'approved' }, applyResult: null }) })
    expect(await first).toBe(true)
    expect(await second).toBe(false)
  })

  test('אחרי כשל — אפשר לנסות שוב, וההודעה בכרטיס', async () => {
    decidePageReport.mockRejectedValueOnce(Object.assign(new Error('הטקסט השתנה בינתיים'), { status: 409 }))
    const { result, data } = setup()
    await act(async () => { await result.current.decide(report, 'reject') })
    expect(result.current.errors.get('r1')).toMatchObject({ text: 'הטקסט השתנה בינתיים' })
    expect(data.refresh).toHaveBeenCalled()
    decidePageReport.mockResolvedValueOnce({ report: { status: 'rejected' }, applyResult: null })
    await act(async () => { await result.current.decide(report, 'reject') })
    expect(decidePageReport).toHaveBeenCalledTimes(2)
    expect(result.current.errors.has('r1')).toBe(false)
  })
})
