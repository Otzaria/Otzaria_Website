import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitHint, clampShift } from './donationTip.js'

test('splitHint: פתיח עם נקודתיים והדגשה', () => {
  assert.deepEqual(splitHint('אין לאוצריא גוף מממן: אתה הכוח המניע שלה'), { lead: 'אין לאוצריא גוף מממן:', punch: 'אתה הכוח המניע שלה' })
})

test('splitHint: בלי נקודתיים / ריק — הכל הדגשה', () => {
  assert.deepEqual(splitHint('תודה!'), { lead: '', punch: 'תודה!' })
  assert.deepEqual(splitHint(undefined), { lead: '', punch: '' })
})

test('clampShift: בתוך המסך — בלי הזזה', () => {
  assert.equal(clampShift({ centerX: 500, width: 240, viewportWidth: 1440 }), 0)
})

test('clampShift: חורג משמאל/מימין — נדחף פנימה עד השוליים', () => {
  assert.equal(clampShift({ centerX: 80, width: 240, viewportWidth: 1024 }), 52)
  assert.equal(clampShift({ centerX: 1000, width: 240, viewportWidth: 1024 }), -108)
})

test('clampShift: רחב מהמסך — ממורכז במסך; קלט לא תקין — 0', () => {
  assert.equal(clampShift({ centerX: 100, width: 400, viewportWidth: 360 }), 80)
  assert.equal(clampShift({ centerX: 100, width: 0, viewportWidth: 360 }), 0)
})
