import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffState, handoffStateFromEntry, handoffRootMargin, HANDOFF_STATE } from './wordmarkHandoff.js'

test('handoffState: המילה עוד נראית מתחת לכותרת (גם פיקסל אחד) — hero', () => {
  assert.equal(handoffState({ sourceBottom: 300, headerBottom: 64 }), HANDOFF_STATE.hero)
  assert.equal(handoffState({ sourceBottom: 64.5, headerBottom: 64 }), HANDOFF_STATE.hero)
})

test('handoffState: המילה מוסתרת כולה מתחת לכותרת, או מעליה — docked', () => {
  assert.equal(handoffState({ sourceBottom: 64, headerBottom: 64 }), HANDOFF_STATE.docked)
  assert.equal(handoffState({ sourceBottom: -500, headerBottom: 64 }), HANDOFF_STATE.docked)
})

test('handoffState: מדידה לא תקינה — off (שם אתר רגיל, לא מוסתר לתמיד)', () => {
  assert.equal(handoffState({ sourceBottom: NaN, headerBottom: 64 }), HANDOFF_STATE.off)
  assert.equal(handoffState({ sourceBottom: 100, headerBottom: undefined }), HANDOFF_STATE.off)
})

test('handoffRootMargin: מוריד את גובה הכותרת מראש ה-viewport', () => {
  assert.equal(handoffRootMargin(64), '-64px 0px 0px 0px')
  assert.equal(handoffRootMargin(63.6), '-64px 0px 0px 0px')
  assert.equal(handoffRootMargin(NaN), '-0px 0px 0px 0px')
})

test('handoffStateFromEntry: חותך את ה-root — hero; מחוץ ומעליו — docked; מחוץ ומתחתיו — hero', () => {
  assert.equal(handoffStateFromEntry({ isIntersecting: true, sourceBottom: 61.2, rootTop: 61 }), HANDOFF_STATE.hero)
  assert.equal(handoffStateFromEntry({ isIntersecting: false, sourceBottom: -300, rootTop: 61 }), HANDOFF_STATE.docked)
  assert.equal(handoffStateFromEntry({ isIntersecting: false, sourceBottom: 1200, rootTop: 61 }), HANDOFF_STATE.hero)
})

test('handoffStateFromEntry: שבר הפיקסל שבין גובה הכותרת (60.8) ל-rootMargin המעוגל (61) — docked', () => {
  // המקרה שנתקע: ה-observer דיווח "מחוץ" כשתחתית המילה ב-60.89
  assert.equal(handoffStateFromEntry({ isIntersecting: false, sourceBottom: 60.89, rootTop: 61 }), HANDOFF_STATE.docked)
})
