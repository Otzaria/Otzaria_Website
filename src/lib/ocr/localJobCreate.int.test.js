// @vitest-environment node
// createOrResumeLocalJob מול MongoDB אמיתי (mongodb-memory-server) — בעלות על ההכנה (סקירה W04).
// בניית ה-PDF מוחלפת במחסום מבוקר (כל קריאה נעצרת עד שהטסט משחרר אותה), והשעון מתקדם דרך
// הפרמטר now מעבר לתוקף ה-lease (10 דקות), כך ששני ניסיונות של אותו requestId רצים במקביל:
// הישן (שה-lease שלו פג) והחדש (שלקח אותו). הקבצים נכתבים באמת (writeJobFileDurable) לתיקייה זמנית.
// בלי בינארי Mongo — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-local-create-'))
  process.env.OCR_LOCAL_STORAGE_DIR = path.join(tmp, 'storage')
  return { tmp }
})

const { builds } = vi.hoisted(() => ({ builds: [] }))
vi.mock('./localPdf.js', () => ({
  buildJobInput: (args) => new Promise((resolve, reject) => builds.push({ args, resolve, reject })),
}))

import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import Page from '../../models/Page.js'
import OcrJob from '../../models/OcrJob.js'
import { startMongo } from '../corrections/testing/mongo.js'
import { createOrResumeLocalJob } from './localJobCreate.js'
import { LocalInputError } from './localPdf.pure.js'
import { PREP_LEASE_MS } from './localJobCreate.pure.js'
import { jobDir, relToAbs, writeJobFileDurable } from './localStorage.js'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await fs.rm(env.tmp, { recursive: true, force: true })
})

let book
let seq = 0
beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  builds.length = 0
  book = { _id: new mongoose.Types.ObjectId(), name: 'ספר', slug: `b${++seq}` }
  await Page.create({ book: book._id, pageNumber: 1, imagePath: `/uploads/books/${book.slug}/page.1.jpg`, content: '' })
})

const REQ = { requestId: 'req-w04-same-request', existingTextMode: 'overwrite', options: { lm: 'off', defaultScript: 'square' } }
const begin = (now) =>
  createOrResumeLocalJob({ book, req: REQ, session: { user: { name: 'מנהל' } }, config: { workerId: 'worker-1' }, now })

// משחרר את בניית ה-PDF מספר i: כותב קובץ אמיתי עם התוכן הנתון ומחזיר אותו כקלט
async function finishBuild(i, content) {
  const { args, resolve } = builds[i]
  const w = await writeJobFileDurable(args.jobId, 'input', Buffer.from(content))
  const pageMap = args.pages.map((p, k) => ({
    pdfPageIndex: k + 1,
    page: p._id,
    pageNumber: p.pageNumber,
    expectedUpdatedAt: p.updatedAt,
    imageSha256: 'a'.repeat(64),
  }))
  resolve({ inputPath: w.relPath, inputSha256: w.sha256, inputBytes: w.bytes, pageMap })
  return w
}

const exists = (p) => fs.stat(p).then(() => true, () => false)
const pdfs = async (jobId) => (await fs.readdir(jobDir(jobId)).catch(() => [])).filter((f) => f.endsWith('.pdf'))

// ניסיון ישן שה-build שלו עדיין רץ + ניסיון חדש (שעון מתקדם מעבר ל-lease) שלקח את הבעלות
async function staleAndTakeover() {
  const t0 = new Date()
  const oldAttempt = begin(t0)
  await vi.waitFor(() => expect(builds).toHaveLength(1))
  const newAttempt = begin(new Date(t0.getTime() + PREP_LEASE_MS + 1000))
  await vi.waitFor(() => expect(builds).toHaveLength(2))
  const job = await OcrJob.findOne({ requestId: REQ.requestId }).lean()
  expect(job.status).toBe('preparing')
  return { oldAttempt, newAttempt, jobId: String(job._id) }
}

describe('בעלות על הכנת local (W04)', () => {
  it('ניסיון ישן שאיבד את ה-lease לא מעביר ל-queued; החדש מפרסם את ה-PDF שלו', async () => {
    const { oldAttempt, newAttempt, jobId } = await staleAndTakeover()

    const oldFile = await finishBuild(0, 'old-pdf')
    const stale = await oldAttempt
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ code: 'preparing', jobId })
    const mid = await OcrJob.findById(jobId).lean()
    expect(mid.status).toBe('preparing')
    expect(mid.inputSha256 ?? null).toBeNull()

    const newFile = await finishBuild(1, 'new-pdf')
    const fresh = await newAttempt
    expect(fresh.status).toBe(202)
    expect(fresh.body).toMatchObject({ jobId, status: 'queued' })
    const done = await OcrJob.findById(jobId).lean()
    expect(done.status).toBe('queued')
    expect(done.inputSha256).toBe(newFile.sha256)
    expect(done.inputPath).toBe(newFile.relPath)
    expect(done.prepLeaseUntil).toBeNull()
    expect(await exists(relToAbs(done.inputPath))).toBe(true)
    // הקובץ של הישן נשאר כיתום (נכתב כשהעבודה עדיין בהכנה) — ה-cron מנקה אחרי הסגירה
    expect(oldFile.relPath).not.toBe(newFile.relPath)

    // ניסיון חוזר נוסף — אותה תשובה
    expect((await begin(new Date())).body).toMatchObject({ jobId, status: 'queued' })
  })

  it('שגיאת קלט קבועה בניסיון הישן לא סוגרת את העבודה; החדש (קלט תקין) מקבל 202', async () => {
    const { oldAttempt, newAttempt, jobId } = await staleAndTakeover()

    builds[0].reject(new LocalInputError('missing_image', { pageNumbers: [1] }))
    const stale = await oldAttempt
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ code: 'preparing', jobId })
    const mid = await OcrJob.findById(jobId).lean()
    expect(mid).toMatchObject({ status: 'preparing', active: true })
    expect(mid.errorCode ?? null).toBeNull()

    const newFile = await finishBuild(1, 'new-pdf')
    const fresh = await newAttempt
    expect(fresh.status).toBe(202)
    const done = await OcrJob.findById(jobId).lean()
    expect(done).toMatchObject({ status: 'queued', active: true, inputSha256: newFile.sha256 })
  })

  it('אותו תוכן (אותו נתיב input-<sha>.pdf): הישן שהפסיד לא מוחק את הקובץ שהחדש עומד לפרסם', async () => {
    const { oldAttempt, newAttempt, jobId } = await staleAndTakeover()

    const oldFile = await finishBuild(0, 'same-pdf')
    expect((await oldAttempt).status).toBe(409)
    expect(await exists(oldFile.absPath)).toBe(true)

    const newFile = await finishBuild(1, 'same-pdf')
    expect(newFile.relPath).toBe(oldFile.relPath)
    expect((await newAttempt).status).toBe(202)
    const done = await OcrJob.findById(jobId).lean()
    expect(done.inputPath).toBe(newFile.relPath)
    expect(await exists(relToAbs(done.inputPath))).toBe(true)
    expect(await pdfs(jobId)).toEqual([path.basename(done.inputPath)])
  })

  it('החדש סיים ראשון; הישן (תוכן אחר) מקבל את המצב הנוכחי ומוחק רק את הקובץ שלו', async () => {
    const { oldAttempt, newAttempt, jobId } = await staleAndTakeover()

    const newFile = await finishBuild(1, 'new-pdf')
    expect((await newAttempt).status).toBe(202)
    const oldFile = await finishBuild(0, 'old-pdf')
    const stale = await oldAttempt
    expect(stale.status).toBe(202)
    expect(stale.body).toMatchObject({ jobId, status: 'queued' })
    const done = await OcrJob.findById(jobId).lean()
    expect(done.inputSha256).toBe(newFile.sha256)
    expect(await exists(oldFile.absPath)).toBe(false)
    expect(await pdfs(jobId)).toEqual([path.basename(newFile.relPath)])
  })

  it('lease שפג בלי שאיש לקח אותו — הבעלים המקורי עדיין מסיים (202)', async () => {
    const attempt = begin(new Date(Date.now() - 2 * PREP_LEASE_MS))
    await vi.waitFor(() => expect(builds).toHaveLength(1))
    const file = await finishBuild(0, 'slow-pdf')
    const res = await attempt
    expect(res.status).toBe(202)
    const done = await OcrJob.findOne({ requestId: REQ.requestId }).lean()
    expect(done).toMatchObject({ status: 'queued', inputSha256: file.sha256 })
  })

  it('שגיאת קלט קבועה של הבעלים — עדיין סוגרת את העבודה (422) ומשחררת את הספר', async () => {
    const attempt = begin(new Date())
    await vi.waitFor(() => expect(builds).toHaveLength(1))
    builds[0].reject(new LocalInputError('missing_image', { pageNumbers: [1] }))
    const res = await attempt
    expect(res.status).toBe(422)
    const done = await OcrJob.findOne({ requestId: REQ.requestId }).lean()
    expect(done).toMatchObject({ status: 'failed', active: false, errorCode: 'missing_image', prepLeaseUntil: null })
  })
})
