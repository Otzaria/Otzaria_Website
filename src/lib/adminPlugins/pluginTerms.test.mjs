import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  quoted, displayName, kindBadge, approveLabel, rejectLabel, rejectNote, rejectedMessage, approvedMessage, versionParts, stabilityBadge,
  storeState, suspendedByOwner, ratingAverage, ratingText, downloadsText, pluginsCountText, historyText,
  sortedVersions, fileSizeText, rejectConfirm, approveUpdateConfirm, suspendMessage, unapproveConfirm,
  resumeOwnerConfirm, deleteForeverConfirm, deleteVersionConfirm, bulkResultText, bulkProgressText,
} from './pluginTerms.js'
import { LRI, PDI } from '../adminList/fileSize.js'

const fresh = { _id: 'n', name: 'זמני היום', version: '1.0.0' }
const update = { _id: 'u', name: 'לוח', version: '1.2.0', isApproved: true, pendingUpdate: { name: 'לוח עברי', version: '1.3.0' } }
// תוסף בחנות עם עדכון ש"הוחזר להמתנה" — השרת ימחק את הכול, לא רק את העדכון
const returnedWithUpdate = { ...update, isApproved: false, versions: [{ version: '1.1.0' }, { version: '1.0.0' }], downloadCount: 3076, ratingCount: 2 }
const returned = { _id: 'r', name: 'שנים מקרא', version: '2.0.0', isApproved: false, versions: Array.from({ length: 13 }, (_, i) => ({ version: `1.${i}` })), downloadCount: 3076 }

test('סוג וגרסה בתור', () => {
  assert.equal(kindBadge(fresh).label, 'חדש')
  assert.equal(kindBadge(update).label, 'עדכון')
  assert.equal(kindBadge(returned).label, 'הוחזר להמתנה')
  assert.equal(kindBadge(returned).tone, 'warning')
  assert.deepEqual(versionParts(update), { next: '1.3.0', prev: '1.2.0', same: false })
  assert.deepEqual(versionParts(fresh), { next: '1.0.0', prev: null, same: false })
  // עדכון באותה גרסה (תיקון בלי מספר חדש)
  assert.deepEqual(versionParts({ ...update, pendingUpdate: { version: '1.2.0' } }), { next: '1.2.0', prev: null, same: true })
})

test('יציבות: תג רק כשאינה "יציב"', () => {
  assert.equal(stabilityBadge('stable'), null)
  assert.equal(stabilityBadge(undefined), null)
  assert.deepEqual(stabilityBadge('beta'), { label: 'בטא', tone: 'neutral' })
  assert.deepEqual(stabilityBadge('experimental'), { label: 'ניסיוני', tone: 'warning' })
})

test('מצב בחנות: מי השהה', () => {
  assert.equal(storeState(fresh).kind, 'active')
  assert.equal(storeState({ isSuspended: true, suspendedByRole: 'admin' }).label, 'מושהה על ידי הניהול')
  assert.equal(storeState({ isSuspended: true, suspendedByRole: 'owner' }).label, 'מושהה על ידי המפתח')
  assert.equal(storeState({ isSuspended: true, suspendedByRole: 'owner' }).short, 'מושהה על ידי המפתח')
  assert.equal(storeState({ isSuspended: true, suspendedByRole: 'admin' }).short, 'מושהה')
  assert.equal(suspendedByOwner({ isSuspended: true, suspendedByRole: 'owner' }), true)
  assert.equal(suspendedByOwner({ isSuspended: true, suspendedByRole: 'admin' }), false)
  assert.equal(suspendedByOwner({ isSuspended: false, suspendedByRole: 'owner' }), false)
})

test('ספירות ביחיד וברבים', () => {
  assert.equal(ratingText({ ratingCount: 0 }), 'אין דירוגים')
  assert.equal(ratingText({ ratingCount: 1, ratingAvg: 5 }), '5.0 · דירוג אחד')
  assert.equal(ratingText({ ratingCount: 12, ratingAvg: 4.25 }), '4.3 · 12 דירוגים')
  assert.equal(downloadsText(0), 'לא הורד עדיין')
  assert.equal(downloadsText(1), 'הורדה אחת')
  assert.equal(downloadsText(1500), '1,500 הורדות')
  assert.equal(pluginsCountText(1), 'תוסף אחד')
  assert.equal(pluginsCountText(3), '3 תוספים')
  assert.equal(quoted('אבג'), '״אבג״')
  assert.equal(ratingAverage(4.25), '4.3')
  assert.equal(displayName({}), 'תוסף בלי שם')
  assert.equal(displayName({ name: 'א' }), 'א')
})

test('גרסאות קודמות מהחדשה לישנה, וגודל קובץ', () => {
  const p = { versions: [{ version: '1', archivedAt: '2026-01-01' }, { version: '3', archivedAt: '2026-06-01' }, { version: '2', archivedAt: '2026-03-01' }] }
  assert.deepEqual(sortedVersions(p).map((v) => v.version), ['3', '2', '1'])
  assert.deepEqual(sortedVersions({}), [])
  assert.equal(fileSizeText(0), '')
  assert.equal(fileSizeText(500), `${LRI}500 B${PDI}`)
  assert.equal(fileSizeText(2048), `${LRI}2 KB${PDI}`)
  assert.equal(fileSizeText(3.5 * 1024 * 1024), `${LRI}3.5 MB${PDI}`)
})

test('"דחה" אומר במפורש שהבקשה נמחקת; בעדכון — שהגרסה שבחנות נשארת', () => {
  const n = rejectConfirm(fresh)
  assert.equal(n.tone, 'danger')
  assert.match(n.body, /תימחק/)
  assert.ok(n.details.some((d) => d.includes('אי אפשר לבטל')))
  const u = rejectConfirm(update)
  assert.match(u.body, /יימחק/)
  assert.match(u.body, /הגרסה שבחנות/)
  assert.match(u.body, /לוח עברי/)
})

test('"דחה" על תוסף שהוחזר להמתנה: אומר שהכול נמחק, עם המספרים — גם כשיש עדכון שממתין', () => {
  const r = rejectConfirm(returned)
  assert.equal(r.title, 'למחוק את התוסף לצמיתות?')
  assert.equal(r.confirmLabel, 'מחק לצמיתות')
  assert.ok(r.details.some((d) => d.includes('14 גרסאות') && d.includes('3,076 הורדות')))
  assert.equal(r.details.some((d) => d.includes('העדכון שממתין')), false)
  // החלטת המשתמש: חלון אדום שמציע השהיה במקום מחיקה
  assert.equal(r.tone, 'danger')
  assert.ok(r.details.some((d) => d.includes('השהה') && d.includes('אין צורך למחוק')))

  const w = rejectConfirm(returnedWithUpdate)
  assert.doesNotMatch(w.body, /הגרסה שבחנות/)
  assert.doesNotMatch(w.details.join(' '), /נשארת כמו שהיא/)
  assert.ok(w.details.some((d) => d.includes('גם העדכון שממתין יימחק')))
  assert.ok(w.details.some((d) => d.includes('3 גרסאות')))

  assert.equal(rejectLabel(returnedWithUpdate), 'מחק לצמיתות')
  assert.equal(approveLabel(returnedWithUpdate), 'אשר והחזר לחנות')
  assert.equal(approveLabel(returned), 'אשר')
  assert.equal(approveLabel(update), 'אשר עדכון')
  assert.equal(approveLabel(fresh), 'אשר')
  assert.equal(rejectLabel(update), 'דחה את העדכון')
  assert.equal(rejectLabel(fresh), 'דחה')
  assert.match(rejectNote(returned), /14 גרסאות/)
  assert.match(rejectedMessage(returned), /נמחק לצמיתות/)
  assert.match(rejectedMessage(update), /נשאר בחנות/)
  assert.match(rejectedMessage(fresh), /נדחתה ונמחקה/)
})

test('סיכום פעולה מרובה: כמה הצליחו, כמה לא, ולמה', () => {
  assert.deepEqual(bulkResultText('suspend', { done: 5 }), { message: '5 תוספים הושהו ולא מוצגים בחנות.', tone: 'success' })
  assert.deepEqual(bulkResultText('resume', { done: 1 }), { message: 'תוסף אחד חזר לחנות.', tone: 'success' })
  const partial = bulkResultText('suspend', { done: 3, failed: 2, failedNames: ['א', 'ב'] })
  assert.equal(partial.tone, 'error')
  assert.equal(partial.message, '3 תוספים הושהו ולא מוצגים בחנות. 2 תוספים לא עודכנו (״א״, ״ב״). נסה שוב.')
  assert.doesNotMatch(bulkResultText('suspend', { done: 0, failed: 5, failedNames: ['1', '2', '3', '4', '5'] }).message, /״/)
  assert.deepEqual(bulkResultText('suspend', { done: 2, stopped: 3 }), { message: '2 תוספים הושהו ולא מוצגים בחנות. נעצר: 3 תוספים לא עודכנו.', tone: 'info' })
  assert.match(bulkResultText('resume', { done: 2, skipped: 1 }).message, /תוסף אחד דולג: המפתח השהה/)
  assert.deepEqual(bulkResultText('resume', { done: 0, unchanged: 4 }), { message: 'כל הנבחרים כבר מוצגים בחנות.', tone: 'info' })
  assert.equal(bulkResultText('suspend', { done: 0, unchanged: 4 }).message, 'כל הנבחרים כבר מושהים.')
  assert.equal(bulkResultText('assign', { done: 0, unchanged: 4, category: 'כלים' }).message, 'כל הנבחרים כבר ב״כלים״.')
  assert.equal(bulkResultText('assign', { done: 2, category: 'כלים' }).message, '2 תוספים שובצו ב״כלים״.')
  assert.equal(bulkProgressText('suspend', { done: 3, total: 12 }), 'משהה… 3 מתוך 12')
})

test('מה נמחק עם התוסף', () => {
  assert.equal(historyText({}), 'גרסה אחת')
  assert.equal(historyText({ versions: [{}], downloadCount: 1 }), '2 גרסאות והורדה אחת')
  assert.equal(historyText({ versions: [{}, {}], downloadCount: 3076, ratingCount: 2 }), '3 גרסאות, 3,076 הורדות ו-2 דירוגים')
})

test('אישור עדכון: הגרסה הקודמת נשמרת רק כשהמספר עולה', () => {
  assert.ok(approveUpdateConfirm(update).details.some((d) => d.includes('גרסה 1.2.0 תישמר')))
  const same = approveUpdateConfirm({ ...update, pendingUpdate: { name: 'לוח', version: '1.2.0' } })
  assert.equal(same.details.some((d) => d.includes('תישמר')), false)
  assert.ok(same.details.some((d) => d.includes('הקובץ הקיים יוחלף ולא יישמר')))
  assert.match(same.body, /באותה גרסה/)
  const lower = approveUpdateConfirm({ ...update, pendingUpdate: { name: 'לוח', version: '1.1.0' } })
  assert.equal(lower.details.some((d) => d.includes('תישמר')), false)
  assert.ok(lower.details.some((d) => d.includes('לא עלה')))
  const back = approveUpdateConfirm(returnedWithUpdate)
  assert.equal(back.confirmLabel, 'אשר והחזר לחנות')
  assert.ok(back.details.some((d) => d.includes('במייל')))
})

test('הודעות אחרי אישור: מושהה נשאר מושהה', () => {
  assert.match(approvedMessage(fresh), /אושר ומוצג בחנות/)
  assert.match(approvedMessage(update), /העדכון של/)
  assert.match(approvedMessage(returned), /חזר לחנות/)
  assert.match(approvedMessage({ ...returned, isSuspended: true }), /עדיין מושהה/)
})

test('החזרה: המייל באישור מחדש, ועדכון שממתין', () => {
  assert.ok(unapproveConfirm(fresh).details.some((d) => d.includes('מייל')))
  assert.equal(unapproveConfirm(fresh).details.some((d) => d.includes('עדכון שממתין')), false)
  assert.ok(unapproveConfirm(update).details.some((d) => d.includes('את כל התוסף')))
  assert.match(resumeOwnerConfirm(fresh).body, /בעצמו/)
})

test('שאר החלונות וההודעות', () => {
  assert.match(approveUpdateConfirm(update).body, /1\.3\.0/)
  assert.equal(approveUpdateConfirm(update).tone, undefined)
  assert.match(unapproveConfirm(fresh).body, /"לאישור"/)
  assert.equal(deleteForeverConfirm(fresh).tone, 'danger')
  assert.equal(deleteForeverConfirm(fresh).confirmLabel, 'מחק לצמיתות')
  assert.match(deleteVersionConfirm(fresh, '0.9').title, /0\.9/)
  assert.equal(suspendMessage('suspend', [fresh]), '״זמני היום״ הושהה ולא מוצג בחנות')
  assert.equal(suspendMessage('resume', [fresh]), '״זמני היום״ חזר לחנות')
  assert.equal(suspendMessage('suspend', [fresh, update]), '2 תוספים הושהו ולא מוצגים בחנות')
})
