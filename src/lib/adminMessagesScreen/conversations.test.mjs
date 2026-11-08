import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAFF_ROLES, audienceText, counterpart, recipientSide, groupMatchesSearch, groupSent, hasBothSides, isIncoming, isStaff, lastActivity,
  lastActivityDate, matchesSearch, snippet, sortByActivity, splitBoxes, subjectText, threadOf, unreadCount, withLocalRead,
} from './conversations.js'

const msg = (id, extra = {}) => ({
  id, subject: `נושא ${id}`, content: `תוכן ${id}`, senderName: 'משה', senderEmail: 'moshe@example.test', senderId: 'u-moshe',
  senderRole: 'user', status: 'read', createdAt: '2026-01-01T10:00:00.000Z', replies: [],
  recipientName: null, recipientEmail: null, recipientId: null, ...extra,
})
/** הודעה שהצוות שלח למשתמש */
const out = (id, extra = {}) => msg(id, {
  senderName: 'בודק מנהל', senderEmail: 'admin@example.test', senderId: 'u-admin', senderRole: 'admin',
  recipientName: 'ראובן', recipientEmail: 'reuven@example.test', recipientId: 'u-reuven', ...extra,
})

test('צוות = מי שרואה את מסך ההודעות בלבד (כמו הסרגל וה-proxy)', () => {
  assert.deepEqual([...STAFF_ROLES].sort(), ['admin', 'admin_books', 'admin_plugins'])
  for (const role of ['admin_ocr', 'model_trainer', 'admin_books_only', 'developer', 'user', null, undefined]) assert.equal(isStaff(role), false, role)
})

test('נכנסות: פנייה של משתמש; של משתמש שנמחק (בלי נמען)', () => {
  assert.equal(isIncoming(msg('a')), true)
  assert.equal(isIncoming(msg('b', { senderRole: null, senderId: null, senderEmail: null, senderName: 'משתמש לא ידוע' })), true)
})

test('נכנסות: פנייה של מנהל OCR, מאמן מודלים ומנהל ספרים-בלבד — הם פונים כמשתמשים', () => {
  for (const role of ['admin_ocr', 'model_trainer', 'admin_books_only']) {
    assert.equal(isIncoming(msg(role, { senderRole: role })), true, role)
    assert.equal(isIncoming(msg(role, { senderRole: role, status: 'unread' })), true, role)
  }
})

test('נכנסות: כל מה שלא נקרא — גם כשכל הכותבים מהצוות (מונה הלשונית = מונה הסרגל)', () => {
  // מנהל ספרים כתב לצוות מהאזור האישי
  assert.equal(isIncoming(msg('a', { senderRole: 'admin_books', status: 'unread' })), true)
  // משתמש שקודם לתפקיד ניהול — הפנייה הישנה שלו שלא נקראה
  assert.equal(isIncoming(out('b', { status: 'unread' })), true)
  const list = [msg('1', { status: 'unread' }), msg('2', { senderRole: 'admin', status: 'unread' }), out('3', { status: 'unread' }), out('4')]
  const { inbox } = splitBoxes(list)
  assert.equal(unreadCount(inbox), unreadCount(list))
})

test('נשלחו: רק הצוות כתב; תשובה של המשתמש מעבירה לנכנסות', () => {
  const o = out('c')
  assert.equal(isIncoming(o), false)
  assert.equal(isIncoming({ ...o, replies: [{ senderRole: 'admin_books', content: 'עוד' }] }), false)
  assert.equal(isIncoming({ ...o, replies: [{ senderRole: 'user', content: 'תודה' }] }), true)
  assert.equal(isIncoming({ ...o, replies: [{ senderRole: 'admin_ocr', content: 'תודה' }] }), true)
  // כותב תשובה שנמחק — לא ידוע, לא מעביר
  assert.equal(isIncoming({ ...o, replies: [{ senderRole: null, content: 'מחוק' }] }), false)
})

test('נשלחו: הודעה עם נמען ממנהל שנמחק (גם "לכל המשתמשים") — לא מתפזרת לנכנסות', () => {
  const gone = { senderRole: null, senderId: null, senderEmail: null, senderName: 'משתמש לא ידוע', subject: 'עדכון', content: 'שלום' }
  const list = Array.from({ length: 40 }, (_, i) => out(`b${i}`, { ...gone, recipientId: `u${i}`, recipientName: `משתמש ${i}`, createdAt: `2026-01-01T10:00:00.0${String(i).padStart(2, '0')}Z` }))
  const { inbox, sent } = splitBoxes(list)
  assert.equal(inbox.length, 0)
  const groups = groupSent(sent)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].recipients.length, 40)
})

test('הצד השני: פנייה — השולח; הודעה של הצוות שהמשתמש ענה עליה — הנמען (לא המנהל)', () => {
  assert.deepEqual(counterpart(msg('a')), { name: 'משה', email: 'moshe@example.test', side: 'sender', gone: false })
  const answered = out('b', { status: 'unread', replies: [{ senderRole: 'user', senderName: 'ראובן', content: 'תודה' }] })
  assert.equal(isIncoming(answered), true)
  assert.deepEqual(counterpart(answered), { name: 'ראובן', email: 'reuven@example.test', side: 'recipient', gone: false })
  // מנהל ספרים כתב לצוות (בלי נמען) — הוא הצד השני
  assert.equal(counterpart(msg('c', { senderRole: 'admin_books', senderName: 'בודק ספרים' })).name, 'בודק ספרים')
  // "נשלחו": הנמען; נמען שנמחק — gone
  assert.equal(recipientSide(out('d')).name, 'ראובן')
  assert.equal(recipientSide(out('d', { recipientId: null, recipientName: null, recipientEmail: null })).gone, true)
  // שולח שנמחק — gone (אין למי להשיב)
  assert.equal(counterpart(msg('e', { senderId: null, senderEmail: null, senderRole: null, senderName: 'משתמש לא ידוע' })).gone, true)
})

test('מיון: לפי הפעילות האחרונה (תשובה אחרונה, אחרת יצירה), מהחדשה; התאריך המוצג = תאריך המיון', () => {
  const a = msg('a', { createdAt: '2026-01-03T00:00:00Z' })
  const b = msg('b', { createdAt: '2026-01-01T00:00:00Z', replies: [{ createdAt: '2026-01-05T00:00:00Z' }] })
  const c = msg('c', { createdAt: '2026-01-02T00:00:00Z' })
  assert.deepEqual(sortByActivity([a, b, c]).map((m) => m.id), ['b', 'a', 'c'])
  assert.equal(lastActivity(b), Date.parse('2026-01-05T00:00:00Z'))
  assert.equal(lastActivityDate(b), '2026-01-05T00:00:00Z')
  assert.equal(lastActivity({}), 0)
})

test('splitBoxes ו-unreadCount', () => {
  const list = [msg('a', { status: 'unread' }), out('b'), msg('c')]
  const { inbox, sent } = splitBoxes(list)
  assert.deepEqual(inbox.map((m) => m.id).sort(), ['a', 'c'])
  assert.deepEqual(sent.map((m) => m.id), ['b'])
  assert.equal(unreadCount(inbox), 1)
  assert.equal(unreadCount(undefined), 0)
})

test('withLocalRead: "סמן כנקרא" שממתין שורד רענון שמחזיר "לא נקראה"', () => {
  const list = [msg('a', { status: 'unread' }), msg('b', { status: 'unread' })]
  const shown = withLocalRead(list, new Set(['a']))
  assert.deepEqual(shown.map((m) => m.status), ['read', 'unread'])
  assert.equal(withLocalRead(list, new Set()), list)
})

test('threadOf: ההודעה ואחריה התשובות, עם "מהצוות" לפי הצוות שמטפל בהודעות', () => {
  const t = threadOf(msg('a', { replies: [{ id: 'r1', senderName: 'רב', senderRole: 'admin', content: 'כן' }, { senderRole: 'admin_ocr', senderName: 'אורי', content: 'תודה' }, { content: 'מחוק' }] }))
  assert.deepEqual(t.map((x) => [x.author, x.fromTeam, x.content]), [['משה', false, 'תוכן a'], ['רב', true, 'כן'], ['אורי', false, 'תודה'], ['חשבון שנמחק', false, 'מחוק']])
  assert.equal(t[2].id, 'a-2')
  assert.equal(hasBothSides(t), true)
  assert.equal(hasBothSides(threadOf(out('b'))), false)
  assert.deepEqual(threadOf(null), [])
})

test('snippet: המילים האחרונות, שורה אחת, מקוצר; subjectText — "בלי נושא"', () => {
  assert.equal(snippet(msg('a', { content: 'שורה\n\nשנייה   כאן' })), 'שורה שנייה כאן')
  assert.equal(snippet(msg('a', { replies: [{ content: 'תשובה' }] })), 'תשובה')
  const long = snippet(msg('a', { content: 'א'.repeat(300) }), 20)
  assert.equal(long.length, 20)
  assert.ok(long.endsWith('…'))
  assert.equal(subjectText('  '), 'בלי נושא')
  assert.equal(subjectText('שלום'), 'שלום')
})

test('groupSent: "לכל המשתמשים" — שורה אחת עם כל הנמענים', () => {
  const base = { subject: 'עדכון', content: 'שלום' }
  const list = [
    out('1', { ...base, recipientId: 'a', recipientName: 'א', createdAt: '2026-01-01T10:00:00.000Z' }),
    out('2', { ...base, recipientId: 'b', recipientName: 'ב', createdAt: '2026-01-01T10:00:00.010Z' }),
    out('3', { ...base, recipientId: 'c', recipientName: 'ג', createdAt: '2026-01-01T10:00:00.020Z' }),
    // אותו תוכן, יום אחר — הודעה נפרדת
    out('4', { ...base, recipientId: 'd', recipientName: 'ד', createdAt: '2026-01-02T10:00:00.000Z' }),
    // עם תשובה של הצוות — לא מקובצת
    out('5', { ...base, recipientId: 'e', recipientName: 'ה', createdAt: '2026-01-01T10:00:00.030Z', replies: [{ senderRole: 'admin', content: 'x', createdAt: '2026-01-01T11:00:00Z' }] }),
  ]
  const groups = groupSent(list)
  assert.deepEqual(groups.map((g) => g.recipients.length), [1, 1, 3])
  assert.equal(groups[0].id, '4')
  assert.equal(groups[1].id, '5')
  assert.equal(groups[1].lastActivityDate, '2026-01-01T11:00:00Z')
  assert.deepEqual(groups[2].recipients.map((r) => r.name).sort(), ['א', 'ב', 'ג'])
  assert.equal(audienceText(groups[2]), '3 נמענים')
  assert.equal(audienceText(groups[0]), 'ד')
  assert.equal(audienceText({ recipients: [{ name: null }] }), 'משתמש שנמחק')
  assert.deepEqual(groupSent(undefined), [])
})

test('groupSent: שתי הודעות זהות שנשלחו בנפרד (חצי דקה ביניהן) — שתי שורות, ואפשר להשיב לכל אחת', () => {
  const base = { subject: 'ספרך אושר', content: 'תודה רבה' }
  const groups = groupSent([
    out('a', { ...base, recipientId: 'r', recipientName: 'ראובן', createdAt: '2026-01-01T10:00:00.000Z' }),
    out('b', { ...base, recipientId: 's', recipientName: 'שמעון', createdAt: '2026-01-01T10:00:30.000Z' }),
  ])
  assert.deepEqual(groups.map((g) => g.recipients.length), [1, 1])
})

test('groupSent: אותו נוסח משני מנהלים שונים — לא מתאחד; נמענים שהשיבו נספרים', () => {
  const base = { subject: 'עדכון', content: 'שלום', createdAt: '2026-01-01T10:00:00.000Z' }
  const groups = groupSent([
    out('a', { ...base, recipientId: 'r1' }),
    out('b', { ...base, recipientId: 'r2', senderId: 'u-other', senderName: 'מנהל אחר' }),
  ])
  assert.equal(groups.length, 2)
  const broadcast = [out('1', { ...base, recipientId: 'x' }), out('2', { ...base, recipientId: 'y' })]
  const replied = out('3', { ...base, recipientId: 'z', status: 'unread', replies: [{ senderRole: 'user', content: 'תודה' }] })
  const [g] = groupSent(broadcast, { inbox: [replied, msg('other')] })
  assert.equal(g.recipients.length, 2)
  assert.equal(g.repliedCount, 1)
})

test('matchesSearch: כל המילים, בכל השדות כולל תשובות; ריק — הכול; groupMatchesSearch — גם בנמענים', () => {
  const m = msg('a', { senderEmail: 'Moshe@Example.com', subject: 'בעיה בהעלאה', replies: [{ senderName: 'רב', content: 'תוקן' }] })
  assert.equal(matchesSearch(m, ''), true)
  assert.equal(matchesSearch(m, 'moshe העלאה'), true)
  assert.equal(matchesSearch(m, 'תוקן'), true)
  assert.equal(matchesSearch(m, 'אחר'), false)
  const [g] = groupSent([out('1', { subject: 'ש', content: 'ת', recipientName: 'אלף' }), out('2', { subject: 'ש', content: 'ת', recipientName: 'בית', recipientId: 'b' })])
  assert.equal(groupMatchesSearch(g, 'בית'), true)
  assert.equal(groupMatchesSearch(g, 'גימל'), false)
})
