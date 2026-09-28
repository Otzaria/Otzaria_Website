/**
 * בדיקות צמצום רשומת הודעה לדף ניהול ההודעות. הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toAdminMessageListItem } from './adminMessagesView.js'

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
    recipientName: 'נמען',
    recipientEmail: 'r@example.test',
    createdAt: '2026-01-01T00:00:00.000Z',
    replies: [{ id: 'r1', senderName: 'מנהל', content: 'תשובה', createdAt: '2026-01-02T00:00:00.000Z' }],
  })
})

test('allowReplies=false נשמר (הודעת מערכת שאין להשיב עליה)', () => {
  assert.equal(toAdminMessageListItem({ ...full, allowReplies: false }).allowReplies, false)
})

test('בלי תגובות — מערך ריק', () => {
  assert.deepEqual(toAdminMessageListItem({ ...full, replies: undefined }).replies, [])
})
