import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correctionsTabs, activeCorrectionsTab } from './tabs.js'

const ids = (user) => correctionsTabs(user).map((t) => t.id)

test('"הגדרות" רק למנהל כללי ולמנהל ספרים', () => {
  assert.deepEqual(ids({ role: 'admin' }), ['queue', 'admin'])
  assert.deepEqual(ids({ role: 'admin_books' }), ['queue', 'admin'])
  assert.deepEqual(ids({ role: 'user', isCorrectionsVolunteer: true }), ['queue'])
  assert.deepEqual(ids({ role: 'user', isSupervisor: true }), ['queue'])
  assert.deepEqual(ids({ role: 'admin_ocr', isCorrectionsVolunteer: true }), ['queue'])
  assert.deepEqual(ids(null), ['queue'])
})

test('שמות הלשוניות לפי מילון השמות, והכתובות לא השתנו', () => {
  assert.deepEqual(correctionsTabs({ role: 'admin' }).map((t) => [t.label, t.href]), [
    ['דיווחים', '/library/corrections'],
    ['הגדרות', '/library/corrections/admin'],
  ])
})

test('לשונית פעילה: התור גם בדף דיווח בודד, ניהול רק בעמוד שלו', () => {
  const cases = {
    '/library/corrections': 'queue',
    '/library/corrections/': 'queue',
    '/library/corrections/66aa11': 'queue',
    '/library/corrections?view=mine': 'queue',
    '/library/corrections/admin': 'admin',
    '/library/corrections/admin/': 'admin',
    // קידומת דומה אינה עמוד הניהול
    '/library/corrections/administrator': 'queue',
    '/library/admin': null,
    '': null,
  }
  for (const [path, expected] of Object.entries(cases)) assert.equal(activeCorrectionsTab(path), expected, path)
  assert.equal(activeCorrectionsTab(undefined), null)
})
