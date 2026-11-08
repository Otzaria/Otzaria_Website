import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  suggestionsCountText, partsText, partsSummary, decidedMessage, partsConflictNotice, partsDecidedMessage, bulkProgressText,
  bulkResultText, bulkRejectConfirm, approvePatternConfirm, patternResultText, blockedMessage, CONFLICT_NOTICE,
  conflictNotice, conflictToast, rejectPendingMessage, lockedNotice, partsActionLabel, NOT_PENDING_MESSAGE, RETRY_MESSAGE, BLOCK_EXPLANATION,
} from './suggestionTerms.js'

const JARGON = /תור|מקטע|קונפליקט|diff|sync|commit|GitHub|PR\b/i

test('מונים ביחיד וברבים', () => {
  assert.equal(suggestionsCountText(1), 'הצעה אחת')
  assert.equal(suggestionsCountText(1200), '1,200 הצעות')
  assert.equal(partsText(1), 'חלק אחד')
  assert.equal(partsText(3), '3 חלקים')
})

test('שורת החלקים: הכול, או כמה עוד ממתינים', () => {
  assert.equal(partsSummary({ changeCount: 3, changes: [{}, {}, {}] }, 3), '3 חלקים')
  assert.equal(partsSummary({ changeCount: 3, changes: [{}, {}, {}] }, 1), '1 מתוך 3 חלקים ממתינים')
  assert.equal(partsSummary({ changeCount: 1, changes: [{}] }, 1), 'חלק אחד')
  assert.equal(partsSummary({ changeCount: 0, changes: [] }, 0), 'אין שינויים להצגה')
})

test('יותר מ-50 חלקים: בלי "X מתוך Y" שגוי', () => {
  const fifty = (handled) => Array.from({ length: 50 }, (_, i) => (i < handled ? { status: 'approved' } : {}))
  assert.equal(partsSummary({ changeCount: 80, changes: fifty(10) }, 40), '80 חלקים, חלק מהם כבר טופלו')
  assert.equal(partsSummary({ changeCount: 80, changes: fifty(0) }, 50), '80 חלקים')
})

test('הודעות אחרי החלטה', () => {
  const edit = { bookPath: 'תנך/בראשית.txt' }
  assert.deepEqual(decidedMessage('approve', edit, 'approved'), { message: 'ההצעה ל"בראשית" אושרה ונכנסה לספר', tone: 'success' })
  assert.deepEqual(decidedMessage('reject', edit, 'rejected'), { message: 'ההצעה ל"בראשית" נדחתה', tone: 'success' })
  // ספר שנמחק — אסור לומר "נכנסה לספר"
  const missing = decidedMessage('approve', edit, 'book-missing')
  assert.equal(missing.tone, 'info')
  assert.doesNotMatch(missing.message, /נכנסה לספר/)
  assert.match(missing.message, /כבר לא קיים/)
  assert.match(decidedMessage('approve', edit, 'nochange').message, /כבר היה כך/)
  assert.equal(decidedMessage('approve', {}, 'approved').message, 'ההצעה ל"ספר בלי שם" אושרה ונכנסה לספר')
  assert.equal(rejectPendingMessage(edit), 'ההצעה ל"בראשית" תידחה')
  assert.equal(partsActionLabel('approve', 1), 'אשר חלק אחד')
  assert.equal(partsActionLabel('reject', 3), 'דחה 3 חלקים')
  assert.equal(partsDecidedMessage({ approved: 2, rejected: 1 }), '2 חלקים אושרו · חלק אחד נדחה')
  assert.equal(partsDecidedMessage({}), 'לא השתנה דבר')
  assert.equal(partsConflictNotice(1).title, 'חלק אחד לא אושר')
  assert.match(partsConflictNotice(3).body, /נשארו ממתינים/)
})

test('פעולה מרובה: התקדמות וסיכום', () => {
  assert.equal(bulkProgressText('approve', { done: 3, total: 12 }), 'מאשר… 3 מתוך 12')
  assert.equal(bulkProgressText('reject', { done: 0, total: 2 }), 'דוחה… 0 מתוך 2')
  assert.deepEqual(bulkResultText('approve', { done: 8 }), { message: '8 הצעות אושרו.', tone: 'success' })
  assert.deepEqual(bulkResultText('reject', { done: 1 }), { message: 'הצעה אחת נדחתה.', tone: 'success' })
  const mixed = bulkResultText('approve', { done: 8, conflicts: 1, gone: 2, failed: 1, stopped: 3 })
  assert.equal(mixed.message, '8 הצעות אושרו · הצעה אחת לא אושרה כי הטקסט בספר השתנה, והיא נשארה ברשימה · 2 כבר לא ממתינות · הצעה אחת לא עודכנה. נסה שוב · נעצר: 3 לא נשלחו.')
  assert.doesNotMatch(mixed.message, /בידי מישהו אחר/)
  assert.equal(mixed.tone, 'error')
  assert.equal(bulkResultText('approve', { done: 2, conflicts: 1 }).tone, 'info')
  assert.equal(bulkResultText('approve', {}).message, 'לא השתנה דבר.')
  assert.deepEqual(patternResultText({ approved: 3, conflicts: 0 }), { message: '3 הצעות אושרו.', tone: 'success' })
})

test('חלונות אישור', () => {
  const one = bulkRejectConfirm(1)
  assert.equal(one.title, 'לדחות את ההצעה?')
  assert.equal(one.tone, 'danger')
  assert.equal(bulkRejectConfirm(12).title, 'לדחות 12 הצעות?')
  assert.equal(bulkRejectConfirm(12).confirmLabel, 'דחה 12')
  assert.match(approvePatternConfirm({ find: 'שרש', replace: 'שורש' }).body, /"שרש" ב"שורש"/)
  assert.match(approvePatternConfirm({ find: 'שרש', replace: '' }).body, /בכלום \(מחיקה\)/)
})

test('הודעת התנגשות: ההצעה עדיין ממתינה; בכמה חלקים — אפשר לאשר רק חלק', () => {
  assert.match(CONFLICT_NOTICE.title, /עדיין ממתינה/)
  assert.doesNotMatch(CONFLICT_NOTICE.body, /לסמן/)
  assert.match(conflictNotice(true).body, /לסמן רק את החלקים/)
  assert.match(conflictToast({ bookPath: 'תנך/בראשית.txt' }), /"בראשית" לא אושרה/)
})

test('נעילה אחרי שגיאת הרשאה / התחברות שפגה', () => {
  assert.match(lockedNotice({ status: 403 }).title, /אין לך עוד הרשאה/)
  assert.equal(lockedNotice({ sessionExpired: true }).title, 'פג תוקף ההתחברות')
})

test('חסימה', () => {
  assert.match(BLOCK_EXPLANATION, /במסך "משתמשים"/)
  assert.equal(blockedMessage('משה', 0), 'משה נחסם מעריכה.')
  assert.equal(blockedMessage('משה', 3), 'משה נחסם מעריכה. 3 הצעות שלו נדחו.')
  assert.equal(blockedMessage('', 1), 'המשתמש נחסם מעריכה. הצעה אחת שלו נדחתה.')
})

test('בלי מונחים טכניים בטקסט הגלוי', () => {
  const texts = [CONFLICT_NOTICE.title, conflictNotice(true).body, partsConflictNotice(2).body, bulkRejectConfirm(2).body,
    approvePatternConfirm({ find: 'a', replace: 'b' }).body, ...approvePatternConfirm({}).details,
    bulkResultText('approve', { done: 1, conflicts: 1, gone: 1, failed: 1, stopped: 1 }).message, NOT_PENDING_MESSAGE, RETRY_MESSAGE,
    lockedNotice({ status: 403 }).body, BLOCK_EXPLANATION]
  for (const t of texts) assert.doesNotMatch(t, JARGON, t)
  assert.doesNotMatch(RETRY_MESSAGE, /מקבילי/)
})
