/**
 * בדיקות עיצוב התאריך המשותף למסכי ניהול התוספים. הרצה: node --test src/app/library/admin/plugins/formatAdminDate.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAdminDate } from './formatAdminDate.js'

test('ערך ריק/undefined/null מחזיר מחרוזת ריקה ולא זורק', () => {
  assert.equal(formatAdminDate(''), '')
  assert.equal(formatAdminDate(null), '')
  assert.equal(formatAdminDate(undefined), '')
})

test('מעצב תאריך תקין בפורמט עברי הכולל שנה, חודש מילולי ויום, ושעה במבנה HH:MM', () => {
  const formatted = formatAdminDate('2024-03-15T10:30:00.000Z')
  // בודקים את המרכיבים הצפויים בלי להיצמד לשעה המדויקת (תלויה באזור הזמן של סביבת הריצה)
  assert.match(formatted, /2024/)
  assert.match(formatted, /15/)
  assert.match(formatted, /\d{1,2}:\d{2}/)
})

test('תואם למתנהג הישן: מחרוזת תאריך תקינה תמיד מיוצרת עם new Date().toLocaleDateString', () => {
  const value = '2023-01-01T00:00:00.000Z'
  const expected = new Date(value).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  assert.equal(formatAdminDate(value), expected)
})
