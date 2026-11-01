import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smooth, otsuThreshold, grayToInk, detectLines, detectWordGaps } from './projectionProfile.js';

// פרופיל סינתטי: שורות בגובה h, מרווח g, דיו v בתוך שורה
function profile(spans, len, v = 50) {
  const a = new Float64Array(len);
  for (const [s, e, val = v] of spans) for (let i = s; i < e; i++) a[i] = val;
  return a;
}
const ys = (bands) => bands.map((b) => [b.y0, b.y1]);

test('smooth: ממוצע נע ושוליים', () => {
  assert.deepEqual(Array.from(smooth([0, 3, 0], 1)), [1.5, 1, 1.5]);
  assert.deepEqual(Array.from(smooth([1, 2], 0)), [1, 2]);
  assert.equal(smooth([], 2).length, 0);
});

test('otsuThreshold: היסטוגרמה דו-שיאית', () => {
  const h = new Float64Array(256);
  h[20] = 100;
  h[230] = 900;
  const t = otsuThreshold(h);
  assert.ok(t >= 20 && t < 230);
  assert.equal(otsuThreshold(new Float64Array(256)), 128);
});

test('detectLines: שלוש שורות נקיות', () => {
  const p = profile([[10, 30], [50, 70], [90, 110]], 130);
  assert.deepEqual(ys(detectLines(p, { smoothRadius: 0 })), [[10, 30], [50, 70], [90, 110]]);
});

test('detectLines: ניקוד מעל השורה מתמזג בה', () => {
  // כתם דק (3px) של ניקוד ב-44..47, צמוד לשורה 50..70
  const p = profile([[10, 30], [44, 47, 8], [50, 70], [90, 110]], 130);
  const b = detectLines(p, { smoothRadius: 0 });
  assert.equal(b.length, 3);
  assert.deepEqual(ys(b)[1], [44, 70]);
});

test('detectLines: ניקוד מתחת לשורה מתמזג בה, לא בשורה הבאה', () => {
  const p = profile([[10, 30], [32, 35, 8], [50, 70]], 90);
  assert.deepEqual(ys(detectLines(p, { smoothRadius: 0 })), [[10, 35], [50, 70]]);
});

test('detectLines: כתם רחוק — נזרק אם נמוך מ-minHeight', () => {
  const p = profile([[10, 30], [60, 62, 40], [100, 120]], 130);
  const b = detectLines(p, { smoothRadius: 0, minHeight: 4 });
  assert.deepEqual(ys(b), [[10, 30], [100, 120]]);
});

test('detectLines: רעש רקע נמוך מתחת לסף לא יוצר שורות', () => {
  const p = profile([[0, 130, 2], [10, 30, 60], [50, 70, 60]], 130);
  assert.deepEqual(ys(detectLines(p, { smoothRadius: 0 })), [[10, 30], [50, 70]]);
});

test('detectLines: offset, ריק, בלי דיו', () => {
  const p = profile([[5, 15]], 20);
  assert.deepEqual(ys(detectLines(p, { smoothRadius: 0, offset: 100 })), [[105, 115]]);
  assert.deepEqual(detectLines([]), []);
  assert.deepEqual(detectLines(new Float64Array(50)), []);
});

test('detectLines: ink מסוכם בפס', () => {
  const b = detectLines(profile([[0, 10, 3]], 20), { smoothRadius: 0 });
  assert.equal(b[0].ink, 30);
});

test('detectWordGaps: מילים לפי מרווחים רחבים, RTL', () => {
  // שלוש מילים; בתוך כל מילה רווחי-אותיות של 1px, בין מילים 10px
  const a = profile([[0, 5], [6, 12], [22, 30], [31, 35], [45, 60]], 60, 5);
  const w = detectWordGaps(a, { minGap: 5 });
  assert.deepEqual(w, [{ x0: 45, x1: 60 }, { x0: 22, x1: 35 }, { x0: 0, x1: 12 }]);
});

test('detectWordGaps: סף אדפטיבי בלי minGap', () => {
  const a = profile([[0, 5], [6, 12], [13, 15], [25, 30], [31, 35], [45, 60]], 60, 5);
  assert.deepEqual(detectWordGaps(a).map((w) => [w.x0, w.x1]), [[45, 60], [25, 35], [0, 15]]);
});

test('detectWordGaps: לפי גובה שורה', () => {
  const a = profile([[0, 10], [14, 20], [40, 50]], 50, 5);
  assert.equal(detectWordGaps(a, { lineHeight: 20 }).length, 2);
});

test('detectWordGaps: מרווחים אחידים — מילה אחת; ריק', () => {
  const a = profile([[0, 4], [5, 9], [10, 14]], 14, 5);
  assert.deepEqual(detectWordGaps(a), [{ x0: 0, x1: 14 }]);
  assert.deepEqual(detectWordGaps(new Float64Array(10)), []);
  assert.deepEqual(detectWordGaps([]), []);
});

test('detectWordGaps: offset ו-inkThreshold', () => {
  const a = profile([[0, 10, 1], [10, 20, 5], [30, 40, 5]], 40);
  assert.deepEqual(detectWordGaps(a, { minGap: 5, inkThreshold: 1, offset: 100 }), [{ x0: 130, x1: 140 }, { x0: 110, x1: 120 }]);
});

// תמונה סינתטית: רקע לבן, מלבנים שחורים
function image(w, h, rects) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        px[p] = px[p + 1] = px[p + 2] = 0;
      }
  return px;
}

test('grayToInk: סכומי שורות ועמודות אחרי Otsu', () => {
  const px = image(20, 10, [[2, 1, 6, 3]]);
  const { rows, cols, threshold, rect } = grayToInk(px, 20, 10);
  assert.ok(threshold >= 0 && threshold < 255);
  assert.deepEqual(rect, { x: 0, y: 0, w: 20, h: 10 });
  assert.equal(rows[1], 4);
  assert.equal(rows[0], 0);
  assert.equal(cols[2], 2);
  assert.equal(cols[10], 0);
});

test('grayToInk: rect נקטם, פיקסל שקוף = לבן, סף מפורש', () => {
  const px = image(10, 10, [[0, 0, 10, 10]]);
  px[3] = 0; // הפיקסל הראשון שקוף
  const r = grayToInk(px, 10, 10, { x: -5, y: 0, w: 8, h: 1 }, { threshold: 128 });
  assert.deepEqual(r.rect, { x: 0, y: 0, w: 3, h: 1 });
  assert.equal(r.rows[0], 2);
});

test('מקצה לקצה: תמונה → שורות → מילים', () => {
  const W = 200;
  const H = 80;
  const px = image(W, H, [
    [150, 10, 190, 25], [100, 10, 140, 25], [20, 10, 80, 25],
    [120, 45, 190, 60], [30, 45, 100, 60],
    [125, 40, 185, 42], // שורת ניקוד צפופה מעל השורה השנייה
  ]);
  const { rows } = grayToInk(px, W, H);
  const bands = detectLines(rows, { smoothRadius: 0 });
  assert.deepEqual(ys(bands), [[10, 25], [40, 60]]);
  const words = bands.map((b) => detectWordGaps(grayToInk(px, W, H, { x: 0, y: b.y0, w: W, h: b.y1 - b.y0 }).cols, { lineHeight: b.y1 - b.y0 }));
  assert.deepEqual(words.map((ws) => ws.length), [3, 2]);
  assert.ok(words[0][0].x0 > words[0][1].x0);
});
