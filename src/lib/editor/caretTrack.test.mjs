import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignmentAgreement, columnStreamGroups, createWordAlignCache, hitTestScan, lineAlignmentFor, lineGapPad, linesForColumn, offsetFromScan, scaleBox, trackCaret } from './caretTrack.js';

// שלוש שורות בצילום, מילים מימין לשמאל (x יורד)
const W = (text, x0, x1, y) => ({ text, bbox: [x0, y, x1, y + 20] });
const SCAN = [
  { id: 0, stream: 'main', bbox: [10, 0, 300, 20], words: [W('בראשית', 220, 300, 0), W('ברא', 140, 210, 0), W('אלהים', 10, 130, 0)] },
  { id: 1, stream: 'main', bbox: [10, 40, 300, 60], words: [W('את', 250, 300, 40), W('השמים', 10, 240, 40)] },
  { id: 2, stream: 'main', bbox: [10, 80, 300, 100] },
];
const TEXT = 'בראשית ברא אלהים\nאת השמים\nואת הארץ';

test('linesForColumn: טור אחד — כל השורות בסדר הקריאה; שני טורים ושני זרמים — לפי הצד; אחרת שורה בלבד', () => {
  const two = { lines: [{ id: 'a', stream: 'r', bbox: [0, 0, 1, 1] }, { id: 'b', stream: 'l', bbox: [0, 0, 1, 1] }] };
  assert.deepEqual(linesForColumn(two).lines.map((l) => l.id), ['a', 'b']);
  assert.equal(linesForColumn(two).stream, null);
  assert.equal(linesForColumn({ lines: SCAN }).stream, 'main');
  assert.equal(linesForColumn(two, { twoColumns: true, column: 'left' }).stream, 'l');
  assert.equal(linesForColumn(two, { twoColumns: true, column: 'right' }).wordLevel, true);
  const one = linesForColumn({ lines: SCAN }, { twoColumns: true, column: 'left' });
  assert.equal(one.wordLevel, false);
  assert.equal(one.lines.length, 3);
  assert.deepEqual(linesForColumn(null), { stream: null, lines: [], wordLevel: false });
});

test('trackCaret: מילה מדויקת → solid; שורה בלי מילים → יחסית (under)', () => {
  const pos = TEXT.indexOf('ברא ');
  const t = trackCaret(TEXT, pos, SCAN);
  assert.equal(t.line, 0);
  assert.equal(t.word, 1);
  assert.equal(t.lineWords, 3);
  assert.equal(t.lineCount, 3);
  assert.equal(t.scanIndex, 0);
  assert.deepEqual(t.wordBox, [140, 0, 210, 20]);
  assert.equal(t.kind, 'solid');
  const u = trackCaret(TEXT, TEXT.indexOf('הארץ'), SCAN);
  assert.equal(u.scanIndex, 2);
  assert.equal(u.kind, 'under');
  assert.deepEqual(u.lineBox, [10, 80, 300, 100]);
});

test('trackCaret: wordLevel=false — רק יחסית; מטמון היישור נשמר לפי שורה וטקסט', () => {
  const cache = createWordAlignCache();
  const a = trackCaret(TEXT, 0, SCAN, { cache });
  assert.equal(a.kind, 'solid');
  assert.equal(cache.size, 1);
  trackCaret(TEXT, 3, SCAN, { cache });
  assert.equal(cache.size, 1);
  assert.equal(trackCaret(TEXT, 0, SCAN, { wordLevel: false }).kind, 'under');
});

test('trackCaret: שורה שנוספה בטקסט → השכנה, בלי מסגרת מילה; בלי שורות צילום → כלום', () => {
  const L = (t, y) => ({ id: y, stream: 'main', text: t, bbox: [10, y, 300, y + 20] });
  const scan = [L('בראשית ברא אלהים', 0), L('את השמים', 40), L('ואת הארץ', 80)];
  const text = 'בראשית ברא אלהים\nשורה חדשה לגמרי שנוספה\nאת השמים\nואת הארץ';
  const al = lineAlignmentFor(text, scan);
  assert.deepEqual(al.map((m) => m.scanIndex), [0, null, 1, 2]);
  const t = trackCaret(text, 20, scan, { alignment: al });
  assert.equal(t.line, 1);
  assert.equal(t.scanIndex, 0);
  assert.equal(t.lineEstimated, true);
  assert.equal(t.wordBox, null);
  assert.equal(trackCaret(text, text.indexOf('השמים'), scan, { alignment: al }).scanIndex, 1);
  // לחיצה על שורת צילום שממופה — לשורה הנכונה בטקסט (אחרי השורה שנוספה)
  assert.equal(offsetFromScan(text, scan, al, 1, null), text.indexOf('את השמים'));
  const none = trackCaret(TEXT, 0, []);
  assert.equal(none.scanIndex, null);
  assert.equal(none.lineBox, null);
});

test('offsetFromScan: שורה ומילה בצילום → תחילת המילה בטקסט', () => {
  assert.equal(offsetFromScan(TEXT, SCAN, null, 0, 2), TEXT.indexOf('אלהים'));
  assert.equal(offsetFromScan(TEXT, SCAN, null, 1, 1), TEXT.indexOf('השמים'));
  assert.equal(offsetFromScan(TEXT, SCAN, null, 1, null), TEXT.indexOf('את'));
  assert.equal(offsetFromScan(TEXT, SCAN, null, 2, 0), TEXT.indexOf('ואת'));
  assert.equal(offsetFromScan(TEXT, SCAN, null, 9, 0), -1);
});

test('hitTestScan: השורה הקרובה ומילה לפי x; מחוץ לשורות → null', () => {
  assert.deepEqual(hitTestScan(SCAN, 150, 10), { line: 0, word: 1 });
  assert.deepEqual(hitTestScan(SCAN, 135, 10), { line: 0, word: 1 });
  assert.deepEqual(hitTestScan(SCAN, 100, 90), { line: 2, word: null });
  assert.equal(hitTestScan(SCAN, 100, 30), null);
  assert.equal(hitTestScan(SCAN, NaN, 10), null);
});

test('scaleBox', () => {
  assert.deepEqual(scaleBox([10, 20, 30, 40], 2), [20, 40, 60, 80]);
  assert.deepEqual(scaleBox([10, 20, 30, 40], 2, 0.5), [20, 10, 60, 20]);
  assert.equal(scaleBox(null, 2), null);
});

test('linesForColumn: header/footer מזיהוי הצילום לא נכנסים לשורות שעוקבים אחריהן', () => {
  const src = { lines: [{ id: 'h', stream: 'header', bbox: [0, 0, 1, 1] }, { id: 'r', stream: 'right', bbox: [0, 0, 1, 1] }, { id: 'l', stream: 'left', bbox: [0, 0, 1, 1] }, { id: 'f', stream: 'footer', bbox: [0, 0, 1, 1] }] };
  assert.deepEqual(linesForColumn(src).lines.map((l) => l.id), ['r', 'l']);
  assert.equal(linesForColumn(src, { twoColumns: true, column: 'left' }).stream, 'left');
  assert.deepEqual(linesForColumn({ lines: [src.lines[0]] }).lines, []);
});

test('טקסט בפסקאות מול שורות צילום רבות → מעקב זורם (flow): trackCaret ו-offsetFromScan', () => {
  // שמונה שורות צילום, שתי פסקאות (סוף פסקה — שורה 3 ושורה 7, קצרות)
  const scan = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: i, stream: 'main', paraEnd: i === 3 || i === 7, bbox: [i === 3 || i === 7 ? 160 : 10, i * 30, 310, i * 30 + 20] }));
  const p1 = Array.from({ length: 21 }, (_, i) => `א${i}`).join(' ');
  const p2 = Array.from({ length: 21 }, (_, i) => `ב${i}`).join(' ');
  const text = `${p1}\n${p2}`;
  const al = lineAlignmentFor(text, scan);
  assert.ok(al.flow, 'מודל זורם מצורף');
  assert.equal(Object.keys(al).includes('flow'), false); // לא-ספיר
  const first = trackCaret(text, 0, scan, { alignment: al });
  assert.equal(first.scanIndex, 0);
  assert.equal(first.kind, 'dashed');
  assert.equal(trackCaret(text, text.indexOf('ב0'), scan, { alignment: al }).scanIndex, 4);
  assert.equal(trackCaret(text, text.indexOf('ב20'), scan, { alignment: al }).scanIndex, 7);
  assert.equal(offsetFromScan(text, scan, al, 4, null), text.indexOf('ב0'));
  // טקסט שורה-מול-שורה — בלי מודל זורם
  assert.equal(lineAlignmentFor(TEXT, SCAN).flow, undefined);
});

test('hitTestScan: סבולת אנכית (padY) — לחיצה ברווח שבין השורות → השורה הקרובה; lineGapPad', () => {
  assert.equal(hitTestScan(SCAN, 150, 26), null);
  assert.deepEqual(hitTestScan(SCAN, 150, 26, 4, 11), { line: 0, word: 1 });
  assert.deepEqual(hitTestScan(SCAN, 150, 34, 4, 11), { line: 1, word: 1 });
  // מחוץ למילים — המילה הקרובה, לא null
  assert.deepEqual(hitTestScan(SCAN, 135, 10, 4, 11), { line: 0, word: 1 });
  assert.equal(lineGapPad(SCAN), 11);
  assert.equal(lineGapPad([SCAN[0]]), 0);
  assert.equal(lineGapPad(null), 0);
});

test('offsetFromScan עם x: ההופכי של trackCaret — מילה שנוספה (תיבה משוערת) ושתי מילים על מילה אחת בצילום', () => {
  // "ואלהים" נוספה בטקסט; "השמים והארץ" — מילה אחת בצילום
  const scan = [
    { id: 0, stream: 'main', bbox: [10, 0, 300, 20], words: [W('בראשית', 220, 300, 0), W('ברא', 140, 210, 0), W('אלהים', 10, 60, 0)] },
    { id: 1, stream: 'main', bbox: [10, 40, 300, 60], words: [W('את', 250, 300, 40), W('השמיםוהארץ', 10, 240, 40)] },
  ];
  const text = 'בראשית ברא ואלהים אלהים\nאת השמים והארץ';
  const al = lineAlignmentFor(text, scan);
  const words = [...text.matchAll(/\S+/g)].map((m) => m.index);
  for (const off of words) {
    const t = trackCaret(text, off, scan, { alignment: al });
    assert.ok(t.wordBox, `תיבה ל-${off}`);
    // שתי מילים על אותה תיבה — כל אחת בחצי שלה (מימין לשמאל)
    const shared = words.filter((o) => trackCaret(text, o, scan, { alignment: al }).wordBox?.every((v, i) => v === t.wordBox[i]));
    const k = shared.indexOf(off);
    const x = t.wordBox[2] - ((k + 0.5) / shared.length) * (t.wordBox[2] - t.wordBox[0]);
    const hit = hitTestScan(scan, x, (t.wordBox[1] + t.wordBox[3]) / 2);
    assert.equal(offsetFromScan(text, scan, al, hit.line, hit.word, { x }), off, `הלוך-חזור ${off}`);
  }
  assert.equal(trackCaret(text, text.indexOf('והארץ'), scan, { alignment: al }).wordBox[0], 10); // אכן מילה משותפת
  // בלי x — מרכז המילה scanWord
  assert.equal(offsetFromScan(text, scan, al, 0, 1), text.indexOf('ברא '));
  // תחילת השורה כשאין מילה ואין x
  assert.equal(offsetFromScan(TEXT, SCAN, null, 2, null), TEXT.indexOf('ואת'));
});

test('trackCaret: confident — שורה מיושרת ומספר מילים קרוב לצילום; שורה בלי מילים / wordLevel=false — לא', () => {
  assert.equal(trackCaret(TEXT, TEXT.indexOf('ברא '), SCAN).confident, true);
  assert.equal(trackCaret(TEXT, TEXT.indexOf('השמים'), SCAN).confident, true);
  assert.equal(trackCaret(TEXT, TEXT.indexOf('הארץ'), SCAN).confident, false);
  assert.equal(trackCaret(TEXT, 0, SCAN, { wordLevel: false }).confident, false);
  // שורה עם 6 מילים בטקסט מול 3 בצילום — לא
  const more = 'בראשית ברא אלהים ועוד שלוש מילים\nאת השמים\nואת הארץ';
  assert.equal(trackCaret(more, 0, SCAN).confident, false);
});

test('trackCaret זורם: confident לפי מספר המילים בקבוצה מול הצילום', () => {
  const ws = (y) => Array.from({ length: 5 }, (_, k) => ({ bbox: [250 - k * 60, y, 300 - k * 60, y + 20] }));
  const scan = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: i, stream: 'main', paraEnd: i === 3 || i === 7, bbox: [10, i * 30, 310, i * 30 + 20], words: ws(i * 30) }));
  const para = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ');
  // 20 מילים בכל פסקה מול 20 מילים בצילום — בטוח; 60 מול 20 — לא
  const ok = `${para('א', 20)}\n${para('ב', 20)}`;
  assert.equal(trackCaret(ok, 0, scan, { alignment: lineAlignmentFor(ok, scan) }).confident, true);
  const bad = `${para('א', 60)}\n${para('ב', 60)}`;
  assert.equal(trackCaret(bad, 0, scan, { alignment: lineAlignmentFor(bad, scan) }).confident, false);
});

test('columnStreamGroups / linesForColumn: שני טורים מול יותר משני זרמים — לפי המיקום האופקי', () => {
  const L = (stream, x0, x1, y) => ({ stream, bbox: [x0, y, x1, y + 10], words: [{ bbox: [x0, y, x1, y + 10] }] });
  const lines = [
    L('header', 100, 900, 0),
    L('right', 520, 900, 20), L('right', 520, 900, 40),
    L('left', 100, 480, 20), L('left', 100, 480, 40),
    L('main', 520, 900, 60), // המשך הטור הימני שזוהה כזרם נפרד
    L('wide', 100, 900, 80), // פסקה ברוחב העמוד — לאף טור
  ];
  const streams = ['right', 'left', 'main', 'wide'];
  assert.deepEqual(columnStreamGroups(lines, streams), { right: ['right', 'main'], left: ['left'] });
  const source = { level: 'word', source: 'profile', lines };
  const r = linesForColumn(source, { twoColumns: true, column: 'right' });
  assert.equal(r.wordLevel, true);
  assert.deepEqual(r.lines.map((l) => l.stream), ['right', 'right', 'main']);
  const l = linesForColumn(source, { twoColumns: true, column: 'left' });
  assert.deepEqual(l.lines.map((x) => x.stream), ['left', 'left']);
  assert.equal(l.stream, 'left');
  // כל הזרמים באותו צד / בלי פער של ממש — אין חלוקה (חזרה לרמת שורה)
  assert.equal(columnStreamGroups([L('a', 500, 900, 0), L('b', 520, 880, 20), L('c', 100, 900, 40)], ['a', 'b', 'c']), null);
});

test('lineAlignmentFor: אותו טקסט ואותן שורות — אותו יישור (מחושב פעם אחת)', () => {
  const L = [0, 1, 2].map((i) => ({ id: i, stream: 'main', bbox: [0, i * 20, 100, i * 20 + 14], words: [{ bbox: [50, i * 20, 100, i * 20 + 14] }, { bbox: [0, i * 20, 40, i * 20 + 14] }] }));
  const a = lineAlignmentFor('א ב\nג ד\nה ו', L);
  assert.equal(lineAlignmentFor('א ב\nג ד\nה ו', L), a);
  assert.notEqual(lineAlignmentFor('א ב\nג ד\nה ו' + ' ז', L), a);
  assert.notEqual(lineAlignmentFor('א ב\nג ד\nה ו', [...L]), a);
});

test('alignmentAgreement: שורה-מול-שורה — שורות שמספר המילים בהן מתאים', () => {
  const L = [0, 1, 2, 3].map((i) => ({ id: i, stream: 'main', bbox: [0, i * 20, 100, i * 20 + 14], words: [{ bbox: [50, i * 20, 100, i * 20 + 14] }, { bbox: [0, i * 20, 40, i * 20 + 14] }] }));
  assert.deepEqual(alignmentAgreement('א ב\nג ד\nה ו\nז ח', L), { agree: 4, total: 4 });
  assert.deepEqual(alignmentAgreement('א ב ג ד ה\nג ד\nה ו\nז ח', L), { agree: 3, total: 4 });
});
