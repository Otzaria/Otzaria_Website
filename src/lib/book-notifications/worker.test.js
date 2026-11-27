// @vitest-environment node
// תור ההודעות על ספרים חדשים (issue #306) — מול MongoDB אמיתי (mongodb-memory-server).
// בלי בינארי Mongo — הבדיקות מדולגות. מכסה: הכנסה לתור פעם אחת לכל ספר, שליחה במנות, עצירה
// במגבלת הספק בלי לאבד נמענים, דילוג על נמען שנדחה / שהסיר את עצמו, נעילה, ושבת.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const { holyDay } = vi.hoisted(() => ({ holyDay: { value: false } }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha: async () => holyDay.value } }))
vi.mock('@/lib/emailService', () => ({
  buildBookNotificationMail: ({ email, bookName }) => ({ to: email, subject: bookName }),
}))

import mongoose from 'mongoose'
import BookNotification from '@/models/BookNotification'
import MailingList from '@/models/MailingList'
import User from '@/models/User'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { DEFAULT_CONFIG } from './policy'
import { enqueueBookNotification, processDueBatch } from './worker'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const EMAILS = ['a@x.test', 'b@x.test', 'c@x.test', 'd@x.test', 'e@x.test']
const book = { _id: new mongoose.Types.ObjectId(), name: 'ספר בדיקה', slug: 'sefer-bdika' }
const config = { ...DEFAULT_CONFIG, batchSize: 2 }

function fakeTransport(fail = {}) {
  const sent = []
  return {
    sent,
    sendMail: vi.fn(async (msg) => {
      if (fail[msg.to]) throw fail[msg.to]
      sent.push(msg.to)
    }),
  }
}

const rateLimit = Object.assign(new Error('Message failed: 554 5.7.1 short-term recipient limit reached'), {
  responseCode: 554,
  response: '554 5.7.1 <END-OF-MESSAGE>: End-of-data rejected: 554 5.7.1 short-term recipient limit reached',
})
const unknownUser = Object.assign(new Error('Message failed'), { responseCode: 550, response: '550 5.1.1 User unknown' })

// השעון של הבדיקה: "עכשיו" זז קדימה בין מנות בלי לחכות באמת
let clock
const now = () => new Date(clock)
const advance = (ms) => { clock += ms }

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  await BookNotification.deleteMany({})
  await MailingList.deleteMany({})
  holyDay.value = false
  clock = Date.now() + 60_000 // דקה קדימה משעון השרת, כדי שרשומה שתיווצר בבדיקה כבר תהיה בשלה
  // d לא מאומת — לא אמור לקבל; a מופיע פעמיים ברשימה
  await User.collection.insertMany(EMAILS.map((email, i) => ({ name: `u${i}`, email, isVerified: email !== 'd@x.test' })))
  await MailingList.create({ listName: 'new_books_subscribers', emails: [...EMAILS, 'a@x.test', 'ghost@x.test'] })
})

describe('enqueueBookNotification', () => {
  it('רק משתמשים מאומתים ברשימה, בלי כפילויות — ופעם אחת לכל ספר', async () => {
    expect(await enqueueBookNotification(book)).toEqual({ status: 'queued', total: 4 })
    const job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job.pending).toEqual(['a@x.test', 'b@x.test', 'c@x.test', 'e@x.test'])

    // לחיצה חוזרת / ניסיון חוזר אחרי timeout — לא נכנס שוב לתור
    expect(await enqueueBookNotification(book)).toEqual({ status: 'already_queued', total: 4 })
    expect(await BookNotification.countDocuments()).toBe(1)

    await BookNotification.updateOne({ book: book._id }, { $set: { status: 'done', pending: [] } })
    expect(await enqueueBookNotification(book)).toEqual({ status: 'already_sent', total: 4 })
  })

  it('שתי בקשות במקביל — רשומה אחת', async () => {
    const results = await Promise.all([enqueueBookNotification(book), enqueueBookNotification(book)])
    expect(results.map((r) => r.status).sort()).toEqual(['already_queued', 'queued'])
    expect(await BookNotification.countDocuments()).toBe(1)
  })

  it('אין מנויים — לא נוצרת רשומה', async () => {
    await MailingList.updateOne({}, { $set: { emails: [] } })
    expect(await enqueueBookNotification(book)).toEqual({ status: 'no_subscribers', total: 0 })
    expect(await BookNotification.countDocuments()).toBe(0)
  })
})

describe('processDueBatch', () => {
  it('שולח במנות עם מרווח, עד הסוף', async () => {
    await enqueueBookNotification(book)
    const transport = fakeTransport()

    const first = await processDueBatch({ now, config, transport })
    expect(first).toMatchObject({ sent: 2, remaining: 2, status: 'queued' })
    // המנה הבאה עוד לא הגיעה
    expect(await processDueBatch({ now, config, transport })).toEqual({ idle: true })

    advance(config.batchIntervalMs)
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 2, remaining: 0, status: 'done' })
    expect(transport.sent).toEqual(['a@x.test', 'b@x.test', 'c@x.test', 'e@x.test'])

    const job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job).toMatchObject({ status: 'done', sentCount: 4, failedCount: 0, pending: [], leaseUntil: null })
    expect(job.completedAt).toBeTruthy()
  })

  it('מגבלת הספק: עוצר, הנמען נשאר בתור, וממשיך אחרי ההמתנה', async () => {
    await enqueueBookNotification(book)
    const transport = fakeTransport({ 'b@x.test': rateLimit })

    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 1, remaining: 3, stop: 'rate_limit' })
    let job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job.pending).toEqual(['b@x.test', 'c@x.test', 'e@x.test'])
    expect(job.deferrals).toBe(1)
    expect(job.nextAttemptAt.getTime()).toBe(clock + config.backoffMs)
    expect(job.lastError).toMatch('recipient limit')

    advance(config.batchIntervalMs)
    expect(await processDueBatch({ now, config, transport })).toEqual({ idle: true })

    advance(config.backoffMs)
    transport.sendMail.mockImplementation(async (msg) => { transport.sent.push(msg.to) })
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 2, remaining: 1 })
    job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job.deferrals).toBe(0)
    // אף נמען לא קיבל פעמיים
    expect(new Set(transport.sent).size).toBe(transport.sent.length)
  })

  it('נמען שנדחה לצמיתות — מדלגים עליו וממשיכים', async () => {
    await enqueueBookNotification(book)
    const transport = fakeTransport({ 'a@x.test': unknownUser })
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 1, failed: 1, remaining: 2 })
    const job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job).toMatchObject({ failedCount: 1, sentCount: 1, deferrals: 0, pending: ['c@x.test', 'e@x.test'] })
  })

  it('מי שהסיר את עצמו אחרי שההודעה נכנסה לתור — לא מקבל', async () => {
    await enqueueBookNotification(book)
    await MailingList.updateOne({}, { $pull: { emails: 'a@x.test' } })
    const transport = fakeTransport()
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 1, skipped: 1 })
    expect(transport.sent).toEqual(['b@x.test'])
  })

  it('נעילה: שתי ריצות במקביל — רק אחת שולחת', async () => {
    await enqueueBookNotification(book)
    const transport = fakeTransport()
    const results = await Promise.all([processDueBatch({ now, config, transport }), processDueBatch({ now, config, transport })])
    expect(results.filter((r) => r.idle)).toHaveLength(1)
    expect(transport.sent).toEqual(['a@x.test', 'b@x.test'])
  })

  it('שבת / יום טוב — לא שולחים, ובודקים שוב אחר כך', async () => {
    await enqueueBookNotification(book)
    holyDay.value = true
    const transport = fakeTransport()
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ sent: 0, stop: 'holy_day' })
    expect(transport.sendMail).not.toHaveBeenCalled()
    const job = await BookNotification.findOne({ book: book._id }).lean()
    expect(job.nextAttemptAt.getTime()).toBe(clock + config.holyDayRetryMs)
    expect(job.leaseUntil).toBeNull()
  })

  it('אחרי יותר מדי עצירות — מוותרים', async () => {
    await enqueueBookNotification(book)
    await BookNotification.updateOne({}, { $set: { deferrals: config.maxDeferrals } })
    const transport = fakeTransport({ 'a@x.test': rateLimit })
    expect(await processDueBatch({ now, config, transport })).toMatchObject({ status: 'failed' })
  })
})
