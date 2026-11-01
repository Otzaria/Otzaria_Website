// בדיקות ל-useLocalWordBoxes: GET לתיבות שמורות בטעינה, זיהוי בלחיצה עם tesseract מדומה
// (נתיבי הנכסים המאוחסנים אצלנו, תיבות מוקטנות לפי scale), PUT עם expectedVersion, ושגיאות בעברית.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLocalWordBoxes, detectionScale, LOCAL_ONLY_NOTICE, readLocalWords, canStartLocalWordDetection } from './useLocalWordBoxes'

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const STORED = {
  source: 'local-tesseract', size: [100, 200], version: 3,
  lines: [{ bbox: [0, 0, 90, 20], stream: 'main', words: [{ bbox: [0, 0, 40, 20] }, { bbox: [50, 0, 90, 20], text: 'א' }] }],
}

test('זיהוי מקומי חסום עד שבדיקת הפריסה השמורה מסתיימת', () => {
  expect(canStartLocalWordDetection('checking')).toBe(false)
  expect(canStartLocalWordDetection('detecting')).toBe(false)
  expect(canStartLocalWordDetection('saving')).toBe(false)
  expect(canStartLocalWordDetection('none')).toBe(true)
  expect(canStartLocalWordDetection('ready')).toBe(true)
})

// תוצאת tesseract v7 (blocks) בתמונה מוגדלת פי 2
const TESS = {
  data: {
    blocks: [{ paragraphs: [{ lines: [{
      text: 'שלום עולם',
      bbox: { x0: 20, y0: 20, x1: 180, y1: 60 },
      words: [
        { text: 'עולם', confidence: 80, bbox: { x0: 20, y0: 20, x1: 90, y1: 60 } },
        { text: 'שלום', confidence: 95, bbox: { x0: 110, y0: 20, x1: 180, y1: 60 } },
      ],
    }] }] }],
  },
}

function tesseractMock({ recognize = vi.fn().mockResolvedValue(TESS) } = {}) {
  const worker = { setParameters: vi.fn().mockResolvedValue(undefined), recognize, terminate: vi.fn().mockResolvedValue(undefined) }
  const createWorker = vi.fn(async (_l, _o, opts) => {
    opts.logger?.({ status: 'recognizing text', progress: 0.5 })
    return worker
  })
  return { mod: { default: { createWorker, OEM: { LSTM_ONLY: 1 }, PSM: { AUTO: '3' } } }, createWorker, worker }
}

const loadImage = vi.fn().mockResolvedValue({ image: 'CANVAS', size: [100, 200], scale: 2 })

beforeEach(() => {
  vi.restoreAllMocks()
  loadImage.mockClear()
})

describe('useLocalWordBoxes', () => {
  test('בלי pageId — idle, בלי בקשות', () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: null }))
    expect(result.current.status).toBe('idle')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('תיבות שמורות → ready עם מבנה אחיד (source local), בלי זיהוי', async () => {
    global.fetch = vi.fn().mockResolvedValue(json(200, { success: true, data: { version: 3, layout: STORED } }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage }))
    expect(result.current.status).toBe('checking')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(global.fetch).toHaveBeenCalledWith('/api/page-layout?pageId=p1', expect.objectContaining({ cache: 'no-store' }))
    expect(result.current.source).toMatchObject({ level: 'word', source: 'local', size: [100, 200] })
    expect(result.current.source.lines[0].words.map((w) => w.bbox[0])).toEqual([50, 0])
    expect(loadImage).not.toHaveBeenCalled()
  })

  test('אין שמורות → none; detect מזהה, מקטין לפי scale, שומר עם expectedVersion', async () => {
    const { mod, createWorker, worker } = tesseractMock()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 0, layout: null } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 0, layout: null, image: { sha256: 'a'.repeat(64) } } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 1, wordCount: 2 } }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))

    let track
    await act(async () => {
      track = await result.current.detect()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBe(null)
    expect(loadImage).toHaveBeenCalledWith('/img.jpg', {})

    const [lang, oem, opts] = createWorker.mock.calls[0]
    expect([lang, oem]).toEqual(['heb', 1])
    expect(opts).toMatchObject({
      workerPath: `${window.location.origin}/vendor/tesseract/v7.0.0/worker.min.js`,
      corePath: `${window.location.origin}/vendor/tesseract/v7.0.0/core`,
      langPath: `${window.location.origin}/vendor/tesseract/lang/heb-4.0.0_best_int`,
      workerBlobURL: false,
    })
    expect(worker.recognize).toHaveBeenCalledWith('CANVAS', {}, { blocks: true, text: false })
    expect(worker.terminate).toHaveBeenCalled()

    expect(track.lines[0].bbox).toEqual([10, 10, 90, 30])
    expect(result.current.source).toBe(track)
    expect(global.fetch.mock.calls[1][0]).toContain('inspectImage=1')
    const [url, init] = global.fetch.mock.calls[2]
    expect([url, init.method]).toEqual(['/api/page-layout', 'PUT'])
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({ pageId: 'p1', expectedVersion: 0, source: 'local-tesseract', size: [100, 200] })
    expect(sent.lines[0].words).toEqual([
      { bbox: [55, 10, 90, 30], text: 'שלום', conf: 0.95 },
      { bbox: [10, 10, 45, 30], text: 'עולם', conf: 0.8 },
    ])
  })

  test('layout שנשמר בין הבדיקה הראשונה ללחיצה — נטען במקום OCR', async () => {
    const { mod, createWorker } = tesseractMock()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 0, layout: null } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 3, layout: STORED, image: { sha256: 'c'.repeat(64) } } }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    let track
    await act(async () => { track = await result.current.detect() })
    expect(track).toMatchObject({ level: 'word', source: 'local' })
    expect(result.current.status).toBe('ready')
    expect(loadImage).not.toHaveBeenCalled()
    expect(createWorker).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('שמירה נכשלת (409) — התיבות נשארות, הודעה בעברית', async () => {
    const { mod } = tesseractMock()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 2, layout: null } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 2, layout: null, image: { sha256: 'b'.repeat(64) } } }))
      .mockResolvedValueOnce(json(409, { error: 'x' }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    await act(async () => {
      await result.current.detect()
    })
    expect(JSON.parse(global.fetch.mock.calls[2][1].body).expectedVersion).toBe(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.source?.level).toBe('word')
    expect(result.current.error).toBe('התיבות של העמוד עודכנו בינתיים על ידי משתמש אחר')
  })

  test('רגרסיה: תשובת שמירה של עמוד קודם שמגיעה אחרי מעבר עמוד לא דורסת את גרסת העמוד החדש', async () => {
    const { mod } = tesseractMock()
    let resolveOldPut
    const puts = []
    global.fetch = vi.fn((url, init) => {
      if (init?.method === 'PUT') {
        const sent = JSON.parse(init.body)
        puts.push(sent)
        if (sent.pageId === 'p1') return new Promise((r) => { resolveOldPut = r })
        return Promise.resolve(json(200, { success: true, data: { version: 8 } }))
      }
      const version = url.includes('pageId=p1') ? 1 : 7
      return Promise.resolve(json(200, { success: true, data: { version, layout: null } }))
    })
    const { result, rerender } = renderHook((p) => useLocalWordBoxes(p), {
      initialProps: { pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod },
    })
    await waitFor(() => expect(result.current.status).toBe('none'))
    let oldDetect
    act(() => {
      oldDetect = result.current.detect()
    })
    await waitFor(() => expect(puts).toHaveLength(1))

    // מעבר לעמוד p2 בזמן שהשמירה של p1 עוד בדרך
    rerender({ pageId: 'p2', imageUrl: '/img2.jpg', loadImage, loadTesseract: async () => mod })
    await waitFor(() => expect(result.current.status).toBe('none'))
    await act(async () => {
      resolveOldPut(json(200, { success: true, data: { version: 2 } }))
      await oldDetect
    })

    await act(async () => {
      await result.current.detect()
    })
    expect(puts[1]).toMatchObject({ pageId: 'p2', expectedVersion: 7 })
    expect(result.current.error).toBe(null)
  })

  test('שולח את hash התמונה מה-GET; 409 של תמונה שהוחלפה — הודעה משלה (QA P2-12)', async () => {
    const { mod } = tesseractMock()
    const sha = 'a'.repeat(64)
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 0, layout: null, image: { sha256: sha } } }))
      .mockResolvedValueOnce(json(409, { error: 'x', code: 'image-changed' }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    await act(async () => {
      await result.current.detect()
    })
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).imageSha256).toBe(sha)
    expect(result.current.error).toBe('תמונת העמוד הוחלפה מאז שנטענה — טען את העמוד מחדש')
  })

  test('unmount בזמן זיהוי — ה-worker נעצר (terminate) ואין PUT', async () => {
    let release
    const { mod, worker } = tesseractMock({ recognize: vi.fn(() => new Promise((r) => { release = r })) })
    global.fetch = vi.fn().mockResolvedValue(json(200, { success: true, data: { version: 0, layout: null } }))
    const { result, unmount } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    let pending
    act(() => { pending = result.current.detect() })
    await waitFor(() => expect(worker.recognize).toHaveBeenCalled())
    unmount()
    await waitFor(() => expect(worker.terminate).toHaveBeenCalled())
    release(TESS)
    await pending
    expect(global.fetch).toHaveBeenCalledTimes(2) // GET רגיל + snapshot לפני זיהוי
  })

  test('קובץ שפה חסר / אין מילים / תמונה לא נטענה — none עם שגיאה, בלי PUT', async () => {
    global.fetch = vi.fn().mockResolvedValue(json(200, { success: true, data: { version: 0, layout: null } }))
    const missing = tesseractMock({ recognize: vi.fn().mockRejectedValue(new Error('Network error while fetching /x/heb.traineddata.gz. Response code: 404')) })
    const { result, rerender } = renderHook((p) => useLocalWordBoxes(p), {
      initialProps: { pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => missing.mod },
    })
    await waitFor(() => expect(result.current.status).toBe('none'))
    await act(async () => {
      await result.current.detect()
    })
    expect(result.current.error).toBe('קובץ השפה לזיהוי מילים חסר בשרת — פנה למנהל האתר')
    // recognize נכשל, אבל ה-worker שנוצר משוחרר
    await waitFor(() => expect(missing.worker.terminate).toHaveBeenCalled())

    const empty = tesseractMock({ recognize: vi.fn().mockResolvedValue({ data: { blocks: [] } }) })
    rerender({ pageId: 'p1', imageUrl: '/img.jpg', loadImage, loadTesseract: async () => empty.mod })
    await act(async () => {
      await result.current.detect()
    })
    expect(result.current.error).toBe('לא זוהו מילים בעמוד')

    rerender({ pageId: 'p1', imageUrl: '/img.jpg', loadImage: vi.fn().mockRejectedValue(new Error('x')), loadTesseract: async () => empty.mod })
    await act(async () => {
      await result.current.detect()
    })
    expect(result.current.error).toBe('טעינת תמונת העמוד נכשלה')
    expect(global.fetch.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true)
  })

  test('GET נכשל (403) — none עם הודעת השרת', async () => {
    global.fetch = vi.fn().mockResolvedValue(json(403, { error: 'הדף נמצא בטיפול על ידי משתמש אחר' }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg' }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    expect(result.current.error).toBe('הדף נמצא בטיפול על ידי משתמש אחר')
  })

  test('detectionScale: מגדיל רק תמונה צרה, עד פי 2', () => {
    expect(detectionScale(2000)).toBe(1)
    expect(detectionScale(1000)).toBe(2)
    expect(detectionScale(1200)).toBe(2)
    expect(detectionScale(1400)).toBeCloseTo(2400 / 1400)
    expect(detectionScale(0)).toBe(1)
  })
})

describe('useLocalWordBoxes — עמוד שלא נתפס (canSave=false)', () => {
  beforeEach(() => window.sessionStorage.clear())

  test('זיהוי לא נשלח לשרת (בלי 403) — נשמר בזיכרון ובמטמון הלשונית, עם הודעה עדינה', async () => {
    const { mod } = tesseractMock()
    global.fetch = vi.fn().mockResolvedValue(json(200, { success: true, data: { version: 0, layout: null } }))
    const { result } = renderHook(() => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', canSave: false, loadImage, loadTesseract: async () => mod }))
    await waitFor(() => expect(result.current.status).toBe('none'))
    await act(async () => {
      await result.current.detect()
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBe(null)
    expect(result.current.notice).toBe(LOCAL_ONLY_NOTICE)
    expect(result.current.source?.level).toBe('word')
    expect(readLocalWords('p1', '/img.jpg')?.source).toBe('local-tesseract')
    expect(readLocalWords('p1', '/other.jpg')).toBe(null)
  })

  test('אחרי רענון — נטען מהמטמון; כשהעמוד נתפס — נשמר בשרת והמטמון מתנקה', async () => {
    window.sessionStorage.setItem('local-word-boxes:p1', JSON.stringify({ imageUrl: '/img.jpg', stored: STORED }))
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 0, layout: null } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { version: 1 } }))
    const { result, rerender } = renderHook(({ canSave }) => useLocalWordBoxes({ pageId: 'p1', imageUrl: '/img.jpg', canSave, loadImage }), { initialProps: { canSave: false } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notice).toBe(LOCAL_ONLY_NOTICE)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    rerender({ canSave: true })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    const [url, init] = global.fetch.mock.calls[1]
    expect([url, init.method]).toEqual(['/api/page-layout', 'PUT'])
    expect(JSON.parse(init.body)).toMatchObject({ pageId: 'p1', expectedVersion: 0, source: 'local-tesseract' })
    await waitFor(() => expect(result.current.notice).toBe(null))
    expect(result.current.error).toBe(null)
    expect(readLocalWords('p1', '/img.jpg')).toBe(null)
  })
})
