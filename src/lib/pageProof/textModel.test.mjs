import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize,
  wordAt,
  wordRange,
  realignWords,
  streamTabs,
  tabLines,
  buildParagraphs,
  nextLineInTab,
  prevLineInTab,
  spliceText,
  enterAt,
  backspaceAtStart,
  deleteAtEnd,
  selectionToLineRanges,
  joinsInRange,
  descriptorToOp,
  docRevision,
  isHeadingLine,
  FURNITURE_TAB,
  MAX_BREAK_WORD,
} from './textModel.js';
import { buildView } from './ops.js';
import { paragraphApproval, pageApproval, segOkState, segKey, isLockedLine, SEG_OK } from './textModel.js';

const W = (text, extra = {}) => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, styles: [], ...extra }));
const L = (id, order, text, extra = {}) => ({
  id,
  order,
  line_no: id - 1,
  bbox: [100, order * 50, 900, order * 50 + 40],
  text,
  text_ocr: text,
  stream: 'main',
  stream_src: 'auto',
  status: 'pending',
  words: W(text),
  ...extra,
});

// עמוד לדוגמה: כותרת, פסקה רגילה, פסקה עם para_start, שורה עם פסקה באמצעה,
// ציטוט, שורה ריקה, הערות, ריהוט, שורה שהוסרה וזרמים נוספים
const view = () => ({
  page: 4,
  streams: [
    { key: 'main', he: 'ראשי', color: '#111111' },
    { key: 'notes', he: 'הערות', color: '#222222' },
  ],
  lines: [
    L(1, 1, 'כותרת הפרק', { stream: 'main_heading' }),
    L(2, 2, 'אלף בית גימל', { para_start: true }),
    L(3, 3, 'דלת הא וו', { para_start: true }),
    L(4, 4, 'זין חית טית יוד', { para_breaks: [2] }),
    L(5, 5, 'כף למד', { para_start: true, para_style: 'quote' }),
    L(6, 6, 'מם נון'),
    L(7, 7, ''),
    L(8, 8, 'הערה א', { stream: 'notes', para_start: true }),
    L(9, 9, '12', { stream: 'header' }),
    L(10, 10, 'נמחקה', { status: 'removed' }),
    L(11, 11, 'פירוש', { stream: 's_rashi' }),
    L(12, 12, 'עוד', { stream: 'notes2' }),
    L(13, 13, 'ועוד', { stream: 'notes_heading' }),
  ],
});

// ---------- מילים ----------

test('tokenize: מילים ורווחים עם מיקומים ומספר-מילה', () => {
  assert.deepEqual(tokenize('  אב  גד '), [
    { w: 'space', text: '  ', start: 0, end: 2 },
    { w: 'word', text: 'אב', start: 2, end: 4, i: 0 },
    { w: 'space', text: '  ', start: 4, end: 6 },
    { w: 'word', text: 'גד', start: 6, end: 8, i: 1 },
    { w: 'space', text: ' ', start: 8, end: 9 },
  ]);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  // אותו פירוק כמו view.wordTokens (split על \s+) — כולל טאב ורווח-קשיח
  assert.deepEqual(tokenize('א\tב ג').filter((t) => t.w === 'word').map((t) => t.text), ['א', 'ב', 'ג']);
});

test('wordAt: המילה של הסמן (גם צמוד לסוף), אחרת הבאה; מוגבל לטווח', () => {
  assert.equal(wordAt('אב גד', 0), 0);
  assert.equal(wordAt('אב גד', 2), 0, 'סמן בסוף המילה');
  assert.equal(wordAt('אב גד', 3), 1);
  assert.equal(wordAt('אב גד', 5), 1);
  assert.equal(wordAt('אב  גד', 3), 1, 'באמצע רווח — המילה הבאה');
  assert.equal(wordAt('אב גד ', 99), 1, 'אחרי הסוף — האחרונה');
  assert.equal(wordAt('  אב', 0), 0);
  assert.equal(wordAt('', 0), -1);
  assert.equal(wordAt('   ', 1), -1);
});

test('wordRange: המילים שחופפות לטווח [a,b)', () => {
  assert.deepEqual(wordRange('אב גד הו', 1, 4), [0, 1]);
  assert.deepEqual(wordRange('אב גד הו', 4, 1), [0, 1], 'סדר הפוך');
  assert.deepEqual(wordRange('אב גד הו', 0, 99), [0, 2]);
  assert.deepEqual(wordRange('אב גד הו', 3, 5), [1, 1]);
  assert.equal(wordRange('אב גד הו', 2, 3), null, 'רק רווח');
  assert.equal(wordRange('אב גד הו', 3, 3), null, 'טווח ריק');
});

// ---------- יישור ----------

test('realignWords: טקסט זהה — הכול נשמר', () => {
  const old = [{ text: 'אב', styles: ['b'], conf: 0.4, bbox: [1, 2, 3, 4] }, { text: 'גד', styles: [] }];
  const r = realignWords('אב גד', old, 'אב גד');
  assert.deepEqual(r.words, old);
  assert.deepEqual(r.map, [0, 1]);
  assert.deepEqual(r.same, [true, true]);
  assert.deepEqual(r.src, [0, 1]);
});

test('realignWords: הוספת מילה בתחילה — הסגנונות זזים עם המילים', () => {
  const old = [{ text: 'אב', styles: ['b'], script: 'rashi', conf: 0.5 }, { text: 'גד', styles: [], script: 'rashi' }];
  const r = realignWords('אב גד', old, 'חדש אב גד');
  assert.deepEqual(r.map, [1, 2]);
  assert.deepEqual(r.same, [true, true]);
  assert.deepEqual(r.words[0], { text: 'חדש', styles: [], script: 'rashi' });
  assert.deepEqual(r.words[1], old[0], 'מילה שלא השתנתה שומרת גם את conf');
  assert.deepEqual(r.src, [-1, 0, 1]);
});

test('realignWords: תיקון-אות במילה — שומרת סגנון/כתב/תיבה, בלי conf', () => {
  const old = [
    { text: 'אב', styles: [] },
    { text: 'גד', styles: ['b'], script: 'square', conf: 0.3, bbox: [5, 5, 9, 9] },
    { text: 'הו', styles: [] },
  ];
  const r = realignWords('אב גד הו', old, 'אב גר הו');
  assert.deepEqual(r.map, [0, 1, 2]);
  assert.deepEqual(r.same, [true, false, true]);
  assert.deepEqual(r.words[1], { text: 'גר', styles: ['b'], script: 'square', conf: null, bbox: [5, 5, 9, 9] });
});

test('realignWords: מחיקת מילה', () => {
  const r = realignWords('אב גד הו', W('אב גד הו'), 'אב הו');
  assert.deepEqual(r.map, [0, -1, 1]);
  assert.deepEqual(r.same, [true, false, true]);
  assert.equal(r.words.length, 2);
});

test('realignWords: פיצול מילה — שני החצאים יורשים; איחוד — הראשונה יורשת', () => {
  const split = realignWords('אבגד הו', [{ text: 'אבגד', styles: ['b'] }, { text: 'הו', styles: [] }], 'אב גד הו');
  assert.deepEqual(split.src, [0, 0, 1]);
  assert.deepEqual(split.map, [0, 2]);
  assert.deepEqual(split.words.map((w) => w.styles), [['b'], ['b'], []]);

  const merge = realignWords('אב גד הו', [{ text: 'אב', styles: ['i'] }, { text: 'גד', styles: [] }, { text: 'הו', styles: [] }], 'אבגד הו');
  assert.deepEqual(merge.map, [0, -1, 1]);
  assert.deepEqual(merge.src, [0, 2]);
  assert.deepEqual(merge.words[0].styles, ['i']);
});

test('realignWords: מילים חוזרות — LCS; כתב למילה שנוספה בסוף מהשכנה', () => {
  assert.deepEqual(realignWords('א ב א', W('א ב א'), 'א א').map, [0, -1, 1]);
  const r = realignWords('abc', [{ text: 'abc', styles: [], script: 'latin' }], 'abc def');
  assert.equal(r.words[1].script, 'latin');
});

test('realignWords: קצוות — ריק, words חסרות/קצרות', () => {
  const fromEmpty = realignWords('', [], 'אב גד');
  assert.deepEqual(fromEmpty.map, []);
  assert.deepEqual(fromEmpty.words.map((w) => w.text), ['אב', 'גד']);
  const toEmpty = realignWords('אב גד', W('אב גד'), '  ');
  assert.deepEqual(toEmpty.map, [-1, -1]);
  assert.deepEqual(toEmpty.words, []);
  const drift = realignWords('אב גד הו', [{ text: 'אב', styles: ['b'] }], 'אב גד הו');
  assert.equal(drift.words.length, 3);
  assert.deepEqual(drift.words[0].styles, ['b']);
  assert.equal(drift.words[2].text, 'הו');
  assert.equal(realignWords('אב', undefined, 'אב').words[0].text, 'אב');
});

test('realignWords: שורה ארוכה עם שינויים מפוזרים', () => {
  const oldText = Array.from({ length: 300 }, (_, i) => `מ${i}`).join(' ');
  const newWords = oldText.split(' ');
  newWords.splice(250, 1);
  newWords.splice(100, 0, 'חדשה');
  newWords[10] = 'תוקנה';
  const r = realignWords(oldText, W(oldText), newWords.join(' '));
  assert.equal(r.map[5], 5);
  assert.equal(r.map[10], 10);
  assert.equal(r.same[10], false);
  assert.equal(r.map[150], 151);
  assert.equal(r.map[250], -1);
  assert.equal(r.map[299], 299);
});

// ---------- לשוניות ----------

test('streamTabs: זרמי-תוכן בסדר הקבוע, כותרות בזרם-הבסיס, ריהוט אחרון, בלי מוסרות', () => {
  const tabs = streamTabs(view());
  assert.deepEqual(tabs.map((t) => t.key), ['main', 'notes', 'notes2', 's_rashi', FURNITURE_TAB]);
  assert.deepEqual(tabs.map((t) => t.count), [7, 2, 1, 1, 1]);
  assert.deepEqual(tabs[0], { key: 'main', he: 'ראשי', color: '#111111', count: 7, furniture: false });
  assert.equal(tabs[4].he, 'ריהוט הדף');
  assert.equal(tabs[4].furniture, true);
  assert.equal(tabs[2].he, "הערות ב'", 'שם מובנה כשאינו בעמוד');
});

test('streamTabs: מותאמים לפי הופעה ראשונה; בלי ריהוט — בלי לשונית ריהוט', () => {
  const v = { lines: [L(1, 1, 'א', { stream: 's_b' }), L(2, 2, 'ב', { stream: 's_a' }), L(3, 3, 'ג', { stream: 'margin' }), L(4, 4, 'ד')] };
  assert.deepEqual(streamTabs(v).map((t) => t.key), ['main', 'margin', 's_b', 's_a']);
  assert.deepEqual(streamTabs({ lines: [] }), []);
  assert.deepEqual(streamTabs(null), []);
});

test('tabLines: שורות הלשונית בסדר-הקריאה; ריהוט; שכנות', () => {
  const v = view();
  v.lines.reverse();
  const main = tabLines(v, 'main');
  assert.deepEqual(main.map((l) => l.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(tabLines(v, 'notes').map((l) => l.id), [8, 13]);
  assert.deepEqual(tabLines(v, FURNITURE_TAB).map((l) => l.id), [9]);
  assert.deepEqual(tabLines(v, 'nope'), []);
  assert.equal(nextLineInTab(main, 3).id, 4);
  assert.equal(nextLineInTab(main, 7), null);
  assert.equal(prevLineInTab(main, 3).id, 2);
  assert.equal(prevLineInTab(main, 1), null);
  assert.equal(prevLineInTab(main, 99), null);
});

test('isHeadingLine: זרם _heading או סגנון h1–h3', () => {
  assert.equal(isHeadingLine({ stream: 'main_heading' }), true);
  assert.equal(isHeadingLine({ stream: 'main', para_style: 'h2' }), true);
  assert.equal(isHeadingLine({ stream: 'main', para_style: 'quote' }), false);
});

// ---------- פסקאות ----------

test('buildParagraphs: כל כללי תחילת-הפסקה, קטעי-שורה וסגנון', () => {
  const paras = buildParagraphs(view(), 'main');
  assert.deepEqual(paras.map((p) => p.key), ['1:0', '2:0', '3:0', '4:2', '5:0']);
  assert.deepEqual(paras.map((p) => [p.style, p.heading]), [['body', true], ['body', false], ['body', false], ['body', false], ['quote', false]]);
  // הכותרת — שורה אחת שלמה
  assert.deepEqual(paras[0].lines, [{ lineId: 1, w0: 0, w1: 1, start: 0, end: 10 }]);
  // פסקה 3: שורה 3 שלמה + שתי המילים הראשונות של שורה 4 (עד סוף "חית")
  assert.deepEqual(paras[2].lines, [
    { lineId: 3, w0: 0, w1: 2, start: 0, end: 9 },
    { lineId: 4, w0: 0, w1: 1, start: 0, end: 7 },
  ]);
  assert.deepEqual(paras[3].first, { lineId: 4, w0: 2 });
  assert.deepEqual(paras[3].lines, [{ lineId: 4, w0: 2, w1: 3, start: 8, end: 15 }]);
  // ציטוט: שורה 6 (בלי para_start ובסגנון רגיל) ממשיכה אותו, והשורה הריקה רשומה עם w1 = -1
  assert.deepEqual(paras[4].lines.map((s) => [s.lineId, s.w0, s.w1]), [[5, 0, 1], [6, 0, 1], [7, 0, -1]]);
});

test('buildParagraphs: מעבר כותרת↔גוף וסגנונות כותרת/ד"ה פותחים פסקה גם בלי para_start', () => {
  const v = {
    lines: [
      L(1, 1, 'א ב'),
      L(2, 2, 'ג', { para_style: 'h2' }),
      L(3, 3, 'ד', { para_style: 'h3' }),
      L(4, 4, 'ה', { para_style: 'h3' }),
      L(5, 5, 'ו'),
      L(6, 6, 'ז', { para_style: 'dh' }),
      L(7, 7, 'ח', { para_style: 'body' }),
      L(8, 8, 'ט', { para_style: 'author' }),
    ],
  };
  assert.deepEqual(buildParagraphs(v, 'main').map((p) => p.key), ['1:0', '2:0', '3:0', '5:0', '6:0']);
});

test('buildParagraphs: para_breaks לא תקפים מתעלמים; שבירה במילה 0 = תחילת שורה', () => {
  const v = { lines: [L(1, 1, 'א ב'), L(2, 2, 'ג ד', { para_breaks: [0, 7, -1, 1.5] })] };
  assert.deepEqual(buildParagraphs(v, 'main').map((p) => p.key), ['1:0', '2:0']);
  assert.deepEqual(buildParagraphs({ lines: [] }, 'main'), []);
});

test('buildParagraphs בלשונית הריהוט: כל שורה פסקה לעצמה; עוזרי-העריכה לא מחלקים אותה', () => {
  const v = { lines: [L(1, 1, 'ברכות', { stream: 'header' }), L(2, 2, 'יב', { stream: 'header' }), L(3, 3, 'גוף'), L(4, 4, '—', { stream: 'sep' })] };
  assert.deepEqual(buildParagraphs(v, FURNITURE_TAB).map((p) => p.key), ['1:0', '2:0', '4:0']);
  for (const fn of [enterAt, backspaceAtStart, deleteAtEnd]) {
    assert.deepEqual(fn(v, FURNITURE_TAB, { lineId: 2, offset: 0 }), { kind: 'noop', reason: 'ריהוט הדף אינו מחולק לפסקאות' });
  }
});

test('buildParagraphs על תצוגה מ-buildView: para_break ופיצול-טקסט', () => {
  const base = { page: 4, size: [1000, 2000], lines: [L(1, 1, 'אחת שתיים שלוש'), L(2, 2, 'ארבע חמש')] };
  const v = buildView(base, [{ kind: 'para_break', page: 4, ids: [1], value: { word: 1, on: true } }]);
  const paras = buildParagraphs(v, 'main');
  assert.deepEqual(paras.map((p) => p.key), ['1:0', '1:1']);
  assert.deepEqual(paras[1].lines.map((s) => s.lineId), [1, 2]);
});

// ---------- עריכה ----------

test('spliceText: החלפה, מיקום-הסמן, סדר הפוך וגבולות', () => {
  assert.deepEqual(spliceText('אבג דה', 1, 2, 'XY'), { text: 'אXYג דה', caret: 3 });
  assert.deepEqual(spliceText('אבג', 2, 1, ''), { text: 'אג', caret: 1 });
  assert.deepEqual(spliceText('אב', -5, 99, 'ג'), { text: 'ג', caret: 1 });
  assert.deepEqual(spliceText('אב', 2, 2, ' גד'), { text: 'אב גד', caret: 5 });
});

test('enterAt: תחילת שורה / סוף שורה / אמצע שורה', () => {
  const v = view();
  assert.deepEqual(enterAt(v, 'main', { lineId: 6, offset: 0 }), { kind: 'para_start', lineId: 6, value: 1 });
  assert.deepEqual(enterAt(v, 'main', { lineId: 4, offset: 15 }), { kind: 'noop', reason: 'כבר יש כאן תחילת פסקה' }, 'סוף שורה 4 → שורה 5 כבר פותחת');
  assert.deepEqual(enterAt(v, 'main', { lineId: 6, offset: 6 }), { kind: 'para_start', lineId: 7, value: 1 });
  assert.deepEqual(enterAt(v, 'main', { lineId: 3, offset: 4 }), { kind: 'para_break', lineId: 3, word: 1, on: true });
  // באמצע מילה — מהמילה הבאה (לא מפצלים מילה)
  assert.deepEqual(enterAt(v, 'main', { lineId: 3, offset: 5 }), { kind: 'para_break', lineId: 3, word: 2, on: true });
  // בתוך המילה האחרונה — כמו סוף השורה
  assert.deepEqual(enterAt(v, 'main', { lineId: 6, offset: 4 }), { kind: 'para_start', lineId: 7, value: 1 });
  // שורה ריקה
  assert.deepEqual(enterAt(v, 'main', { lineId: 7, offset: 0 }), { kind: 'para_start', lineId: 7, value: 1 });
});

test('enterAt: כבר תחילת פסקה / סוף הלשונית / שורה זמנית / לא בלשונית', () => {
  const v = view();
  assert.equal(enterAt(v, 'main', { lineId: 3, offset: 0 }).kind, 'noop');
  assert.equal(enterAt(v, 'main', { lineId: 1, offset: 0 }).kind, 'noop', 'השורה הראשונה בלשונית');
  assert.equal(enterAt(v, 'main', { lineId: 4, offset: 8 }).kind, 'noop', 'כבר שבירה במילה 2');
  assert.deepEqual(enterAt(v, 'notes', { lineId: 13, offset: 4 }), { kind: 'noop', reason: 'סוף הזרם — אין אחריו שורה' });
  assert.equal(enterAt(v, 'main', { lineId: 8, offset: 0 }).reason, 'השורה אינה בלשונית הזו');
  const t = { lines: [L(1, 1, 'א ב'), L(-3, 2, 'ג ד', { _new: true })] };
  assert.match(enterAt(t, 'main', { lineId: -3, offset: 0 }).reason, /זיהוי מחדש/);
  assert.match(enterAt(t, 'main', { lineId: 1, offset: 3 }).reason, /זיהוי מחדש/);
});

test('enterAt: מילה מעבר לגבול para_break', () => {
  const text = Array.from({ length: MAX_BREAK_WORD + 3 }, () => 'א').join(' ');
  const v = { lines: [L(1, 1, text)] };
  const off = (MAX_BREAK_WORD + 1) * 2;
  assert.equal(enterAt(v, 'main', { lineId: 1, offset: off }).kind, 'noop');
});

test('backspaceAtStart: para_start 0, para_break off, גבול-שורה, תחילת הלשונית, גבול-סגנון', () => {
  const v = view();
  assert.deepEqual(backspaceAtStart(v, 'main', { lineId: 3, offset: 0 }), { kind: 'para_start', lineId: 3, value: 0 });
  assert.deepEqual(backspaceAtStart(v, 'main', { lineId: 4, offset: 0 }), { kind: 'line-boundary', lineId: 4, prevLineId: 3 });
  assert.deepEqual(backspaceAtStart(v, 'main', { lineId: 4, offset: 8 }), { kind: 'para_break', lineId: 4, word: 2, on: false });
  assert.equal(backspaceAtStart(v, 'main', { lineId: 1, offset: 0 }).kind, 'noop');
  assert.equal(backspaceAtStart(v, 'main', { lineId: 1, offset: 0 }).reason, 'תחילת הזרם');
  // כותרת→גוף וגוף→ציטוט: הגבול נכפה ע"י הסגנון
  assert.match(backspaceAtStart(v, 'main', { lineId: 2, offset: 0 }).reason, /סגנון-הפסקה/);
  assert.match(backspaceAtStart(v, 'main', { lineId: 5, offset: 0 }).reason, /סגנון-הפסקה/);
  // לא בגבול
  assert.equal(backspaceAtStart(v, 'main', { lineId: 4, offset: 7 }).kind, 'noop');
  assert.equal(backspaceAtStart(v, 'main', { lineId: 4, offset: 5 }).kind, 'noop');
});

test('deleteAtEnd: המראה של backspaceAtStart', () => {
  const v = view();
  assert.deepEqual(deleteAtEnd(v, 'main', { lineId: 2, offset: 12 }), { kind: 'para_start', lineId: 3, value: 0 });
  assert.deepEqual(deleteAtEnd(v, 'main', { lineId: 3, offset: 9 }), { kind: 'line-boundary', lineId: 3, nextLineId: 4 });
  assert.deepEqual(deleteAtEnd(v, 'main', { lineId: 4, offset: 7 }), { kind: 'para_break', lineId: 4, word: 2, on: false });
  assert.match(deleteAtEnd(v, 'main', { lineId: 4, offset: 15 }).reason, /סגנון-הפסקה/);
  assert.deepEqual(deleteAtEnd(v, 'main', { lineId: 7, offset: 0 }), { kind: 'noop', reason: 'סוף הזרם — אין אחריו שורה' });
  assert.equal(deleteAtEnd(v, 'main', { lineId: 4, offset: 5 }).kind, 'noop');
});

test('selectionToLineRanges: טווח לכל שורה בסדר-הקריאה, גם כשהבחירה הפוכה', () => {
  const v = view();
  const a = { lineId: 3, offset: 4 };
  const b = { lineId: 5, offset: 2 };
  const want = [
    { lineId: 3, start: 4, end: 9 },
    { lineId: 4, start: 0, end: 15 },
    { lineId: 5, start: 0, end: 2 },
  ];
  assert.deepEqual(selectionToLineRanges(v, 'main', a, b), want);
  assert.deepEqual(selectionToLineRanges(v, 'main', b, a), want);
  assert.deepEqual(selectionToLineRanges(v, 'main', { lineId: 3, offset: 5 }, { lineId: 3, offset: 2 }), [{ lineId: 3, start: 2, end: 5 }]);
  assert.deepEqual(selectionToLineRanges(v, 'main', { lineId: 3, offset: 2 }, { lineId: 3, offset: 2 }), [{ lineId: 3, start: 2, end: 2 }]);
  assert.deepEqual(selectionToLineRanges(v, 'main', a, { lineId: 8, offset: 0 }), []);
});

test('joinsInRange: גבולות-הפסקה שהבחירה חוצה (לפני תיקוני-הטקסט)', () => {
  const v = view();
  // מאמצע שורה 2 עד אמצע שורה 4 (אחרי הגבול שבמילה 2): חוצה את תחילת 3 ואת השבירה במילה 2 של 4
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 2, offset: 4 }, { lineId: 4, offset: 10 }), [
    { kind: 'para_start', lineId: 3, value: 0 },
    { kind: 'para_break', lineId: 4, word: 2, on: false },
  ]);
  // הפוך — אותו דבר
  assert.equal(joinsInRange(v, 'main', { lineId: 4, offset: 10 }, { lineId: 2, offset: 4 }).length, 2);
  // מסתיימת בדיוק בתחילת פסקה — חוצה; מתחילה בה — לא
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 2, offset: 12 }, { lineId: 3, offset: 0 }), [{ kind: 'para_start', lineId: 3, value: 0 }]);
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 3, offset: 0 }, { lineId: 3, offset: 5 }), []);
  // רק הרווח שבין שני קטעי שורה 4
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 4, offset: 7 }, { lineId: 4, offset: 8 }), [{ kind: 'para_break', lineId: 4, word: 2, on: false }]);
  // גבול שנכפה בסגנון (כותרת→גוף, גוף→ציטוט) — לא נכלל
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 1, offset: 2 }, { lineId: 2, offset: 2 }), []);
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 4, offset: 12 }, { lineId: 5, offset: 1 }), []);
  assert.deepEqual(joinsInRange(v, 'main', { lineId: 2, offset: 0 }, { lineId: 8, offset: 1 }), []);
  assert.deepEqual(joinsInRange(v, FURNITURE_TAB, { lineId: 9, offset: 0 }, { lineId: 9, offset: 1 }), []);
});

test('descriptorToOp: תיאור ← פעולת-חוזה', () => {
  assert.deepEqual(descriptorToOp({ kind: 'para_start', lineId: 3, value: 0 }, 4), { kind: 'para_start', page: 4, ids: [3], value: 0 });
  assert.deepEqual(descriptorToOp({ kind: 'para_break', lineId: 4, word: 2, on: true }, 4), {
    kind: 'para_break',
    page: 4,
    ids: [4],
    value: { word: 2, on: true },
  });
  assert.equal(descriptorToOp({ kind: 'noop' }, 4), null);
  assert.equal(descriptorToOp({ kind: 'line-boundary', lineId: 1 }, 4), null);
});

// ---------- גרסה ----------

test('docRevision: revision + גיבוב יציב של המזהים והגודל', () => {
  const d = { revision: 2, size: [100, 200], lines: [{ id: 3 }, { id: 1 }] };
  const r = docRevision(d);
  assert.match(r, /^2:[0-9a-f]{8}$/);
  assert.equal(docRevision({ ...d, lines: [{ id: 1 }, { id: 3 }] }), r, 'סדר השורות לא משנה');
  assert.notEqual(docRevision({ ...d, size: [100, 201] }), r);
  assert.notEqual(docRevision({ ...d, lines: [{ id: 1 }, { id: 4 }] }), r);
  assert.notEqual(docRevision({ ...d, revision: 3 }), r);
  assert.match(docRevision({ size: [1, 1], lines: [] }), /^1:[0-9a-f]{8}$/);
  assert.match(docRevision(null), /^1:/);
});

// ---------- אישור פסקה-פסקה ----------

// עמוד לאישור: פסקה 1 = שורות 1–2 + תחילת שורה 3; פסקה 2 = סוף שורה 3 (מהמילה
// 2) + שורה 4; פסקה 3 = שורה 5 (נעולה — תיבה שתוקנה); הערות בלשונית נפרדת
const apage = () => ({
  page: 4,
  size: [1000, 2000],
  lines: [
    L(1, 1, 'אחת שתיים', { para_start: true }),
    L(2, 2, 'שלוש ארבע'),
    L(3, 3, 'חמש שש שבע שמונה', { para_breaks: [2] }),
    L(4, 4, 'תשע עשר'),
    L(5, 5, 'נעולה כאן', { para_start: true }),
    L(6, 6, 'הערה', { stream: 'notes', para_start: true }),
    L(7, 7, '12', { stream: 'header' }),
  ],
});
const okOp = (id) => ({ kind: 'line_ok', page: 4, ids: [id] });
const segOp = (id, w0) => ({ kind: SEG_OK, page: 4, ids: [id], value: w0, _local: true });
// התצוגה כמו ש-useProofEditor בונה אותה: פעולות אמיתיות ל-buildView, ומצב
// חצאי-האישור מכל הפעולות (כולל המקומיות)
const aview = (ops = [], base = apage()) => {
  const v = buildView(base, ops.filter((o) => !o._local));
  return { ...v, _segOk: segOkState(base, ops).keys };
};

test('paragraphApproval: מבנה, שורה משותפת, שורה נעולה', () => {
  const v = aview([{ kind: 'bbox', page: 4, ids: [5], value: [100, 250, 900, 290] }]);
  const a = paragraphApproval(v, 'main');
  assert.deepEqual([...a.byKey.keys()], ['1:0', '3:2', '5:0']);
  const p1 = a.byKey.get('1:0');
  assert.deepEqual(p1.lineIds, [1, 2, 3]);
  assert.deepEqual(p1.segs.map((s) => [s.key, s.shared, s.locked, s.ok]), [
    ['1:0', false, false, false],
    ['2:0', false, false, false],
    ['3:0', true, false, false],
  ]);
  assert.deepEqual(a.byKey.get('3:2').lineIds, [3, 4]);
  assert.deepEqual(a.segsByLine.get(3), ['3:0', '3:2']);
  // פסקה 3 — כל שורותיה נעולות: לא ניתנת לאישור ולא נספרת
  assert.equal(a.byKey.get('5:0').approvable, false);
  assert.equal(a.total, 2);
  assert.equal(a.approved, 0);
});

test('paragraphApproval: שורה משותפת מאושרת רק כששתי הפסקאות אושרו', () => {
  // אישור פסקה 1: line_ok לשורות 1,2 + חצי-אישור לשורה 3 (קטע 0)
  let a = paragraphApproval(aview([okOp(1), okOp(2), segOp(3, 0)]), 'main');
  assert.equal(a.byKey.get('1:0').approved, true);
  assert.equal(a.byKey.get('3:2').approved, false);
  assert.equal(a.approved, 1);
  // אישור פסקה 2: חצי-אישור לקטע 2 + (שורה 3 הושלמה) line_ok לשורה 3 + שורה 4
  a = paragraphApproval(aview([okOp(1), okOp(2), segOp(3, 0), segOp(3, 2), okOp(3), okOp(4)]), 'main');
  assert.equal(a.byKey.get('3:2').approved, true);
  assert.equal(a.approved, 2);
  assert.equal(a.total, 3, 'בלי תיקון-חיתוך גם פסקה 3 ניתנת לאישור');
  // ביטול אישור פסקה 1 (בלי line_ok של 3 ובלי חצי-האישור שלה) — פסקה 2 נשארת מאושרת
  a = paragraphApproval(aview([segOp(3, 2), okOp(4)]), 'main');
  assert.equal(a.byKey.get('1:0').approved, false);
  assert.equal(a.byKey.get('3:2').approved, true);
});

test('paragraphApproval: line_ok של שורה משותפת (למשל מלוח-הצד) מאשר את שני הקטעים; opts.locked', () => {
  const a = paragraphApproval(aview([okOp(3), okOp(4)]), 'main');
  assert.equal(a.byKey.get('3:2').approved, true);
  assert.equal(a.byKey.get('1:0').approved, false, 'שורות 1–2 עוד לא אושרו');
  const b = paragraphApproval(aview([okOp(4)]), 'main', { locked: new Set([3]) });
  assert.equal(b.byKey.get('3:2').approved, true, 'שורה 3 נעולה — לא נדרשת');
  assert.deepEqual(b.byKey.get('3:2').lineIds, [4]);
});

test('paragraphApproval: תיקון-טקסט באמצע פסקה מאושרת משאיר אותה מאושרת', () => {
  const ops = [okOp(1), okOp(2), segOp(3, 0), segOp(3, 2), okOp(3), okOp(4), { kind: 'text', page: 4, ids: [4], value: 'תשע עשרה' }];
  const a = paragraphApproval(aview(ops), 'main');
  assert.equal(a.byKey.get('3:2').approved, true);
});

test('segOkState: חצי-האישור זז עם הגבול כשמתקנים מילים לפני אותו', () => {
  const base = apage();
  const ops = [segOp(3, 2), { kind: 'text', page: 4, ids: [3], value: 'חמש ו שש שבע שמונה' }];
  const s = segOkState(base, ops);
  assert.deepEqual([...s.keys], ['3:3']);
  assert.equal(s.byOp.get(ops[0]), '3:3');
  // התצוגה: הגבול עבר גם הוא למילה 3 — והפסקה עדיין מאושרת בקטע הזה
  const v = aview([...ops, okOp(4)], base);
  assert.equal(buildParagraphs(v, 'main')[1].key, '3:3');
  assert.equal(paragraphApproval(v, 'main').byKey.get('3:3').approved, true);
  // מחיקת כל המילים מהגבול והלאה — חצי-האישור יורד
  assert.equal(segOkState(base, [segOp(3, 2), { kind: 'text', page: 4, ids: [3], value: 'חמש שש' }]).keys.size, 0);
  // קטע 0 נשאר 0 בכל תיקון; פיצול השורה מוחק את חצאי-האישור שלה
  assert.deepEqual([...segOkState(base, [segOp(3, 0), { kind: 'text', page: 4, ids: [3], value: 'א ב ג' }]).keys], ['3:0']);
  assert.equal(segOkState(base, [segOp(3, 0), { kind: 'line_split', page: 4, ids: [3], value: { x: 500 } }]).keys.size, 0);
  assert.equal(segOkState(base, [{ kind: SEG_OK, ids: [3], value: -1, _local: true }, null]).keys.size, 0);
});

test('paragraphApproval: מעבר שני — שורות שאושרו בסבב הקודם (preApproved / view._preOk) כבר מאושרות', () => {
  // שורות 1–2, 4 אושרו בסבב הקודם; שורה 3 (משותפת) זוהתה מחדש ומחכה לבדיקה
  const pre = new Set([1, 2, 4]);
  let a = paragraphApproval(aview(), 'main', { preApproved: pre });
  assert.equal(a.byKey.get('1:0').approved, false, 'שורה 3 עוד לא נבדקה');
  assert.deepEqual(
    a.byKey.get('1:0').segs.map((s) => [s.lineId, s.pre, s.ok]),
    [
      [1, true, true],
      [2, true, true],
      [3, false, false],
    ]
  );
  assert.equal(a.approved, 0);
  // אחרי line_ok לשורה 3 — שתי הפסקאות מאושרות; pre רק לפסקה שכולה אושרה קודם
  a = paragraphApproval({ ...aview([okOp(3)]), _preOk: pre }, 'main');
  assert.equal(a.byKey.get('1:0').approved, true);
  assert.equal(a.byKey.get('1:0').pre, false, 'שורה 3 אושרה עכשיו — אפשר לבטל');
  assert.equal(a.byKey.get('3:2').approved, true);
  assert.equal(a.approved, 2);
  // פסקה שכולה אושרה קודם — pre (אין מה לבטל)
  const all = paragraphApproval(aview(), 'main', { preApproved: new Set([1, 2, 3, 4, 5]) });
  assert.equal(all.byKey.get('1:0').pre, true);
  assert.equal(all.approved, all.total);
  // opts.preApproved גובר על view._preOk
  assert.equal(paragraphApproval({ ...aview(), _preOk: pre }, 'main', { preApproved: new Set() }).byKey.get('1:0').segs[0].ok, false);
});

test('paragraphApproval בלשונית ריהוט הדף — אין פסקאות לאישור', () => {
  const a = paragraphApproval(aview(), FURNITURE_TAB);
  assert.equal(a.byKey.size, 0);
  assert.equal(a.total, 0);
});

test('pageApproval: כל לשוניות-התוכן, בלי ריהוט', () => {
  const r = pageApproval(aview([okOp(6)]));
  assert.equal(r.total, 4);
  assert.equal(r.approved, 1);
  assert.deepEqual([...r.byTab.keys()], ['main', 'notes']);
  assert.deepEqual(r.byTab.get('notes'), { approved: 1, total: 1 });
  assert.deepEqual(pageApproval({ lines: [] }), { approved: 0, total: 0, byTab: new Map() });
});

test('isLockedLine + segKey', () => {
  assert.equal(isLockedLine({ id: 3 }), false);
  assert.equal(isLockedLine({ id: -1 }), true);
  assert.equal(isLockedLine({ id: 3, _recut: true }), true);
  assert.equal(isLockedLine({ id: 3, _new: true }), true);
  assert.equal(isLockedLine({ id: 3 }, new Set([3])), true);
  assert.equal(isLockedLine(null), true);
  assert.equal(segKey(7, 0), '7:0');
});
