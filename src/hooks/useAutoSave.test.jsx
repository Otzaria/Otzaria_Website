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

  test('saveNow שומר מיד ומבטל את השמירה המושהית', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const { result } = renderHook(() => useAutoSave())

    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 1, content: 'ישן' })
    })
    let ok
    await act(async () => {
      ok = await result.current.saveNow({ bookPath: 'b', pageNumber: 1, content: 'חדש' })
    })
    expect(ok).toBe(true)
    expect(result.current.status).toBe('saved')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).content).toBe('חדש')
  })

  test('flush שולח מיד את מה שממתין, ו-flush בלי שינוי לא שולח כלום', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const { result } = renderHook(() => useAutoSave())

    await act(async () => {
      await result.current.flush()
    })
    expect(global.fetch).not.toHaveBeenCalled()

    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 1, content: 'ממתין' })
    })
    await act(async () => {
      await result.current.flush()
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).content).toBe('ממתין')
  })

  test('שמירות יוצאות בטור: השנייה נשלחת רק אחרי שהראשונה חזרה', async () => {
    let resolveFirst
    global.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const { result } = renderHook(() => useAutoSave())

    let second
    await act(async () => {
      result.current.saveNow({ bookPath: 'b', pageNumber: 1, content: '1' })
      second = result.current.saveNow({ bookPath: 'b', pageNumber: 1, content: '2' })
      await Promise.resolve()
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveFirst({ ok: true, status: 200, json: async () => ({ success: true }) })
      await second
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).content).toBe('2')
  })
  test('רגרסיה: unmount עם שמירה שממתינה ל-debounce שולח אותה מיד (לא מבטל)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const { result, unmount } = renderHook(() => useAutoSave())

    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 1, content: 'הוקלד רגע לפני יציאה' })
    })
    expect(global.fetch).not.toHaveBeenCalled()
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).content).toBe('הוקלד רגע לפני יציאה')
    // והטיימר הישן לא שולח שוב
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('pagehide שולח את מה שממתין עם keepalive', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const { result, unmount } = renderHook(() => useAutoSave())
    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 2, content: 'לפני סגירה' })
    })
    window.dispatchEvent(new Event('pagehide'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/page-content')
    expect(options.keepalive).toBe(true)
    expect(JSON.parse(options.body)).toMatchObject({ bookPath: 'b', pageNumber: 2, content: 'לפני סגירה' })
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('pagehide עם גוף גדול (מעל 60KB בבתים) שולח ב-sendBeacon כ-application/json, בלי keepalive', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true, writable: true })
    const { result, unmount } = renderHook(() => useAutoSave())
    const content = 'א'.repeat(31000) // 62000 בתים
    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 3, content })
    })
    window.dispatchEvent(new Event('pagehide'))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/page-content')
    expect(blob.type).toBe('application/json')
    expect(JSON.parse(await blob.text()).content).toBe(content)
    unmount()
    delete navigator.sendBeacon
  })

  test('גוף גדול מדי גם ל-sendBeacon: beforeunload מבקש אישור, ואם sendBeacon נכשלה — נרשם ככישלון', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    const sendBeacon = vi.fn().mockReturnValue(false)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true, writable: true })
    const { result, unmount } = renderHook(() => useAutoSave())
    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 4, content: 'ב'.repeat(40000) }) // 80000 בתים
    })
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    // ניסיון אחרון: fetch רגיל, בלי keepalive
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][1].keepalive).toBeUndefined()
    expect(result.current.status).toBe('error')
    unmount()
    delete navigator.sendBeacon
  })

  test('beforeunload מבקש אישור רק כשהשמירה האחרונה נכשלה, ו-flush מנסה אותה שוב', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ success: false, error: 'x' }) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useAutoSave())

    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(fire()).toBe(false)
    act(() => {
      result.current.save({ bookPath: 'b', pageNumber: 1, content: 'ת' })
    })
    expect(fire()).toBe(false) // ממתין — pagehide ישלח אותו
    let ok
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(false)
    expect(fire()).toBe(true)

    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    await act(async () => {
      ok = await result.current.flush()
    })
    expect(ok).toBe(true)
    expect(JSON.parse(global.fetch.mock.calls.at(-1)[1].body).content).toBe('ת')
    expect(fire()).toBe(false)
  })
})
