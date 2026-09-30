import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINTS,
  cleanInsert,
  wordIndexAt,
  wordMarks,
  lemmaWords,
  paragraphIndexAt,
  paragraphStart,
  caretInfo,
  planInsert,
  planDelete,
  planEnter,
  planJoin,
  planParaStyle,
  planCharStyle,
  planApprove,
  unapproveMatcher,
  nextAfterApprove,
  suspiciousWords,
  nextSuspicious,
  linkBadge,
  linkEndpoints,
  farLabel,
  selectionText,
  isCollapsed,
  samePos,
  styleActive,
} from './flowEdit.js';
import { buildParagraphs, paragraphApproval, segOkState, SEG_OK, FURNITURE_TAB } from './textModel.js';
import { buildView } from './ops.js';

const W = (text) => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, styles: [] }));
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

// כותרת · פסקה · פסקה (שורה 3 + תחילת 4) · פסקה מאמצע 4 · ציטוט (5–7) · הערות · ריהוט
const base = () => ({
  page: 4,
  size: [1000, 2000],
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
  ],
});
const V = (ops = [], b = base()) => {
  const v = buildView(b, ops.filter((o) => !o._local));
  const s = segOkState(b, ops);
  return { ...v, _segOk: s.keys, _segOkOf: s.byOp };
};
const at = (lineId, offset) => ({ lineId, offset });
const caretSel = (lineId, offset) => ({ anchor: at(lineId, offset), focus: at(lineId, offset) });
const range = (a, b) => ({ anchor: at(...a), focus: at(...b) });
const text = (id, value) => ({ kind: 'text', page: 4, ids: [id], value });

// ---------- עזרים ----------

test('cleanInsert: ירידות-שורה וטאבים ← רווח; סימנים נסתרים ותווי-בקרה — נמחקים', () => {
  assert.equal(cleanInsert('אב\r\nגד\n\nהו\tז'), 'אב גד הו ז');
  assert.equal(cleanInsert('א\u200fב\u200bג\ufeff\u00adד'), 'אבגד');
  assert.equal(cleanInsert(`א${String.fromCharCode(1)}ב${String.fromCharCode(0x7f)}`), 'אב');
  assert.equal(cleanInsert(null), '');
});

test('wordIndexAt / isCollapsed / samePos', () => {
  assert.equal(wordIndexAt('אב גד', 0), 0);
  assert.equal(wordIndexAt('אב גד', 2), 0, 'צמוד לסוף המילה');
  assert.equal(wordIndexAt('אב  גד', 3), -1, 'באמצע רווח');
  assert.equal(wordIndexAt('', 0), -1);
  assert.equal(isCollapsed(caretSel(2, 3)), true);
  assert.equal(isCollapsed(range([2, 3], [2, 4])), false);
  assert.equal(isCollapsed(null), true);
  assert.equal(samePos(at(1, 2), at(1, 2)), true);
  assert.equal(samePos(at(1, 2), null), false);
});

test('wordMarks: ביטחון נמוך (flags ו-conf), חלופות, מודל-שפה', () => {
  const line = {
    words: [{ conf: 0.99 }, { conf: 0.5 }, { conf: null }],
    flags: { low_words: [2, 'x'] },
    alternatives: [{ i: 0, alts: [] }],
    lm_flags: [{ i: 1, kinds: ['lm'] }, null],
  };
  const m = wordMarks(line, 0.95);
  assert.deepEqual([...m.low].sort(), [1, 2]);
  assert.deepEqual([...m.alts.keys()], [0]);
  assert.deepEqual([...m.lm.keys()], [1]);
  assert.equal(wordMarks(null).low.size, 0);
});

test('lemmaWords: עד המילה שנגמרת בנקודה/נקודתיים, או לפני מקף; אחרת מילה אחת', () => {
  assert.deepEqual(lemmaWords('אמר רבא. פירוש', 0), [0, 1]);
  assert.deepEqual(lemmaWords('אמר רבא — פירוש', 0), [0, 1]);
  assert.deepEqual(lemmaWords('תנו רבנן וכו׳ וגו', 0), [0, 0]);
  assert.deepEqual(lemmaWords('סוף. אמר רבא: פירוש', 1), [1, 2]);
  assert.equal(lemmaWords('אחת', 3), null);
});

test('paragraphIndexAt / paragraphStart / caretInfo', () => {
  const v = V([{ kind: 'styles', page: 4, ids: [3], value: { style: 'b', words: [1, 1], on: true } }]);
  const paras = buildParagraphs(v, 'main');
  assert.equal(paragraphIndexAt(paras, at(3, 2)), 2);
  assert.equal(paragraphIndexAt(paras, at(4, 7)), 2, 'סוף הקטע הראשון של שורה 4');
  assert.equal(paragraphIndexAt(paras, at(4, 8)), 3, 'תחילת הפסקה שבאמצע שורה 4');
  assert.equal(paragraphIndexAt(paras, at(8, 0)), -1, 'שורה מלשונית אחרת');
  assert.equal(paragraphIndexAt(paras, null), -1);
  assert.deepEqual(paragraphStart(paras[3]), at(4, 8));
  const info = caretInfo(v, 'main', at(3, 5));
  assert.equal(info.paraKey, '3:0');
  assert.equal(info.paraStyle, 'body');
  assert.equal(info.wordIndex, 1);
  assert.deepEqual([...info.charStyles], ['b']);
  assert.equal(caretInfo(v, 'main', at(5, 0)).paraStyle, 'quote');
  assert.equal(caretInfo(v, 'main', at(1, 0)).heading, true);
});

// ---------- הקלדה ----------

test('planInsert: הקלדה בסמן — פעולת text לשורה, סמן אחרי ההכנסה, מפתח-צבירה', () => {
  assert.deepEqual(planInsert(V(), 'main', caretSel(2, 3), 'ף'), {
    ops: [text(2, 'אלףף בית גימל')],
    caret: at(2, 4),
    coalesceKey: 'text:2',
  });
  // הדבקה עם ירידות-שורה — שורה אחת
  assert.equal(planInsert(V(), 'main', caretSel(2, 0), 'א\nב ').ops[0].value, 'א ב אלף בית גימל');
  assert.deepEqual(planInsert(V(), 'main', caretSel(2, 0), ''), { ops: [] });
  assert.deepEqual(planInsert(V(), 'main', null, 'x'), { ops: [] });
});

test('planInsert: שורה ממתינה לזיהוי מחדש (תיבה שתוקנה / locked) — לא נוגעים, רמז', () => {
  const v = V([{ kind: 'bbox', page: 4, ids: [3], value: [100, 150, 900, 190] }]);
  assert.deepEqual(planInsert(v, 'main', caretSel(3, 1), 'x'), { ops: [], hint: HINTS.locked });
  assert.deepEqual(planInsert(V(), 'main', caretSel(2, 1), 'x', { locked: new Set([2]) }), { ops: [], hint: HINTS.locked });
});

test('planInsert על בחירה בין שורות: ביטול גבול-הפסקה קודם, ואז תיקוני-הטקסט', () => {
  const r = planInsert(V(), 'main', range([3, 4], [2, 4]), 'X');
  assert.deepEqual(r.ops, [
    { kind: 'para_start', page: 4, ids: [3], value: 0 },
    text(2, 'אלף X'),
    text(3, 'הא וו'),
  ]);
  assert.deepEqual(r.caret, at(2, 5));
  assert.equal(r.coalesceKey, undefined, 'כמה פעולות — קבוצה, בלי צבירה');
  // בחירה בתוך שורה אחת (מילה מסומנת והקלדה) — ממשיכה לצבור
  const one = planInsert(V(), 'main', range([2, 4], [2, 7]), 'ב');
  assert.deepEqual(one.ops, [text(2, 'אלף ב גימל')]);
  assert.equal(one.coalesceKey, 'text:2');
  // שורה נעולה באמצע — לא משתנה, רמז
  const locked = planDelete(V(), 'main', range([2, 4], [4, 3]), -1, 'char', null, { locked: new Set([3]) });
  assert.deepEqual(locked.ops.map((o) => [o.kind, o.ids[0]]), [['para_start', 3], ['text', 2], ['text', 4]]);
  assert.equal(locked.hint, HINTS.lockedSkipped);
});

test('planInsert על בחירה: הדבקה ריקה לא מוחקת; בחירה שמתחילה בשורה נעולה — רמז בלבד', () => {
  // לוח-גזירים של תמונה / רק סימן-כיווניות — כלום (ולא מחיקת הבחירה)
  assert.deepEqual(planInsert(V(), 'main', range([4, 0], [4, 9]), '\u200f'), { ops: [] });
  assert.deepEqual(planInsert(V(), 'main', range([4, 0], [4, 9]), ''), { ops: [] });
  // האות הייתה אמורה להיכנס לשורה הנעולה — לא מוחקים את שאר הבחירה
  const r = planInsert(V(), 'main', range([3, 4], [4, 4]), 'x', { locked: new Set([3]) });
  assert.deepEqual(r, { ops: [], hint: HINTS.locked });
  // בחירה שמתחילה בשורה פתוחה ועוברת על נעולה — ההכנסה בשורה הפתוחה
  const ok = planInsert(V(), 'main', range([2, 4], [4, 3]), 'x', { locked: new Set([3]) });
  assert.deepEqual(ok.ops.filter((o) => o.kind === 'text').map((o) => o.ids[0]), [2, 4]);
});

test('שורה שהתרוקנה — רמז "לא-שורה"', () => {
  const b = base();
  b.lines[5] = L(6, 6, 'מ');
  const v = V([], b);
  assert.deepEqual(planDelete(v, 'main', caretSel(6, 1), -1), { ops: [text(6, '')], caret: at(6, 0), coalesceKey: 'text:6', hint: HINTS.emptied });
  assert.equal(planDelete(v, 'main', range([2, 0], [2, 12]), -1).hint, HINTS.emptied);
  assert.equal(planDelete(v, 'main', caretSel(2, 5), -1).hint, undefined);
});

// ---------- מחיקה ----------

test('planDelete: אות לפני/אחרי הסמן, טווח מהדפדפן, מילה ושורה', () => {
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 5), -1), { ops: [text(2, 'אלף ית גימל')], caret: at(2, 4), coalesceKey: 'text:2' });
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 5), 1).ops, [text(2, 'אלף בת גימל')]);
  // טווח שהדפדפן חישב (למשל אות עם ניקוד) — גובר
  const t = { start: at(2, 1), end: at(2, 3) };
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 3), -1, 'char', t).ops, [text(2, 'א בית גימל')]);
  // טווח שחוצה שורה — לא בשימוש (אחרת נמחקים תווים של שורה אחרת)
  const cross = { start: at(1, 9), end: at(2, 3) };
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 3), -1, 'char', cross).ops, [text(2, 'אל בית גימל')]);
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 7), -1, 'word').ops, [text(2, 'אלף  גימל')]);
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 4), 1, 'word').ops, [text(2, 'אלף  גימל')]);
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 7), -1, 'line').ops, [text(2, ' גימל')]);
  assert.deepEqual(planDelete(V(), 'main', caretSel(2, 7), 1, 'line').ops, [text(2, 'אלף בית')]);
});

test('planDelete בגבולות: חיבור פסקאות, פסקה באמצע שורה, סוף-שורה בסריקה, תחילת הזרם', () => {
  const v = V();
  // Backspace בתחילת שורה שפותחת פסקה ← para_start 0, הסמן נשאר
  assert.deepEqual(planDelete(v, 'main', caretSel(3, 0), -1), { ops: [{ kind: 'para_start', page: 4, ids: [3], value: 0 }], caret: at(3, 0) });
  // בתחילת הפסקה שבאמצע שורה 4 ← para_break off
  assert.deepEqual(planDelete(v, 'main', caretSel(4, 8), -1).ops, [{ kind: 'para_break', page: 4, ids: [4], value: { word: 2, on: false } }]);
  // Delete בסוף הפסקה שלפני הגבול באמצע השורה
  assert.deepEqual(planDelete(v, 'main', caretSel(4, 7), 1).ops, [{ kind: 'para_break', page: 4, ids: [4], value: { word: 2, on: false } }]);
  // Delete בסוף שורה 2 ← שורה 3 מפסיקה לפתוח פסקה
  assert.deepEqual(planDelete(v, 'main', caretSel(2, 12), 1).ops, [{ kind: 'para_start', page: 4, ids: [3], value: 0 }]);
  // גבול רגיל בין שתי שורות של אותה פסקה: אין מה למחוק — הסמן מדלג, רמז
  assert.deepEqual(planDelete(v, 'main', caretSel(6, 0), -1), { ops: [], caret: at(5, 6), hint: HINTS.lineBoundary });
  assert.deepEqual(planDelete(v, 'main', caretSel(5, 6), 1), { ops: [], caret: at(6, 0), hint: HINTS.lineBoundary });
  // תחילת הזרם / גבול שנכפה בסגנון — רמז בלבד
  assert.deepEqual(planDelete(v, 'main', caretSel(1, 0), -1), { ops: [], hint: 'תחילת הזרם' });
  assert.match(planDelete(v, 'main', caretSel(2, 0), -1).hint, /סגנון-הפסקה/);
  // בחירה — מחיקת הטווח
  assert.deepEqual(planDelete(v, 'main', range([2, 0], [2, 4]), -1).ops, [text(2, 'בית גימל')]);
});

test('planDelete: שורה נעולה — רמז; בגבול עדיין אפשר לחבר פסקאות', () => {
  const v = V([{ kind: 'bbox', page: 4, ids: [3], value: [100, 150, 900, 190] }]);
  assert.deepEqual(planDelete(v, 'main', caretSel(3, 2), -1), { ops: [], hint: HINTS.locked });
  assert.equal(planDelete(v, 'main', caretSel(3, 0), -1).ops[0].kind, 'para_start');
});

// ---------- פסקאות ----------

test('planEnter: אמצע שורה ← para_break והסמן בתחילת הפסקה החדשה; תחילת שורה; סוף שורה', () => {
  const v = V();
  assert.deepEqual(planEnter(v, 'main', caretSel(3, 3)), {
    ops: [{ kind: 'para_break', page: 4, ids: [3], value: { word: 1, on: true } }],
    caret: at(3, 4),
  });
  assert.deepEqual(planEnter(v, 'main', caretSel(6, 0)), { ops: [{ kind: 'para_start', page: 4, ids: [6], value: 1 }], caret: at(6, 0) });
  assert.deepEqual(planEnter(v, 'main', caretSel(6, 6)), { ops: [{ kind: 'para_start', page: 4, ids: [7], value: 1 }], caret: at(7, 0) });
  assert.deepEqual(planEnter(v, 'main', caretSel(3, 0)), { ops: [], hint: 'כבר יש כאן תחילת פסקה' });
  // בחירה — Enter בתחילתה, בלי למחוק אותה
  assert.equal(planEnter(v, 'main', range([3, 9], [3, 4])).ops[0].value.word, 1);
});

test('planJoin: הפסקה של הסמן מתחברת לקודמת', () => {
  const v = V();
  assert.deepEqual(planJoin(v, 'main', at(3, 5)).ops, [{ kind: 'para_start', page: 4, ids: [3], value: 0 }]);
  assert.deepEqual(planJoin(v, 'main', at(4, 12)).ops, [{ kind: 'para_break', page: 4, ids: [4], value: { word: 2, on: false } }]);
  assert.deepEqual(planJoin(v, 'main', at(1, 2)), { ops: [], hint: HINTS.firstPara });
  assert.match(planJoin(v, 'main', at(5, 1)).hint, /סגנון-הפסקה/);
  assert.deepEqual(planJoin(v, FURNITURE_TAB, at(9, 0)), { ops: [], hint: HINTS.furniture });
});

test('planParaStyle: כל שורות הפסקאות שהבחירה נוגעת בהן, פעולה אחת; הורדת _heading', () => {
  const v = V();
  assert.deepEqual(planParaStyle(v, 'main', caretSel(3, 2), 'h2').ops, [{ kind: 'para', page: 4, ids: [3, 4], value: 'h2' }]);
  assert.deepEqual(planParaStyle(v, 'main', range([2, 1], [4, 9]), 'dh').ops, [{ kind: 'para', page: 4, ids: [2, 3, 4], value: 'dh' }]);
  assert.deepEqual(planParaStyle(v, 'main', caretSel(1, 0), 'body').ops, [
    { kind: 'para', page: 4, ids: [1], value: 'body' },
    { kind: 'stream', page: 4, ids: [1], value: 'main' },
  ]);
  assert.equal(planParaStyle(v, 'main', caretSel(1, 0), 'h1').ops.length, 1, 'כותרת נשארת כותרת');
  assert.deepEqual(planParaStyle(v, FURNITURE_TAB, caretSel(9, 0), 'h1'), { ops: [], hint: HINTS.furniture });
});

// ---------- סגנון-תו ----------

test('planCharStyle: המילה שבסמן, בחירה בין שורות, החלפה אוטומטית, שורות נעולות', () => {
  const v = V();
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 5), 'b').ops, [
    { kind: 'styles', page: 4, ids: [2], value: { style: 'b', words: [1, 1], on: true } },
  ]);
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 3), 'b').ops[0].value.words, [0, 0], 'צמוד לסוף המילה');
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 3), 'b', false).ops[0].value.on, false);
  assert.deepEqual(planCharStyle(v, 'main', { anchor: at(2, 3), focus: at(2, 3) }, 'i').sel, caretSel(2, 3));
  // בחירה משורה 2 (מילה 1) עד שורה 3 (מילה 0)
  assert.deepEqual(
    planCharStyle(v, 'main', range([2, 5], [3, 2]), 'big').ops.map((o) => [o.ids[0], o.value.words]),
    [[2, [1, 2]], [3, [0, 0]]]
  );
  // כבר מודגש בכל הטווח ← הסרה
  const bold = V([{ kind: 'styles', page: 4, ids: [2], value: { style: 'b', words: [0, 2], on: true } }]);
  assert.equal(planCharStyle(bold, 'main', range([2, 0], [2, 7]), 'b').ops[0].value.on, false);
  assert.equal(planCharStyle(bold, 'main', range([2, 0], [3, 2]), 'b').ops[0].value.on, true, 'חלק לא מודגש ← הוספה');
  // רווח / נעולה
  assert.deepEqual(planCharStyle(V([text(2, 'אלף  בית')]), 'main', caretSel(2, 4), 'b'), { ops: [], hint: HINTS.noWord });
  const r = planCharStyle(v, 'main', range([2, 0], [3, 9]), 'b', true, { locked: new Set([3]) });
  assert.deepEqual(r.ops.map((o) => o.ids[0]), [2]);
  assert.equal(r.hint, HINTS.lockedSkipped);
  assert.deepEqual(planCharStyle(v, 'main', caretSel(3, 1), 'b', true, { locked: new Set([3]) }), { ops: [], hint: HINTS.locked });
});

test('planCharStyle + styleActive: heavy (מגלאי-הטיפוגרפיה) נחשב מודגש; B כבוי מוריד גם אותו', () => {
  const b = base();
  b.lines[1].words = [{ text: 'אלף', styles: ['heavy'] }, { text: 'בית', styles: [] }, { text: 'גימל', styles: ['b', 'heavy'] }];
  const v = V([], b);
  assert.equal(styleActive(new Set(['heavy']), 'b'), true, 'הכפתור B לחוץ');
  assert.equal(styleActive(['b'], 'b'), true);
  assert.equal(styleActive(new Set(['heavy']), 'i'), false);
  assert.equal(styleActive(null, 'b'), false);
  // Ctrl+B על מילה heavy — כבר מודגשת ← הסרה של b וגם של heavy
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 1), 'b').ops, [
    { kind: 'styles', page: 4, ids: [2], value: { style: 'b', words: [0, 0], on: false } },
    { kind: 'styles', page: 4, ids: [2], value: { style: 'heavy', words: [0, 0], on: false } },
  ]);
  // B כבוי מפורש על כל השורה — heavy יורד רק מהטווח שיש בו
  assert.deepEqual(
    planCharStyle(v, 'main', range([2, 0], [2, 12]), 'b', false).ops.map((o) => [o.value.style, o.value.words]),
    [['b', [0, 2]], ['heavy', [0, 2]]]
  );
  // מילה לא מודגשת ← הוספת b בלבד
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 5), 'b').ops.map((o) => [o.value.style, o.value.on]), [['b', true]]);
  // נטוי — בלי קשר ל-heavy
  assert.deepEqual(planCharStyle(v, 'main', caretSel(2, 1), 'i', false).ops.map((o) => o.value.style), ['i']);
  // בתצוגה: heavy + הסרה ← המילה כבר לא מודגשת
  const off = V(planCharStyle(v, 'main', caretSel(2, 1), 'b').ops, b);
  assert.equal(styleActive(off.lines.find((l) => l.id === 2).words[0].styles, 'b'), false);
});

// ---------- אישור פסקה ----------

test('planApprove: line_ok לשורות הפסקה; שורה משותפת — חצי-אישור, ו-line_ok כשהשנייה מאושרת', () => {
  let ops = [];
  const r1 = planApprove(V(ops), 'main', '3:0');
  assert.deepEqual(r1.ops, [
    { kind: 'line_ok', page: 4, ids: [3], _pa: '3:0' },
    { kind: SEG_OK, page: 4, ids: [4], value: 0, _local: true, _pa: '3:0' },
  ]);
  ops = [...ops, ...r1.ops];
  const r2 = planApprove(V(ops), 'main', '4:2');
  assert.deepEqual(r2.ops, [
    { kind: SEG_OK, page: 4, ids: [4], value: 2, _local: true, _pa: '4:2' },
    { kind: 'line_ok', page: 4, ids: [4], _pa: '4:2' },
  ]);
  ops = [...ops, ...r2.ops];
  assert.deepEqual(planApprove(V(ops), 'main', '4:2'), { ops: [] }, 'כבר מאושרת');
  // הציטוט: שלוש שורות, כולל הריקה
  assert.deepEqual(planApprove(V(), 'main', '5:0').ops.map((o) => o.ids[0]), [5, 6, 7]);
  // שורה שכבר אושרה (למשל מלוח-הצד) — מדלגים עליה
  assert.deepEqual(planApprove(V([{ kind: 'line_ok', page: 4, ids: [6] }]), 'main', '5:0').ops.map((o) => o.ids[0]), [5, 7]);
  // פסקה שכל שורותיה נעולות
  assert.deepEqual(planApprove(V(), 'main', '2:0', { locked: new Set([2]) }), { ops: [], hint: HINTS.notApprovable });
  assert.deepEqual(planApprove(V(), 'main', 'nope'), { ops: [] });
  // ריהוט הדף (Ctrl+Enter שם) — בלי line_ok נסתר
  assert.deepEqual(planApprove(V(), FURNITURE_TAB, '9:0'), { ops: [], hint: HINTS.furnitureApprove });
  assert.deepEqual(nextAfterApprove(V(), FURNITURE_TAB, '9:0'), { caret: null, hint: HINTS.furnitureApprove, done: false });
});

test('unapproveMatcher: מסיר line_ok של הפסקה (גם מתוך פעולה על כמה שורות) ואת חצאי-האישור שלה', () => {
  const r1 = planApprove(V(), 'main', '3:0').ops;
  const r2 = planApprove(V(r1), 'main', '4:2').ops;
  const bulk = { kind: 'line_ok', page: 4, ids: [2, 3, 6] };
  const ops = [...r1, ...r2, bulk, text(5, 'כף')];
  const pred = unapproveMatcher(V(ops), 'main', '3:0');
  assert.deepEqual(ops.map(pred), [true, true, false, true, [3], false]);
  // אחרי הסרה — פסקה 3:0 לא מאושרת, 4:2 נשארת מאושרת (חצי-האישור שלה)
  const left = ops.filter((o, i) => pred(o) !== true && i !== 4).concat({ ...bulk, ids: [2, 6] });
  const pa = planApprove(V(left), 'main', '4:2');
  assert.deepEqual(pa.ops, [], 'פסקה 4:2 עדיין מאושרת');
  assert.equal(unapproveMatcher(V(), 'main', 'nope'), null);
  // חצי-אישור שמפתחו זז בתיקון-טקסט עדיין נמצא
  const moved = [...r1, ...r2, text(4, 'זין ו חית טית יוד')];
  const pm = unapproveMatcher(V(moved), 'main', '4:3');
  assert.equal(pm(r2[0]), true);
  assert.deepEqual(pm.add, [], 'לפסקה השכנה כבר יש חצי-אישור משלה');
});

test('unapproveMatcher: פסקה שאושרה ורק אחר-כך חולקה באמצע שורה — ביטול אחת לא מבטל את השכנה', () => {
  // פסקה 3:0 = שורות 3 + תחילת 4, בלי השבירה במילה 2: אישור ← line_ok 3, 4
  const b = base();
  b.lines[3] = L(4, 4, 'זין חית טית יוד');
  let ops = planApprove(V([], b), 'main', '3:0').ops;
  assert.deepEqual(ops.map((o) => [o.kind, o.ids[0]]), [['line_ok', 3], ['line_ok', 4]]);
  // Enter באמצע שורה 4 ← שתי פסקאות שחולקות אותה, שתיהן מאושרות (line_ok של 4)
  ops = [...ops, { kind: 'para_break', page: 4, ids: [4], value: { word: 2, on: true } }];
  const pred = unapproveMatcher(V(ops, b), 'main', '3:0');
  assert.deepEqual(pred.add, [{ kind: SEG_OK, page: 4, ids: [4], value: 2, _local: true, _pa: '4:2' }]);
  // הסרה + ההוספה (כמו useProofEditor.removeWhere)
  const left = [...ops.filter((o) => pred(o) !== true), ...pred.add];
  const a = paragraphApproval(V(left, b), 'main');
  assert.equal(a.byKey.get('3:0').approved, false);
  assert.equal(a.byKey.get('4:2').approved, true, 'השכנה נשארת מאושרת');
  // אישור מחדש של הראשונה ← line_ok לשורה המשותפת חוזר
  const again = planApprove(V(left, b), 'main', '3:0').ops;
  assert.deepEqual(again.filter((o) => o.kind === 'line_ok').map((o) => o.ids[0]), [3, 4]);
});

test('nextAfterApprove: הפסקה הבאה שלא אושרה; חזרה להתחלה; הכול אושר', () => {
  const v = V([{ kind: 'line_ok', page: 4, ids: [5, 6, 7] }]);
  assert.deepEqual(nextAfterApprove(v, 'main', '2:0'), { caret: at(3, 0), done: false });
  assert.deepEqual(nextAfterApprove(v, 'main', '4:2'), { caret: at(1, 0), hint: HINTS.wrapApprove, done: false });
  const all = V([{ kind: 'line_ok', page: 4, ids: [1, 2, 3, 4, 5, 6, 7] }]);
  assert.deepEqual(nextAfterApprove(all, 'main', '5:0'), { caret: null, hint: HINTS.allApproved, done: true });
});

// ---------- מילים חשודות ----------

test('suspiciousWords + nextSuspicious: סדר-קריאה, קדימה/אחורה, חזרה בסוף', () => {
  const b = base();
  b.lines[1].flags = { low_words: [2] }; // "גימל"
  b.lines[2].alternatives = [{ i: 0, alts: [{ text: 'דלית', p: 0.3 }] }]; // "דלת"
  b.lines[3].lm_flags = [{ i: 3, kinds: ['rec'] }]; // "יוד"
  b.lines[3].words[1].conf = 0.2; // "חית"
  const v = V([], b);
  assert.deepEqual(
    suspiciousWords(v, 'main').map((w) => [w.lineId, w.i]),
    [[2, 2], [3, 0], [4, 1], [4, 3]]
  );
  const n1 = nextSuspicious(v, 'main', caretSel(2, 0), 1);
  assert.deepEqual(n1.sel, range([2, 8], [2, 12]));
  const n2 = nextSuspicious(v, 'main', n1.sel, 1);
  assert.deepEqual(n2.target, { lineId: 3, i: 0, start: 0, end: 3 });
  assert.deepEqual(nextSuspicious(v, 'main', n2.sel, -1).target.lineId, 2);
  const last = nextSuspicious(v, 'main', caretSel(4, 15), 1);
  assert.equal(last.hint, HINTS.wrapNext);
  assert.deepEqual(last.target.lineId, 2);
  assert.equal(nextSuspicious(v, 'main', caretSel(2, 0), -1).hint, HINTS.wrapPrev);
  // "זין חית טית יוד": המילה 3 מתחילה בתו 12 (0–3, 4–7, 8–11, 12–15)
  assert.deepEqual(nextSuspicious(v, 'main', null, -1).target, { lineId: 4, i: 3, start: 12, end: 15 });
  assert.deepEqual(nextSuspicious(V(), 'main', caretSel(2, 0), 1), { target: null, hint: HINTS.noSuspicious });
});

// ---------- קישורים ----------

test('linkEndpoints: טווחי-מילים, ציוני-הערה (marks), צד בלי מידע', () => {
  const b = base();
  b.links = [
    { from_line: 8, to_line: 3, to_page: 4, kind: 'note', from_words: [0, 1], to_words: [1, 2] },
    { from_line: 8, to_line: 2, to_page: 4, kind: 'dh', words: [0, 0] },
    { from_line: 8, to_line: 6, to_page: 4, kind: 'note' },
    { from_line: 8, to_line: 99, to_page: 5, kind: 'note' },
  ];
  b.marks = { 6: [{ a: 3, b: 6, role: 'anchor', go: 8 }] };
  const eps = linkEndpoints(V([], b));
  assert.deepEqual([...eps.get(3).keys()], [2]);
  assert.deepEqual(eps.get(3).get(2)[0], { n: 1, kind: 'note', side: 'to', other: { lineId: 8, page: 4, i: 1 } });
  assert.deepEqual(eps.get(2).get(0)[0].n, 2);
  assert.deepEqual([...eps.get(6).keys()], [1], 'מהציון שבשורה (מיקום-תווים 3 = מילה 1)');
  // צד ההערה: קישור 1 אחרי מילה 1, השאר — מילה 0
  assert.deepEqual(eps.get(8).get(1).map((e) => e.n), [1]);
  assert.deepEqual(eps.get(8).get(0).map((e) => e.n), [2, 3, 4]);
  assert.deepEqual(eps.get(8).get(0)[2].other, { lineId: 99, page: 5, i: null, label: 'עמוד 5, שורה 99' });
  assert.equal(linkEndpoints({ lines: [] }).size, 0);
  assert.equal(linkBadge(1), '①');
  assert.equal(linkBadge(20), '⑳');
  assert.equal(linkBadge(21), '(21)');
});

test('linkEndpoints: קישור לעמוד אחר — הקצה שבעמוד מצביע לעמוד השני, עם "עמוד N, שורה M: «…»"', () => {
  const b = base();
  b.links = [
    // הפירוש בעמוד 3 (צד ה-from זר), הגוף כאן
    { from_line: 555, from_page: 3, from_line_no: 20, from_text: 'ג והנה', to_line: 3, to_page: 4, kind: 'dh', from_words: [0, 0], to_words: [1, 1] },
    // הערה כאן, הגוף בעמוד 5
    { from_line: 8, to_line: 777, to_page: 5, to_line_no: 11, to_text: 'ב ועוד', kind: 'note', from_words: [0, 0], to_words: [0, 0] },
  ];
  const eps = linkEndpoints(V([], b));
  assert.deepEqual(eps.get(3).get(1)[0], { n: 1, kind: 'dh', side: 'to', other: { lineId: 555, page: 3, i: 0, label: 'עמוד 3, שורה 21: «ג והנה»' } });
  assert.equal(eps.has(555), false);
  assert.deepEqual(eps.get(8).get(0)[0].other, { lineId: 777, page: 5, i: null, label: 'עמוד 5, שורה 12: «ב ועוד»' });
  assert.equal(farLabel(4, 11, 77, 'ב ועוד נראה'), 'עמוד 4, שורה 12: «ב ועוד נראה»');
});

// ---------- העתקה ----------

test('selectionText: שורות של פסקה ברווח, פסקאות בירידת-שורה', () => {
  const v = V();
  assert.equal(selectionText(v, 'main', range([2, 4], [4, 11])), 'בית גימל\nדלת הא וו זין חית\nטית');
  assert.equal(selectionText(v, 'main', range([3, 4], [3, 6])), 'הא');
  assert.equal(selectionText(v, 'main', caretSel(3, 4)), '');
  assert.equal(selectionText(v, 'main', range([3, 4], [8, 1])), '');
});
