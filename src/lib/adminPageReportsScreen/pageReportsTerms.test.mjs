import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAGE_REPORTS_TITLE, appliedText, doneToast, emptyText, failText, pendingCountLabel,
  reportName, reportsCountText, statusOptionLabel,
} from './pageReportsTerms.js'

test('שם המסך — מהסרגל', () => {
  assert.equal(PAGE_REPORTS_TITLE, 'דיווחים על עמודים')
})

test('ספירות ותוויות', () => {
  assert.equal(reportsCountText(1), 'דיווח אחד')
  assert.equal(reportsCountText(12), '12 דיווחים')
  assert.equal(pendingCountLabel(1), 'אחד ממתין')
  assert.equal(pendingCountLabel(3), '3 ממתינים')
  assert.equal(statusOptionLabel('approved', 4), 'אושר 4')
  assert.equal(reportName({ bookName: 'בראשית רבה', pageNumber: 12 }), 'בראשית רבה, עמוד 12')
  assert.equal(reportName({ bookPath: 'x', pageNumber: 1 }), 'x, עמוד 1')
})

test('החלה על הטקסט', () => {
  assert.equal(appliedText('proposed'), 'התיקון הוחל על טקסט העמוד')
  assert.equal(appliedText('original'), 'בטקסט העמוד הוחזר הטקסט שבספר')
  assert.equal(appliedText(null), '')
})

test('הודעות אחרי פעולה', () => {
  const r = { bookName: 'ספר', pageNumber: 3 }
  assert.equal(doneToast('approve', r), 'התיקון אושר; טקסט העמוד לא השתנה — ספר, עמוד 3')
  assert.equal(doneToast('reject', r), 'התיקון נדחה; טקסט העמוד לא השתנה — ספר, עמוד 3')
  assert.equal(doneToast('handled', r), 'ההודעה סומנה כטופלה — ספר, עמוד 3')
  assert.equal(doneToast('reopen', r), 'הדיווח חזר לממתינים — ספר, עמוד 3')
  for (const action of ['approve', 'reject', 'handled', 'reopen', 'other']) assert.match(failText(action), /נסה שוב/)
})

test('ריק — לפי לשונית ומצב, בלי ז\'רגון', () => {
  assert.equal(emptyText('book_error', 'pending', '').title, 'אין טעויות שממתינות')
  assert.equal(emptyText('message', 'pending', 'b').title, 'אין הודעות שממתינות בספר הזה')
  assert.equal(emptyText('message', 'handled', '').title, 'אין דיווחים כאלה')
  for (const t of [emptyText('book_error', 'pending', ''), emptyText('message', 'all', '')]) {
    assert.doesNotMatch(t.title + t.description, /תור|סטטוס/)
  }
})
