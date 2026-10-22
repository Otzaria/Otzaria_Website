// @vitest-environment node
// GET /api/worker/v1/jobs — מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — מדולג.
// מכסה: אימות (401/403 JSON + no-store), רשימה ריקה, רק עבודות לא-סגורות וגלויות של העובד
// (לא preparing/סגורות/של עובד אחר/gemini), צורת הפריט מול החוזה, מהישנה לחדשה, דפדוף (101 →
// 100+cursor ו-1+null), cursor יציב כשעבודות נסגרות/נוספות בין עמודים, limit ו-cursor לא תקינים,
// רשומה פגומה שמדולגת לבדה (cursor לפי האחרונה שנסרקה), שימוש באינדקס הרשימה (explain), ועדכון
// OcrWorkerState.lastSeenAt.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'
import OcrJob from '@/models/OcrJob'
import OcrWorkerState from '@/models/OcrWorkerState'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { GET } from './route'
import { listFilter } from '@/lib/ocr/localEnvelope'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const SECRET = 'S'.repeat(48)
const WORKER = 'worker-1'
const T = new Date('2026-10-19T08:00:00.000Z')
const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

const req = (qs = '', auth = `Bearer ${SECRET}`) =>
  new Request(`http://localhost/api/worker/v1/jobs${qs}`, { headers: auth ? { authorization: auth } : {} })

async function list(qs = '?limit=100') {
  const res = await GET(req(qs))
  return { res, body: await res.json() }
}

function jobDoc(over = {}) {
  const _id = new mongoose.Types.ObjectId()
  return {
    _id,
    book: new mongoose.Types.ObjectId(),
    method: 'local',
    taskType: 'ocr',
    status: 'queued',
    active: true,
    workerId: WORKER,
    requestId: `req-${_id}`,
    options: { lm: 'rabbinic', defaultScript: 'square' },
    inputPath: `${_id}/input-${SHA_A}.pdf`,
    inputSha256: SHA_A,
    inputBytes: 1234,
    pageMap: [
      { pdfPageIndex: 1, page: new mongoose.Types.ObjectId(), pageNumber: 3, expectedUpdatedAt: T, imageSha256: SHA_B },
      { pdfPageIndex: 2, page: new mongoose.Types.ObjectId(), pageNumber: 5, expectedUpdatedAt: T, imageSha256: SHA_B },
    ],
    ...over,
  }
}

const makeJob = async (over) => (await OcrJob.create(jobDoc(over))).toObject()

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
})

describe('GET /api/worker/v1/jobs', () => {
  it('בלי Bearer / סוד שגוי → 401 JSON עם no-store', async () => {
    for (const auth of [null, `Bearer ${'X'.repeat(48)}`, `bearer ${SECRET}`]) {
      const res = await GET(req('', auth))
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.json()).toEqual({ error: 'unauthorized' })
    }
  })

  it('תצורה חסרה בשרת → 403 worker_api_disabled', async () => {
    delete process.env.OCR_WORKER_SECRET
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'worker_api_disabled' })
  })

  it('רשימה ריקה → {items:[], nextCursor:null} עם no-store', async () => {
    const { res, body } = await list()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(body).toEqual({ items: [], nextCursor: null })
  })

  it('רק עבודות לא-סגורות וגלויות של העובד, מהישנה לחדשה, בצורת החוזה', async () => {
    const queued = await makeJob()
    await makeJob({ status: 'preparing', inputPath: undefined, inputSha256: undefined, inputBytes: undefined, pageMap: undefined })
    await makeJob({ status: 'completed', active: false })
    await makeJob({ status: 'failed', active: false })
    await makeJob({ status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel' })
    await makeJob({ workerId: 'worker-2' })
    await makeJob({ method: 'gemini', requestId: undefined, inputPath: undefined, inputSha256: undefined, pageMap: undefined, status: 'running' })
    const running = await makeJob({ status: 'running', cancelRequested: true, options: { lm: 'off' } })
    const attention = await makeJob({ status: 'needs_attention', options: undefined })
    const applying = await makeJob({ status: 'applying', decision: 'apply' })

    const { body } = await list()
    expect(body.nextCursor).toBeNull()
    expect(body.items.map((i) => i.jobId)).toEqual([queued, running, attention, applying].map((j) => String(j._id)))

    const [first, second, third, fourth] = body.items
    expect(first).toEqual({
      schemaVersion: 1,
      jobId: String(queued._id),
      taskType: 'ocr',
      workerId: WORKER,
      createdAt: queued.createdAt.toISOString(),
      inputSha256: SHA_A,
      options: { lm: 'rabbinic', defaultScript: 'square' },
      pageMap: queued.pageMap.map((e) => ({
        pdfPageIndex: e.pdfPageIndex,
        pageId: String(e.page),
        pageNumber: e.pageNumber,
        expectedUpdatedAt: '2026-10-19T08:00:00.000Z',
        imageSha256: SHA_B,
      })),
      cancelRequested: false,
      siteState: 'queued',
    })
    expect(Object.keys(first)).toEqual(['schemaVersion', 'jobId', 'taskType', 'workerId', 'createdAt', 'inputSha256', 'options', 'pageMap', 'cancelRequested', 'siteState'])
    expect(second).toMatchObject({ cancelRequested: true, siteState: 'in_progress', options: { lm: 'off' } })
    expect(third).toMatchObject({ siteState: 'in_progress', options: {} })
    expect(fourth.siteState).toBe('in_progress')
  })

  it('המעטפה זהה בין סבבים (immutable) — גם כשמשתנים שדות שאינם בה', async () => {
    const j = await makeJob()
    const before = (await list()).body.items[0]
    await OcrJob.updateOne({ _id: j._id }, { $set: { status: 'running', reportSeq: 7, processedPages: 1, lastSeenAt: new Date() } })
    const after = (await list()).body.items[0]
    const strip = ({ siteState, cancelRequested, ...env }) => env
    expect(JSON.stringify(strip(after))).toBe(JSON.stringify(strip(before)))
    expect(after.siteState).toBe('in_progress')
  })

  it('דפדוף: 101 עבודות → 100 עם cursor, ואחריו 1 עם null', async () => {
    const docs = Array.from({ length: 101 }, () => jobDoc())
    await OcrJob.insertMany(docs)
    const p1 = await list('?limit=100')
    expect(p1.body.items).toHaveLength(100)
    expect(p1.body.nextCursor).toBe(String(docs[99]._id))
    const p2 = await list(`?limit=100&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
    expect(p2.body.items).toHaveLength(1)
    expect(p2.body.items[0].jobId).toBe(String(docs[100]._id))
    expect(p2.body.nextCursor).toBeNull()
    expect(Object.hasOwn(p2.body, 'nextCursor')).toBe(true)
  })

  it('cursor יציב: עבודה שנסגרה ועבודה שנוספה בין עמודים — בלי דילוג, בלי כפילות, תמיד מתקדם', async () => {
    const docs = Array.from({ length: 5 }, () => jobDoc())
    await OcrJob.insertMany(docs)
    const p1 = await list('?limit=2')
    expect(p1.body.items.map((i) => i.jobId)).toEqual([docs[0], docs[1]].map((d) => String(d._id)))
    // בין העמודים: העבודה האחרונה בעמוד (ה-cursor עצמו) נסגרת, עוד אחת נסגרת ועבודה חדשה נוספת
    await OcrJob.updateOne({ _id: docs[1]._id }, { $set: { status: 'cancelled', active: false } })
    await OcrJob.updateOne({ _id: docs[2]._id }, { $set: { status: 'completed', active: false } })
    const added = await makeJob()
    const seen = [...p1.body.items.map((i) => i.jobId)]
    const cursors = [p1.body.nextCursor]
    let cursor = p1.body.nextCursor
    while (cursor) {
      const p = await list(`?limit=2&cursor=${cursor}`)
      seen.push(...p.body.items.map((i) => i.jobId))
      if (p.body.nextCursor) {
        expect(p.body.nextCursor > cursor).toBe(true)
        expect(cursors).not.toContain(p.body.nextCursor)
        cursors.push(p.body.nextCursor)
      }
      cursor = p.body.nextCursor
    }
    expect(seen).toEqual([docs[0], docs[1], docs[3], docs[4], added].map((d) => String(d._id)))
  })

  it('limit מעל 100 → לכל היותר 100; limit/cursor לא תקינים → 400 bad_request JSON', async () => {
    await OcrJob.insertMany(Array.from({ length: 101 }, () => jobDoc()))
    const big = await list('?limit=1000')
    expect(big.body.items).toHaveLength(100)
    expect(typeof big.body.nextCursor).toBe('string')
    for (const qs of ['?limit=0', '?limit=abc', '?limit=-5', '?cursor=zzz', '?cursor=64B7F0C2A1B2C3D4E5F60001']) {
      const { res, body } = await list(qs)
      expect(res.status, qs).toBe(400)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(body).toEqual({ error: 'bad_request' })
    }
  })

  it('רשומה פגומה (תאריך לא תקין) מדולגת לבדה עם לוג מינימלי; השאר מוחזרים וה-cursor מתקדם', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // 3 עבודות; האמצעית (האחרונה בעמוד של limit=2) עם createdAt לא תקין ו-expectedUpdatedAt חסר
      const docs = Array.from({ length: 3 }, () => jobDoc())
      await OcrJob.insertMany(docs)
      await OcrJob.collection.updateOne(
        { _id: docs[1]._id },
        { $set: { createdAt: 'garbage' }, $unset: { 'pageMap.0.expectedUpdatedAt': '' } }
      )
      const p1 = await list('?limit=2')
      expect(p1.res.status).toBe(200)
      expect(p1.body.items.map((i) => i.jobId)).toEqual([String(docs[0]._id)])
      expect(p1.body.nextCursor).toBe(String(docs[1]._id))
      const p2 = await list(`?limit=2&cursor=${p1.body.nextCursor}`)
      expect(p2.body).toMatchObject({ nextCursor: null })
      expect(p2.body.items.map((i) => i.jobId)).toEqual([String(docs[2]._id)])
      expect(err).toHaveBeenCalledTimes(1)
      expect(err.mock.calls[0]).toEqual([`[ocr-worker] list item skipped: jobId=${docs[1]._id} code=RangeError`])
    } finally {
      err.mockRestore()
    }
  })

  it('שאילתת הרשימה משתמשת באינדקס הרשימה, בלי מיון בזיכרון ובלי סריקת אוסף', async () => {
    await OcrJob.insertMany(Array.from({ length: 30 }, (_, i) => jobDoc(i % 3 ? { status: 'completed', active: false } : {})))
    const ex = await OcrJob.find(listFilter(WORKER, null)).sort({ _id: 1 }).limit(101).explain('executionStats')
    const stages = []
    const walk = (s) => {
      if (!s) return
      stages.push(s)
      ;(s.inputStages || (s.inputStage ? [s.inputStage] : [])).forEach(walk)
    }
    walk(ex.executionStats.executionStages)
    const names = stages.map((s) => s.stage)
    expect(names).not.toContain('SORT')
    expect(names).not.toContain('COLLSCAN')
    expect(stages.filter((s) => s.stage === 'IXSCAN').map((s) => s.indexName)).toContain('method_1_workerId_1_active_1__id_1')
    expect(ex.executionStats.nReturned).toBe(10)
    expect(ex.executionStats.totalKeysExamined).toBe(10)
  })

  it('OcrWorkerState.lastSeenAt מתעדכן בכל פנייה מאומתת (ולא בפנייה שנדחתה)', async () => {
    await GET(req('', null))
    expect(await OcrWorkerState.countDocuments()).toBe(0)
    const before = Date.now()
    await list()
    const st = await OcrWorkerState.findOne({ workerId: WORKER }).lean()
    expect(st.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 5)
    expect(st.lastRoute).toBe('GET /api/worker/v1/jobs')
  })
})
