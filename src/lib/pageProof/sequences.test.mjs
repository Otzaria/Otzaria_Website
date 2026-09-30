import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEQ_SIZE, assignSequences, requiredFor, isDoubleSequence, resequence, hash32 } from './sequences.js';

const P = (page, extra = {}) => ({ _id: `id${page}`, page, seq: 0, started: false, ...extra });
const asObj = (map) => Object.fromEntries([...map].map(([k, v]) => [k, v]));

test('assignSequences: רצפים של 5 לפי סדר עולה, בלי כפילויות', () => {
  const m = assignSequences([7, 1, 2, 3, 4, 5, 6, 3]);
  assert.deepEqual([...m], [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 1], [7, 1]]);
  assert.equal(SEQ_SIZE, 5);
});

test('isDoubleSequence/requiredFor: דטרמיניסטי, וקצוות האחוז', () => {
  assert.equal(isDoubleSequence('abc', 1, 0), false);
  assert.equal(isDoubleSequence('abc', 1, 100), true);
  assert.equal(requiredFor('abc', 1, 100), 2);
  assert.equal(isDoubleSequence('gid1', 4), isDoubleSequence('gid1', 4));
  assert.equal(hash32('a'), hash32('a'));
  assert.notEqual(hash32('a'), hash32('b'));
});

test('resequence: בלי עמודים שהתחילו — floor(מקום/5) לפי מספר-העמוד, בכל סדר קלט', () => {
  const pages = [9, 1, 3, 2, 4, 5, 6, 7, 8, 10, 11].map((p) => P(p, { seq: 99 }));
  const m = resequence(pages);
  assert.deepEqual(asObj(m), {
    id1: 0, id2: 0, id3: 0, id4: 0, id5: 0,
    id6: 1, id7: 1, id8: 1, id9: 1, id10: 1,
    id11: 2,
  });
  assert.deepEqual(asObj(resequence(pages.slice().reverse())), asObj(m));
});

test('resequence: עמוד שהתחיל שומר את הרצף שלו ואינו במפה', () => {
  const pages = [1, 2, 3, 4, 5, 6].map((p) => P(p));
  pages[5] = P(6, { seq: 1, started: true });
  const m = resequence(pages);
  assert.equal(m.has('id6'), false);
  assert.deepEqual(asObj(m), { id1: 0, id2: 0, id3: 0, id4: 0, id5: 0 });
});

test('resequence: עמוד שחזר מזיהוי-מחדש מצטרף לרצף של שכניו שכבר הוגשו', () => {
  const pages = [1, 2, 3, 4, 5].map((p) => P(p, { seq: 0, started: p !== 3 }));
  assert.deepEqual(asObj(resequence(pages)), { id3: 0 });
});

test('resequence: עמודים שנוספו לפני עמודים שכבר חולקו — מספר-רצף חדש, בלי ערבוב', () => {
  // ייבוא ראשון: עמודים 10–19 (רצף 0 = 10–14 — חולק; רצף 1 = 15–19)
  const pages = [
    ...[10, 11, 12, 13, 14].map((p) => P(p, { seq: 0, started: true })),
    ...[15, 16, 17, 18, 19].map((p) => P(p, { seq: 1 })),
    // ייבוא שני: עמודים 1–9
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => P(p, { seq: 0 })),
  ];
  const m = resequence(pages);
  // קבוצת-היעד 0 (עמודים 1–5) — המספר 0 תפוס בידי 10–14 → מספר חדש מעל הכול
  const s1 = m.get('id1');
  assert.ok(s1 > 3, `${s1}`);
  for (const p of [2, 3, 4, 5]) assert.equal(m.get(`id${p}`), s1);
  // 6–9 בקבוצה 1 (עם 10 שהתחיל ורצפו 0) — המספר 1 פנוי
  for (const p of [6, 7, 8, 9]) assert.equal(m.get(`id${p}`), 1);
  // 15 (קבוצה 2) ו-16–19 (קבוצה 3)
  assert.equal(m.get('id15'), 2);
  for (const p of [16, 17, 18, 19]) assert.equal(m.get(`id${p}`), 3);
  // שום רצף של עמודים שלא התחילו אינו משותף לעמוד שהתחיל מחוץ לקבוצתו
  const startedSeqs = new Set(pages.filter((p) => p.started).map((p) => p.seq));
  assert.ok(![...m.values()].some((s) => startedSeqs.has(s)));
  assert.equal(m.size, 14);
});

test('resequence: קלט ריק/חלקי', () => {
  assert.equal(resequence([]).size, 0);
  assert.equal(resequence(null).size, 0);
  assert.deepEqual(asObj(resequence([P(3), { _id: 'x' }])), { id3: 0 });
});
