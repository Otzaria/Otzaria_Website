import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caretRowMid, lineColAt, locateCol, rowInView, revealScrollTop } from './caretRow.js';

test('lineColAt: שורה ועמודה, כולל קטימה', () => {
  assert.deepEqual(lineColAt('אב\nגדה\nו', 0), { line: 0, col: 0 });
  assert.deepEqual(lineColAt('אב\nגדה\nו', 2), { line: 0, col: 2 });
  assert.deepEqual(lineColAt('אב\nגדה\nו', 3), { line: 1, col: 0 });
  assert.deepEqual(lineColAt('אב\nגדה\nו', 5), { line: 1, col: 2 });
  assert.deepEqual(lineColAt('אב\nגדה\nו', 99), { line: 2, col: 1 });
  assert.deepEqual(lineColAt('אב', -4), { line: 0, col: 0 });
  assert.deepEqual(lineColAt(null, 3), { line: 0, col: 0 });
});

test('locateCol: גבול בין צמתים שייך לצומת הבא', () => {
  assert.deepEqual(locateCol([3, 1, 4], 0), { index: 0, offset: 0 });
  assert.deepEqual(locateCol([3, 1, 4], 2), { index: 0, offset: 2 });
  assert.deepEqual(locateCol([3, 1, 4], 3), { index: 1, offset: 0 });
  assert.deepEqual(locateCol([3, 1, 4], 4), { index: 2, offset: 0 });
  assert.deepEqual(locateCol([3, 1, 4], 7), { index: 2, offset: 3 });
});

test('locateCol: סוף השורה ומעבר לה — סוף הצומת האחרון; צמתים ריקים מדולגים', () => {
  assert.deepEqual(locateCol([3, 1, 4], 8), { index: 2, offset: 4 });
  assert.deepEqual(locateCol([3, 1, 4], 50), { index: 2, offset: 4 });
  assert.deepEqual(locateCol([0, 2, 0], 1), { index: 1, offset: 1 });
  assert.deepEqual(locateCol([0, 2, 0], 2), { index: 1, offset: 2 });
  assert.equal(locateCol([], 0), null);
  assert.equal(locateCol([0, 0], 0), null);
});

test('caretRowMid: התו שאחרי, ואם אין לו גובה — התו שלפני', () => {
  assert.equal(caretRowMid({ top: 100, bottom: 120 }), 110);
  assert.equal(caretRowMid({ top: 100, bottom: 100 }, { top: 60, bottom: 80 }), 70);
  assert.equal(caretRowMid(null, { top: 60, bottom: 80 }), 70);
  assert.equal(caretRowMid(null, null), null);
});

test('rowInView: בתוך החלון עם שוליים', () => {
  assert.equal(rowInView(50, 0, 100, 10), true);
  assert.equal(rowInView(5, 0, 100, 10), false);
  assert.equal(rowInView(95, 0, 100, 10), false);
  assert.equal(rowInView(null, 0, 100), false);
});

test('revealScrollTop: שורת הסמן נעמדת מול השורה שנלחצה בצילום', () => {
  // חלון 100..500, הסמן ב-2000 (מתחת לחלון), נלחץ בגובה 450
  assert.equal(revealScrollTop({ rowY: 2000, targetY: 450, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 5000 }), 1550);
  // נמדד כשהשכבה הייתה גלולה ל-300 — אותו מיקום בתוכן
  assert.equal(revealScrollTop({ rowY: 1700, targetY: 450, viewTop: 100, viewBottom: 500, measuredScroll: 300, maxScroll: 5000 }), 1550);
});

test('revealScrollTop: נקודה מחוץ לחלון או לא ידועה — אמצע החלון', () => {
  assert.equal(revealScrollTop({ rowY: 2000, targetY: 900, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 5000 }), 1700);
  assert.equal(revealScrollTop({ rowY: 2000, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 5000 }), 1700);
  assert.equal(revealScrollTop({ rowY: 2000, targetY: 110, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 5000, margin: 20 }), 1700);
});

test('revealScrollTop: מוגבל לטווח הגלילה; בלי מדידה — null', () => {
  assert.equal(revealScrollTop({ rowY: 2000, targetY: 450, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 1200 }), 1200);
  assert.equal(revealScrollTop({ rowY: 150, targetY: 450, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 1200 }), 0);
  assert.equal(revealScrollTop({ rowY: null, targetY: 450, viewTop: 100, viewBottom: 500, measuredScroll: 0, maxScroll: 1200 }), null);
  assert.equal(revealScrollTop({ rowY: 300, viewTop: 100, viewBottom: 100, measuredScroll: 0, maxScroll: 1200 }), null);
});
