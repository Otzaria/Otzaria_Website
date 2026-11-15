import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListSort, libraryVersionKey, reportLibraryVersion, compareByVersion, sortSpec, libraryVersionKeyExpr } from './listSort.js';

test('parseListSort: ערך לא מוכר → ברירת מחדל לפי גרסה', () => {
  assert.equal(parseListSort(undefined), 'version');
  assert.equal(parseListSort('bogus'), 'version');
  assert.equal(parseListSort('newest'), 'newest');
  assert.equal(parseListSort('oldest'), 'oldest');
});

test('libraryVersionKey: מספרי, מעדיף libraryBuildId, null כשאין מספר', () => {
  assert.equal(libraryVersionKey({ libraryVersion: '27' }), 27);
  assert.equal(libraryVersionKey({ libraryVersion: '100' }), 100);
  assert.equal(libraryVersionKey({ libraryVersion: '1.2.3' }), 1.2);
  assert.equal(libraryVersionKey({ libraryVersion: 'v31' }), 31);
  assert.equal(libraryVersionKey({ libraryVersion: 'unknown' }), null);
  assert.equal(libraryVersionKey({}), null);
  assert.equal(libraryVersionKey({ libraryVersion: '20', location: { libraryBuildId: '28' } }), 28);
  assert.equal(libraryVersionKey({ libraryVersion: '20', location: { libraryBuildId: '' } }), 20);
  assert.equal(libraryVersionKey({ libraryVersion: '20', location: { libraryBuildId: '  ' } }), 20, 'build ריק-רווחים — כמו בתצוגה');
  assert.ok(Number.isFinite(libraryVersionKey({ libraryVersion: '1'.repeat(400) })), 'מספר ענק מקלט ציבורי — מפתח סופי, לא Infinity');
});

test('reportLibraryVersion: מחרוזת לתצוגה, בלי unknown', () => {
  assert.equal(reportLibraryVersion({ libraryVersion: 'unknown' }), null);
  assert.equal(reportLibraryVersion({ libraryVersion: '27', location: { libraryBuildId: '28' } }), '28');
  assert.equal(reportLibraryVersion({ libraryVersion: ' 27 ' }), '27');
});

test('compareByVersion: גרסה חדשה קודם, בתוך גרסה החדש קודם, בלי גרסה בסוף', () => {
  const rows = [
    { id: 'a', libraryVersion: '27', createdAt: '2026-11-01' },
    { id: 'b', libraryVersion: 'unknown', createdAt: '2026-11-10' },
    { id: 'c', libraryVersion: '100', createdAt: '2026-01-01' },
    { id: 'd', libraryVersion: '27', createdAt: '2026-11-05' },
  ];
  assert.deepEqual([...rows].sort(compareByVersion).map((r) => r.id), ['c', 'd', 'a', 'b']);
});

test('sortSpec ו-libraryVersionKeyExpr', () => {
  assert.deepEqual(sortSpec('version'), { libraryVersionSortKey: -1, createdAt: -1, _id: -1 });
  assert.deepEqual(sortSpec('oldest'), { createdAt: 1, _id: 1 });
  assert.deepEqual(sortSpec('newest'), { createdAt: -1, _id: -1 });
  const expr = libraryVersionKeyExpr();
  assert.equal(expr.$let.vars.m.$regexFind.regex, '\\d{1,15}(?:\\.\\d{1,15})?');
  assert.deepEqual(expr.$let.in.$cond[2].$convert, { input: '$$m.match', to: 'double', onError: null, onNull: null });
});
