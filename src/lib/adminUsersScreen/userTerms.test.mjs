import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLE_LABELS } from '../roles.js'
import {
  TEAMS, TEAM_FLAGS, RESTRICTIONS, userTeams, roleLabel, roleTone, showsRoleTag, displayName, hasName, roleAccessLines, roleLostItems,
  roleChangeConfirm, validateDetails, detailsForm, detailsChanges, hasChanges, detailsBody, flagBody, detailsPatch, flagPatch,
  deleteConfirmed, activityCounts, teamToast, teamPendingText, teamDescription, blockReason, ROLE_IDS, ROLE_HINTS, ROLE_OPTIONS,
  savedToast, deleteImpact,
} from './userTerms.js'

const USER = { _id: 'u1', name: 'משה כהן', email: 'moshe@example.com', role: 'user', points: 12, isSupervisor: true, completedPages: 4, inProgressPages: 2 }

test('דגלים: שלושה, בדגל שהוא true ממש', () => {
  assert.deepEqual(TEAMS.map((t) => t.field), ['isSupervisor', 'isCorrectionsVolunteer', 'dictaEditBlocked'])
  assert.deepEqual(userTeams({ isSupervisor: true, dictaEditBlocked: 'true' }).map((t) => t.id), ['supervisor'])
  assert.deepEqual(userTeams(null), [])
})

test('צוותים והגבלה: החסימה בנפרד, והתיאורים אומרים איפה הם חלים', () => {
  assert.deepEqual(TEAM_FLAGS.map((t) => t.id), ['supervisor', 'volunteer'])
  assert.deepEqual(RESTRICTIONS.map((t) => t.id), ['blocked'])
  assert.match(TEAMS[0].description, /מרחב עריכת הספרים/)
  assert.match(TEAMS[2].description, /מרחב עריכת הספרים/)
  assert.match(TEAMS[2].description, /עבודה על עמודים לא נפגעת/)
  assert.match(teamDescription(TEAMS[0], { blocked: true }), /לא פעיל כל עוד הוא חסום/)
  assert.equal(teamDescription(TEAMS[0]), TEAMS[0].description)
})

test('סיבת חסימה: הנוסח הקבוע של השרת אינו סיבה', () => {
  assert.equal(blockReason({ dictaEditBlocked: true, dictaEditBlockedReason: 'הצעות לא רציניות' }), 'הצעות לא רציניות')
  assert.equal(blockReason({ dictaEditBlocked: true, dictaEditBlockedReason: 'נחסם דרך ממשק ניהול המשתמשים' }), '')
  assert.equal(blockReason({ dictaEditBlocked: false, dictaEditBlockedReason: 'x' }), '')
})

test('תפקידים: השמות מ-ROLE_LABELS, לא מוכר = משתמש; תג ניטרלי, ובלי תג למשתמש רגיל', () => {
  assert.deepEqual(ROLE_IDS, Object.keys(ROLE_LABELS))
  assert.equal(roleLabel('admin_books'), ROLE_LABELS.admin_books)
  assert.equal(roleLabel('nope'), 'משתמש')
  assert.equal(roleTone('admin'), 'primary')
  assert.equal(roleTone('admin_ocr'), 'neutral')
  assert.equal(roleTone('user'), 'neutral')
  assert.equal(roleTone(undefined), 'neutral')
  assert.equal(showsRoleTag('user'), false)
  assert.equal(showsRoleTag('weird'), false)
  assert.equal(showsRoleTag('developer'), true)
})

test('הסבר לכל תפקיד בבורר', () => {
  for (const role of ROLE_IDS) assert.ok(ROLE_HINTS[role], role)
  assert.deepEqual(ROLE_OPTIONS.map((o) => o.value), ROLE_IDS)
  assert.notEqual(ROLE_HINTS.admin_books, ROLE_HINTS.admin_books_only)
})

test('שם לתצוגה', () => {
  assert.equal(displayName({ name: '  ', email: 'a@b.co' }), 'a@b.co')
  assert.equal(displayName({}), 'משתמש בלי שם')
  assert.equal(hasName({ name: ' ' }), false)
  assert.equal(hasName({ name: 'א' }), true)
})

test('מה התפקיד רואה — מהסרגל עצמו, לפי התפקיד בלבד', () => {
  assert.deepEqual(roleAccessLines('user'), [])
  assert.deepEqual(roleAccessLines('user', { isSupervisor: true }), [])
  assert.deepEqual(roleAccessLines('developer'), ['דיווחי תקלות'])
  assert.equal(roleAccessLines('admin_books_only')[0], 'לוח הניהול')
  const books = roleAccessLines('admin_books')
  assert.ok(books.some((l) => l.startsWith('ספרים: ') && l.includes('העלאות')))
  assert.ok(!books.join(' ').includes('משתמשים'))
  assert.ok(roleAccessLines('admin').some((l) => l.includes('משתמשים')))
})

test('מה ייעלם בשינוי תפקיד', () => {
  const lost = roleLostItems('admin', 'admin_books')
  assert.ok(lost.includes('משתמשים'))
  assert.ok(lost.includes('לאישור'))
  assert.ok(!lost.includes('ספרים'))
  assert.deepEqual(roleLostItems('user', 'admin'), [])
})

test('חלון שינוי תפקיד', () => {
  const c = roleChangeConfirm({ user: USER, role: 'admin_books' })
  assert.equal(c.title, 'לשנות את התפקיד למנהל ספרים?')
  assert.match(c.body, /יראה:$/)
  assert.ok(c.details.length > 0)
  assert.equal(c.tone, 'default')
  assert.equal(c.warning, '')
  assert.equal(c.lost, '')
  assert.match(c.note, /כשהוא יתחבר מחדש/)
  // מתנדב תיקונים: "דיווחי טעויות" לא מגיע מהתפקיד "מפתח"
  const dev = roleChangeConfirm({ user: { ...USER, isCorrectionsVolunteer: true }, role: 'developer' })
  assert.deepEqual(dev.details, ['דיווחי תקלות'])
  const down = roleChangeConfirm({ user: { name: 'ב', role: 'admin' }, role: 'admin_books' })
  assert.match(down.lost, /^לא יראה יותר: .*משתמשים/)
  const none = roleChangeConfirm({ user: { name: 'א' }, role: 'user' })
  assert.match(none.body, /לא יראה את ממשק הניהול/)
  const self = roleChangeConfirm({ user: { name: 'אני', role: 'admin' }, role: 'admin_books', self: true })
  assert.equal(self.tone, 'danger')
  assert.match(self.warning, /החשבון שלך/)
  assert.equal(self.body, 'אתה תהיה מנהל ספרים. בניהול תראה:')
  assert.match(self.lost, /^לא תראה יותר:/)
  assert.match(self.note, /כשתתחבר מחדש/)
  assert.equal(roleChangeConfirm({ user: { name: 'אני' }, role: 'admin', self: true }).warning, '')
})

test('ההודעה אחרי שמירה', () => {
  const none = { name: false, email: false, points: false, role: false }
  assert.equal(savedToast('משה', { ...none, role: true }, 'admin_books'), 'התפקיד של משה שונה למנהל ספרים')
  assert.equal(savedToast('משה', { ...none, role: true, name: true }, 'admin'), 'הפרטים והתפקיד של משה נשמרו')
  assert.equal(savedToast('משה', { ...none, points: true }, 'user'), 'הפרטים של משה נשמרו')
})

test('בדיקת הפרטים', () => {
  assert.deepEqual(validateDetails({ name: 'א', email: 'a@b.co', points: '5' }), {})
  assert.deepEqual(Object.keys(validateDetails({ name: ' ', email: 'bad', points: '1.5' })).sort(), ['email', 'name', 'points'])
  assert.equal(validateDetails({ name: 'א', email: '', points: '0' }).email, 'כתוב כתובת דואר.')
  assert.equal(validateDetails({ name: 'א', email: 'a@b.co', points: '-3' }).points, undefined)
  // רק מה ששונה נבדק: נקודות ענקיות ישנות ושם חסר לא חוסמים שינוי בשדה אחר
  const changed = { name: false, email: true, points: false, role: false }
  assert.deepEqual(validateDetails({ name: '', email: 'a@b.co', points: '12345678901234567890' }, changed), {})
  assert.equal(validateDetails({ name: 'א', email: 'a@b.co', points: '12345678901' }).points, undefined)
  assert.equal(validateDetails({ name: 'א', email: 'a@b.co', points: '99999999999999999999' }).points, 'כתוב מספר שלם.')
})

test('טופס ושינויים', () => {
  const form = detailsForm(USER)
  assert.deepEqual(form, { name: 'משה כהן', email: 'moshe@example.com', points: '12', role: 'user' })
  assert.equal(detailsForm({ role: 'weird' }).role, 'user')
  assert.equal(detailsForm({ points: 1e21 }).points, '1000000000000000000000')
  assert.equal(hasChanges(detailsChanges(USER, form)), false)
  assert.equal(hasChanges(detailsChanges(USER, { ...form, name: ' משה כהן ' })), false)
  assert.deepEqual(detailsChanges(USER, { ...form, role: 'admin', points: '13' }), { name: false, email: false, points: true, role: true })
})

test('גוף ה-PUT של מתג: הערכים השמורים כמו שהם, בלי קיצוץ, ועוד הדגל', () => {
  const odd = { ...USER, name: ' משה ', email: 'Moshe@Example.com ', role: 'weird' }
  assert.deepEqual(flagBody(odd, 'isSupervisor', false), { userId: 'u1', name: ' משה ', email: 'Moshe@Example.com ', role: 'weird', points: 12, isSupervisor: false })
  assert.equal('isSupervisor' in flagBody(USER, 'dictaEditBlocked', true), false)
  // שדה חסר לא נשלח ב-JSON
  assert.equal(JSON.stringify(flagBody({ _id: 'x' }, 'dictaEditBlocked', true)), '{"userId":"x","dictaEditBlocked":true}')
})

test('גוף ה-PUT של "שמור": מה ששונה מהטופס, השאר מהשמור כמו שהוא; בלי דגלים', () => {
  const form = { name: ' דוד ', email: ' d@e.co ', points: '7', role: 'admin' }
  const all = { name: true, email: true, points: true, role: true }
  assert.deepEqual(detailsBody(USER, form, all), { userId: 'u1', name: 'דוד', email: 'd@e.co', role: 'admin', points: 7 })
  const onlyRole = { name: false, email: false, points: false, role: true }
  const saved = { ...USER, name: 'משה ', isSupervisor: false }
  assert.deepEqual(detailsBody(saved, form, onlyRole), { userId: 'u1', name: 'משה ', email: 'moshe@example.com', role: 'admin', points: 12 })
})

test('השינוי המקומי אחרי שמירה: רק השדות ששונו, ומה שהשרת קבע', () => {
  const changes = { name: true, email: false, points: false, role: false }
  const patch = detailsPatch({ userId: 'u1', name: 'דוד', email: 'x', role: 'user', points: 7 }, changes, { isVerified: false, name: 'X', isSupervisor: false })
  assert.deepEqual(patch, { _id: 'u1', isVerified: false, name: 'דוד' })
  assert.deepEqual(flagPatch('u1', TEAMS[0], true, {}), { _id: 'u1', isSupervisor: true })
  const blocked = flagPatch('u1', TEAMS[2], true, { dictaEditBlockedReason: 'נחסם דרך ממשק ניהול המשתמשים', dictaEditBlockedAt: '2026-11-01' })
  assert.deepEqual(blocked, { _id: 'u1', dictaEditBlocked: true, dictaEditBlockedReason: 'נחסם דרך ממשק ניהול המשתמשים', dictaEditBlockedAt: '2026-11-01' })
  assert.equal(flagPatch('u1', TEAMS[2], false, null).dictaEditBlockedReason, '')
})

test('מחיקה: מה יקרה לעמודים, במספרים', () => {
  assert.deepEqual(deleteImpact({}), ['אין לו עמודים, כך שהספרים לא יושפעו.'])
  const both = deleteImpact({ completedPages: 5, inProgressPages: 1 })
  assert.equal(both[0], '5 עמודים שהושלמו ועוד עמוד אחד בעבודה יחזרו להיות פנויים.')
  assert.match(both[1], /ההתקדמות של הספרים/)
  assert.deepEqual(deleteImpact({ inProgressPages: 2 }), ['2 עמודים שלו יחזרו להיות פנויים.'])
  assert.equal(deleteImpact({ completedPages: 1200 })[0], '1,200 עמודים שהושלמו יחזרו להיות פנויים.')
})

test('אישור מחיקה: הדואר המדויק', () => {
  assert.equal(deleteConfirmed(' MOSHE@example.com ', 'moshe@example.com'), true)
  assert.equal(deleteConfirmed('moshe@example', 'moshe@example.com'), false)
  assert.equal(deleteConfirmed('', ''), false)
})

test('מונים והודעות', () => {
  assert.deepEqual(activityCounts(USER), { points: 12, completed: 4, inProgress: 2 })
  assert.deepEqual(activityCounts({}), { points: 0, completed: 0, inProgress: 0 })
  assert.equal(teamToast(TEAMS[2], true, 'משה'), 'משה נחסם מעריכה')
  assert.equal(teamToast(TEAMS[2], false, 'משה'), 'החסימה של משה בוטלה')
  assert.equal(teamToast(TEAMS[0], true, 'משה'), 'משה נוסף לצוות "מפקח"')
  assert.equal(teamPendingText(TEAMS[2], true, 'משה'), 'משה ייחסם מעריכה')
  assert.equal(teamPendingText(TEAMS[1], false, 'משה'), 'משה יוסר מהצוות "מתנדב תיקונים"')
})
