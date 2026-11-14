import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bulkProgressText, withStopReason } from './bulkText.js'

test('bulkProgressText: פועל, שלוש נקודות, מספרים עם מפריד אלפים', () => {
  assert.equal(bulkProgressText('מסתיר', { done: 120, total: 2745 }), 'מסתיר… 120 מתוך 2,745')
  assert.equal(bulkProgressText('מוחק', { done: 0, total: 2 }), 'מוחק… 0 מתוך 2')
})

test('bulkProgressText: ערך חסר — אפס', () => {
  assert.equal(bulkProgressText('מעדכן', { done: undefined, total: 3 }), 'מעדכן… 0 מתוך 3')
})

test('withStopReason: הסיכום ואחריו הסיבה; בלי סיבה — הסיכום', () => {
  assert.equal(withStopReason('2 הוסתרו.', { message: 'אירעה שגיאה בשרת.' }), '2 הוסתרו. אירעה שגיאה בשרת.')
  assert.equal(withStopReason('2 הוסתרו.', { message: '' }), '2 הוסתרו.')
  assert.equal(withStopReason('2 הוסתרו.', null), '2 הוסתרו.')
})
