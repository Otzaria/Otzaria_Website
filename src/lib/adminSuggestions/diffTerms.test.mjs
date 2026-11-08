import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decisionText, inlineCaption, keepLabel, partTitle, suggestionCaptions } from './diffTerms.js'

test('כותרת חלק: "חלק 2 מתוך 5", ובלי סך — "חלק 2"', () => {
  assert.equal(partTitle(2, 5), 'חלק 2 מתוך 5')
  assert.equal(partTitle(1, 1), 'חלק 1')
  assert.equal(partTitle(3, undefined), 'חלק 3')
})

test('כיתוב הנוסחים בהצעה: כרגע בספר / מוצע, ותוספת או מחיקה בלבד', () => {
  assert.deepEqual(suggestionCaptions({ before: 'א', after: 'ב' }), { before: 'כרגע בספר', after: 'מוצע' })
  assert.deepEqual(suggestionCaptions({ before: '', after: 'ב' }), { before: null, after: 'מוצע להוסיף' })
  assert.deepEqual(suggestionCaptions({ before: 'א', after: '' }), { before: 'מוצע למחוק', after: null })
})

test('בהתנגשות: נוסח ריק — "השאר בלי טקסט (מחק את החלק)"', () => {
  assert.equal(keepLabel('ours', false), 'השאר את הנוסח שבאתר')
  assert.equal(keepLabel('theirs', true), 'השאר בלי טקסט (מחק את החלק)')
})

test('מצב החלק אחרי בחירה', () => {
  assert.equal(decisionText('ours', 'waiting'), 'נבחר: הנוסח שבאתר')
  assert.equal(decisionText('theirs', 'saved'), 'נשמר: נשאר הנוסח שבמאגר')
})

test('כיתוב בטקסט אחד: "השינוי המוצע", ותוספת או מחיקה בלבד', () => {
  assert.equal(inlineCaption({ before: 'א', after: 'ב' }), 'השינוי המוצע')
  assert.equal(inlineCaption({ before: '', after: 'ב' }), 'מוצע להוסיף')
  assert.equal(inlineCaption({ before: 'א', after: '' }), 'מוצע למחוק')
})
