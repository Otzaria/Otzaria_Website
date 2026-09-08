// בדיקות ל-useOCR: מוודאות ש-performGeminiOCR ו-performOCRWin (שמשתמשות ב-apiPost/apiUpload
// מ-api-utils) שולחות את הבקשה הנכונה, מחזירות את הטקסט בהצלחה, וזורקות שגיאה עם
// הודעת השרת כשהשרת מחזיר תשובה לא תקינה.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOCR } from './useOCR'

function mockFetchOnce(ok, data) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => data
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useOCR - performGeminiOCR', () => {
  test('מחזיר את הטקסט שהתקבל מהשרת בהצלחה', async () => {
    mockFetchOnce(true, { success: true, text: 'טקסט מזוהה' })
    const { result } = renderHook(() => useOCR())

    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    // מדמים FileReader כדי לא להיות תלויים במימוש אמיתי של קריאת קבצים
    const originalFileReader = global.FileReader
    global.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,QUJD'
        this.onloadend()
      }
    }

    let text
    await act(async () => {
      text = await result.current.performGeminiOCR(blob, 'key', 'gemini-1.5-flash', 'prompt')
    })

    expect(text).toBe('טקסט מזוהה')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/gemini-ocr',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )
    const [, options] = global.fetch.mock.calls[0]
    const sentBody = JSON.parse(options.body)
    expect(sentBody).toEqual({
      imageBase64: 'QUJD',
      model: 'gemini-1.5-flash',
      userApiKey: 'key',
      customPrompt: 'prompt'
    })

    global.FileReader = originalFileReader
  })

  test('זורק שגיאה עם הודעת השרת כשהבקשה נכשלת', async () => {
    mockFetchOnce(false, { error: 'Too many requests' })
    const { result } = renderHook(() => useOCR())

    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    const originalFileReader = global.FileReader
    global.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,QUJD'
        this.onloadend()
      }
    }

    await expect(
      act(async () => {
        await result.current.performGeminiOCR(blob, '', 'gemini-1.5-flash', '')
      })
    ).rejects.toThrow('Too many requests')

    global.FileReader = originalFileReader
  })
})

describe('useOCR - performOCRWin', () => {
  test('מחזיר את הטקסט שהתקבל מהשרת בהצלחה', async () => {
    mockFetchOnce(true, { success: true, text: 'טקסט מ-OCRWIN' })
    const { result } = renderHook(() => useOCR())

    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    let text
    await act(async () => {
      text = await result.current.performOCRWin(blob)
    })

    expect(text).toBe('טקסט מ-OCRWIN')
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/ocrwin')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
  })

  test('זורק שגיאה עם הודעת השרת כשהבקשה נכשלת', async () => {
    mockFetchOnce(false, { error: 'No file uploaded' })
    const { result } = renderHook(() => useOCR())

    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    await expect(
      act(async () => {
        await result.current.performOCRWin(blob)
      })
    ).rejects.toThrow('No file uploaded')
  })
})
