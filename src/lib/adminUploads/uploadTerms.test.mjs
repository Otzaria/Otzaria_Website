import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  QUEUE_STATUS,
  ageText,
  bookStatusOptions,
  bookStatusView,
  deletedForeverText,
  downloadLabel,
  emptyStateKind,
  emptyTrashDialog,
  fullDateText,
  movedToTrashText,
  partialText,
  permanentDeleteDialog,
  restoredText,
  selectedText,
  statusChangedText,
  statusRevertedText,
  uploadsCountText,
} from './uploadTerms.js'

const statuses = {
  not_checked: { label: 'לא נבדק', color: '#94a3b8' },
  In_treatment: { label: 'בטיפול', color: '#236cd1' },
  broken: { label: '  ', color: 'red; background:url(x)' },
}

test('bookStatusView: מההגדרות, מברירת המחדל, ומפתח שנמחק', () => {
  assert.deepEqual(bookStatusView('In_treatment', statuses), { key: 'In_treatment', label: 'בטיפול', color: '#236cd1' })
  assert.deepEqual(bookStatusView('ready', statuses), { key: 'ready', label: 'תקין ומוכן להכנסה', color: '#10b981' })
  assert.deepEqual(bookStatusView('gone_status', statuses), { key: 'gone_status', label: 'gone_status', color: '#94a3b8' })
  // בלי מפתח — התור; תווית ריקה וצבע לא תקין — לא עוברים לתצוגה
  assert.equal(bookStatusView(undefined, statuses).key, QUEUE_STATUS)
  assert.deepEqual(bookStatusView('broken', statuses), { key: 'broken', label: 'broken', color: '#94a3b8' })
})

test('bookStatusOptions: בסדר ההגדרות, עם מונים, ומצבים יתומים בסוף', () => {
  const counts = new Map([['In_treatment', 3], ['orphan', 1]])
  assert.deepEqual(bookStatusOptions(statuses, counts).map((o) => [o.value, o.count]), [
    ['not_checked', 0], ['In_treatment', 3], ['broken', 0], ['orphan', 1],
  ])
  // לפני שההגדרות נטענו — ברירות המחדל
  assert.deepEqual(bookStatusOptions(null).map((o) => o.value), ['not_checked', 'needs_attention', 'ready', 'added_to_library'])
})

test('ספירות והודעות בעברית — יחיד ורבים', () => {
  assert.equal(uploadsCountText(1), 'העלאה אחת')
  assert.equal(uploadsCountText(3999), '3,999 העלאות')
  assert.equal(downloadLabel(1), 'הורד קובץ')
  assert.equal(downloadLabel(12), 'הורד 12 קבצים')
})

const ONE = { books: 1, uploads: 1, title: 'חוות דעת' }
const ONE_BOOK = { books: 1, uploads: 12, title: 'חוות דעת' }
const MANY = { books: 3, uploads: 101, title: null }

test('הודעות אחרי פעולה — במונחי ספרים, עם שם הספר', () => {
  assert.equal(movedToTrashText(ONE), '"חוות דעת" הועבר לאשפה')
  assert.equal(movedToTrashText(ONE_BOOK), '12 העלאות של "חוות דעת" הועברו לאשפה')
  assert.equal(movedToTrashText(MANY), '3 ספרים הועברו לאשפה (101 העלאות)')
  assert.equal(restoredText(ONE), '"חוות דעת" שוחזר')
  assert.equal(restoredText(MANY), '3 ספרים שוחזרו (101 העלאות)')
  assert.equal(deletedForeverText({ books: 0, uploads: 291 }), '291 העלאות נמחקו לצמיתות')
  assert.equal(deletedForeverText({ books: 0, uploads: 1 }), 'העלאה אחת נמחקה לצמיתות')
  assert.equal(statusChangedText('בטיפול', ONE_BOOK), 'המצב של "חוות דעת" שונה ל"בטיפול"')
  assert.equal(statusChangedText('בטיפול', MANY), 'המצב של 3 ספרים שונה ל"בטיפול"')
  assert.equal(statusRevertedText(MANY), 'המצב הקודם של 3 ספרים הוחזר')
  assert.match(partialText('trash', 2, 3), /^רק 2 מתוך 3 העלאות הועברו לאשפה\./)
})

test('selectedText: ספרים קודם, והעלאות כשיש יותר', () => {
  assert.equal(selectedText({ books: 1, uploads: 1 }), 'ספר אחד נבחר')
  assert.equal(selectedText({ books: 1, uploads: 12 }), 'ספר אחד נבחר · 12 העלאות')
  assert.equal(selectedText({ books: 3, uploads: 101 }), '3 ספרים נבחרו · 101 העלאות')
  assert.equal(selectedText({ books: 1200, uploads: 1200 }), '1,200 ספרים נבחרו')
})

test('דיאלוגי המחיקה לצמיתות: כותרת קצרה, שם הספר בגוף; רוקן אשפה — המספר המדויק', () => {
  const one = permanentDeleteDialog(ONE)
  assert.equal(one.title, 'למחוק לצמיתות העלאה אחת?')
  assert.equal(one.body, '"חוות דעת" יימחק מהמערכת, ולא יהיה אפשר לשחזר אותו.')
  assert.equal(permanentDeleteDialog({ books: 1, uploads: 12, title: 'מרומי שדה א' }).title, 'למחוק לצמיתות 12 העלאות?')
  assert.match(permanentDeleteDialog({ books: 1, uploads: 12, title: 'מרומי שדה א' }).body, /^12 העלאות של "מרומי שדה א"/)
  assert.match(permanentDeleteDialog(MANY).body, /^101 העלאות מ-3 ספרים/)
  assert.equal(permanentDeleteDialog(ONE).confirmLabel, 'מחק לצמיתות')
  assert.equal(emptyTrashDialog(292).title, 'למחוק לצמיתות את כל 292 ההעלאות שבאשפה?')
  assert.equal(emptyTrashDialog(1).title, 'למחוק לצמיתות את ההעלאה שבאשפה?')
  assert.equal(emptyTrashDialog(1292).title, 'למחוק לצמיתות את כל 1,292 ההעלאות שבאשפה?')
  assert.match(emptyTrashDialog(5, { filtered: true }).body, /גם העלאות שהסינון מסתיר/)
  assert.equal(emptyTrashDialog(291).confirmLabel, 'רוקן אשפה')
})

test('emptyStateKind: תור ריק, אין התאמה לסינון, אשפה ריקה', () => {
  const none = { q: '', type: '', user: [], status: [] }
  assert.equal(emptyStateKind({ tab: 'uploads', total: 10, shown: 3, query: none }), null)
  assert.equal(emptyStateKind({ tab: 'uploads', total: 0, shown: 0, query: none }), 'queue-clear')
  assert.equal(emptyStateKind({ tab: 'uploads', total: 10, shown: 0, query: { ...none, status: [QUEUE_STATUS] } }), 'queue-clear')
  assert.equal(emptyStateKind({ tab: 'uploads', total: 10, shown: 0, query: { ...none, status: [QUEUE_STATUS], q: 'x' } }), 'no-match')
  assert.equal(emptyStateKind({ tab: 'uploads', total: 10, shown: 0, query: { ...none, status: [QUEUE_STATUS, 'ready'] } }), 'no-match')
  assert.equal(emptyStateKind({ tab: 'uploads', total: 10, shown: 0, query: { ...none, user: ['x'] } }), 'no-match')
  assert.equal(emptyStateKind({ tab: 'trash', total: 0, shown: 0, query: none }), 'trash-empty')
  assert.equal(emptyStateKind({ tab: 'trash', total: 5, shown: 0, query: { ...none, q: 'x' } }), 'no-match')
})

test('ageText ו-fullDateText: לפי לוח השנה בשעון ירושלים, לא לפי שעון המכונה', () => {
  // 2 בנובמבר 2026, 09:00 בירושלים = 07:00 UTC
  const now = Date.UTC(2026, 10, 2, 7, 0)
  assert.equal(ageText(Date.UTC(2026, 10, 1, 23, 30), now), 'היום') // 01:30 בירושלים — כבר היום
  assert.equal(ageText(Date.UTC(2026, 10, 1, 21, 30), now), 'אתמול') // 23:30 בירושלים אתמול
  assert.equal(ageText(Date.UTC(2026, 9, 31, 10), now), 'לפני יומיים')
  assert.equal(ageText(Date.UTC(2026, 9, 28, 10), now), 'לפני 5 ימים')
  assert.equal(ageText(Date.UTC(2026, 9, 1, 10), now), '1.10.2026')
  assert.equal(ageText(Date.UTC(2026, 10, 3, 7), now), 'היום') // שעון מעט מקדים
  assert.equal(ageText('not a date', now), '')
  assert.equal(ageText(null, now), '')
  assert.match(fullDateText(Date.UTC(2026, 10, 1, 21, 30)), /1 בנובמבר 2026.*23:30/)
  assert.equal(fullDateText(''), '')
})
