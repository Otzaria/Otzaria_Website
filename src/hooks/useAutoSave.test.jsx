// בדיקות ל-useAutoSave: מוודאות ש-debouncedSave שולח בקשה ל-/api/page-content אחרי
// שהות (debounce), מעדכן את הסטטוס ל-saved בהצלחה, ול-error כשהשרת מחזיר תשובה שלילית -
// מבלי לחשוף למשתמש את הודעת השגיאה עצמה (רק את הסטטוס).
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAutoSave', () => {
  test('שומר בהצלחה לאחר ה-debounce ומעדכן סטטוס ל-saved', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'נשמר בהצלחה', pageStatus: 'in-progress' })
    })

    const { result } = renderHook(() => useAutoSave())

    act(() => {
      result.current.save({ bookPath: 'some-book', pageNumber: 1, content: 'תוכן' })
    })

    expect(result.current.status).toBe('unsaved')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/page-content',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )
    const [, options] = global.fetch.mock.calls[0]
    const sentBody = JSON.parse(options.body)
    expect(sentBody).toMatchObject({ bookPath: 'some-book', pageNumber: 1, content: 'תוכן' })

    expect(result.current.status).toBe('saved')
  })

  test('מעדכן סטטוס ל-error כשהשרת מחזיר תשובה שלילית, בלי לזרוק החוצה', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: 'אין לך הרשאה לערוך דף זה' })
    })

    const { result } = renderHook(() => useAutoSave())

    act(() => {
      result.current.save({ bookPath: 'some-book', pageNumber: 1, content: 'תוכן' })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(result.current.status).toBe('error')
  })

  test('קריאות שמירה חוזרות בתוך חלון ה-debounce מבטלות את הקודמת (רק בקשה אחת יוצאת)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    })

    const { result } = renderHook(() => useAutoSave())

    act(() => {
      result.current.save({ bookPath: 'some-book', pageNumber: 1, content: 'א' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    act(() => {
      result.current.save({ bookPath: 'some-book', pageNumber: 1, content: 'אב' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    const sentBody = JSON.parse(options.body)
    expect(sentBody.content).toBe('אב')
  })
})
