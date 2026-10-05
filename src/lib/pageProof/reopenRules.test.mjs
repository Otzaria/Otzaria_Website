import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REOPEN_MSG, earlierRoundFilter, reopenFilter, reopenMessage, reopenRefusal, reopenUpdate, roundFilter, roundOf, sameRound } from './reopenRules.js';
import { pickPrimary } from './fixesExport.js';

// עריכה אחרי אישור — רק מנהל (docs/63 §5): הכללים הטהורים — הסבב, מתי מותר לפתוח מחדש, והעדכון.

test('הסבב: בלי השדה — 0; מסנני-Mongo לסבב ולסבבים קודמים', () => {
  assert.equal(roundOf({}), 0);
  assert.equal(roundOf({ round: 2 }), 2);
  assert.equal(roundOf({ round: -1 }), 0);
  assert.equal(sameRound({}, { round: 0 }), true);
  assert.equal(sameRound({ round: 1 }, {}), false);
  assert.deepEqual(roundFilter(0), { round: { $in: [0, null] } });
  assert.deepEqual(roundFilter(3), { round: 3 });
  assert.deepEqual(earlierRoundFilter(2), { $or: [{ round: { $lt: 2 } }, { round: null }] });
});

test('רק עמוד מאושר נפתח מחדש — עם הסבר לכל השאר', () => {
  assert.equal(reopenRefusal({ status: 'done', required: 1, activeCount: 1, approvedCount: 1 }), null);
  assert.equal(reopenRefusal({ status: 'done', required: 2, activeCount: 2, approvedCount: 2 }), null);
  assert.equal(reopenRefusal({ status: 'done', required: 2, activeCount: 2, approvedCount: 1 }), REOPEN_MSG.pending);
  assert.equal(reopenRefusal({ status: 'recut', approvedCount: 1 }), REOPEN_MSG.recut);
  assert.equal(reopenRefusal({ status: 'open', activeCount: 0 }), REOPEN_MSG.open);
  assert.equal(reopenRefusal({ status: 'open', activeCount: 1, required: 2 }), REOPEN_MSG.pending);
  assert.equal(reopenRefusal(null), REOPEN_MSG.missing);
});

test('העדכון: פתוח, בלי מונים ומגישים, בודק אחד, בלי תפיסה, והסבב עולה — מותנה במצב שנקרא', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  const u = reopenUpdate({ name: 'מנהלת' }, now);
  assert.deepEqual(u.$inc, { round: 1 });
  // מספר הבודקים הדרוש נשאר כשהיה — עמוד כפול נשאר כפול
  assert.equal('required' in u.$set, false);
  assert.deepEqual(u.$set, {
    status: 'open',
    activeCount: 0,
    approvedCount: 0,
    submitters: [],
    leasedBy: null,
    leasedUntil: null,
    reopenedAt: now,
    reopenedByName: 'מנהלת',
  });
  const f = reopenFilter({ _id: 'p1', revision: 2, round: 1 });
  assert.deepEqual([f._id, f.status, f.revision, f.round], ['p1', 'done', 2, 1]);
  assert.ok(f.$expr);
  assert.match(reopenMessage({ page: 7 }), /^לפתוח מחדש לעריכה את עמוד 7\?/);
  assert.match(reopenMessage({ page: 7 }), /האישור הבא — שוב בידי מנהל/);
});

test('קובץ-התיקונים: בעמוד שנפתח מחדש — ההגשה של הסבב האחרון ראשית (גם כשהישנה כבר יצאה)', () => {
  const old = { _id: 'a', approvedAt: '2026-10-01', exportedAt: '2026-10-02', round: 0 };
  const neu = { _id: 'b', approvedAt: '2026-10-05', round: 1 };
  assert.equal(pickPrimary([old, neu]), neu);
  assert.equal(pickPrimary([old, { ...neu, round: undefined }]), old, 'בלי סבבים — הכלל הישן (שיצאה קודם)');
});
