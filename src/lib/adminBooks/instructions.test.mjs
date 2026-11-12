import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_EDITING_TITLE,
  bookInstructionsPayload,
  cleanSections,
  itemsToText,
  newSectionForm,
  parseExamplePage,
  sameSections,
  textToItems,
  toBookInstructionsForm,
  toSectionForms,
  untitledSectionKeys,
} from './instructions.js'

test('טקסט ↔ הנחיות: שורה לכל הנחיה, שורות ריקות נזרקות רק בשמירה', () => {
  assert.equal(itemsToText(['א', 'ב']), 'א\nב')
  assert.deepEqual(textToItems(' א \r\n\n ב\n'), ['א', 'ב'])
  assert.equal(itemsToText(null), '')
})

test('ניקוי סעיפים: בלי הנחיות — נזרק; בלי כותרת — נזרק רק כשנדרשת כותרת', () => {
  const forms = [
    { key: '1', title: ' כללי ', text: 'א\n\nב' },
    { key: '2', title: 'ריק', text: '\n ' },
    { key: '3', title: '', text: 'ג' },
  ]
  assert.deepEqual(cleanSections(forms), [{ title: 'כללי', items: ['א', 'ב'] }])
  assert.deepEqual(cleanSections(forms, { requireTitle: false }), [{ title: 'כללי', items: ['א', 'ב'] }, { title: '', items: ['ג'] }])
  assert.deepEqual(untitledSectionKeys(forms), ['3'])
})

test('טופס הנחיות של ספר: ברירת מחדל, עמוד דוגמה, ומה נשלח', () => {
  const empty = toBookInstructionsForm(null, undefined)
  assert.equal(empty.title, DEFAULT_EDITING_TITLE)
  assert.equal(empty.sections.length, 1)
  assert.equal(empty.sections[0].title, 'כללי')
  assert.equal(empty.examplePage, null)
  const form = toBookInstructionsForm({ title: 'תלמוד', sections: [{ title: 'פיסוק', items: ['נקודה', 'פסיק'] }] }, 7)
  assert.equal(form.sections[0].text, 'נקודה\nפסיק')
  assert.equal(form.examplePage, 7)
  assert.deepEqual(bookInstructionsPayload({ ...form, title: '  ' }), {
    editingInfo: { title: DEFAULT_EDITING_TITLE, sections: [{ title: 'פיסוק', items: ['נקודה', 'פסיק'] }] },
    examplePage: 7,
  })
})

test('השוואה: מפתחות ורווחים לא נחשבים שינוי', () => {
  const a = toSectionForms([{ title: 'א', items: ['1'] }])
  const b = [{ ...newSectionForm('א '), text: '1\n' }]
  assert.equal(sameSections(a, b), true)
  assert.equal(sameSections(a, [{ ...newSectionForm('א'), text: '2' }]), false)
})

test('עמוד דוגמה: ריק, תקין, מחוץ לטווח, לא מספר', () => {
  assert.deepEqual(parseExamplePage('', 10), { value: null, error: null })
  assert.deepEqual(parseExamplePage(' 4 ', 10), { value: 4, error: null })
  assert.equal(parseExamplePage('11', 10).error, 'בספר יש 10 עמודים.')
  assert.equal(parseExamplePage('2.5', 10).error, 'כתוב מספר עמוד (מ-1 ומעלה), או השאר ריק.')
  assert.equal(parseExamplePage('0', 10).error, 'כתוב מספר עמוד (מ-1 ומעלה), או השאר ריק.')
})
