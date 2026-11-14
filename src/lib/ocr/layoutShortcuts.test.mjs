import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutShortcut, ownedElsewhere } from './layoutShortcuts.js'

// אלמנט מדומה: closest מחזיר אובייקט כשאחד הסלקטורים ברשימה מופיע ב-matches
const el = (tagName, matches = []) => ({
  tagName,
  closest: (sel) => (sel.split(',').some((s) => matches.includes(s)) ? {} : null),
})
const ev = (key, target, extra = {}) => ({ key, target, defaultPrevented: false, ...extra })
const state = { allValid: false, untouched: true }

test('Enter על הדף: שמירה כשהכול תקין, "הכול נכון" כשלא נגעו, אחרת כלום', () => {
  assert.equal(layoutShortcut(ev('Enter', el('DIV')), { allValid: true, untouched: false }), 'save')
  assert.equal(layoutShortcut(ev('Enter', el('DIV')), state), 'allCorrect')
  assert.equal(layoutShortcut(ev('Enter', el('DIV')), { allValid: false, untouched: false }), null)
  assert.equal(layoutShortcut(ev('n', el('BODY')), state), 'skip')
  assert.equal(layoutShortcut(ev('N', el('BODY')), state), 'skip')
})

test('מקש בתוך בורר (כפתור או רשימה פתוחה) או חלון — לא מפעיל כלום', () => {
  for (const target of [
    el('BUTTON', ['[aria-haspopup]']),
    el('UL', ['[role="listbox"]']),
    el('LI', ['[role="listbox"]']),
    el('DIV', ['[role="dialog"]']),
  ]) {
    assert.equal(layoutShortcut(ev('Enter', target), state), null)
    assert.equal(layoutShortcut(ev('n', target), state), null)
  }
})

test('הקלדה בשדה ואירוע שכבר טופל — לא מפעילים', () => {
  assert.equal(ownedElsewhere(ev('Enter', el('INPUT'))), true)
  assert.equal(ownedElsewhere(ev('Enter', el('TEXTAREA'))), true)
  assert.equal(ownedElsewhere(ev('Enter', { tagName: 'DIV', isContentEditable: true })), true)
  assert.equal(layoutShortcut(ev('Enter', el('DIV'), { defaultPrevented: true }), state), null)
  assert.equal(ownedElsewhere(ev('Enter', null)), false)
})
