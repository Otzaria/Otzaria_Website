import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/localCleanup', () => ({ runLocalOcrCleanup: vi.fn() }))

import { GET, POST } from './route'
import { runLocalOcrCleanup } from '@/lib/ocr/localCleanup'

const SECRET = 's'.repeat(40)
const req = (auth) =>
  new Request('http://localhost/api/cron/ocr-local-cleanup', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  })

const PURGE = {
  storageMissing: false,
  scanned: 2,
  jobsPurged: 1,
  inputsDeleted: 1,
  resultsDeleted: 1,
  rejectedDeleted: 0,
  kept: 1,
  tmpDeleted: 0,
  truncated: false,
  errors: 0,
  errorSamples: [],
}

describe('/api/cron/ocr-local-cleanup', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
    vi.mocked(runLocalOcrCleanup).mockReset()
    vi.mocked(runLocalOcrCleanup).mockResolvedValue({ resumed: { count: 0, ok: 0, results: [] }, purge: PURGE })
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })

  it('401 בלי כותרת / עם סוד שגוי — ולא מריץ ניקוי', async () => {
    for (const auth of [undefined, 'Bearer wrong', `Basic ${SECRET}`, SECRET]) {
      const res = await POST(req(auth))
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(runLocalOcrCleanup).not.toHaveBeenCalled()
  })

  it('500 כש-CRON_SECRET לא מוגדר', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(runLocalOcrCleanup).not.toHaveBeenCalled()
  })

  it('סוד נכון → מריץ ומחזיר את הסיכום (POST ו-GET)', async () => {
    for (const handler of [POST, GET]) {
      const res = await handler(req(`Bearer ${SECRET}`))
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.purge).toEqual(PURGE)
      expect(body.resumed).toEqual({
        count: 0,
        ok: 0,
        attempted: 0,
        succeeded: 0,
        contention: 0,
        failed: 0,
        failedCodes: {},
        results: [],
      })
      expect(typeof body.ranAt).toBe('string')
    }
    expect(runLocalOcrCleanup).toHaveBeenCalledTimes(2)
  })

  it('שורש אחסון חסר או שגיאות → ok:false (200, כדי שהסיכום יירשם בלוג)', async () => {
    vi.mocked(runLocalOcrCleanup).mockResolvedValue({
      resumed: { count: 0, ok: 0, results: [] },
      purge: { ...PURGE, storageMissing: true },
    })
    const body = await (await POST(req(`Bearer ${SECRET}`))).json()
    expect(body.ok).toBe(false)
  })

  it('השלמה שנכשלה (result_unavailable / חריגה) → ok:false עם סיכום, HTTP 200 (סקירה W08)', async () => {
    const results = [
      { jobId: 'j1', ok: true, code: 'applied' },
      { jobId: 'j2', ok: false, code: 'result_unavailable' },
      { jobId: 'j3', ok: false, code: 'MongoNetworkError' },
      { jobId: 'j4', ok: false, code: 'apply_in_progress' },
    ]
    vi.mocked(runLocalOcrCleanup).mockResolvedValue({ resumed: { count: 4, ok: 1, results }, purge: PURGE })
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.resumed).toEqual({
      count: 4,
      ok: 1,
      attempted: 4,
      succeeded: 1,
      contention: 1,
      failed: 2,
      failedCodes: { result_unavailable: 1, MongoNetworkError: 1 },
      results,
    })
  })

  it('השחזור היחיד נכשל (result_unavailable) → ok:false (שחזור W08)', async () => {
    vi.mocked(runLocalOcrCleanup).mockResolvedValue({
      resumed: { count: 1, ok: 0, results: [{ jobId: 'j1', ok: false, code: 'result_unavailable' }] },
      purge: PURGE,
    })
    const body = await (await POST(req(`Bearer ${SECRET}`))).json()
    expect(body.ok).toBe(false)
  })

  it('תחרות צפויה בלבד (apply_in_progress/not_stalled/not_found) והצלחות (applied/cancelled/already_closed) → ok:true', async () => {
    const results = ['apply_in_progress', 'not_stalled', 'not_found']
      .map((code) => ({ jobId: code, ok: false, code }))
      .concat(['applied', 'cancelled', 'already_closed'].map((code) => ({ jobId: code, ok: true, code })))
    vi.mocked(runLocalOcrCleanup).mockResolvedValue({ resumed: { count: 6, ok: 3, results }, purge: PURGE })
    const body = await (await POST(req(`Bearer ${SECRET}`))).json()
    expect(body.ok).toBe(true)
    expect(body.resumed).toMatchObject({ attempted: 6, succeeded: 3, contention: 3, failed: 0, failedCodes: {} })
  })

  it('חריגה → 500 cleanup_failed בלי פרטים', async () => {
    vi.mocked(runLocalOcrCleanup).mockRejectedValue(new Error('secret detail'))
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'cleanup_failed' })
  })
})
