import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeStatus, applyChangesSequentially, computeEditClosure } from './moderation-logic.js';

// ==================== changeStatus ====================

test('changeStatus: מחזיר status קיים', () => {
  assert.equal(changeStatus({ status: 'approved' }), 'approved');
});

test('changeStatus: ברירת מחדל "pending" למקטע ישן ללא status', () => {
  assert.equal(changeStatus({}), 'pending');
});

// ==================== applyChangesSequentially ====================

test('applyChangesSequentially: מחיל מקטע יחיד תקין', () => {
  const result = applyChangesSequentially('שלום עולם', [{ before: 'עולם', after: 'ירושלים' }]);
  assert.equal(result.content, 'שלום ירושלים');
  assert.equal(result.okChanges.length, 1);
  assert.equal(result.conflictChanges.length, 0);
});

test('applyChangesSequentially: מקטע שלא נמצא בתוכן נחשב קונפליקט ולא משנה את התוכן', () => {
  const change = { before: 'לא-קיים', after: 'משהו' };
  const result = applyChangesSequentially('שלום עולם', [change]);
  assert.equal(result.content, 'שלום עולם');
  assert.equal(result.okChanges.length, 0);
  assert.deepEqual(result.conflictChanges, [change]);
});

test('applyChangesSequentially: מחיל מקטעים ברצף כך שכל מקטע רואה את תוצאת קודמו', () => {
  const changes = [
    { before: 'אחד', after: 'ראשון' },
    { before: 'ראשון שתיים', after: 'ראשון שני' },
  ];
  const result = applyChangesSequentially('אחד שתיים', changes);
  assert.equal(result.content, 'ראשון שני');
  assert.equal(result.okChanges.length, 2);
});

test('applyChangesSequentially: מקטע ריק מחזיר תוכן ללא שינוי ומערכים ריקים', () => {
  const result = applyChangesSequentially('תוכן', []);
  assert.equal(result.content, 'תוכן');
  assert.deepEqual(result.okChanges, []);
  assert.deepEqual(result.conflictChanges, []);
});

test('applyChangesSequentially: תוכן null/undefined מטופל כמחרוזת ריקה', () => {
  const result = applyChangesSequentially(null, []);
  assert.equal(result.content, '');
});

test('applyChangesSequentially: מזהה בדיוק אילו מקטעים הצליחו ואילו התנגשו (רפרנס זהה)', () => {
  const ok = { before: 'עולם', after: 'ירושלים' };
  const conflict = { before: 'לא-קיים', after: 'X' };
  const result = applyChangesSequentially('שלום עולם', [ok, conflict]);
  assert.equal(result.okChanges[0], ok);
  assert.equal(result.conflictChanges[0], conflict);
});

// ==================== computeEditClosure ====================

test('computeEditClosure: נותרו מקטעים ממתינים -> לא סגור', () => {
  const closure = computeEditClosure([{ status: 'approved', applied: true }, { status: 'pending' }]);
  assert.equal(closure.closed, false);
  assert.equal(closure.remainingPending, 1);
});

test('computeEditClosure: הכל מאושר ומוחל -> approved, allApplied=true', () => {
  const closure = computeEditClosure([
    { status: 'approved', applied: true },
    { status: 'approved', applied: true },
  ]);
  assert.equal(closure.closed, true);
  assert.equal(closure.remainingPending, 0);
  assert.equal(closure.finalStatus, 'approved');
  assert.equal(closure.allApplied, true);
});

test('computeEditClosure: הכל נדחה -> rejected', () => {
  const closure = computeEditClosure([{ status: 'rejected' }, { status: 'rejected' }]);
  assert.equal(closure.closed, true);
  assert.equal(closure.finalStatus, 'rejected');
});

test('computeEditClosure: מקטע מאושר שטרם הוחל -> allApplied=false גם כשסגור', () => {
  const closure = computeEditClosure([
    { status: 'approved', applied: false },
    { status: 'rejected' },
  ]);
  assert.equal(closure.closed, true);
  assert.equal(closure.finalStatus, 'approved');
  assert.equal(closure.allApplied, false);
});

test('computeEditClosure: מקטע ללא status (ישן) נחשב pending -> לא סגור', () => {
  const closure = computeEditClosure([{}, { status: 'approved', applied: true }]);
  assert.equal(closure.closed, false);
  assert.equal(closure.remainingPending, 1);
});

test('computeEditClosure: מערך ריק נחשב סגור, ואין מקטע מאושר -> rejected', () => {
  const closure = computeEditClosure([]);
  assert.equal(closure.closed, true);
  assert.equal(closure.remainingPending, 0);
  assert.equal(closure.finalStatus, 'rejected');
  assert.equal(closure.allApplied, true);
});
