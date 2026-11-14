import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIONS_HINT, DICTIONARY_DESCRIPTION, approveAriaLabel, bulkApproveConfirm, bulkProgressText, bulkResultText, doneToast, failedToast, pendingToast,
  removeLabel, removeUserConfirm, rowKeyAction, userDoneToast, userFailedToast, usersCountText, wordsCountText,
} from './dictionaryTerms.js'

test('ספירות: יחיד ורבים', () => {
  assert.equal(wordsCountText(1), 'מילה אחת')
  assert.equal(wordsCountText(1200), '1,200 מילים')
  assert.equal(usersCountText(1), 'משתמש אחד')
  assert.equal(usersCountText(3), '3 משתמשים')
})

test('הודעות: לפני, אחרי, כשל', () => {
  assert.match(pendingToast('approve', 'ובכן'), /"ובכן" תיכנס למילון הכללי/)
  assert.match(pendingToast('remove', 'ובכן'), /תוסר מהמילון האישי/)
  assert.equal(doneToast('skip', 'ובכן'), '"ובכן" דולגה.')
  assert.equal(failedToast('approve', 'ובכן', false), 'לא הצלחנו להוסיף את "ובכן".')
  assert.match(failedToast('skip', 'ובכן', true), /אצל כל המשתמשים/)
})

test('פעולה מרובה: התקדמות, סיכום וחלון אישור', () => {
  assert.equal(bulkProgressText('approve', { done: 3, total: 12 }), 'מוסיף למילון… 3 מתוך 12')
  assert.equal(bulkResultText('approve', { ok: 1, failed: 0, stopped: false }), 'מילה אחת נוספה למילון.')
  assert.equal(bulkResultText('skip', { ok: 4, failed: 2, stopped: true }), '4 מילים דולגו · 2 לא עודכנו ונשארו מסומנות · הפעולה נעצרה.')
  assert.equal(bulkResultText('approve', { ok: 0, failed: 1, stopped: false }), 'לא נוספו מילים · מילה אחת לא עודכנה ונשארה מסומנת.')
  assert.equal(bulkApproveConfirm(1).title, 'להוסיף מילה אחת למילון הכללי?')
  assert.equal(bulkApproveConfirm(5).confirmLabel, 'הוסף 5 מילים')
})

test('מקשי קיצור: לפי המקש הפיזי (גם במקלדת עברית), בלי Ctrl / Alt / ⌘', () => {
  assert.equal(rowKeyAction({ key: 'ArrowDown' }), 'next')
  assert.equal(rowKeyAction({ key: 'ArrowUp' }), 'prev')
  assert.equal(rowKeyAction({ key: 'ש', code: 'KeyA' }), 'approve')
  assert.equal(rowKeyAction({ key: 'ד', code: 'KeyS' }), 'skip')
  assert.equal(rowKeyAction({ key: 'j', code: 'KeyJ' }), 'next')
  assert.equal(rowKeyAction({ key: 'k', code: 'KeyK' }), 'prev')
  assert.equal(rowKeyAction({ key: 'a', code: 'KeyA', ctrlKey: true }), null)
  assert.equal(rowKeyAction({ key: 'z', code: 'KeyZ' }), null)
  assert.equal(rowKeyAction(null), null)
})

test('פעולה על מילה של כמה משתמשים — נאמר במפורש "לכל N המשתמשים"; פעולה על משתמש אחד — בשמו', () => {
  assert.match(pendingToast('remove', 'ובכן', 3), /של כל 3 המשתמשים/)
  assert.match(pendingToast('approve', 'ובכן', 3), /של כל 3 המשתמשים/)
  assert.match(pendingToast('skip', 'ובכן', 2), /אצל כל 2 המשתמשים/)
  assert.doesNotMatch(pendingToast('skip', 'ובכן', 1), /כל/)
  assert.equal(removeLabel(1), 'הסר מהמילון האישי של המשתמש')
  assert.equal(removeLabel(4), 'הסר מהמילון האישי של כל 4 המשתמשים')
  assert.match(approveAriaLabel('ובכן', 4), /לכל 4 המשתמשים/)
  assert.equal(userDoneToast('skip', 'ובכן', 'משה'), '"ובכן" דולגה אצל משה.')
  assert.match(userFailedToast('remove', 'ובכן', 'משה'), /אצל משה/)
  assert.equal(removeUserConfirm('ובכן', 'משה').cancelLabel, 'בטל')
  assert.equal(bulkApproveConfirm(2).cancelLabel, 'בטל')
  assert.match(DICTIONARY_DESCRIPTION, /בדיקת האיות בעורך/)
  assert.match(ACTIONS_HINT, /דלג.*תחזור.*הסר/)
})
