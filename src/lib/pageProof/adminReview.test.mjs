/**
 * צורות-התשובה של סקירת ההגשות (adminReview.js): ההגשה המלאה, חתימת-העמוד (כמו sig בקובץ-
 * התיקונים) וחלון-העמודים של רשימת ההגשות לפי עמוד.
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submissionDetail, pageSig, pageWindow } from './adminReview.js';
import { docRevision } from './textModel.js';

test('submissionDetail: כל השדות של סקירת-הגשה, needsRecut מהפעולות, גרסה חסרה ← 1', () => {
  const at = new Date('2026-09-30T10:00:00Z');
  const sub = {
    _id: { toString: () => 's1' },
    page: 'p1',
    user: 'u1',
    status: 'submitted',
    userName: 'ראובן',
    who: 'otz-u1',
    ops: [{ kind: 'line_split', page: 3, ids: [1], value: { x: 20 } }],
    opCount: 1,
    note: 'הערה',
    createdAt: at,
    reviewedByName: undefined,
    reviewedAt: undefined,
    reviewNote: '',
    reviewerEdited: false,
    exportedAt: null,
  };
  const d = submissionDetail(sub);
  assert.equal(d.id, 's1');
  assert.equal(d.needsRecut, true);
  assert.equal(d.revision, 1);
  assert.deepEqual(d.ops, sub.ops);
  assert.deepEqual(Object.keys(d).sort(), [
    'basedOn',
    'createdAt',
    'exportedAt',
    'id',
    'needsRecut',
    'note',
    'ops',
    'recutRequest',
    'reviewNote',
    'reviewedAt',
    'reviewedByName',
    'reviewerEdited',
    'revision',
    'sameAs',
    'status',
    'userName',
    'who',
  ]);
  assert.equal(submissionDetail({ ...sub, ops: [{ kind: 'text', page: 3, ids: [1], value: 'א' }], revision: 2 }).needsRecut, false);
  // הבודק השני (basedOn.basedOnOf): "מבוססת על הגשה X" ו-sameAs; בלי — null
  assert.deepEqual([d.basedOn, d.sameAs], [null, null]);
  const based = { base: { id: 'sA', userName: 'שמעון', status: 'approved', kind: 'submission' }, sameAs: ['sA:0'], added: 0, removed: [] };
  assert.deepEqual(submissionDetail(sub, based).basedOn, { id: 'sA', userName: 'שמעון', status: 'approved', kind: 'submission', added: 0, removed: [] });
  assert.deepEqual(submissionDetail(sub, based).sameAs, ['sA:0']);
  assert.equal(submissionDetail({ ...sub, revision: 2 }).revision, 2);
  // בקשת מתנדב לזיהוי-מחדש — מסומנת (לביטול ב"שחרור מהמתנה", לא בדחייה)
  assert.equal(d.recutRequest, false);
  assert.equal(submissionDetail({ ...sub, recutRequest: true }).recutRequest, true);
});

test('pageSig: אותה חתימה כמו בקובץ-התיקונים (docRevision על הגרסה השמורה)', () => {
  const page = { revision: 2, doc: { size: [100, 200], lines: [{ id: 4 }, { id: 3 }] } };
  assert.equal(pageSig(page), docRevision({ revision: 2, lines: [{ id: 3 }, { id: 4 }], size: [100, 200] }));
  // עמוד ישן בלי השדה — גרסה 1
  assert.match(pageSig({ doc: { lines: [] } }), /^1:/);
});

test('pageWindow: מספרי-עמודים ייחודיים וממוינים, המשך אחרי after, next רק כשיש עוד', () => {
  assert.deepEqual(pageWindow([5, 3, 3, 9, 1], { limit: 2 }), { pages: [1, 3], total: 4, next: 3 });
  assert.deepEqual(pageWindow([5, 3, 3, 9, 1], { after: 3, limit: 2 }), { pages: [5, 9], total: 4, next: null });
  assert.deepEqual(pageWindow([5, 3, 9, 1], { after: 9, limit: 2 }), { pages: [], total: 4, next: null });
  assert.deepEqual(pageWindow([], {}), { pages: [], total: 0, next: null });
  assert.deepEqual(pageWindow([2, null, 'x', 1], { limit: 10 }), { pages: [1, 2], total: 2, next: null });
});
