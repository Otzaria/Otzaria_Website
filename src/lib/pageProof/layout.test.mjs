import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_DEFAULT, clampSplit, readLayout, splitFromPointer, nudgeSplit, SPLIT_MIN, SPLIT_MAX } from './layout.js';

test('clampSplit: בין 20 ל-80, עשירית-אחוז; ערך לא-מספרי ← 50', () => {
  assert.equal(clampSplit(10), SPLIT_MIN);
  assert.equal(clampSplit(95), SPLIT_MAX);
  assert.equal(clampSplit(33.333), 33.3);
  assert.equal(clampSplit(NaN), 50);
  assert.equal(clampSplit(undefined), 50);
});

test('readLayout: מחרוזת שמורה, ערכים פגומים ← ברירת-המחדל', () => {
  assert.deepEqual(readLayout(null), LAYOUT_DEFAULT);
  assert.deepEqual(readLayout('לא JSON'), LAYOUT_DEFAULT);
  assert.deepEqual(readLayout('[1,2]'), LAYOUT_DEFAULT);
  assert.deepEqual(readLayout(JSON.stringify({ split: 64, swap: true, fontSize: 24, fontFamily: 'Arial, sans-serif' })), {
    split: 64,
    swap: true,
    fontSize: 24,
    fontFamily: 'Arial, sans-serif',
  });
  const bad = readLayout({ split: 'x', swap: 'yes', fontSize: 400, fontFamily: '' });
  assert.deepEqual(bad, { ...LAYOUT_DEFAULT, fontSize: 40 });
  assert.equal(readLayout({ split: 5 }).split, SPLIT_MIN);
});

test('splitFromPointer: הסריקה מימין (ברירת-המחדל) ומשמאל (swap)', () => {
  const rect = { left: 100, right: 1100, width: 1000 };
  assert.equal(splitFromPointer(rect, 700, false), 40, 'מהמצביע עד הקצה הימני');
  assert.equal(splitFromPointer(rect, 700, true), 60, 'מהקצה השמאלי עד המצביע');
  assert.equal(splitFromPointer(rect, 150, false), SPLIT_MAX);
  assert.equal(splitFromPointer(rect, 1090, false), SPLIT_MIN);
  assert.equal(splitFromPointer({ width: 0 }, 10), null);
  assert.equal(splitFromPointer(rect, NaN), null);
});

test('nudgeSplit: החץ מזיז את המפריד לכיוונו; Home/End; מקש אחר ← null', () => {
  assert.equal(nudgeSplit(50, 'ArrowLeft', false), 52, 'סריקה מימין — ← מרחיב אותה');
  assert.equal(nudgeSplit(50, 'ArrowRight', false), 48);
  assert.equal(nudgeSplit(50, 'ArrowLeft', true), 48, 'סריקה משמאל — ← מצר אותה');
  assert.equal(nudgeSplit(79, 'ArrowLeft', false), SPLIT_MAX);
  assert.equal(nudgeSplit(50, 'Home'), SPLIT_MIN);
  assert.equal(nudgeSplit(50, 'End'), SPLIT_MAX);
  assert.equal(nudgeSplit(50, 'Enter'), null);
});
