import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useScanLines,
  clearScanLinesCache,
  scanLinesMemoryCacheKeys,
  SCAN_ANALYSIS_DELAY_MS,
  SCAN_LINES_MEMORY_LIMIT,
} from './useScanLines'

// עמוד 200×120 עם שלוש שורות של שלוש "מילים". הרווחים בין המילים לא מיושרים אנכית — אחרת
// הם נראים כתעלה בין שני טורים (scanProfile.findGutter)
const ROWS = [
  [20, [[20, 60], [80, 120], [140, 180]]],
  [50, [[20, 90], [110, 150], [160, 180]]],
  [80, [[20, 50], [70, 130], [150, 180]]],
]
function fakePage(w, h) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [y, words] of ROWS) {
    for (const [a, b] of words) {
      for (let yy = y; yy < y + 12; yy++) for (let x = a; x < b; x++) px.fill(0, (yy * w + x) * 4, (yy * w + x) * 4 + 3)
    }
  }
  return px
}

let images
let getContext
beforeEach(() => {
  clearScanLinesCache()
  window.sessionStorage.clear()
  images = []
  class FakeImage {
    constructor() {
      this.naturalWidth = 200
      this.naturalHeight = 120
      images.push(this)
    }
    set src(v) {
      this._src = v
      setTimeout(() => (v.includes('broken') ? this.onerror?.() : this.onload?.()), 0)
    }
    get src() {
      return this._src
    }
  }
  vi.stubGlobal('Image', FakeImage)
  getContext = vi.fn(() => ({ drawImage: vi.fn(), getImageData: (x, y, w, h) => ({ data: fakePage(w, h) }) }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useScanLines', () => {
  it('ממדי התמונה + שורות מהפרופיל, נשמר במטמון הלשונית', async () => {
    const { result } = renderHook(() => useScanLines('/uploads/p1.jpg'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.size).toEqual([200, 120])
    expect(result.current.profile.lines).toHaveLength(3)
    expect(result.current.profile.lines[0].words).toHaveLength(3)
    expect(JSON.parse(window.sessionStorage.getItem('scanProfile:v3:/uploads/p1.jpg')).lines).toHaveLength(3)
    // טעינה חוזרת — מהמטמון, בלי תמונה חדשה
    clearScanLinesCache()
    const calls = getContext.mock.calls.length
    const again = renderHook(() => useScanLines('/uploads/p1.jpg'))
    expect(again.result.current.status).toBe('ready')
    // התמונה נטענת רק לאימות הממדים וטביעת האצבע (canvas אחד של 16×16) — בלי ניתוח חוזר
    await waitFor(() => expect(images.at(-1)._src).toBe('/uploads/p1.jpg'))
    await new Promise((r) => setTimeout(r, 20))
    expect(again.result.current.status).toBe('ready')
    expect(getContext.mock.calls.length).toBe(calls + 1)
  })

  it('פרופיל שמור לכתובת שהתמונה בה הוחלפה (ממדים אחרים) → נזרק ומנותח מחדש', async () => {
    window.sessionStorage.setItem('scanProfile:v3:/uploads/p2.jpg', JSON.stringify({ size: [999, 777], lines: [], threshold: 128 }))
    const { result } = renderHook(() => useScanLines('/uploads/p2.jpg'))
    expect(result.current.size).toEqual([999, 777])
    await waitFor(() => expect(result.current.size).toEqual([200, 120]))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.profile.lines).toHaveLength(3)
    expect(JSON.parse(window.sessionStorage.getItem('scanProfile:v3:/uploads/p2.jpg')).size).toEqual([200, 120])
  })

  it('פרופיל שמור לתמונה אחרת באותן מידות (טביעת אצבע שונה) → נזרק ומנותח מחדש', async () => {
    const stale = { size: [200, 120], lines: [], threshold: 128, fp: Array(256).fill(0) }
    window.sessionStorage.setItem('scanProfile:v3:/uploads/p5.jpg', JSON.stringify(stale))
    const { result } = renderHook(() => useScanLines('/uploads/p5.jpg'))
    expect(result.current.profile.lines).toHaveLength(0)
    await waitFor(() => expect(result.current.profile?.lines).toHaveLength(3))
    const saved = JSON.parse(window.sessionStorage.getItem('scanProfile:v3:/uploads/p5.jpg'))
    expect(saved.fp).toHaveLength(256)
    expect(saved.fp[0]).toBeGreaterThan(200)
  })

  it('analyze=false — רק ממדים, בלי canvas', async () => {
    const { result } = renderHook(() => useScanLines('/uploads/p2.jpg', { analyze: false }))
    await waitFor(() => expect(result.current.size).toEqual([200, 120]))
    expect(result.current.profile).toBeNull()
    expect(result.current.status).toBe('idle')
    expect(getContext).not.toHaveBeenCalled()
  })

  it('תמונה שלא נטענה / canvas מוכתם → error בשקט; בלי כתובת → idle', async () => {
    const broken = renderHook(() => useScanLines('/uploads/broken.jpg'))
    await waitFor(() => expect(broken.result.current.status).toBe('error'))
    getContext.mockImplementation(() => ({ drawImage() {}, getImageData() { throw new Error('tainted') } }))
    const tainted = renderHook(() => useScanLines('/uploads/p3.jpg'))
    await waitFor(() => expect(tainted.result.current.status).toBe('error'))
    expect(tainted.result.current.size).toEqual([200, 120])
    expect(renderHook(() => useScanLines(null)).result.current.status).toBe('idle')
  })

  it('sessionStorage חסום — עדיין עובד מהזיכרון', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const { result } = renderHook(() => useScanLines('/uploads/p4.jpg'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('עם Worker + OffscreenCanvas — הניתוח רץ ב-Worker ולא ב-canvas של הדף', async () => {
    const posted = []
    class FakeWorker {
      constructor(u, o) {
        this.url = String(u)
        this.opts = o
      }
      postMessage(msg, transfer) {
        posted.push({ msg, transfer, url: this.url, opts: this.opts })
        setTimeout(() => this.onmessage?.({ data: { id: msg.id, profile: { size: [200, 120], lines: [{ bbox: [0, 0, 1, 1] }], threshold: 100 } } }), 0)
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 200, height: 120, close() {} })))
    const { result } = renderHook(() => useScanLines('/uploads/w1.jpg'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.profile.lines).toHaveLength(1)
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toContain('scanProfile.worker')
    expect(posted[0].opts).toEqual({ type: 'module' })
    expect(posted[0].transfer).toEqual([posted[0].msg.bitmap])
    expect(getContext).not.toHaveBeenCalled()
  })

  it('ניווט מהיר לפני ההשהיה אינו מנתח עמוד מעבר', async () => {
    vi.useFakeTimers()
    const posted = []
    class FakeWorker {
      postMessage(msg) { posted.push(msg) }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 200, height: 120, close() {} })))
    const hook = renderHook(({ url }) => useScanLines(url), { initialProps: { url: '/uploads/transit.jpg' } })

    await act(async () => { await vi.advanceTimersByTimeAsync(1) }) // טעינת תמונת עמוד המעבר
    hook.rerender({ url: '/uploads/final.jpg' })
    await act(async () => { await vi.advanceTimersByTimeAsync(1 + SCAN_ANALYSIS_DELAY_MS) })

    expect(posted).toHaveLength(1)
    expect(images.at(-1)._src).toBe('/uploads/final.jpg')
    hook.unmount()
    vi.useRealTimers()
  })

  it('מעבר עמוד מבטל worker פעיל כדי שהעמוד החדש לא ימתין בתור', async () => {
    vi.useFakeTimers()
    const workers = []
    class FakeWorker {
      constructor() { this.terminated = false; this.posted = []; workers.push(this) }
      postMessage(msg) { this.posted.push(msg) }
      terminate() { this.terminated = true }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 200, height: 120, close() {} })))
    const hook = renderHook(({ url }) => useScanLines(url), { initialProps: { url: '/uploads/slow.jpg' } })

    await act(async () => { await vi.advanceTimersByTimeAsync(1 + SCAN_ANALYSIS_DELAY_MS) })
    expect(workers[0].posted).toHaveLength(1)
    hook.rerender({ url: '/uploads/current.jpg' })
    expect(workers[0].terminated).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1 + SCAN_ANALYSIS_DELAY_MS) })

    expect(workers).toHaveLength(2)
    expect(workers[1].posted).toHaveLength(1)
    hook.unmount()
    vi.useRealTimers()
  })

  it('מטמון הזיכרון הוא LRU מוגבל; sessionStorage ממשיך להחזיק עמודים ישנים', () => {
    for (let i = 0; i <= SCAN_LINES_MEMORY_LIMIT; i++) {
      const url = `/uploads/cached-${i}.jpg`
      window.sessionStorage.setItem(`scanProfile:v3:${url}`, JSON.stringify({ size: [200, 120], lines: [] }))
      const hook = renderHook(() => useScanLines(url))
      expect(hook.result.current.status).toBe('ready')
      hook.unmount()
    }

    const keys = scanLinesMemoryCacheKeys()
    expect(keys).toHaveLength(SCAN_LINES_MEMORY_LIMIT)
    expect(keys).not.toContain('/uploads/cached-0.jpg')
    expect(keys.at(-1)).toBe(`/uploads/cached-${SCAN_LINES_MEMORY_LIMIT}.jpg`)
    expect(window.sessionStorage.getItem('scanProfile:v3:/uploads/cached-0.jpg')).not.toBeNull()
  })
})
