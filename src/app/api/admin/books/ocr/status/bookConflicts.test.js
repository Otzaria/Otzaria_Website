// @vitest-environment node
// רגרסיה לסקירה W03: עבודה חדשה (OCRWin או local) לא מסתירה התנגשויות פתוחות ותוצאות מתנגשות
// שלא נבדקו מעבודות local קודמות — מצב הספר וראוט ההתנגשויות מחזירים אותן ברמת הספר, עם פרטי
// העבודה המקורית. מול MongoDB אמיתי (mongodb-memory-server); בלי בינארי Mongo — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrJob from '@/models/OcrJob'
import OcrConflict from '@/models/OcrConflict'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { GET as getStatus } from './route'
import { GET as listConflicts } from '../conflicts/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const SHA_APPLIED = 'a'.repeat(64)
const SHA_CONFLICT = 'b'.repeat(64)
const OLD_AT = new Date('2026-10-01T08:00:00Z')

let book
let page
let oldJob

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  getServerSessionMock.mockReset()
  getServerSessionMock.mockResolvedValue({ user: { name: 'מנהל ספרים', role: 'admin_books' } })
  book = await Book.create({ name: 'ספר בדיקה', slug: `w03-${Date.now()}` })
  page = await Page.create({ book: book._id, pageNumber: 3, imagePath: '/x/3.jpg', content: 'טקסט אנושי' })
  // עבודת local שהסתיימה עם התנגשות עמוד פתוחה ועם תוצאה מתנגשת שלא סומנה "נבדק"
  oldJob = await OcrJob.create({
    book: book._id, method: 'local', status: 'completed', active: false, workerId: 'w', totalPages: 1,
    conflictPages: 1, createdAt: OLD_AT,
    resultConflicts: [{ sha256: SHA_CONFLICT, receivedAt: OLD_AT, bytes: 512, path: 'x/rejected-b.json', reviewedAt: null }],
  })
  await OcrConflict.create({
    job: oldJob._id, book: book._id, page: page._id, pageNumber: 3, pdfPageIndex: 1,
    status: 'open', ocrText: 'טקסט OCR', resultSha256: SHA_APPLIED,
  })
})

async function status() {
  const res = await getStatus(new Request(`http://t.test/api/admin/books/ocr/status?bookId=${book._id}`))
  expect(res.status).toBe(200)
  // נתוני ניהול תלויי-session (ונקראים ב-polling) — לעולם לא במטמון משותף
  expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  return res.json()
}

async function openConflicts() {
  const res = await listConflicts(new Request(`http://t.test/api/admin/books/ocr/conflicts?bookId=${book._id}&status=open`))
  expect(res.status).toBe(200)
  return res.json()
}

describe('W03 — התנגשויות ברמת הספר אחרי עבודה חדשה', () => {
  it('אחרי עבודת OCRWin חדשה: הספירה, הרשימה והתוצאה המתנגשת של העבודה הקודמת עדיין נגישות', async () => {
    await OcrJob.create({ book: book._id, method: 'ocrwin', status: 'completed', active: false, createdAt: new Date('2026-10-02T08:00:00Z') })

    const view = await status()
    expect(view.job.method).toBe('ocrwin')
    expect(view.conflictsOpen).toBe(0) // המשמעות הקיימת: של העבודה המוחזרת בלבד
    expect(view.bookConflictsOpen).toBe(1)
    expect(view.olderResultConflicts).toEqual([{
      jobId: String(oldJob._id), jobCreatedAt: OLD_AT.toISOString(), sha256: SHA_CONFLICT,
      receivedAt: OLD_AT.toISOString(), bytes: 512, reviewedAt: null,
    }])
    expect(JSON.stringify(view)).not.toContain('rejected-b.json')

    const list = await openConflicts()
    expect(list.openCount).toBe(1)
    expect(list.conflicts).toHaveLength(1)
    expect(list.conflicts[0]).toMatchObject({ jobId: String(oldJob._id), jobCreatedAt: OLD_AT.toISOString(), pageNumber: 3 })
  })

  it('אחרי עבודת local חדשה: גם ההתנגשויות הקודמות נספרות; תוצאות העבודה החדשה לא מוכפלות', async () => {
    const newJob = await OcrJob.create({
      book: book._id, method: 'local', status: 'completed', active: false, workerId: 'w', totalPages: 1,
      createdAt: new Date('2026-10-03T08:00:00Z'),
      resultConflicts: [{ sha256: 'c'.repeat(64), receivedAt: new Date(), bytes: 1, reviewedAt: null }],
    })
    await OcrConflict.create({ job: newJob._id, book: book._id, page: page._id, pageNumber: 3, status: 'open', ocrText: 'חדש' })

    const view = await status()
    expect(view.job.id).toBe(String(newJob._id))
    expect(view.conflictsOpen).toBe(1)
    expect(view.bookConflictsOpen).toBe(2)
    // תוצאות העבודה המוחזרת נמצאות ב-job.resultConflicts — ב-olderResultConflicts רק של הקודמות
    expect(view.job.resultConflicts).toHaveLength(1)
    expect(view.olderResultConflicts.map((c) => c.jobId)).toEqual([String(oldJob._id)])

    const list = await openConflicts()
    expect(list.conflicts.map((c) => c.jobId).sort()).toEqual([String(oldJob._id), String(newJob._id)].sort())
  })

  it('התנגשות באמצע אימוץ (applying) נספרת ומוצגת ברשימה ברמת הספר', async () => {
    const now = new Date()
    await OcrConflict.updateMany({ job: oldJob._id }, {
      $set: { status: 'applying', applyStartedAt: now, applyLeaseUntil: new Date(now.getTime() + 60_000) },
    })
    await OcrJob.create({ book: book._id, method: 'ocrwin', status: 'completed', active: false })

    const view = await status()
    expect(view.bookConflictsOpen).toBe(1)
    const list = await openConflicts()
    expect(list.openCount).toBe(1)
    expect(list.conflicts.map((c) => c.status)).toEqual(['applying'])
  })

  it('תוצאה מתנגשת שסומנה "נבדק" והתנגשות שטופלה כבר לא מוצגות', async () => {
    await OcrJob.updateOne({ _id: oldJob._id }, { $set: { 'resultConflicts.0.reviewedAt': new Date() } })
    await OcrConflict.updateMany({ job: oldJob._id }, { $set: { status: 'dismissed' } })
    await OcrJob.create({ book: book._id, method: 'ocrwin', status: 'completed', active: false })

    const view = await status()
    expect(view.bookConflictsOpen).toBe(0)
    expect(view.olderResultConflicts).toEqual([])
  })
})
