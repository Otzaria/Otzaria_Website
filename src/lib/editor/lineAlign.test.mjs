import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLine, lineCost, alignLines, nearestAlignedLine } from './lineAlign.js';

const idx = (al) => al.map((a) => a.scanIndex);
const L = ['בראשית ברא אלהים את השמים', 'ואת הארץ והארץ היתה תהו', 'ובהו וחשך על פני תהום', 'ורוח אלהים מרחפת על פני המים'];

test('normalizeLine / lineCost', () => {
  assert.equal(normalizeLine('בְּרֵאשִׁית, בָּרָא'), 'בראשיתברא');
  assert.equal(lineCost('אבגד', 'אבגד'), 0);
  assert.equal(lineCost('', 'אב'), 1);
  assert.equal(lineCost('א', 'ב'), 1);
  assert.ok(lineCost(normalizeLine(L[0]), normalizeLine(L[0].replace('ברא', 'כרא'))) < 0.25);
  assert.ok(lineCost(normalizeLine(L[0]), normalizeLine(L[3])) > 0.6);
});

test('alignLines: מספר שווה — זהות (בלי DP)', () => {
  const al = alignLines(L, L.map((t) => ({ text: 'זבל' + t })));
  assert.deepEqual(idx(al), [0, 1, 2, 3]);
  assert.ok(al.every((a) => a.kind === 'identity'));
});

test('alignLines: מספר שווה אבל מוזז בשורה (כותרת בצילום + שורה שנוספה בטקסט) — DP לפי רוחב', () => {
  // צילום: כותרת קצרה, ואחריה 5 שורות באורכים שונים; הטקסט: 5 השורות + שורה קצרה בסוף
  const widths = [200, 1000, 600, 950, 400, 900];
  const scan = widths.map((w, i) => ({ bbox: [1000 - w, i * 20, 1000, i * 20 + 12] }));
  const chars = (n) => 'א'.repeat(n);
  const T = [chars(100), chars(60), chars(95), chars(40), chars(90), chars(15)];
  const al = alignLines(T, scan);
  assert.deepEqual(idx(al).slice(0, 5), [1, 2, 3, 4, 5]);
  assert.notEqual(al[0].kind, 'identity');
});

test('alignLines: מספר שווה ורוחבים תואמים — נשאר זהות (DP לא מנצח בבירור)', () => {
  const widths = [1000, 600, 950, 400];
  const scan = widths.map((w, i) => ({ bbox: [1000 - w, i * 20, 1000, i * 20 + 12] }));
  const T = [100, 58, 97, 42].map((n) => 'א'.repeat(n));
  const al = alignLines(T, scan);
  assert.deepEqual(idx(al), [0, 1, 2, 3]);
  assert.ok(al.every((a) => a.kind === 'identity'));
});

test('alignLines: force — DP גם כשהמספר שווה', () => {
  const al = alignLines([L[0], L[2]], [L[0], L[1]], { force: true });
  assert.equal(al[0].scanIndex, 0);
});

test('alignLines: ריקים', () => {
  assert.deepEqual(alignLines([], L), []);
  assert.deepEqual(idx(alignLines(['א'], [])), [null]);
});

test('alignLines: שורה נמחקה מהטקסט', () => {
  assert.deepEqual(idx(alignLines([L[0], L[2], L[3]], L)), [0, 2, 3]);
});

test('alignLines: שורה נוספה בטקסט', () => {
  const al = alignLines([L[0], 'שורה חדשה לגמרי שאין כמותה', L[1], L[2], L[3]], L);
  assert.deepEqual(idx(al), [0, null, 1, 2, 3]);
  assert.equal(al[1].kind, 'insert');
});

test('alignLines: שורה פוצלה בטקסט לשתיים (merge)', () => {
  const [a, b] = ['ואת הארץ', 'והארץ היתה תהו'];
  const al = alignLines([L[0], a, b, L[2], L[3]], L);
  assert.deepEqual(idx(al), [0, 1, 1, 2, 3]);
  assert.equal(al[1].kind, 'merge');
});

test('alignLines: שתי שורות אוחדו בטקסט (split)', () => {
  const al = alignLines([L[0], L[1] + ' ' + L[2], L[3]], L);
  assert.equal(al[1].kind, 'split');
  assert.deepEqual(al[1].scanIndexes, [1, 2]);
  assert.equal(al[2].scanIndex, 3);
});

test('alignLines: שגיאות זיהוי בצילום', () => {
  const scan = [L[0].replace('ש', 'ט'), L[2].replace('ו', 'ז')];
  assert.deepEqual(idx(alignLines([L[0], L[1], L[2]], scan)), [0, null, 1]);
});

test('alignLines: בלי טקסט בצילום — לפי אורך מול רוחב', () => {
  const T = ['שורה ארוכה מאוד מאוד עם הרבה מילים', 'שורה ארוכה מאוד מאוד עם הרבה תווים'];
  // שורה קצרה (סוף פסקה) בצילום שנמחקה מהטקסט — מדלגים עליה
  const scan = [{ bbox: [0, 0, 1000, 10] }, { bbox: [700, 20, 1000, 30] }, { bbox: [0, 40, 980, 50] }];
  assert.deepEqual(idx(alignLines(T, scan)), [0, 2]);
  // שורה קצרה שנוספה בטקסט — שמה נשאר מונוטוני (מתמזגת בשכנה או מדולגת)
  const al = alignLines([T[0], 'קצר', T[1]], [scan[0], scan[2]]);
  assert.equal(al[0].scanIndex, 0);
  assert.equal(al[2].scanIndex, 1);
});

test('alignLines: בלי טקסט ובלי תיבות — לפי הסדר', () => {
  assert.deepEqual(idx(alignLines(['א', 'ב', 'ג'], [{}, {}])), [0, 1, null]);
});

test('nearestAlignedLine', () => {
  const al = alignLines([L[0], 'חדשה לגמרי בלי קשר שום', L[1], L[2], L[3]], L);
  assert.equal(nearestAlignedLine(al, 1), 0);
  assert.equal(nearestAlignedLine(al, 2), 1);
  assert.equal(nearestAlignedLine(al, 99), 3);
  const lead = alignLines(['זה לא קשור כלל', L[0], L[1], L[2], L[3]], L);
  assert.equal(nearestAlignedLine(lead, 0), 0);
  assert.equal(nearestAlignedLine([], 0), null);
  assert.equal(nearestAlignedLine([{ scanIndex: null, scanIndexes: [], cost: 1, kind: 'insert' }], 0), null);
});
