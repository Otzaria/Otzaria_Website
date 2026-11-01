import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FP_SIZE, analysisScale, fingerprintDistance, grayFingerprint, profileFitsImage, profileFromRgba, MAX_WORDS_PER_LINE, splitBlocks, findGutter, narrowGutter, paragraphEnds, headerLines } from './scanProfile.js';
import { fromProfile } from './trackingSource.js';

// תמונה לבנה עם מלבנים שחורים (מילים)
function page(w, h, rects) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        px[p] = px[p + 1] = px[p + 2] = 0;
      }
    }
  }
  return px;
}

// הרווחים בין המילים לא מיושרים אנכית — אחרת הם נראים כתעלה בין שני טורים
const ROWS = [
  [20, [[20, 60], [80, 120], [140, 180]]],
  [50, [[20, 90], [110, 150], [160, 180]]],
  [80, [[20, 50], [70, 130], [150, 180]]],
];
const rects = ROWS.flatMap(([y, ws]) => ws.map(([a, b]) => [a, y, b, y + 12]));

test('analysisScale: לא מגדילים; קטום לרוחב ולשטח', () => {
  assert.equal(analysisScale(800, 1000), 1);
  assert.equal(analysisScale(2800, 1000), 0.5);
  assert.ok(Math.abs(analysisScale(1400, 4000, { maxPixels: 1_400_000 }) - 0.5) < 1e-9);
  assert.equal(analysisScale(0, 10), 1);
});

test('profileFromRgba: שלוש שורות (פס מוחלק — פיקסל שוליים מכל צד), שלוש מילים בכל אחת, ממוינות מימין לשמאל', () => {
  const p = profileFromRgba(page(200, 120, rects), 200, 120);
  assert.deepEqual(p.size, [200, 120]);
  assert.equal(p.lines.length, 3);
  assert.deepEqual(p.lines[0].bbox, [20, 19, 180, 33]);
  assert.deepEqual(p.lines[1].words, [[160, 180], [110, 150], [20, 90]]);
});

test('profileFromRgba: פס צל בשוליים לא מבטל את השורות; scale מחזיר לפיקסלים טבעיים', () => {
  const px = page(200, 120, [...rects, [0, 0, 5, 120], [195, 0, 200, 120]]);
  const p = profileFromRgba(px, 200, 120, { scale: 0.5 });
  assert.deepEqual(p.size, [400, 240]);
  assert.equal(p.lines.length, 3);
  assert.deepEqual(p.lines[2].bbox, [40, 158, 360, 186]);
  const src = fromProfile(p);
  assert.equal(src.source, 'profile');
  assert.equal(src.level, 'word');
  assert.equal(src.lines[0].words.length, 3);
});

test('profileFromRgba: עמוד ריק / קלט פגום → בלי שורות', () => {
  assert.deepEqual(profileFromRgba(page(50, 50, []), 50, 50).lines, []);
  assert.deepEqual(profileFromRgba(new Uint8ClampedArray(4), 50, 50).lines, []);
  assert.deepEqual(profileFromRgba(null, 0, 0).lines, []);
});

test('profileFromRgba: שורה רועשת (יותר מדי מילים) נשמרת בלי מילים', () => {
  const noisy = [];
  for (let i = 0; i < MAX_WORDS_PER_LINE + 5; i++) noisy.push([4 + i * 8, 30, 7 + i * 8, 40]);
  const p = profileFromRgba(page(400, 80, noisy), 400, 80);
  assert.equal(p.lines.length, 1);
  assert.deepEqual(p.lines[0].words, []);
});

// ---- שני טורים, כותרת עליונה, סופי פסקאות ----

// שורה של "מילים" בין xa ל-xb (RTL: מתחילה מימין), רווחים לא מיושרים בין שורות
function lineRects(xa, xb, y, seed) {
  const out = [];
  let x = xb;
  let k = seed;
  while (x - 10 > xa) {
    const w = 14 + ((k * 7) % 13);
    out.push([Math.max(xa, x - w), y, x, y + 12]);
    x -= w + 6;
    k++;
  }
  return out;
}

const B = (x0, y0, x1, y1) => ({ bbox: [x0, y0, x1, y1] });

test('splitBlocks: רווח גדול מהרגיל מפריד גושים; רווחים רגילים לא', () => {
  const rows = new Array(200).fill(0);
  const ink = (a, b) => rows.fill(10, a, b);
  ink(0, 12); // כותרת
  for (const y of [60, 90, 120, 150, 180]) ink(y, y + 12);
  assert.deepEqual(splitBlocks(rows), [{ y0: 0, y1: 12 }, { y0: 60, y1: 200 }]);
  assert.deepEqual(splitBlocks(new Array(10).fill(1)), [{ y0: 0, y1: 10 }]);
});

test('findGutter: תעלה ריקה באמצע עם טקסט משני הצדדים; בלי תעלה / צד ריק → null', () => {
  const cols = new Array(100).fill(20);
  cols.fill(0, 45, 55);
  assert.deepEqual(findGutter(cols, 100), { x0: 45, x1: 55 });
  assert.equal(findGutter(new Array(100).fill(20), 100), null);
  const oneSide = new Array(100).fill(0);
  oneSide.fill(20, 60, 100);
  assert.equal(findGutter(oneSide, 100), null);
  assert.equal(findGutter([1, 2], 10), null);
});

test('findGutter / narrowGutter: תעלה צרה או "מלוכלכת" (עמוד מוטה) — עמק עמוק בפרופיל', () => {
  // רוחב 400, דיו 300 בעמודות הטקסט; תעלה של 4 עמודות עם מעט דיו (אותיות שבולטות לתוכה)
  const cols = new Array(400).fill(300);
  cols.fill(0, 0, 10);
  cols.fill(0, 390, 400);
  cols.fill(20, 198, 202);
  assert.deepEqual(findGutter(cols, 1000), { x0: 198, x1: 202 });
  // עמק רדוד (פחות מרבע מהדיו הרגיל אינו) — לא תעלה
  const shallow = new Array(400).fill(300);
  shallow.fill(120, 195, 205);
  assert.equal(narrowGutter(shallow, 1000), null);
  assert.equal(findGutter(shallow, 1000), null);
  // דיו רב בתחתית העמק ביחס לגובה — לא תעלה
  const inky = new Array(400).fill(1000);
  inky.fill(80, 198, 202);
  assert.equal(narrowGutter(inky, 1000), null);
});

test('paragraphEnds: שורה שמסתיימת הרבה לפני הקצה השמאלי היא סוף פסקה', () => {
  const ls = [B(10, 0, 300, 20), B(12, 30, 300, 50), B(150, 60, 300, 80), B(10, 90, 300, 110), B(11, 120, 300, 140)];
  assert.deepEqual(paragraphEnds(ls), [false, false, true, false, false]);
  assert.deepEqual(paragraphEnds([]), []);
});

test('headerLines: כותרת של שתי שורות בראש שני הטורים, באותו גובה, ואחריה רווח גדול', () => {
  const col = (x0, x1, ys) => ys.map((y) => B(x0, y, x1, y + 12));
  const ys = [0, 18, 60, 80, 100, 120, 140];
  const h = headerLines(col(210, 390, ys), col(10, 190, ys));
  assert.deepEqual(h, { right: 2, left: 2 });
  // בלי רווח גדול — אין כותרת
  const even = [0, 20, 40, 60, 80, 100, 120];
  assert.equal(headerLines(col(210, 390, even), col(10, 190, even)), null);
  // רק בטור אחד — אין כותרת
  assert.equal(headerLines(col(210, 390, ys), col(10, 190, even)), null);
});

test('profileFromRgba: כותרת ברוחב מלא + שני טורים → header, הטור הימני כולו ואחריו השמאלי, paraEnd', () => {
  const W = 400;
  const H = 260;
  const rects = [...lineRects(150, 250, 10, 0)]; // כותרת קצרה במרכז
  const ys = [70, 100, 130, 160, 190, 220];
  ys.forEach((y, i) => {
    rects.push(...lineRects(i === 2 ? 300 : 215, 390, y, i)); // שורה 2 בימין — סוף פסקה
    rects.push(...lineRects(10, 185, y, i + 3));
  });
  const p = profileFromRgba(page(W, H, rects), W, H);
  const streams = p.lines.map((l) => l.stream);
  assert.deepEqual(streams, ['header', ...ys.map(() => 'right'), ...ys.map(() => 'left')]);
  const right = p.lines.filter((l) => l.stream === 'right');
  assert.deepEqual(right.map((l) => l.paraEnd), [false, false, true, false, false, false]);
  assert.ok(right.every((l) => l.bbox[0] >= 200));
  assert.ok(p.lines.filter((l) => l.stream === 'left').every((l) => l.bbox[2] <= 200));
  // fromProfile שומר את paraEnd
  assert.equal(fromProfile(p).lines.filter((l) => l.paraEnd).length >= 1, true);
});

test('profileFromRgba: כותרת בתוך הטורים בלי רווח גדול לפניה (headerLines) → header', () => {
  const W = 400;
  const H = 260;
  const rects = [...lineRects(300, 390, 10, 0), ...lineRects(10, 100, 10, 1)];
  // רווח של 18 מול 8 הרגיל: גדול מפי 2 (headerLines) אבל לא מפי 2.5 (splitBlocks)
  const ys = [40, 60, 80, 100, 120, 140, 160, 180];
  ys.forEach((y, i) => {
    rects.push(...lineRects(215, 390, y, i));
    rects.push(...lineRects(10, 185, y, i + 3));
  });
  const p = profileFromRgba(page(W, H, rects), W, H);
  assert.equal(p.lines.filter((l) => l.stream === 'header').length, 2);
  assert.equal(p.lines.filter((l) => l.stream === 'right').length, ys.length);
  assert.equal(p.lines.filter((l) => l.stream === 'left').length, ys.length);
});

test('profileFitsImage: פרופיל שמור תקף רק לאותם ממדים (סטייה של פיקסל מותרת)', () => {
  assert.equal(profileFitsImage({ size: [1200, 1800] }, 1200, 1800), true);
  assert.equal(profileFitsImage({ size: [1200, 1800] }, 1201, 1799), true);
  assert.equal(profileFitsImage({ size: [1200, 1800] }, 1000, 1800), false);
  assert.equal(profileFitsImage({ size: [1200] }, 1200, 1800), false);
  assert.equal(profileFitsImage(null, 1200, 1800), false);
  assert.equal(profileFitsImage({ size: [1200, 1800] }, 0, 0), false);
});

test('grayFingerprint: ממוצע אפור ברשת 16×16; fingerprintDistance', () => {
  const N = FP_SIZE;
  const white = new Uint8ClampedArray(N * N * 4).fill(255);
  const fw = grayFingerprint(white, N, N);
  assert.equal(fw.length, N * N);
  assert.ok(fw.every((v) => v === 255));
  // תמונה גדולה יותר: כל תא — ממוצע הפיקסלים שבו (חצי עליון שחור)
  const W = 32, H = 32;
  const half = new Uint8ClampedArray(W * H * 4).fill(255);
  half.fill(0, 0, (W * H * 4) / 2);
  const fh = grayFingerprint(half, W, H);
  assert.equal(fh[0], 0);
  assert.equal(fh[N * N - 1], 255);
  assert.equal(fingerprintDistance(fw, fw), 0);
  assert.equal(fingerprintDistance(fw, fh), 127.5);
  assert.equal(fingerprintDistance(fw, null), Infinity);
  assert.equal(grayFingerprint(white, 0, 0), null);
});

test('profileFitsImage: עם טביעת אצבע — תמונה אחרת באותן מידות נפסלת', () => {
  const a = Array(256).fill(200);
  const b = Array(256).fill(205);
  assert.equal(profileFitsImage({ size: [100, 100], fp: a }, 100, 100, a), true);
  assert.equal(profileFitsImage({ size: [100, 100], fp: a }, 100, 100, b), false);
  // בלי טביעה לאחד מהם — רק הממדים
  assert.equal(profileFitsImage({ size: [100, 100] }, 100, 100, b), true);
  assert.equal(profileFitsImage({ size: [100, 100], fp: a }, 100, 100, null), true);
});
