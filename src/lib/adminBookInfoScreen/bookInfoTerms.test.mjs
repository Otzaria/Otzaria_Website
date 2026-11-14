import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTENTION_STATUSES, BOOK_INFO_DESCRIPTION, STATUS, attentionText, bulkDeleteConfirm, deleteLabel, explainError, fieldLabel, fieldsCountText,
  formatValue, publishLabel, publishProgressText, publishResultText, requestsCountText, statusInfo,
} from './bookInfoTerms.js'

test('כל מצב של השרת — שם וגוון; מצב לא מוכר — "נכשל"', () => {
  for (const id of ['publishing', 'open', 'merged', 'closed', 'modified', 'conflict', 'failed']) {
    assert.ok(STATUS[id].label && STATUS[id].tone && STATUS[id].hint, id)
  }
  assert.equal(statusInfo('merged').label, 'פורסם')
  assert.equal(statusInfo('nope').label, 'נכשל')
  // בלי ז'רגון: לא PR ולא "מוזג"
  for (const s of Object.values(STATUS)) assert.doesNotMatch(s.label + s.hint, /\bPR\b|מוזג(?!ה)/)
  // לפי מילון השמות
  assert.equal(STATUS.open.label, 'ממתין לפרסום')
  // כל מצב שדורש טיפול — אומר מה לעשות; "נכשל" — גם (אבל לא נספר כדורש טיפול)
  for (const id of [...ATTENTION_STATUSES, 'failed']) assert.ok(STATUS[id].todo, id)
  assert.equal(ATTENTION_STATUSES.includes('failed'), false)
})

test('שורת ההסבר: האישור הוא מיזוג שהמנהל עושה, ו"ב‑GitHub" לא נשבר', () => {
  assert.match(BOOK_INFO_DESCRIPTION, /אתה מאשר/)
  assert.match(BOOK_INFO_DESCRIPTION, /ב‑GitHub/)
  assert.doesNotMatch(BOOK_INFO_DESCRIPTION, /ב-GitHub/)
})

test('הסיבה מהשרת — בעברית פשוטה, והמקור נשמר ל"פרטים"', () => {
  assert.equal(explainError(''), null)
  const branch = explainError('הענף אינו תואם לקומיט שנוצר; נדרשת בדיקה ידנית')
  assert.doesNotMatch(branch.text, /ענף|קומיט/)
  assert.equal(branch.raw, 'הענף אינו תואם לקומיט שנוצר; נדרשת בדיקה ידנית')
  assert.match(explainError('Not Found').text, /תקלה טכנית/)
  assert.deepEqual(explainError('משהו אחר בעברית'), { text: 'משהו אחר בעברית', raw: null })
})

test('שם הכפתור — בדיוק מה שיקרה', () => {
  assert.equal(deleteLabel(0, 3), 'מחק את ההצעה')
  assert.equal(deleteLabel(3, 3), 'מחק את ההצעה')
  assert.equal(deleteLabel(1, 3), 'מחק את השדה המסומן')
  assert.equal(deleteLabel(2, 3), 'מחק את 2 השדות המסומנים')
  assert.equal(publishLabel(2, 2), 'פתח בקשת מיזוג')
  assert.equal(publishLabel(1, 2), 'פתח בקשת מיזוג (שדה אחד)')
})

test('שדות וערכים', () => {
  assert.equal(fieldLabel('authorName'), 'שם המחבר')
  assert.equal(fieldLabel('other'), 'other')
  assert.equal(formatValue(''), 'אין')
  assert.equal(formatValue(null), 'אין')
  assert.equal(formatValue('  '), 'אין')
  assert.equal(formatValue(1167), '1167')
})

test('ספירות והודעות', () => {
  assert.equal(requestsCountText(1), 'בקשה אחת')
  assert.equal(requestsCountText(12), '12 בקשות')
  assert.equal(fieldsCountText(3), '3 שדות')
  assert.equal(attentionText(1), 'בקשה אחת צריכה בדיקה')
  assert.equal(attentionText(2), '2 בקשות צריכות בדיקה')
  assert.equal(publishProgressText({ done: 2, total: 5 }), 'פותח בקשות מיזוג… 2 מתוך 5')
  assert.equal(publishResultText({ ok: 1, failed: 0, stopped: false }), 'נפתחה בקשת מיזוג אחת.')
  assert.equal(publishResultText({ ok: 3, failed: 2, stopped: true }), 'נפתחו 3 בקשות מיזוג · 2 הצעות לא נפתחו — הסיבה כתובה בכל אחת · הפעולה נעצרה.')
  assert.equal(bulkDeleteConfirm(1).title, 'למחוק לצמיתות הצעה אחת?')
  assert.equal(bulkDeleteConfirm(4).confirmLabel, 'מחק 4 לצמיתות')
  assert.equal(bulkDeleteConfirm(4).cancelLabel, 'בטל')
})
