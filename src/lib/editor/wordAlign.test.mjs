import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAP,
  CONFIDENT_COST,
  normalizeWord,
  normCost,
  wordCost,
  alignLine,
  inverseMap,
  unionBox,
  matchedBox,
  estimateInserted,
} from './wordAlign.js';

// מילות צילום RTL: שורה בגובה 10..30, מילים בין x=1000 ל-0
const scanOf = (words, { right = 1000, w = 100, gap = 20 } = {}) =>
  words.map((text, i) => ({ text, bbox: [right - (i + 1) * w - i * gap, 10, right - i * w - i * gap, 30] }));
const idx = (al) => al.map((a) => a.scanIndex);

test('normalizeWord: ניקוד, טעמים, גרשיים, מקף, פיסוק, סופיות', () => {
  assert.equal(normalizeWord('בְּרֵאשִׁ֖ית'), 'בראשית');
  assert.equal(normalizeWord('ר"ת'), 'רת');
  assert.equal(normalizeWord('תוס׳'), 'תוס');
  assert.equal(normalizeWord('רמב״ם'), 'רמבמ');
  assert.equal(normalizeWord('כל־העם'), 'כלהעמ');
  assert.equal(normalizeWord('(שלום),'), 'שלומ');
  assert.equal(normalizeWord('—'), '');
  assert.equal(normalizeWord('\u200fאב\u200e'), 'אב');
  assert.equal(normalizeWord('ABC'), 'abc');
  assert.equal(normalizeWord(null), '');
  // צורות-מצגת (שׁ מורכבת)
  assert.equal(normalizeWord('שׁלום'), 'שלומ');
});

test('normCost / wordCost', () => {
  assert.equal(normCost('', ''), 0);
  assert.equal(normCost('אב', ''), 1);
  assert.equal(normCost('אבגד', 'אבגה'), 0.25);
  assert.equal(normCost('אבגד', 'אבדג'), 0.25); // החלפת סמוכים = 1
  assert.equal(wordCost('שָׁלוֹם', 'שלום'), 0);
  assert.equal(wordCost('א', 'תתתת'), 1);
});

test('alignLine: זהות', () => {
  const t = ['בראשית', 'ברא', 'אלהים'];
  const al = alignLine(t, scanOf(t));
  assert.deepEqual(idx(al), [0, 1, 2]);
  assert.ok(al.every((a) => a.confident && a.cost === 0 && a.kind === 'match'));
});

test('alignLine: מקבל מחרוזות בצילום', () => {
  assert.deepEqual(idx(alignLine(['אב', 'גד'], ['אב', 'גד'])), [0, 1]);
});

test('alignLine: ריקים', () => {
  assert.deepEqual(alignLine([], scanOf(['אב'])), []);
  const al = alignLine(['אב', 'גד'], []);
  assert.deepEqual(idx(al), [null, null]);
  assert.ok(al.every((a) => a.kind === 'insert' && !a.confident));
  assert.deepEqual(alignLine(null, null), []);
});

test('alignLine: מילה שנוספה בטקסט', () => {
  const al = alignLine(['אבג', 'חדשה', 'דהו', 'זחט'], scanOf(['אבג', 'דהו', 'זחט']));
  assert.deepEqual(idx(al), [0, null, 1, 2]);
  assert.equal(al[1].kind, 'insert');
});

test('alignLine: מילה שנמחקה מהטקסט', () => {
  assert.deepEqual(idx(alignLine(['אבג', 'זחט'], scanOf(['אבג', 'דהו', 'זחט']))), [0, 2]);
});

test('alignLine: שגיאת זיהוי — התאמה בטוחה מול מקווקווה', () => {
  const al = alignLine(['בראשית', 'ברא', 'אלהים'], scanOf(['בראשיח', 'כרא', 'אלהים']));
  assert.deepEqual(idx(al), [0, 1, 2]);
  assert.ok(al[0].confident); // 1/6
  assert.ok(al[1].cost > 0.3 && al[1].cost <= CONFIDENT_COST); // 1/3 — עדיין בטוחה
  const far = alignLine(['אב', 'שלום', 'גד'], scanOf(['אב', 'קרטע', 'גד']));
  assert.equal(far[1].scanIndex, 1);
  assert.equal(far[1].confident, false);
});

test('alignLine: איחוד — שתי מילים בטקסט, אחת בצילום', () => {
  const al = alignLine(['בית', 'המקדש', 'נבנה'], scanOf(['ביתהמקדש', 'נבנה']));
  assert.deepEqual(idx(al), [0, 0, 1]);
  assert.equal(al[0].kind, 'merge');
  assert.equal(al[1].kind, 'merge');
  assert.ok(al[0].confident);
});

test('alignLine: פיצול — מילה בטקסט, שתיים בצילום', () => {
  const al = alignLine(['ביתהמקדש', 'נבנה'], scanOf(['בית', 'המקדש', 'נבנה']));
  assert.equal(al[0].kind, 'split');
  assert.deepEqual(al[0].scanIndexes, [0, 1]);
  assert.equal(al[1].scanIndex, 2);
});

test('alignLine: ניקוד ופיסוק בטקסט אינם פוגעים בהתאמה', () => {
  const al = alignLine(['בְּרֵאשִׁ֖ית', 'בָּרָ֣א', 'אֱלֹהִ֑ים:'], scanOf(['בראשית', 'ברא', 'אלהים']));
  assert.ok(al.every((a) => a.cost === 0));
});

test('alignLine: מילה חוזרת — הסדר נשמר (מונוטוני)', () => {
  const al = alignLine(['אמר', 'משה', 'אמר'], scanOf(['אמר', 'אמר']));
  const got = al.map((a) => a.scanIndex).filter((x) => x !== null);
  assert.deepEqual(got, [...got].sort((a, b) => a - b));
  assert.equal(new Set(got).size, got.length);
});

test('alignLine: לצילום אין טקסט — אותו מספר מילים לפי הסדר', () => {
  const scan = scanOf(['', '', '']).map((w) => ({ bbox: w.bbox }));
  const al = alignLine(['א', 'ב', 'ג'], scan);
  assert.deepEqual(idx(al), [0, 1, 2]);
  assert.ok(al.every((a) => a.kind === 'position' && a.confident));
});

test('alignLine: לצילום אין טקסט ומספר שונה — לפי מקום, לא בטוח', () => {
  const scan = [{ bbox: [800, 0, 1000, 10] }, { bbox: [0, 0, 200, 10] }];
  const al = alignLine(['אבגד', 'ה', 'וזחט'], scan);
  assert.deepEqual(idx(al), [0, 0, 1].slice(0, 2).concat([1]));
  assert.ok(al.every((a) => a.kind === 'position' && !a.confident));
});

test('alignLine: gap מותאם', () => {
  // דילוג זול מאוד → עדיף לדלג על התאמה גרועה
  const al = alignLine(['אב'], scanOf(['תתת']), { gap: 0.1 });
  assert.equal(al[0].scanIndex, null);
  assert.equal(GAP, 0.55);
});

test('inverseMap', () => {
  const al = alignLine(['בית', 'המקדש', 'חדש', 'נבנה'], scanOf(['ביתהמקדש', 'נבנה', 'עוד']));
  assert.deepEqual(inverseMap(al, 3), [0, 3, null]);
  assert.deepEqual(inverseMap(alignLine(['ביתהמקדש'], scanOf(['בית', 'המקדש'])), 2), [0, 0]);
  assert.deepEqual(inverseMap([], 2), [null, null]);
  assert.deepEqual(inverseMap(null, 0), []);
});

test('unionBox / matchedBox', () => {
  assert.deepEqual(unionBox([[0, 5, 10, 20], [20, 0, 30, 15]]), [0, 0, 30, 20]);
  assert.equal(unionBox([]), null);
  const scan = scanOf(['בית', 'המקדש']);
  const al = alignLine(['ביתהמקדש'], scan);
  assert.deepEqual(matchedBox(al, scan, 0), unionBox([scan[0].bbox, scan[1].bbox]));
  assert.equal(matchedBox(al, scan, 5), null);
});

test('estimateInserted: בין שתי שכנות — בתוך הרווח, RTL', () => {
  const scan = scanOf(['אבג', 'דהו']); // [880..1000], [760..880-20=860]
  const text = ['אבג', 'חדש', 'דהו'];
  const al = alignLine(text, scan);
  const b = estimateInserted(text, al, scan, 1);
  assert.ok(b[2] <= scan[0].bbox[0] + 1e-9, 'משמאל לקודמת');
  assert.ok(b[0] >= scan[1].bbox[2] - 1e-9, 'מימין לבאה');
  assert.equal(b[1], 10);
  assert.equal(b[3], 30);
});

test('estimateInserted: שתי מילים שנוספו ברצף — זו אחר זו מימין לשמאל', () => {
  const scan = scanOf(['אבג', 'דהו'], { gap: 200 });
  const text = ['אבג', 'חדש', 'עוד', 'דהו'];
  const al = alignLine(text, scan);
  const a = estimateInserted(text, al, scan, 1);
  const b = estimateInserted(text, al, scan, 2);
  assert.ok(a[0] >= b[2] - 1e-9);
  assert.ok(a[2] > b[2]);
});

test('estimateInserted: שכנות צמודות — פס צר על הגבול', () => {
  const scan = [{ text: 'אב', bbox: [50, 0, 100, 10] }, { text: 'גד', bbox: [0, 0, 50, 10] }];
  const text = ['אב', 'חדש', 'גד'];
  const b = estimateInserted(text, alignLine(text, scan), scan, 1);
  assert.ok(b[0] < 50 && b[2] > 50);
});

test('estimateInserted: רק קודמת / רק באה — נצמד מהצד הנכון וקטום לשורה', () => {
  const scan = scanOf(['אבג']); // [900..1000]
  const after = ['אבג', 'חדש'];
  const b1 = estimateInserted(after, alignLine(after, scan), scan, 1, { lineBox: [0, 5, 1000, 35] });
  assert.ok(b1[2] < 900 && b1[0] < b1[2]);
  assert.deepEqual([b1[1], b1[3]], [5, 35]);
  const before = ['חדש', 'אבג'];
  const b2 = estimateInserted(before, alignLine(before, scan), scan, 0, { lineBox: [0, 5, 1000, 35] });
  assert.ok(b2[0] >= 1000 - 1e-9 || b2[0] > 900);
  assert.ok(b2[2] <= 1000);
});

test('estimateInserted: בלי שום עוגן — לפי מקום התווים בשורה; בלי שורה — null', () => {
  const text = ['אב', 'גד'];
  const al = alignLine(text, []);
  const b = estimateInserted(text, al, [], 0, { lineBox: [0, 0, 500, 20] });
  assert.ok(b[2] === 500 && b[0] > 250);
  assert.equal(estimateInserted(text, al, [], 0), null);
  assert.equal(estimateInserted(text, al, [], 9), null);
});

test('estimateInserted: מילה מיושרת — התיבה שלה', () => {
  const scan = scanOf(['אב']);
  assert.deepEqual(estimateInserted(['אב'], alignLine(['אב'], scan), scan, 0), scan[0].bbox);
});
