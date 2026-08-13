/**
 * בדיקות חוקי ההשהיה של תוסף מהחנות. הרצה: npm test
 *
 * המקרים המרכזיים: מעלה התוסף רשאי להשהות ולהחזיר בעצמו, אך לא לעקוף השהיה
 * שביצע מנהל ולא להחזיר תוסף שאישורו בוטל בניהול.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySuspension,
  canAccessSuspended,
  isPluginSuspended,
  suspensionError,
  suspensionFields
} from './pluginVisibility.js'

/** תוסף מדומה, כמו במסמך ה-DB */
function plugin(overrides = {}) {
  return {
    isApproved: true,
    isSuspended: false,
    suspendedAt: null,
    suspendedBy: null,
    suspendedByRole: null,
    ...overrides
  }
}

test('המעלה רשאי להשהות תוסף מאושר', () => {
  assert.equal(suspensionError(plugin(), 'suspend', { isAdmin: false }), null)
})

test('לא ניתן להשהות תוסף שאינו מאושר', () => {
  const error = suspensionError(plugin({ isApproved: false }), 'suspend', { isAdmin: false })
  assert.match(error, /רק תוסף שאושר/)
})

test('לא ניתן להשהות תוסף שכבר מושהה', () => {
  const error = suspensionError(plugin({ isSuspended: true, suspendedByRole: 'owner' }), 'suspend')
  assert.match(error, /כבר מושהה/)
})

test('המעלה רשאי להחזיר לחנות תוסף שהוא עצמו השהה', () => {
  const suspended = plugin({ isSuspended: true, suspendedByRole: 'owner' })
  assert.equal(suspensionError(suspended, 'resume', { isAdmin: false }), null)
})

test('המעלה אינו רשאי להחזיר תוסף שהושהה בניהול — מנהל כן', () => {
  const suspended = plugin({ isSuspended: true, suspendedByRole: 'admin' })
  assert.match(suspensionError(suspended, 'resume', { isAdmin: false }), /הנהלת האתר/)
  assert.equal(suspensionError(suspended, 'resume', { isAdmin: true }), null)
})

test('בוטל האישור בניהול — אין החזרה לחנות', () => {
  const suspended = plugin({ isApproved: false, isSuspended: true, suspendedByRole: 'owner' })
  assert.match(suspensionError(suspended, 'resume', { isAdmin: false }), /האישור/)
})

test('החלת השהיה והחזרה מעדכנת את שדות המצב', () => {
  const doc = plugin()
  applySuspension(doc, 'suspend', { userId: 'u1', isAdmin: false })
  assert.equal(isPluginSuspended(doc), true)
  assert.equal(doc.suspendedByRole, 'owner')
  assert.equal(doc.suspendedBy, 'u1')
  assert.ok(doc.suspendedAt instanceof Date)

  applySuspension(doc, 'resume', { userId: 'u1', isAdmin: false })
  assert.deepEqual(suspensionFields(doc), {
    isSuspended: false,
    suspendedByRole: null,
    suspendedAt: null
  })
})

test('השהיית מנהל מסומנת כ-admin', () => {
  const doc = plugin()
  applySuspension(doc, 'suspend', { userId: 'a1', isAdmin: true })
  assert.equal(doc.suspendedByRole, 'admin')
})

test('גישה לתוסף מושהה — למעלה ולמנהל בלבד', () => {
  assert.equal(canAccessSuspended({ isAdmin: false, isOwner: true }), true)
  assert.equal(canAccessSuspended({ isAdmin: true, isOwner: false }), true)
  assert.equal(canAccessSuspended({ isAdmin: false, isOwner: false }), false)
})
