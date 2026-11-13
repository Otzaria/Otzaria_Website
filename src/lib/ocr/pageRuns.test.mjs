import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPagesInRuns, pageRunsOf } from './pageRuns.js';

test('pageRunsOf: ממיין, מאחד רצפים, מסיר כפילויות וערכים לא תקינים', () => {
  assert.deepEqual(pageRunsOf([5, 1, 2, 3, 3, 7, 8, 10]), [[1, 3], [5, 5], [7, 8], [10, 10]]);
  assert.deepEqual(pageRunsOf([]), []);
  assert.deepEqual(pageRunsOf(null), []);
  assert.deepEqual(pageRunsOf([0, -1, 1.5, NaN, '2', 4]), [[4, 4]]);
});

test('countPagesInRuns: בלי טווח — כל העמודים; עם טווח — רק החיתוך', () => {
  const runs = [[1, 3], [5, 5], [7, 8], [10, 10]];
  assert.equal(countPagesInRuns(runs, null), 7);
  assert.equal(countPagesInRuns(runs, { from: 2, to: 7 }), 4); // 2,3,5,7
  assert.equal(countPagesInRuns(runs, { from: 4, to: 4 }), 0);
  assert.equal(countPagesInRuns(runs, { from: 9, to: 500 }), 1);
  assert.equal(countPagesInRuns(runs, { from: 1, to: 10 }), 7);
});

test('countPagesInRuns: קלט פגום — אפס/מתעלמים', () => {
  assert.equal(countPagesInRuns(undefined, null), 0);
  assert.equal(countPagesInRuns([[3, 1], 'x', [1], [2, 4]], null), 3);
});
