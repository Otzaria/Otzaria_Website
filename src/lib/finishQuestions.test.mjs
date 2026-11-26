import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FINISH_QUESTION_MODES,
  MAX_FINISH_QUESTIONS,
  MAX_FINISH_QUESTION_LENGTH,
  normalizeBookFinishQuestions,
  normalizeGlobalFinishQuestions,
  normalizeQuestionItems,
  questionsFromText,
  resolveFinishQuestions
} from './finishQuestions.js'

const texts = (list) => list.map((q) => q.text)

test('normalizeQuestionItems: מנקה רווחים, ריקות, כפולות וערכים שאינם מחרוזות', () => {
  assert.deepEqual(normalizeQuestionItems(['  א  ב ', '', '   ', 'א ב', 5, null, 'ג']), ['א ב', 'ג'])
  assert.deepEqual(normalizeQuestionItems(undefined), [])
  assert.deepEqual(normalizeQuestionItems('לא מערך'), [])
})

test('normalizeQuestionItems: תקרה לאורך ולכמות', () => {
  const long = 'א'.repeat(MAX_FINISH_QUESTION_LENGTH + 50)
  assert.equal(normalizeQuestionItems([long])[0].length, MAX_FINISH_QUESTION_LENGTH)
  const many = Array.from({ length: MAX_FINISH_QUESTIONS + 5 }, (_, i) => `שאלה ${i}`)
  assert.equal(normalizeQuestionItems(many).length, MAX_FINISH_QUESTIONS)
})

test('normalizeBookFinishQuestions: מצב לא מוכר או חסר → base', () => {
  assert.deepEqual(normalizeBookFinishQuestions(null), { mode: 'base', items: [] })
  assert.equal(normalizeBookFinishQuestions({ mode: 'hack' }).mode, 'base')
  assert.equal(normalizeBookFinishQuestions({ mode: 'custom', items: ['x'] }).mode, 'custom')
})

test('normalizeGlobalFinishQuestions', () => {
  assert.deepEqual(normalizeGlobalFinishQuestions(undefined), { items: [] })
  assert.deepEqual(normalizeGlobalFinishQuestions({ items: [' א '] }), { items: ['א'] })
})

const global = { items: ['בדקתי ראשי תיבות', 'בדקתי ניקוד'] }

test('resolveFinishQuestions: ספר בלי הגדרה מקבל את השאלות הכלליות', () => {
  assert.deepEqual(texts(resolveFinishQuestions(global, undefined)), global.items)
})

test('resolveFinishQuestions: base מתעלם משאלות הספר', () => {
  const book = { mode: FINISH_QUESTION_MODES.BASE, items: ['שאלה לספר'] }
  assert.deepEqual(texts(resolveFinishQuestions(global, book)), global.items)
})

test('resolveFinishQuestions: base+custom — כלליות ואחריהן של הספר, בלי כפילות', () => {
  const book = { mode: FINISH_QUESTION_MODES.BASE_AND_CUSTOM, items: ['שאלה לספר', 'בדקתי ניקוד'] }
  const result = resolveFinishQuestions(global, book)
  assert.deepEqual(texts(result), ['בדקתי ראשי תיבות', 'בדקתי ניקוד', 'שאלה לספר'])
  assert.deepEqual(result.map((q) => q.source), ['global', 'global', 'book'])
})

test('resolveFinishQuestions: custom — רק של הספר', () => {
  const book = { mode: FINISH_QUESTION_MODES.CUSTOM, items: ['שאלה לספר'] }
  assert.deepEqual(texts(resolveFinishQuestions(global, book)), ['שאלה לספר'])
})

test('resolveFinishQuestions: מזהים ייחודיים', () => {
  const book = { mode: FINISH_QUESTION_MODES.BASE_AND_CUSTOM, items: ['ד'] }
  const ids = resolveFinishQuestions(global, book).map((q) => q.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('questionsFromText: שורה = שאלה', () => {
  assert.deepEqual(questionsFromText('א\n\n ב \r\nא'), ['א', 'ב'])
  assert.deepEqual(questionsFromText(undefined), [])
})
