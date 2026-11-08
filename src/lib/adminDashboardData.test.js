// @vitest-environment node
// הנתונים של הדשבורד: כל מקום נספר בתנאי של המסך שלו (מיובא מהמקור, לא מועתק), כל שאילתה נשלחת
// עם maxTimeMS, ותקציב הזמן כולל גם את החיבור — מקום תקוע או שזורק לא מפיל את האחרים.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const m = vi.hoisted(() => {
  const models = {}
  const make = (name) => {
    models[name] = {
      collection: { name: `${name.toLowerCase()}s` },
      aggregate: vi.fn(async () => []),
      countDocuments: vi.fn(async () => 0),
      estimatedDocumentCount: vi.fn(async () => 0),
    }
    return { default: models[name] }
  }
  return { models, make, connect: vi.fn(async () => undefined), badge: vi.fn(async () => ({ unreadMessages: 7, pendingUploads: 9, pendingPlugins: 0 })) }
})

vi.mock('@/lib/db', () => ({ default: m.connect }))
vi.mock('@/models/Message', () => m.make('Message'))
vi.mock('@/models/Upload', () => m.make('Upload'))
vi.mock('@/models/Plugin', () => m.make('Plugin'))
vi.mock('@/models/ServicePluginReview', () => m.make('ServicePluginReview'))
vi.mock('@/models/ErrorReport', () => m.make('ErrorReport'))
vi.mock('@/models/BookEdit', () => m.make('BookEdit'))
vi.mock('@/models/LibraryBook', () => m.make('LibraryBook'))
vi.mock('@/models/TrainingProofItem', () => m.make('TrainingProofItem'))
vi.mock('@/models/TrainingProofVolunteer', () => m.make('TrainingProofVolunteer'))
vi.mock('@/models/OcrLine', () => m.make('OcrLine'))
vi.mock('@/models/OcrLayoutPage', () => m.make('OcrLayoutPage'))
vi.mock('@/models/BookInfo', () => m.make('BookInfo'))
vi.mock('@/models/BookInfoChangeSet', () => m.make('BookInfoChangeSet'))
vi.mock('@/models/BookInfoPendingChange', () => m.make('BookInfoPendingChange'))
vi.mock('@/models/TzuratSubmission', () => m.make('TzuratSubmission'))
vi.mock('@/models/TzuratItem', () => m.make('TzuratItem'))
vi.mock('@/models/TzuratReport', () => m.make('TzuratReport'))
vi.mock('@/models/Page', () => m.make('Page'))
vi.mock('@/models/User', () => m.make('User'))
vi.mock('@/models/Book', () => m.make('Book'))
vi.mock('@/models/AppReport', () => m.make('AppReport'))
vi.mock('@/models/SpellWordSkip', () => m.make('SpellWordSkip'))
vi.mock('@/lib/adminBadgeCounts', async (importOriginal) => ({ ...(await importOriginal()), getRequestAdminBadgeCounts: m.badge }))

import { ADMIN_BADGE_FILTERS } from '@/lib/adminBadgeCounts'
import { failedPublishFilter, queuedFilter } from '@/lib/corrections/listFilters'
import { SECTIONS } from '@/lib/trainingProof/vocab'
import { ACTIVE_STATUSES } from '@/lib/bookinfo/service'
import { DASHBOARD_QUEUES, visibleQueues } from '@/lib/adminDashboard'
import {
  BOOK_INFO_WAITING_STATUSES,
  DASHBOARD_BUDGET_MS,
  DASHBOARD_LOADER_IDS,
  loadDashboardQueues,
  loadGeneralStats,
} from './adminDashboardData'

const NOW = new Date('2026-11-01T12:00:00Z')
const ALL_ON = { servicePlugins: true }
const firstMatch = (model) => model.aggregate.mock.calls[0][0][0].$match

beforeEach(() => {
  for (const model of Object.values(m.models)) {
    model.aggregate.mockReset().mockResolvedValue([])
    model.countDocuments.mockReset().mockResolvedValue(0)
    model.estimatedDocumentCount.mockReset().mockResolvedValue(0)
  }
  m.connect.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('לכל מקום בדשבורד יש טוען, ואין טוען בלי מקום', () => {
  expect([...DASHBOARD_LOADER_IDS].sort()).toEqual(DASHBOARD_QUEUES.map((q) => q.id).sort())
})

describe('התנאים — מהמקור של המסך', () => {
  test('תיקוני טקסט: הלשונית "פנויים ובטיפולי" (queuedFilter), באותו רגע', async () => {
    await loadDashboardQueues('admin', { now: NOW })
    const calls = m.models.ErrorReport.aggregate.mock.calls.map((c) => c[0][0].$match)
    expect(calls).toContainEqual(queuedFilter(NOW))
    expect(calls).toContainEqual(failedPublishFilter())
  })

  test('הודעות והעלאות: המספר מהמונה של הסרגל, והוותק באותו תנאי בדיוק', async () => {
    const results = await loadDashboardQueues('admin', { now: NOW })
    expect(results.messages).toMatchObject({ status: 'ok', count: 7 })
    expect(results.uploads).toMatchObject({ status: 'ok', count: 9 })
    expect(m.badge).toHaveBeenCalledWith('admin')
    expect(firstMatch(m.models.Message)).toEqual({ ...ADMIN_BADGE_FILTERS.unreadMessages, createdAt: { $type: 'date' } })
    expect(firstMatch(m.models.Upload)).toEqual({ ...ADMIN_BADGE_FILTERS.pendingUploads, createdAt: { $type: 'date' } })
    expect(m.models.Message.countDocuments).not.toHaveBeenCalled()
  })

  test('תוספים: תנאי המונה של הסרגל, מפורק לחדשים ולעדכונים', async () => {
    m.models.Plugin.aggregate.mockResolvedValue([
      { _id: true, count: 2, oldestCreated: new Date('2026-10-20'), oldestSubmitted: null },
      { _id: false, count: 1, oldestCreated: new Date('2025-01-01'), oldestSubmitted: new Date('2026-10-10') },
    ])
    const { plugins } = await loadDashboardQueues('admin_plugins', { now: NOW })
    expect(firstMatch(m.models.Plugin)).toEqual(ADMIN_BADGE_FILTERS.pendingPlugins)
    expect(plugins).toEqual({ status: 'ok', count: 3, oldest: new Date('2026-10-10'), parts: { created: 2, updates: 1 } })
  })

  test('מידע על ספרים: ACTIVE_STATUSES של המסך בלי modified, ועוד ההצעות הישנות', async () => {
    expect(BOOK_INFO_WAITING_STATUSES).toEqual(ACTIVE_STATUSES.filter((s) => s !== 'modified'))
    expect(BOOK_INFO_WAITING_STATUSES).toEqual(expect.arrayContaining(['publishing', 'open', 'conflict']))
    m.models.BookInfoChangeSet.aggregate.mockResolvedValue([{ _id: 'open', count: 28, oldest: new Date('2026-10-07') }, { _id: 'conflict', count: 1, oldest: null }])
    m.models.BookInfoPendingChange.aggregate.mockResolvedValue([{ count: 44, oldest: new Date('2026-04-01') }])
    const { 'book-info': info } = await loadDashboardQueues('admin_books', { now: NOW })
    expect(firstMatch(m.models.BookInfoChangeSet)).toEqual({ status: { $in: BOOK_INFO_WAITING_STATUSES } })
    expect(info).toEqual({ status: 'ok', count: 73, oldest: new Date('2026-04-01'), parts: { conflict: 1, legacy: 44 } })
  })

  test('הגהה לאימון: כל החלקים של המסך (באינדקס section+status), מפורק לפי חלק', async () => {
    m.models.TrainingProofItem.aggregate.mockResolvedValue([{ _id: 'ocr', count: 26, oldest: null }, { _id: 'router', count: 60, oldest: new Date('2026-11-01') }])
    const { 'proof-review': proof } = await loadDashboardQueues('admin_ocr', { now: NOW })
    expect(firstMatch(m.models.TrainingProofItem)).toEqual({ section: { $in: SECTIONS }, status: 'submitted' })
    expect(proof).toEqual({ status: 'ok', count: 86, oldest: new Date('2026-11-01'), parts: { ocr: 26, router: 60, frames: 0 } })
  })

  test('הוותק: $min (מדלג על מסמך בלי תאריך), לא מיון שבו null יוצא ראשון', async () => {
    await loadDashboardQueues('admin', { now: NOW })
    const pipeline = m.models.LibraryBook.aggregate.mock.calls[0][0]
    expect(pipeline[1].$group.oldest).toEqual({ $min: '$conflict.detectedAt' })
  })

  test('תוספי שירות: לא נשאלים כשהתכונה כבויה', async () => {
    await loadDashboardQueues('admin_plugins', { now: NOW })
    expect(m.models.ServicePluginReview.aggregate).not.toHaveBeenCalled()
    await loadDashboardQueues('admin_plugins', { now: NOW, features: ALL_ON })
    expect(m.models.ServicePluginReview.aggregate).toHaveBeenCalled()
  })
})

describe('עומס ותקרת זמן', () => {
  test('כל שאילתה נשלחת עם maxTimeMS — במקומות ובמצב הכללי', async () => {
    await loadDashboardQueues('admin', { now: NOW, features: ALL_ON })
    await loadGeneralStats('admin', { now: NOW })
    let calls = 0
    for (const model of Object.values(m.models)) {
      for (const fn of [model.aggregate, model.countDocuments, model.estimatedDocumentCount]) {
        for (const args of fn.mock.calls) {
          calls++
          const opts = fn === model.estimatedDocumentCount ? args[0] : args[1]
          expect(opts?.maxTimeMS, `${model.collection.name}`).toBeGreaterThan(0)
          expect(opts.maxTimeMS).toBeLessThanOrEqual(DASHBOARD_BUDGET_MS)
        }
      }
    }
    // מנהל כללי: עד 21 שאילתות לדשבורד (בלי מוני הסרגל המשותפים), ו-6 למצב הכללי
    expect(calls).toBeLessThanOrEqual(27)
  })

  test('מקום שזורק — רק הוא "error", והשאר נטענים', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.models.OcrLine.aggregate.mockRejectedValue(new Error('boom'))
    m.models.OcrLayoutPage.aggregate.mockResolvedValue([{ count: 4, oldest: null }])
    const results = await loadDashboardQueues('admin_ocr', { now: NOW })
    expect(results['ocr-lines']).toEqual({ status: 'error' })
    expect(results['ocr-layout']).toMatchObject({ status: 'ok', count: 4 })
  })

  test('מקום תקוע — "error" כשהתקציב נגמר, בלי לחכות לו', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.models.OcrLine.aggregate.mockReturnValue(new Promise(() => {}))
    const pending = loadDashboardQueues('admin_ocr', { now: NOW })
    await vi.advanceTimersByTimeAsync(DASHBOARD_BUDGET_MS + 10)
    const results = await pending
    expect(results['ocr-lines']).toEqual({ status: 'error' })
    expect(results['proof-volunteers']).toMatchObject({ status: 'ok' })
  })

  test('החיבור בתוך התקציב: DB שלא עונה — זורק אחרי התקציב (לא 30 שניות)', async () => {
    vi.useFakeTimers()
    m.connect.mockReturnValue(new Promise(() => {}))
    const queues = loadDashboardQueues('admin_ocr', { now: NOW })
    const stats = loadGeneralStats('admin', { now: NOW })
    const settled = Promise.allSettled([queues, stats])
    await vi.advanceTimersByTimeAsync(DASHBOARD_BUDGET_MS + 10)
    const [q, s] = await settled
    expect(q.status).toBe('rejected')
    expect(s.status).toBe('rejected')
  })

  test('מצב כללי תקוע — זורק אחרי התקציב', async () => {
    vi.useFakeTimers()
    m.models.Page.countDocuments.mockReturnValue(new Promise(() => {}))
    const stats = loadGeneralStats('admin_books', { now: NOW })
    const settled = Promise.allSettled([stats])
    await vi.advanceTimersByTimeAsync(DASHBOARD_BUDGET_MS + 10)
    expect((await settled)[0].status).toBe('rejected')
  })

  test('מצב כללי: ספרים ומוסתרים באגרגציה אחת, ודיווחי תוכנה רק למנהל כללי', async () => {
    m.models.Book.aggregate.mockResolvedValue([{ books: 132, hidden: 85 }])
    const stats = await loadGeneralStats('admin_books', { now: NOW })
    expect(stats).toMatchObject({ books: 132, hiddenBooks: 85, users: undefined, appReportsWeek: undefined })
    expect(m.models.AppReport.countDocuments).not.toHaveBeenCalled()
    expect(m.models.Book.countDocuments).not.toHaveBeenCalled()
  })
})

test('תפקיד בלי מקומות — בלי חיבור ובלי שאילתות', async () => {
  expect(visibleQueues('admin_books_only')).toEqual([])
  expect(await loadDashboardQueues('admin_books_only')).toEqual({})
  expect(m.connect).not.toHaveBeenCalled()
})
