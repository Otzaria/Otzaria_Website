import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  splitLines,
  joinLines,
  diffToHunks,
  diffWords,
  focusChange,
  threeWayMerge,
  applyHunks,
} from './text-diff.js';

// ==================== splitLines / joinLines ====================

test('splitLines: מפצל לפי \\n ומנרמל \\r\\n', () => {
  assert.deepEqual(splitLines('a\r\nb\nc'), ['a', 'b', 'c']);
});

test('splitLines: null/undefined -> [""]', () => {
  assert.deepEqual(splitLines(null), ['']);
  assert.deepEqual(splitLines(undefined), ['']);
});

test('joinLines: מחבר בחזרה עם \\n', () => {
  assert.equal(joinLines(['a', 'b', 'c']), 'a\nb\nc');
});

// ==================== diffToHunks + applyHunks round-trip ====================

test('diffToHunks: טקסטים זהים -> אין hunks', () => {
  assert.deepEqual(diffToHunks('שלום\nעולם', 'שלום\nעולם'), []);
});

test('diffToHunks -> applyHunks: round-trip משחזר את הטקסט החדש', () => {
  const oldText = 'שורה 1\nשורה 2\nשורה 3\nשורה 4';
  const newText = 'שורה 1\nשורה שונתה\nשורה 3\nשורה 4';
  const hunks = diffToHunks(oldText, newText);
  assert.ok(hunks.length >= 1);
  const { content, conflicts } = applyHunks(oldText, hunks);
  assert.equal(conflicts.length, 0);
  assert.equal(content, newText);
});

test('diffToHunks -> applyHunks: הוספת שורה באמצע', () => {
  const oldText = 'א\nב\nד';
  const newText = 'א\nב\nג\nד';
  const hunks = diffToHunks(oldText, newText);
  const { content, conflicts } = applyHunks(oldText, hunks);
  assert.equal(conflicts.length, 0);
  assert.equal(content, newText);
});

test('diffToHunks -> applyHunks: מחיקת שורה', () => {
  const oldText = 'א\nב\nג';
  const newText = 'א\nג';
  const hunks = diffToHunks(oldText, newText);
  const { content, conflicts } = applyHunks(oldText, hunks);
  assert.equal(conflicts.length, 0);
  assert.equal(content, newText);
});

test('diffToHunks: hunk.before אינו ריק כשיש שורות הקשר סביב האזור שהשתנה', () => {
  const hunks = diffToHunks('לפני\nישן\nאחרי', 'לפני\nחדש\nאחרי');
  assert.ok(hunks.length >= 1);
  for (const h of hunks) assert.notEqual(h.before, '');
});

test('diffToHunks: קובץ ריק שהתמלא כולו -> before ריק (אין הקשר לעגן אליו)', () => {
  const hunks = diffToHunks('', 'תוכן חדש');
  assert.deepEqual(hunks, [{ line: 0, before: '', after: 'תוכן חדש' }]);
});

// ==================== applyHunks: idempotency & conflicts ====================

test('applyHunks: hunk זהה (before===after) תמיד "מוחל" בלי לשנות תוכן', () => {
  const { content, applied, conflicts } = applyHunks('טקסט קבוע', [{ before: 'X', after: 'X' }]);
  assert.equal(content, 'טקסט קבוע');
  assert.equal(applied, 1);
  assert.equal(conflicts.length, 0);
});

test('applyHunks: יישום כפול של אותו hunk הוא אידמפוטנטי (הפעם השנייה מצליחה בלי שינוי כפול)', () => {
  const hunk = { before: 'ישן', after: 'חדש' };
  const once = applyHunks('טקסט ישן כאן', [hunk]);
  assert.equal(once.content, 'טקסט חדש כאן');
  const twice = applyHunks(once.content, [hunk]);
  assert.equal(twice.content, once.content);
  assert.equal(twice.conflicts.length, 0);
});

test('applyHunks: before שלא נמצא בטקסט -> קונפליקט', () => {
  const { content, conflicts } = applyHunks('טקסט מקורי', [{ before: 'לא-קיים', after: 'X' }]);
  assert.equal(content, 'טקסט מקורי');
  assert.equal(conflicts.length, 1);
});

test('applyHunks: before מופיע פעמיים -> קונפליקט מעורפל (ambiguous)', () => {
  const { conflicts } = applyHunks('חוזר חוזר', [{ before: 'חוזר', after: 'X' }]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].ambiguous, true);
});

test('applyHunks: הוספה לטקסט ריק', () => {
  const { content, applied } = applyHunks('', [{ before: '', after: 'תוכן חדש' }]);
  assert.equal(content, 'תוכן חדש');
  assert.equal(applied, 1);
});

test('applyHunks: הוספה עם before ריק כשהטקסט לא ריק -> קונפליקט', () => {
  const { conflicts } = applyHunks('טקסט קיים', [{ before: '', after: 'תוכן חדש' }]);
  assert.equal(conflicts.length, 1);
});

// ==================== diffWords ====================

test('diffWords: מזהה מילה שהוחלפה', () => {
  const segs = diffWords('שלום עולם', 'שלום ירושלים');
  const types = segs.map((s) => s.type);
  assert.ok(types.includes('equal'));
  assert.ok(types.includes('del'));
  assert.ok(types.includes('add'));
});

test('diffWords: טקסטים זהים -> הכל equal', () => {
  const segs = diffWords('אותו טקסט', 'אותו טקסט');
  assert.ok(segs.every((s) => s.type === 'equal'));
});

test('diffWords: null/undefined מטופלים כמחרוזת ריקה', () => {
  const segs = diffWords(null, 'חדש');
  assert.ok(segs.some((s) => s.type === 'add'));
});

// ==================== focusChange ====================

test('focusChange: טקסטים זהים מוחזרים כמות שהם', () => {
  const result = focusChange('זהה', 'זהה');
  assert.deepEqual(result, { before: 'זהה', after: 'זהה' });
});

test('focusChange: מקצץ הקשר ארוך משני הצדדים ומסמן עם …', () => {
  const prefix = 'א'.repeat(500);
  const suffix = 'ב'.repeat(500);
  const before = `${prefix}ישן${suffix}`;
  const after = `${prefix}חדש${suffix}`;
  const result = focusChange(before, after, { context: 10 });
  assert.ok(result.before.startsWith('…'));
  assert.ok(result.before.includes('ישן'));
  assert.ok(result.after.includes('חדש'));
  assert.ok(result.before.length < before.length);
});

// ==================== threeWayMerge ====================

test('threeWayMerge: הסכמה מלאה (ours===theirs) -> clean', () => {
  const result = threeWayMerge('בסיס', 'שינוי', 'שינוי');
  assert.equal(result.merged, 'שינוי');
  assert.equal(result.clean, true);
  assert.deepEqual(result.conflicts, []);
});

test('threeWayMerge: רק אנחנו שינינו (theirs===base) -> מאמץ את שלנו', () => {
  const result = threeWayMerge('בסיס', 'השינוי שלנו', 'בסיס');
  assert.equal(result.merged, 'השינוי שלנו');
  assert.equal(result.clean, true);
});

test('threeWayMerge: רק הם שינו (ours===base) -> מאמץ את שלהם', () => {
  const result = threeWayMerge('בסיס', 'בסיס', 'השינוי שלהם');
  assert.equal(result.merged, 'השינוי שלהם');
  assert.equal(result.clean, true);
});

test('threeWayMerge: שינויים באזורים שונים מתמזגים נקי', () => {
  const base = 'שורה1\nשורה2\nשורה3\nשורה4\nשורה5';
  const ours = 'שורה1-שונה\nשורה2\nשורה3\nשורה4\nשורה5';
  const theirs = 'שורה1\nשורה2\nשורה3\nשורה4\nשורה5-שונה';
  const result = threeWayMerge(base, ours, theirs);
  assert.equal(result.clean, true);
  assert.match(result.merged, /שורה1-שונה/);
  assert.match(result.merged, /שורה5-שונה/);
});

test('threeWayMerge: שינוי חופף באותו אזור -> קונפליקט', () => {
  const base = 'שורה משותפת בלבד';
  const ours = 'השינוי שלנו לשורה';
  const theirs = 'השינוי שלהם לשורה';
  const result = threeWayMerge(base, ours, theirs);
  assert.equal(result.clean, false);
  assert.ok(result.conflicts.length > 0);
});
