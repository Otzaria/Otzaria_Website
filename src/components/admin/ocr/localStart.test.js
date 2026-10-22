import { describe, it, expect, vi } from 'vitest'
import {
  START_URL,
  classifyStartResponse,
  clearRequestId,
  loadRequestId,
  localParamsKey,
  newRequestId,
  postLocalStart,
  saveRequestId,
} from './localStart'

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

describe('newRequestId', () => {
  it('randomUUID כשקיים, ואחרת hex מ-getRandomValues — תמיד תואם לולידציית השרת', () => {
    expect(newRequestId({ randomUUID: () => 'abc-123-def' })).toBe('abc-123-def')
    const id = newRequestId({ getRandomValues: (a) => a.fill(171) })
    expect(id).toBe('ab'.repeat(16))
    expect(newRequestId({})).toMatch(REQUEST_ID_RE)
    expect(newRequestId()).toMatch(REQUEST_ID_RE)
  })
})

describe('אחסון requestId', () => {
  const memStore = () => {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }
  }
  const key = localParamsKey({ bookId: 'b1', existingTextMode: 'skip', options: { lm: 'rabbinic', defaultScript: 'square' } })

  it('נטען רק לאותם פרמטרים', () => {
    const store = memStore()
    saveRequestId(store, 'b1', key, 'req-1-abcdef')
    expect(loadRequestId(store, 'b1', key)).toBe('req-1-abcdef')
    const other = localParamsKey({ bookId: 'b1', existingTextMode: 'overwrite', options: { lm: 'rabbinic', defaultScript: 'square' } })
    expect(loadRequestId(store, 'b1', other)).toBeNull()
    expect(loadRequestId(store, 'b2', key)).toBeNull()
    clearRequestId(store, 'b1')
    expect(loadRequestId(store, 'b1', key)).toBeNull()
  })

  it('אחסון שזורק או חסר — בלי חריגה', () => {
    const throwing = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(loadRequestId(throwing, 'b1', key)).toBeNull()
    expect(() => saveRequestId(throwing, 'b1', key, 'id')).not.toThrow()
    expect(() => clearRequestId(throwing, 'b1')).not.toThrow()
    expect(loadRequestId(null, 'b1', key)).toBeNull()
    expect(loadRequestId({ getItem: () => '{bad json' }, 'b1', key)).toBeNull()
  })
})

describe('classifyStartResponse', () => {
  it('202 עם מצב פעיל — התחיל', () => {
    expect(classifyStartResponse(202, { success: true, jobId: 'j', status: 'queued' })).toMatchObject({ kind: 'started', jobId: 'j' })
    expect(classifyStartResponse(202, { success: true, jobId: 'j', status: 'running' }).kind).toBe('started')
  })

  it('202 עם failed/cancelled/completed — לא "התחיל", ה-requestId מתחדש', () => {
    for (const status of ['failed', 'cancelled', 'completed']) {
      const r = classifyStartResponse(202, { success: true, jobId: 'j', status })
      expect(r.kind).toBe('error')
      expect(r.keepRequestId).toBe(false)
      expect(r.refresh).toBe(true)
    }
    expect(classifyStartResponse(202, { success: true, status: 'failed' }).message).toMatch(/נכשלה/)
    expect(classifyStartResponse(202, { success: true, status: 'cancelled' }).message).toMatch(/בוטלה/)
  })

  it('זמניים — ניסיון חוזר', () => {
    expect(classifyStartResponse(0, {}).kind).toBe('retry')
    expect(classifyStartResponse(409, { code: 'preparing', error: 'בהכנה' }).kind).toBe('retry')
    expect(classifyStartResponse(502, {}).kind).toBe('retry')
    expect(classifyStartResponse(503, { code: 'busy' }).kind).toBe('retry')
    expect(classifyStartResponse(503, {}).kind).toBe('retry')
    expect(classifyStartResponse(504, {}).kind).toBe('retry')
  })

  it('סופיים — הודעה עברית מהשרת, requestId מתחדש', () => {
    const r400 = classifyStartResponse(400, { error: 'חלוקה לטורים אינה נתמכת', code: 'split_columns_unsupported' })
    expect(r400).toMatchObject({ kind: 'error', message: 'חלוקה לטורים אינה נתמכת', keepRequestId: false })
    expect(classifyStartResponse(409, { code: 'active_job', error: 'כבר קיימת עבודה' })).toMatchObject({ kind: 'error', keepRequestId: false, refresh: true })
    expect(classifyStartResponse(409, { code: 'request_conflict', error: 'שימש' }).keepRequestId).toBe(false)
    expect(classifyStartResponse(413, {}).message).toBe('הספר גדול מדי לעיבוד במחשב המקומי')
    expect(classifyStartResponse(503, { code: 'local_not_configured', error: 'ספק המחשב המקומי אינו מוגדר בשרת' })).toMatchObject({ kind: 'error', keepRequestId: false })
  })

  it('422 — עם מספרי העמודים', () => {
    const r = classifyStartResponse(422, { error: 'חסרות תמונות', code: 'missing_image', pageNumbers: [3, 7] })
    expect(r.message).toBe('חסרות תמונות (עמודים: 3, 7)')
    const many = classifyStartResponse(422, { error: 'X', pageNumbers: Array.from({ length: 20 }, (_, i) => i + 1) })
    expect(many.message).toMatch(/ועוד 5\)$/)
  })

  it('500 — אותו requestId נשמר (ההכנה נמשכת בלחיצה חוזרת)', () => {
    const r = classifyStartResponse(500, { error: 'הכנת קובץ הקלט נכשלה בשל תקלה זמנית. אפשר לנסות שוב', code: 'preparation_retry' })
    expect(r).toMatchObject({ kind: 'error', keepRequestId: true })
  })

  it('גוף שאינו אובייקט', () => {
    expect(classifyStartResponse(400, null).message).toBe('הבקשה אינה תקינה')
  })
})

describe('postLocalStart', () => {
  const reply = (status, body) => ({ status, json: async () => body })
  const payload = { bookId: 'b', method: 'local', requestId: 'req-xyz-123456' }

  it('ניסיון חוזר עם אותו payload עד להצלחה', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 504, json: async () => { throw new SyntaxError('html') } })
      .mockResolvedValueOnce(reply(409, { code: 'preparing' }))
      .mockResolvedValueOnce(reply(202, { success: true, jobId: 'j', status: 'queued' }))
    const onRetry = vi.fn()
    const sleep = vi.fn().mockResolvedValue(undefined)
    const r = await postLocalStart({ payload, fetchImpl, sleep, onRetry, delayMs: 5000 })
    expect(r.kind).toBe('started')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    for (const call of fetchImpl.mock.calls) {
      expect(call[0]).toBe(START_URL)
      expect(JSON.parse(call[1].body)).toEqual(payload)
    }
    expect(sleep.mock.calls.every((c) => c[0] === 5000)).toBe(true)
    expect(onRetry.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })

  it('אחרי מיצוי הניסיונות — שגיאה ששומרת את ה-requestId', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'))
    const r = await postLocalStart({ payload, fetchImpl, sleep: async () => {}, attempts: 6 })
    expect(fetchImpl).toHaveBeenCalledTimes(7)
    expect(r).toMatchObject({ kind: 'error', keepRequestId: true })
    expect(r.message).toMatch(/לא תיווצר עבודה כפולה/)
  })

  it('ביטול (סגירת הדיאלוג) בזמן ההמתנה — ההמתנה נקטעת ואין ניסיון חוזר נוסף', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const fetchImpl = vi.fn().mockResolvedValue(reply(503, { error: 'עמוס' }))
      const pending = postLocalStart({ payload, fetchImpl, delayMs: 60000, signal: controller.signal })
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)
      controller.abort()
      // בלי לקדם את השעון: ההמתנה של 60 שניות מסתיימת מיד עם הביטול
      await expect(pending).resolves.toEqual({ kind: 'aborted' })
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(10 * 60000)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ביטול בזמן שהבקשה בדרך — aborted גם אם התשובה הגיעה, ובלי לסווג אותה', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const sleep = vi.fn()
    const r = await postLocalStart({ payload, fetchImpl, sleep, signal: controller.signal })
    expect(r).toEqual({ kind: 'aborted' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('signal שכבר בוטל — לא שולחים כלל', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn()
    expect(await postLocalStart({ payload, fetchImpl, signal: controller.signal })).toEqual({ kind: 'aborted' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('תשובה סופית — בלי ניסיון חוזר', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(413, { error: 'גדול מדי' }))
    const r = await postLocalStart({ payload, fetchImpl, sleep: async () => {} })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(r.message).toBe('גדול מדי')
  })
})
