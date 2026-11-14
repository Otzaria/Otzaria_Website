import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginate, parseMessagesQuery, serializeMessagesQuery, updateMessagesQuery, viewFromParams, viewHref } from './messagesQuery.js'

test('ברירת מחדל: נכנסות, בלי סינון', () => {
  assert.deepEqual(parseMessagesQuery(new URLSearchParams('')), { view: 'inbox', q: '', onlyNew: false, page: 1, message: '' })
  assert.deepEqual(parseMessagesQuery(null), { view: 'inbox', q: '', onlyNew: false, page: 1, message: '' })
})

test('קריאה מהכתובת; ערכים לא תקינים נזרקים', () => {
  const q = parseMessagesQuery(new URLSearchParams('view=sent&q= משה &new=1&page=3&message=abc123'))
  assert.deepEqual(q, { view: 'sent', q: 'משה', onlyNew: true, page: 3, message: 'abc123' })
  const bad = parseMessagesQuery(new URLSearchParams('view=trash&new=yes&page=-2&message=<x>'))
  assert.deepEqual(bad, { view: 'inbox', q: '', onlyNew: false, page: 1, message: '' })
})

test('viewFromParams — גם מאובייקט של עמוד שרת', () => {
  assert.equal(viewFromParams({ view: 'reminders' }), 'reminders')
  assert.equal(viewFromParams({ view: ['sent', 'x'] }), 'sent')
  assert.equal(viewFromParams({}), 'inbox')
})

test('כתיבה לכתובת: בלי ברירות מחדל, בסדר קבוע, הלוך וחזור', () => {
  assert.equal(serializeMessagesQuery({ view: 'inbox', q: '', onlyNew: false, page: 1, message: '' }), '')
  const query = { view: 'sent', q: 'שלום', onlyNew: true, page: 2, message: 'm1' }
  const text = serializeMessagesQuery(query)
  assert.equal(text, '?view=sent&q=%D7%A9%D7%9C%D7%95%D7%9D&new=1&page=2&message=m1')
  assert.deepEqual(parseMessagesQuery(new URLSearchParams(text.slice(1))), query)
})

test('updateMessagesQuery: סינון — לעמוד הראשון; לשונית — שומרת את החיפוש ומאפסת את השאר', () => {
  const q = { view: 'inbox', q: 'x', onlyNew: true, page: 4, message: 'm' }
  assert.equal(updateMessagesQuery(q, { q: 'y' }).page, 1)
  assert.equal(updateMessagesQuery(q, { onlyNew: false }).page, 1)
  assert.equal(updateMessagesQuery(q, { page: 2 }).page, 2)
  assert.equal(updateMessagesQuery(q, { message: '' }).page, 4)
  assert.deepEqual(updateMessagesQuery(q, { view: 'sent' }), { view: 'sent', q: 'x', onlyNew: false, page: 1, message: '' })
})

test('viewHref', () => {
  assert.equal(viewHref('inbox'), '/library/admin/messages')
  assert.equal(viewHref('reminders'), '/library/admin/messages?view=reminders')
  assert.equal(viewHref('sent', 'דוד'), `/library/admin/messages?view=sent&q=${encodeURIComponent('דוד').replace(/%20/g, '+')}`)
  assert.equal(viewHref('reminders', 'דוד'), '/library/admin/messages?view=reminders')
})

test('paginate: 25 בעמוד', () => {
  const p = paginate(Array.from({ length: 60 }, (_, i) => i), 3)
  assert.deepEqual([p.page, p.pageCount, p.from, p.to, p.items.length], [3, 3, 51, 60, 10])
})
