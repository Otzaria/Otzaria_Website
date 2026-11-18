import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentSuspect, placeSuspectPopup, suspectAt, suspectId } from './suspectPopup.js';

const S = [
  { column: 'right', start: 0, end: 4, text: 'אאאא' },
  { column: 'right', start: 10, end: 14, text: 'בבבב' },
  { column: 'left', start: 2, end: 5, text: 'גגג' },
];

test('suspectAt: caret inside or at either edge, in the same column only', () => {
  assert.equal(suspectAt(S, 'right', 0)?.text, 'אאאא');
  assert.equal(suspectAt(S, 'right', 4)?.text, 'אאאא');
  assert.equal(suspectAt(S, 'right', 12)?.text, 'בבבב');
  assert.equal(suspectAt(S, 'right', 7), null);
  assert.equal(suspectAt(S, 'left', 12), null);
  assert.equal(suspectAt(S, 'right', NaN), null);
  assert.equal(suspectAt(null, 'right', 1), null);
});

test('adjacentSuspect: F8 opens the word under the caret first, then moves on and wraps across columns', () => {
  assert.equal(adjacentSuspect(S, { column: 'right', offset: 2 }).text, 'אאאא');
  assert.equal(adjacentSuspect(S, { column: 'right', offset: 6 }).text, 'בבבב');
  assert.equal(adjacentSuspect(S, { suspect: S[0] }).text, 'בבבב');
  assert.equal(adjacentSuspect(S, { suspect: S[1] }).text, 'גגג');
  assert.equal(adjacentSuspect(S, { suspect: S[2] }).text, 'אאאא');
  assert.equal(adjacentSuspect(S, { column: 'left', offset: 9 }).text, 'אאאא');
});

test('adjacentSuspect: Shift+F8 skips the word under the caret and wraps backwards', () => {
  assert.equal(adjacentSuspect(S, { column: 'right', offset: 12 }, -1).text, 'אאאא');
  assert.equal(adjacentSuspect(S, { column: 'right', offset: 2 }, -1).text, 'גגג');
  assert.equal(adjacentSuspect(S, { column: 'left', offset: 0 }, -1).text, 'בבבב');
  assert.equal(adjacentSuspect(S, { suspect: S[0] }, -1).text, 'גגג');
  assert.equal(adjacentSuspect([], { column: 'right', offset: 0 }), null);
});

test('suspectId matches the review panel id', () => {
  assert.equal(suspectId(S[2]), 'left:2:גגג');
});

const VP = { width: 1000, height: 800 };
const overlaps = (word, p, h) => p.top < word.bottom && p.top + h > word.top;

test('placeSuspectPopup: below the word by default, right edges aligned', () => {
  const word = { left: 500, right: 560, top: 100, bottom: 120 };
  const p = placeSuspectPopup(word, { width: 300, height: 200 }, VP);
  assert.equal(p.above, false);
  assert.equal(p.top, 126);
  assert.equal(p.left, 260);
  assert.ok(!overlaps(word, p, Math.min(200, p.maxHeight)));
});

test('placeSuspectPopup: above near the bottom; never on the word and never off screen', () => {
  const word = { left: 20, right: 60, top: 760, bottom: 780 };
  const p = placeSuspectPopup(word, { width: 300, height: 200 }, VP);
  assert.equal(p.above, true);
  assert.ok(!overlaps(word, p, 200));
  assert.equal(p.left, 8);
  assert.ok(p.top >= 8);
});

test('placeSuspectPopup: a tall popup is limited to the chosen side instead of covering the word', () => {
  const word = { left: 500, right: 560, top: 390, bottom: 410 };
  const p = placeSuspectPopup(word, { width: 300, height: 2000 }, VP);
  const h = Math.min(2000, p.maxHeight);
  assert.ok(!overlaps(word, p, h));
  assert.ok(p.top >= 8 && p.top + h <= 792);
});

test('placeSuspectPopup: when both sides are tiny, maxHeight keeps a sensible minimum', () => {
  const word = { left: 500, right: 560, top: 30, bottom: 50 };
  const p = placeSuspectPopup(word, { width: 300, height: 400 }, { width: 1000, height: 100 });
  assert.ok(p.maxHeight >= 120);
});
