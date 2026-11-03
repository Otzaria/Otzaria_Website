/**
 * בדיקות לעזרי קיצורי המקלדת (src/lib/shortcuts.js). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatShortcut, isReservedShortcut, reservedShortcutMessage } from './shortcuts.js'

test('formatShortcut — תצוגה ידידותית', () => {
  assert.equal(formatShortcut('Ctrl+Shift+KeyZ'), 'Ctrl+Shift+Z')
  assert.equal(formatShortcut('Ctrl+Backslash'), 'Ctrl+\\')
})

test('isReservedShortcut — מקשי עריכה וניווט בלי מקש שינוי', () => {
  for (const c of ['Backspace', 'Delete', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(isReservedShortcut(c), true, c)
  }
})

test('isReservedShortcut — ביטול, ביצוע מחדש, העתקה, הדבקה, גזירה, בחירת הכול (Ctrl וגם Cmd)', () => {
  for (const c of ['Ctrl+KeyZ', 'Ctrl+KeyY', 'Ctrl+Shift+KeyZ', 'Ctrl+KeyC', 'Ctrl+KeyV', 'Ctrl+KeyX', 'Ctrl+KeyA',
    'Meta+KeyZ', 'Shift+Meta+KeyZ', 'Meta+KeyV']) {
    assert.equal(isReservedShortcut(c), true, c)
  }
})

test('isReservedShortcut — צירופים פנויים', () => {
  for (const c of ['Ctrl+KeyB', 'Ctrl+Backslash', 'Ctrl+Enter', 'Alt+KeyS', 'F11', 'Ctrl+Shift+KeyC', 'Ctrl+Alt+KeyZ',
    'Ctrl+Meta+KeyZ', 'Alt+ArrowUp', 'Ctrl+ArrowLeft', 'Shift+Enter', 'KeyQ', '', null]) {
    assert.equal(isReservedShortcut(c), false, String(c))
  }
})

test('reservedShortcutMessage — הודעה בעברית עם הצירוף, או null', () => {
  assert.equal(reservedShortcutMessage('Ctrl+KeyZ'), 'הצירוף Ctrl+Z שמור לפעולות עריכה בסיסיות. בחר צירוף אחר.')
  assert.equal(reservedShortcutMessage('Ctrl+KeyB'), null)
})
