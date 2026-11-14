import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alsoFoundText, audienceCountText, broadcastAudienceCount, broadcastConfirm, bulkDeleteConfirm, composeDelivery, composeMissing, bulkProgressText, bulkResultText, conversationsText, deleteConfirm, deleteSentConfirm,
  editorsText, messagesText, newCountLabel, usersText, clockText, shortTimeText, longTimeText, sentToAllText, toEditorsText, toUsersText,
} from './messageTerms.js'

test('ספירות ביחיד וברבים', () => {
  assert.equal(conversationsText(1), 'שיחה אחת')
  assert.equal(conversationsText(1200), '1,200 שיחות')
  assert.equal(messagesText(2), '2 הודעות')
  assert.equal(usersText(1), 'משתמש אחד')
  assert.equal(editorsText(4), '4 עורכים')
  assert.equal(toEditorsText(1), 'לעורך אחד')
  assert.equal(toEditorsText(4), 'ל-4 עורכים')
  assert.equal(toUsersText(1), 'למשתמש אחד')
  assert.equal(newCountLabel(1), 'אחת חדשה')
  assert.equal(newCountLabel(3), '3 חדשות')
})

test('חלונות מחיקה: הרסניים, "מחק לצמיתות", עם המספר', () => {
  assert.equal(deleteConfirm('שאלה').tone, 'danger')
  assert.equal(deleteConfirm('שאלה').confirmLabel, 'מחק לצמיתות')
  assert.equal(deleteConfirm('').body, undefined)
  assert.equal(bulkDeleteConfirm(12).title, 'למחוק לצמיתות 12 שיחות?')
  assert.equal(bulkDeleteConfirm(1).title, 'למחוק לצמיתות שיחה אחת?')
  const many = deleteSentConfirm({ subject: 'x', recipients: [{}, {}, {}], repliedCount: 2 })
  assert.equal(many.title, 'למחוק את ההודעה אצל 3 נמענים?')
  // מה שהחלון מבטיח = מה שהשרת מוחק: רק מי שלא השיב; מי שהשיב נשאר בנכנסות
  assert.match(many.details[0], /3 הנמענים שלא השיבו/)
  assert.match(many.details[1], /2 נמענים השיבו.*בנכנסות ויישארו/)
  assert.match(deleteSentConfirm({ recipients: [{}, {}] }).details[1], /אם מישהו השיב/)
  assert.equal(deleteSentConfirm({ subject: 'x', recipients: [{}] }).title, 'למחוק את ההודעה לצמיתות?')
})

test('אישור "כל המשתמשים": בלי מספר על הכפתור; מספר מדויק או "כ-", ואיך זה מגיע', () => {
  const approx = broadcastConfirm(42)
  assert.equal(approx.title, 'לשלוח את ההודעה לכל המשתמשים?')
  assert.equal(approx.confirmLabel, 'שלח לכל המשתמשים')
  assert.match(approx.details[0], /^היא תגיע לכ-42 משתמשים/)
  assert.match(approx.body, /באתר/)
  assert.match(approx.body, /לא נשלחת בדואר/)
  assert.match(broadcastConfirm(43, { exact: true }).details[0], /^היא תגיע ל-43 משתמשים/)
  assert.match(broadcastConfirm(1, { exact: true }).details[0], /^היא תגיע למשתמש אחד/)
  assert.equal(broadcastConfirm(NaN).details[0], 'היא תגיע לכל מי שאינו מנהל.')
  // "אי אפשר לבטל" — לא נכון: אפשר למחוק מנשלחו
  assert.ok(!broadcastConfirm(5).details.join(' ').includes('אי אפשר לבטל'))
  assert.match(broadcastConfirm(5).details[1], /אפשר למחוק אותה מ"נשלחו"/)
  // 0 נמענים (נספר במדויק) — אין מה לאשר
  assert.equal(broadcastConfirm(0, { exact: true }), null)
  assert.equal(audienceCountText(0), 'אין כרגע משתמשים שאינם מנהלים')
  assert.equal(audienceCountText(42), 'כ-42 משתמשים')
  assert.equal(audienceCountText(43, { exact: true }), '43 משתמשים')
})

test('הודעה חדשה: מה חסר (במקום כפתור מושבת), וכותרת המשנה לכולם', () => {
  assert.deepEqual(composeMissing({ toAll: false, hasUser: false, subject: ' ', text: '' }).map((m) => m.field), ['user', 'subject', 'text'])
  assert.deepEqual(composeMissing({ toAll: true, hasUser: false, subject: 'a', text: 'b' }), [])
  assert.match(composeDelivery(true), /של כל אחד מהם/)
  assert.match(composeDelivery(false), /של הנמען/)
})

test('חיפוש: "נמצאו גם" בלשונית השנייה', () => {
  assert.equal(alsoFoundText('sent', 2), 'נמצאו גם 2 בנשלחו')
  assert.equal(alsoFoundText('inbox', 1), 'נמצאה גם אחת בנכנסות')
  assert.equal(alsoFoundText('sent', 0), '')
})

test('התקדמות וסיכום של פעולה מרובה', () => {
  assert.equal(bulkProgressText('delete', { done: 3, total: 10 }), 'מוחק… 3 מתוך 10')
  assert.equal(bulkProgressText('read', { done: 0, total: 2 }), 'מסמן כנקרא… 0 מתוך 2')
  assert.deepEqual(bulkResultText('read', { done: 5 }), { message: '5 שיחות סומנו כנקראו.', tone: 'success' })
  assert.deepEqual(bulkResultText('delete', { done: 1, failed: 2, stopped: 3 }), {
    message: 'שיחה אחת נמחקה. 2 נכשלו ונשארו בבחירה. עצרת לפני 3 שיחות (נשארו בבחירה).', tone: 'error',
  })
  assert.deepEqual(bulkResultText('delete', { stopped: 1 }), { message: 'עצרת לפני שיחה אחת (נשארה בבחירה).', tone: 'info' })
  // 5 נבחרו: 3 סומנו, אחת כבר הייתה נקראה, אחת נכשלה — 3+1+1 = 5
  assert.deepEqual(bulkResultText('read', { done: 3, skipped: 1, failed: 1 }), {
    message: '3 שיחות סומנו כנקראו. שיחה אחת כבר הייתה נקראה. שיחה אחת נכשלה ונשארה בבחירה.', tone: 'error',
  })
  assert.deepEqual(bulkResultText('delete', {}), { message: 'לא בוצע דבר.', tone: 'info' })
})

test('זמנים: היום — שעה; אחרת — יחסי; בשרשור — עם השעה (שעון ירושלים)', () => {
  const now = Date.parse('2026-11-04T12:00:00Z') // 14:00 בירושלים
  assert.equal(clockText('2026-11-04T07:05:00Z'), '09:05')
  assert.equal(shortTimeText('2026-11-04T07:05:00Z', now), '09:05')
  assert.equal(shortTimeText('2026-11-03T07:05:00Z', now), 'אתמול')
  assert.equal(longTimeText('2026-11-03T07:05:00Z', now), 'אתמול, 09:05')
  assert.equal(longTimeText('2026-11-04T07:05:00Z', now), 'היום, 09:05')
  assert.equal(longTimeText(null, now), '')
  assert.equal(clockText('x'), '')
})

test('sentToAllText: המספר מהשרת; 0 — לא נשלחה לאף אחד; בלי מספר — בלי מספר', () => {
  assert.deepEqual(sentToAllText('נשלח בהצלחה ל-40 משתמשים'), { message: 'ההודעה נשלחה ל-40 משתמשים', tone: 'success' })
  assert.equal(sentToAllText('נשלח בהצלחה ל-1 משתמשים').message, 'ההודעה נשלחה למשתמש אחד')
  assert.equal(sentToAllText(undefined).message, 'ההודעה נשלחה לכל המשתמשים')
  assert.deepEqual(sentToAllText('נשלח בהצלחה ל-0 משתמשים'), { message: 'ההודעה לא נשלחה לאף אחד: אין כרגע משתמשים שאינם מנהלים.', tone: 'info' })
})

test('broadcastAudienceCount: כמו השרת — כל מי שאינו מתפקידי הניהול (גם מפתח ומי שאין לו תפקיד)', () => {
  const users = [{ role: 'user' }, { role: 'developer' }, {}, { role: 'admin' }, { role: 'admin_ocr' }, { role: 'model_trainer' },
    // כמה תפקידים: מפתח שהוא גם מנהל OCR — מנהל, לא נספר
    { role: 'admin_ocr', roles: ['developer', 'admin_ocr'] }]
  assert.equal(broadcastAudienceCount(users), 3)
  assert.equal(broadcastAudienceCount(undefined), 0)
})
