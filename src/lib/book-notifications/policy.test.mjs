/**
 * בדיקות ללוגיקה של תור ההודעות על ספרים חדשים (src/lib/book-notifications/policy.js). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CONFIG,
  backoffDelayMs,
  classifySendError,
  errorSummary,
  planAfterBatch,
  readConfig,
  uniqueEmails,
} from './policy.js'

test('classifySendError: מגבלת הנמענים של הספק (המקרה מ-#306) עוצרת את המנה', () => {
  const err = Object.assign(new Error('Message failed: 554 5.7.1 <END-OF-MESSAGE>: End-of-data rejected: 554 5.7.1 short-term recipient limit reached'), {
    responseCode: 554,
    response: '554 5.7.1 <END-OF-MESSAGE>: End-of-data rejected: 554 5.7.1 short-term recipient limit reached',
  })
  assert.equal(classifySendError(err), 'rate_limit')
})

test('classifySendError: 452 ו-"try again later" הם מגבלת קצב', () => {
  assert.equal(classifySendError({ responseCode: 452, response: '452 4.5.3 Too many recipients' }), 'rate_limit')
  assert.equal(classifySendError({ responseCode: 451, response: '451 4.7.1 Please try again later' }), 'rate_limit')
})

test('classifySendError: תקלות חיבור ו-4xx הן זמניות', () => {
  assert.equal(classifySendError({ code: 'ETIMEDOUT', message: 'Connection timeout' }), 'temporary')
  assert.equal(classifySendError({ code: 'ECONNECTION', message: 'connect ECONNREFUSED' }), 'temporary')
  assert.equal(classifySendError({ responseCode: 421, response: '421 4.4.2 closing connection' }), 'temporary')
  assert.equal(classifySendError(new Error('boom')), 'temporary')
})

test('classifySendError: דחיית ספאם / חסימת חשבון — לא מוותרים על הנמען', () => {
  const err = { responseCode: 554, response: '554 5.7.1 Spam message rejected. If this is legitimate mail, contact support' }
  assert.equal(classifySendError(err), 'temporary')
})

test('classifySendError: תיבה שלא קיימת — דילוג על הנמען בלבד', () => {
  assert.equal(classifySendError({ responseCode: 550, response: '550 5.1.1 <x@example.com>: Recipient address rejected: User unknown' }), 'recipient')
  assert.equal(classifySendError({ responseCode: 553, response: '553 5.1.3 Invalid address' }), 'recipient')
})

test('classifySendError: קוד מתוך טקסט ההודעה כשאין responseCode', () => {
  assert.equal(classifySendError(new Error('Message failed: 550 5.1.1 mailbox unavailable')), 'recipient')
})

test('backoffDelayMs: מוכפל בכל עצירה עד התקרה', () => {
  assert.equal(backoffDelayMs(1), DEFAULT_CONFIG.backoffMs)
  assert.equal(backoffDelayMs(2), DEFAULT_CONFIG.backoffMs * 2)
  assert.equal(backoffDelayMs(3), DEFAULT_CONFIG.backoffMs * 4)
  assert.equal(backoffDelayMs(50), DEFAULT_CONFIG.maxBackoffMs)
  assert.equal(backoffDelayMs(0), DEFAULT_CONFIG.backoffMs)
})

test('planAfterBatch: אין עוד נמענים — הסתיים', () => {
  assert.deepEqual(planAfterBatch({ remaining: 0, deferrals: 3, stop: null }), { status: 'done', deferrals: 3, delayMs: null })
})

test('planAfterBatch: מנה תקינה — המנה הבאה אחרי המרווח, ורצף העצירות מתאפס', () => {
  assert.deepEqual(planAfterBatch({ remaining: 10, deferrals: 2, stop: null }), { status: 'queued', deferrals: 0, delayMs: DEFAULT_CONFIG.batchIntervalMs })
})

test('planAfterBatch: עצירה — המתנה גדלה; אחרי המקסימום מוותרים', () => {
  assert.deepEqual(planAfterBatch({ remaining: 10, deferrals: 0, stop: 'rate_limit' }), { status: 'queued', deferrals: 1, delayMs: DEFAULT_CONFIG.backoffMs })
  const last = planAfterBatch({ remaining: 10, deferrals: DEFAULT_CONFIG.maxDeferrals, stop: 'temporary' })
  assert.equal(last.status, 'failed')
})

test('readConfig: ערכים מה-env, ומתעלם מערכים לא תקינים', () => {
  const cfg = readConfig({ BOOK_NOTIFY_BATCH_SIZE: '25', BOOK_NOTIFY_BATCH_INTERVAL_MS: 'abc', BOOK_NOTIFY_BACKOFF_MS: '-5' })
  assert.equal(cfg.batchSize, 25)
  assert.equal(cfg.batchIntervalMs, DEFAULT_CONFIG.batchIntervalMs)
  assert.equal(cfg.backoffMs, DEFAULT_CONFIG.backoffMs)
})

test('uniqueEmails: בלי כפילויות וערכים ריקים, בסדר המקורי', () => {
  assert.deepEqual(uniqueEmails(['a@x', ' b@x ', 'a@x', '', null, 'c@x']), ['a@x', 'b@x', 'c@x'])
})

test('errorSummary: מקוצר', () => {
  assert.equal(errorSummary({ response: 'x'.repeat(500) }).length, 300)
  assert.equal(errorSummary(null), 'unknown error')
})
