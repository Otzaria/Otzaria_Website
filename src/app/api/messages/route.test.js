import { beforeEach, expect, test, vi } from 'vitest'
import { toAdminMessageListItem } from '@/lib/adminMessagesView'
import { counterpart, isIncoming, threadOf } from '@/lib/adminMessagesScreen/conversations'

const { find, getServerSession } = vi.hoisted(() => ({ find: vi.fn(), getServerSession: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Message', () => ({ default: { find } }))
vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { GET } from './route'

const staff = { _id: 'staff', name: 'מנהל משולב', email: 'staff@example.test',
  role: 'admin_books_only', roles: ['admin_books_only', 'admin_plugins'] }
const recipient = { _id: 'recipient', name: 'נמען', email: 'recipient@example.test' }
let doc
let query

beforeEach(() => {
  doc = { _id: 'message', sender: staff, recipient, subject: 'עדכון', content: 'שלום', isRead: true,
    replies: [{ _id: 'reply', sender: staff, content: 'עוד תשובה' }] }
  query = { populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn(async () => [doc]) }
  find.mockReset().mockReturnValue(query)
  getServerSession.mockReset().mockResolvedValue({ user: { ...staff, id: staff._id } })
})

test.each(['?allMessages=true', ''])('GET %s שומר תפקידים משניים מהמסד ועד לסיווג השיחה', async (search) => {
  const res = await GET(new Request(`http://localhost/api/messages${search}`))
  expect(res.status).toBe(200)
  const { messages: [message] } = await res.json()
  expect(query.populate).toHaveBeenCalledWith('sender', 'name email role roles')
  expect(query.populate).toHaveBeenCalledWith('replies.sender', 'name email role roles')
  expect(find).toHaveBeenCalledWith(search ? { messageType: { $ne: 'system' } } : {
    $or: [{ sender: staff._id }, { recipient: staff._id }],
  })
  expect(message.replies[0].senderRoles).toEqual(staff.roles)
  const item = toAdminMessageListItem(message)
  expect(item.senderRoles).toEqual(staff.roles)
  expect(isIncoming(item)).toBe(false)
  expect(counterpart(item)).toMatchObject({ name: recipient.name, side: 'recipient' })
  expect(threadOf(item).map((r) => r.fromTeam)).toEqual([true, true])
  expect(toAdminMessageListItem(item)).toEqual(item)
})

test('משתמש רגיל וכותב שנמחק נבדלים אחרי שליפה ומיפוי', async () => {
  doc.sender = { ...staff, role: 'admin' }
  doc.replies = [
    { _id: 'ordinary', sender: { _id: 'user', name: 'משתמש', role: 'user' }, content: 'תודה' },
    { _id: 'gone', sender: null, content: 'נמחק' },
  ]
  const res = await GET(new Request('http://localhost/api/messages?allMessages=true'))
  const { messages: [message] } = await res.json()
  const item = toAdminMessageListItem(message)
  expect(item.replies.map((r) => r.senderRoles)).toEqual([[], null])
  expect(isIncoming(item)).toBe(true)
  expect(isIncoming({ ...item, replies: [item.replies[1]] })).toBe(false)
  doc.sender = null
  const deletedRes = await GET(new Request('http://localhost/api/messages?allMessages=true'))
  const deleted = toAdminMessageListItem((await deletedRes.json()).messages[0])
  expect(deleted.senderRoles).toBeNull()
  expect(isIncoming(deleted)).toBe(true) // תגובה של משתמש רגיל נשמרת בנכנסות
  expect(isIncoming({ ...deleted, replies: [deleted.replies[1]] })).toBe(false)
})

test('בלי session אין שליפת הודעות', async () => {
  getServerSession.mockResolvedValue(null)
  expect((await GET(new Request('http://localhost/api/messages?allMessages=true'))).status).toBe(401)
  expect(find).not.toHaveBeenCalled()
})
