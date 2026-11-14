/**
 * בדיקות צמצום רשומת הודעה לדף ניהול ההודעות. הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toAdminMessageListItem } from './adminMessagesView.js'
import { ASSIGNABLE_ROLES, primaryRole } from './roles.js'
import { counterpart, isIncoming, isStaff, threadOf } from './adminMessagesScreen/conversations.js'

const full = {
  id: 'm1',
  subject: 'נושא',
  content: 'תוכן',
  sender: { _id: 'u1', name: 'שולח', email: 's@example.test', role: 'user' },
  recipient: { _id: 'u2', name: 'נמען', email: 'r@example.test' },
  isRead: false,
  readBy: ['u3', 'u4'],
  messageType: 'user',
  allowReplies: true,
  senderName: 'שולח',
  senderEmail: 's@example.test',
  recipientName: 'נמען',
  recipientEmail: 'r@example.test',
  status: 'unread',
  createdAt: '2026-01-01T00:00:00.000Z',
  replies: [
    {
      id: 'r1',
      sender: 'u9',
      senderName: 'מנהל',
      senderEmail: 'a@example.test',
      senderRole: 'admin',
      content: 'תשובה',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
}

test('משאיר בדיוק את השדות שהדף מציג', () => {
  assert.deepEqual(toAdminMessageListItem(full), {
    id: 'm1',
    subject: 'נושא',
    content: 'תוכן',
    status: 'unread',
    allowReplies: true,
    senderName: 'שולח',
    senderEmail: 's@example.test',
    senderRole: 'user',
    senderRoles: [],
    senderId: 'u1',
    recipientName: 'נמען',
    recipientEmail: 'r@example.test',
    recipientId: 'u2',
    createdAt: '2026-01-01T00:00:00.000Z',
    replies: [{ id: 'r1', senderName: 'מנהל', senderRole: 'admin', senderRoles: ['admin'], content: 'תשובה', createdAt: '2026-01-02T00:00:00.000Z' }],
  })
})

test('allowReplies=false נשמר (הודעת מערכת שאין להשיב עליה)', () => {
  assert.equal(toAdminMessageListItem({ ...full, allowReplies: false }).allowReplies, false)
})

test('בלי תגובות — מערך ריק', () => {
  assert.deepEqual(toAdminMessageListItem({ ...full, replies: undefined }).replies, [])
})

test('senderRole: מהשולח המאוכלס; שולח שנמחק — null; ומה שכבר צומצם — נשמר', () => {
  assert.equal(toAdminMessageListItem({ ...full, sender: null }).senderRole, null)
  assert.equal(toAdminMessageListItem({ ...full, sender: { role: 'admin_books' } }).senderRole, 'admin_books')
  const once = toAdminMessageListItem(full)
  assert.deepEqual(toAdminMessageListItem(once), once)
})

test('תשובה בלי תפקיד (כותב שנמחק) — senderRole null', () => {
  const [reply] = toAdminMessageListItem({ ...full, replies: [{ id: 'r2', content: 'x' }] }).replies
  assert.equal(reply.senderRole, null)
  assert.equal(reply.senderRoles, null)
})

test('senderId / recipientId: מהמסמך המאוכלס; נמחק או בלי נמען (פנייה לצוות) — null', () => {
  const none = toAdminMessageListItem({ ...full, sender: null, recipient: null })
  assert.equal(none.senderId, null)
  assert.equal(none.recipientId, null)
  assert.equal(none.senderRoles, null)
})

test('כל צירופי התפקידים: מיפוי השולח והתשובות שומר על הסיווג ועל הצד השני בשיחה', () => {
  for (let mask = 0; mask < 2 ** ASSIGNABLE_ROLES.length; mask++) {
    const roles = ASSIGNABLE_ROLES.filter((_, i) => mask & (1 << i))
    const role = primaryRole(roles)
    const staff = roles.some((r) => ['admin', 'admin_books', 'admin_plugins'].includes(r))
    const source = { ...full, status: 'read', sender: { ...full.sender, role, roles }, replies: [] }
    const item = toAdminMessageListItem(source)
    assert.equal(isIncoming(item), !staff, JSON.stringify(roles))
    assert.equal(counterpart(item).side, staff ? 'recipient' : 'sender', JSON.stringify(roles))
    assert.equal(threadOf(item)[0].fromTeam, staff, JSON.stringify(roles))
    assert.deepEqual(toAdminMessageListItem(item), item)

    const reply = toAdminMessageListItem({ ...source, sender: { ...full.sender, role: 'admin' },
      replies: [{ id: 'r', senderRole: role, senderRoles: roles, content: 'תשובה' }] })
    assert.equal(isIncoming(reply), !staff, `reply ${JSON.stringify(roles)}`)
    assert.equal(threadOf(reply)[1].fromTeam, staff, `reply ${JSON.stringify(roles)}`)
  }
})

test('מערך ריק הוא משתמש מוכר; כותב שנמחק נשאר לא ידוע גם אחרי מיפוי חוזר', () => {
  const source = { ...full, status: 'read', sender: { ...full.sender, role: 'admin' }, replies: [
    { id: 'ordinary', senderRoles: [], content: 'תגובה' },
    { id: 'deleted', senderRole: null, senderRoles: null, content: 'נמחק' },
  ] }
  const item = toAdminMessageListItem(source)
  assert.deepEqual(item.replies.map((r) => r.senderRoles), [[], null])
  assert.equal(isIncoming(item), true)
  assert.equal(isIncoming({ ...item, replies: [item.replies[1]] }), false)
  assert.deepEqual(toAdminMessageListItem(item), item)
})

test('תפקיד צוות משני לא אובד גם כשהשולח או התשובה מגיעים מאוכלסים', () => {
  const sender = { ...full.sender, role: 'admin_books_only', roles: ['admin_books_only', 'admin_plugins'] }
  const item = toAdminMessageListItem({ ...full, status: 'read', sender, replies: [{ id: 'r', sender }] })
  assert.deepEqual(item.senderRoles, ['admin_books_only', 'admin_plugins'])
  assert.deepEqual(item.replies[0].senderRoles, item.senderRoles)
  assert.equal(isStaff(item.senderRoles), true)
  assert.equal(isIncoming(item), false)
  assert.deepEqual(threadOf(item).map((r) => r.fromTeam), [true, true])
})
