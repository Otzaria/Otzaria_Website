import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exceedsJsonDepth } from './jsonDepth.js';

// n מכלים מקוננים (מערכים, או אובייקטים {a:...}) סביב 0 — נבנה כמחרוזת, בלי רקורסיה
const deepArray = (n) => JSON.parse(`${'['.repeat(n)}0${']'.repeat(n)}`);
const deepObject = (n) => JSON.parse(`${'{"a":'.repeat(n)}0${'}'.repeat(n)}`);

test('exceedsJsonDepth: פרימיטיבים ומכלים ריקים', () => {
  for (const v of [null, undefined, 0, 'x', true]) assert.equal(exceedsJsonDepth(v, 0), false);
  assert.equal(exceedsJsonDepth({}, 1), false);
  assert.equal(exceedsJsonDepth([], 1), false);
  assert.equal(exceedsJsonDepth({}, 0), true);
  assert.equal(exceedsJsonDepth({ a: [1, 'x', null] }, 2), false);
  assert.equal(exceedsJsonDepth({ a: [1, 'x', null] }, 1), true);
});

test('exceedsJsonDepth: בדיוק בגבול עובר, גבול+1 נפסל — מערכים, אובייקטים ומעורב', () => {
  for (const limit of [1, 8, 64, 100]) {
    for (const make of [deepArray, deepObject]) {
      assert.equal(exceedsJsonDepth(make(limit), limit), false, `${make.name}(${limit})`);
      assert.equal(exceedsJsonDepth(make(limit + 1), limit), true, `${make.name}(${limit + 1})`);
    }
  }
  // הענף העמוק הוא אחרון ברשימה, אחרי ענפים רדודים
  const mixed = { a: 1, b: [{}], c: { d: [[{ e: [0] }]] } }; // c(2) d(3) [](4) {}(5) e(6)
  assert.equal(exceedsJsonDepth(mixed, 6), false);
  assert.equal(exceedsJsonDepth(mixed, 5), true);
});

test('exceedsJsonDepth: קינון עוין של מאות אלפי רמות — לא זורק (אין רקורסיה) ונפסל', () => {
  assert.equal(exceedsJsonDepth(deepArray(500_000), 64), true);
  assert.equal(exceedsJsonDepth(deepObject(200_000), 64), true);
  // רוחב גדול בעומק רדוד (שורש → rows → [i, {v}] → {v} = 4 רמות) — לפי העומק בלבד
  const wide = { rows: Array.from({ length: 100_000 }, (_, i) => [i, { v: i }]) };
  assert.equal(exceedsJsonDepth(wide, 4), false);
  assert.equal(exceedsJsonDepth(wide, 3), true);
});

test('exceedsJsonDepth: קלט מעגלי (לא מ-JSON.parse) מסתיים ונחשב עמוק מדי', () => {
  const a = { x: 1 };
  a.self = a;
  assert.equal(exceedsJsonDepth(a, 64), true);
});
