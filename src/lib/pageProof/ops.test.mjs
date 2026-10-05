import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOp,
  validateOps,
  applyOp,
  buildView,
  compactOps,
  snapFrame,
  FRAME_PAD,
  autoFrames,
  describeOp,
  CUT_KINDS,
  needsRecut,
  recutLineIds,
  tempLineId,
  sanitizeOp,
  bookOrder,
  mergeLineOk,
  packOps,
  farLinkSide,
  foreignLinkRefs,
  withForeignLines,
  FAR_TEXT_SENT,
  MAX_FAR_TEXT,
  withBookOnly,
  dropIdleBookOnly,
  bookOnlyLineIds,
  isPrintDefectOp,
} from './ops.js';
import { OP_KINDS, isStreamKey, keepHeading, isBookOnly, PRINT_DEFECT_WHY } from './vocab.js';

const line = (id, bbox, extra = {}) => ({
  id,
  line_no: id - 1,
  order: id,
  bbox,
  text: `שורה ${id}`,
  text_ocr: `שורה ${id}`,
  status: 'pending',
  stream: 'main',
  stream_src: 'auto',
  words: [{ text: 'שורה', styles: [] }, { text: String(id), styles: [] }],
  flags: { low_words: [1] },
  alternatives: [{ i: 1 }],
  lm_flags: [],
  ...extra,
});

const doc = () => ({
  contract: 1,
  gid: 'abcdef123456',
  page: 3,
  size: [1000, 2000],
  frames: [],
  links: [],
  lines: [
    line(1, [100, 100, 900, 140]),
    line(2, [100, 150, 900, 190]),
    line(3, [100, 1500, 900, 1530], { stream: 'notes' }),
  ],
});

test('validateOp: סוג לא מוכר ועמוד שגוי', () => {
  assert.match(validateOp(doc(), { kind: 'nope', page: 3 }), /לא מוכר/);
  assert.match(validateOp(doc(), { kind: 'stream', page: 4, ids: [1], value: 'main' }), /עמוד 4/);
});

test('validateOp: שורות חייבות להיות בעמוד', () => {
  assert.match(validateOp(doc(), { kind: 'stream', page: 3, ids: [99], value: 'main' }), /אינה בעמוד/);
  assert.match(validateOp(doc(), { kind: 'stream', page: 3, ids: [-1], value: 'main' }), /אינה בעמוד/);
  assert.equal(validateOp(doc(), { kind: 'stream', page: 3, ids: [1, 2], value: 'notes' }), null);
});

test('validateOp: זרמים מותאמים וכותרות', () => {
  assert.equal(validateOp(doc(), { kind: 'stream', page: 3, ids: [1], value: 's_rashi' }), null);
  assert.equal(validateOp(doc(), { kind: 'stream', page: 3, ids: [1], value: 'notes_heading' }), null);
  assert.match(validateOp(doc(), { kind: 'stream', page: 3, ids: [1], value: 'bogus' }), /זרם/);
});

test('validateOp: טקסט, תיבה וסגנון', () => {
  assert.equal(validateOp(doc(), { kind: 'text', page: 3, ids: [1], value: 'חדש' }), null);
  assert.match(validateOp(doc(), { kind: 'text', page: 3, ids: [1, 2], value: 'x' }), /לשורה אחת/);
  assert.match(validateOp(doc(), { kind: 'bbox', page: 3, ids: [1], value: [0, 0, 2000, 10] }), /חורגת/);
  assert.equal(validateOp(doc(), { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 1], on: true } }), null);
  assert.match(validateOp(doc(), { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [2, 1], on: true } }), /טווח/);
});

test('validateOp: מסגרות וקישורים', () => {
  const ok = { kind: 'frames_set', page: 3, value: { frames: [{ fid: 'a1b2c3', stream: 'main', bbox: [90, 90, 910, 200], order: 1 }] } };
  assert.equal(validateOp(doc(), ok), null);
  const dup = { ...ok, value: { frames: [ok.value.frames[0], ok.value.frames[0]] } };
  assert.match(validateOp(doc(), dup), /מזהה/);
  assert.match(validateOp(doc(), { kind: 'link_add', page: 3, ids: [1] }), /שתי/);
  assert.equal(validateOp(doc(), { kind: 'link_del', page: 3, value: { src_line: 3, page: 3 } }), null);
});

test('validateOp: פעולות-שורה חדשות', () => {
  assert.equal(validateOp(doc(), { kind: 'line_split', page: 3, ids: [1], value: { x: 500 } }), null);
  assert.match(validateOp(doc(), { kind: 'line_split', page: 3, ids: [1], value: { x: 950 } }), /מחוץ/);
  assert.equal(validateOp(doc(), { kind: 'line_add', page: 3, value: { bbox: [10, 10, 50, 40], text: 'x' } }), null);
});

test('validateOps: רשימה ריקה נדחית', () => {
  assert.match(validateOps(doc(), []), /אין/);
  assert.match(validateOps(doc(), [{ kind: 'text', page: 3, ids: [9], value: 'x' }]), /פעולה 1/);
});

test('applyOp text: מסמן fixed ומנקה סימונים; זהה ל-OCR = ok', () => {
  const d = applyOp(doc(), { kind: 'text', page: 3, ids: [1], value: 'מתוקן' });
  const l = d.lines[0];
  assert.equal(l.text, 'מתוקן');
  assert.equal(l.status, 'fixed');
  assert.deepEqual(l.alternatives, []);
  assert.deepEqual(l.flags.low_words, []);
  const d2 = applyOp(d, { kind: 'text', page: 3, ids: [1], value: 'שורה 1' });
  assert.equal(d2.lines[0].status, 'ok');
});

test('applyOp אינו משנה את הקלט', () => {
  const base = doc();
  applyOp(base, { kind: 'stream', page: 3, ids: [1], value: 'notes' });
  assert.equal(base.lines[0].stream, 'main');
});

test('applyOp styles: הוספה והסרה בטווח', () => {
  let d = applyOp(doc(), { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 1], on: true } });
  assert.deepEqual(d.lines[0].words.map((w) => w.styles), [['b'], ['b']]);
  d = applyOp(d, { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [1, 1], on: false } });
  assert.deepEqual(d.lines[0].words.map((w) => w.styles), [['b'], []]);
});

test('applyOp status: הסרה ושחזור מחזירים את המצב הקודם', () => {
  let d = applyOp(doc(), { kind: 'status', page: 3, ids: [2], value: 'removed' });
  assert.equal(d.lines[1].status, 'removed');
  d = applyOp(d, { kind: 'status', page: 3, ids: [2], value: 'restore' });
  assert.equal(d.lines[1].status, 'pending');
});

test('buildView: מסגרת קובעת זרם לשורות שכולן בתוכה, human גובר', () => {
  const ops = [
    { kind: 'stream', page: 3, ids: [2], value: 'margin' },
    { kind: 'frames_set', page: 3, value: { frames: [{ fid: 'f00001', stream: 'notes', bbox: [90, 90, 910, 200], order: 1 }] } },
  ];
  const v = buildView(doc(), ops);
  const byId = Object.fromEntries(v.lines.map((l) => [l.id, l]));
  assert.equal(byId[1].stream, 'notes');
  assert.equal(byId[1].stream_src, 'frame');
  assert.equal(byId[2].stream, 'margin');
  // ניקוי המסגרות מחזיר את הזרם האוטומטי
  const v2 = buildView(doc(), [...ops, { kind: 'frames_clear', page: 3 }]);
  assert.equal(v2.lines.find((l) => l.id === 1).stream, 'main');
});

test('buildView: פיצול יוצר שתי שורות זמניות בסדר ימין-לשמאל', () => {
  const v = buildView(doc(), [{ kind: 'line_split', page: 3, ids: [1], value: { x: 500 } }]);
  const parts = v.lines.filter((l) => l._new);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((l) => l.id < 0));
  assert.deepEqual(parts[0].bbox, [500, 100, 900, 140]);
  assert.equal(v.lines.some((l) => l.id === 1), false);
});

test('buildView: איחוד והוספה', () => {
  const v = buildView(doc(), [
    { kind: 'line_merge', page: 3, ids: [1, 2] },
    { kind: 'line_add', page: 3, value: { bbox: [100, 200, 900, 230], text: 'נוספה' } },
  ]);
  const merged = v.lines.find((l) => l._new && l.text.includes('שורה 1'));
  assert.deepEqual(merged.bbox, [100, 100, 900, 190]);
  assert.equal(merged.text, 'שורה 1 שורה 2');
  assert.ok(v.lines.some((l) => l.text === 'נוספה'));
});

test('compactOps: האחרונה גוברת, וטקסט שחזר למקור נופל', () => {
  const ops = [
    { kind: 'stream', page: 3, ids: [1], value: 'notes' },
    { kind: 'text', page: 3, ids: [2], value: 'אחר' },
    { kind: 'stream', page: 3, ids: [1], value: 'margin' },
    { kind: 'text', page: 3, ids: [2], value: 'שורה 2' },
    { kind: 'status', page: 3, ids: [3], value: 'restore' },
    { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 0], on: true } },
    { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 0], on: false } },
  ];
  const out = compactOps(doc(), ops);
  assert.deepEqual(out.map((o) => o.kind), ['stream', 'styles', 'styles']);
  assert.equal(out[0].value, 'margin');
});

test('snapFrame מתהדק סביב השורות שבתוכו', () => {
  const b = snapFrame([0, 0, 1000, 300], doc().lines);
  assert.deepEqual(b, [96, 96, 904, 194]);
  assert.deepEqual(snapFrame([0, 600, 50, 700], doc().lines), [0, 600, 50, 700]);
});

test('snapFrame: כיווץ בלבד — לעולם לא מעבר למה שצויר; שורות שהוסרו / בלי תיבה אינן נספרות', () => {
  assert.equal(FRAME_PAD, 4);
  // המלבן חותך את השורות (מרכזן בפנים) — המסגרת לא גדלה אל מעבר לו
  assert.deepEqual(snapFrame([300, 90, 700, 200], doc().lines), [300, 96, 700, 194]);
  const lines = [...doc().lines, line(9, [100, 200, 900, 240], { status: 'removed' }), { id: 10, bbox: null }];
  assert.deepEqual(snapFrame([0, 0, 1000, 300], lines), [96, 96, 904, 194]);
  assert.equal(snapFrame(null, lines), null);
  assert.deepEqual(snapFrame([0, 0, 1000, 300], null), [0, 0, 1000, 300]);
});

test('מסגרת-כותרת ("כותרת הערות") נותנת לשורות שבתוכה את זרם-הכותרת; מסגרת-ריהוט — את הריהוט', () => {
  const v = buildView(doc(), [
    {
      kind: 'frames_set',
      page: 3,
      value: {
        frames: [
          { fid: 'hh0001', stream: 'notes_heading', bbox: [90, 90, 910, 145], order: 1 },
          { fid: 'ff0001', stream: 'footer', bbox: [90, 1490, 910, 1540], order: 2 },
        ],
      },
    },
  ]);
  const s = Object.fromEntries(v.lines.map((l) => [l.id, [l.stream, l.stream_src]]));
  assert.deepEqual(s[1], ['notes_heading', 'frame']);
  assert.deepEqual(s[2], ['main', 'auto']);
  assert.deepEqual(s[3], ['footer', 'frame']);
  // זרם-ספר מותאם עם כותרת
  const v2 = buildView(doc(), [{ kind: 'frames_set', page: 3, value: { frames: [{ fid: 'ss0001', stream: 's_rashi_heading', bbox: [90, 90, 910, 200], order: 1 }] } }]);
  assert.deepEqual(v2.lines.filter((l) => l.id !== 3).map((l) => l.stream), ['s_rashi_heading', 's_rashi_heading']);
});

test('autoFrames: מסגרת לכל זרם/טור, עם seq ו-order', () => {
  const d = doc();
  d.lines.push(line(4, [100, 1540, 480, 1570], { stream: 'notes' }), line(5, [520, 1540, 900, 1570], { stream: 'notes' }));
  // שורה 3 רחבה ומכסה את שני הטורים — נופלת לטור אחד; כאן מוודאים רק מבנה
  let n = 0;
  const frames = autoFrames(d, () => `fid${String(++n).padStart(3, '0')}`);
  assert.ok(frames.length >= 2);
  assert.deepEqual(frames.map((f) => f.order), frames.map((_, i) => i + 1));
  assert.ok(frames.every((f) => f.seq >= 1 && /^fid\d{3}$/.test(f.fid)));
});

test('describeOp בעברית', () => {
  assert.match(describeOp(doc(), { kind: 'text', page: 3, ids: [1], value: 'חדש' }), /שורה 1: «שורה 1» ← «חדש»/);
  assert.match(describeOp(doc(), { kind: 'status', page: 3, ids: [2], value: 'removed' }), /הוסרה/);
});

test('describeOp: זרם — בשמו העברי (לא המפתח), כותרת בשם הכותרת, וריהוט עם "לא נכנס לספר"', () => {
  const d = { ...doc(), streams: [{ key: 'notes', he: 'רש"י', color: '#123456' }] };
  const stream = (value) => describeOp(d, { kind: 'stream', page: 3, ids: [1], value });
  assert.equal(stream('main'), 'שורה 1: זרם ← ראשי');
  assert.equal(stream('notes'), 'שורה 1: זרם ← רש"י', 'השם שהספר נתן לזרם');
  assert.equal(stream('notes_heading'), 'שורה 1: זרם ← כותרת רש"י');
  assert.equal(stream('main_heading'), 'שורה 1: זרם ← כותרת');
  assert.equal(stream('notes2'), "שורה 1: זרם ← הערות ב'");
  assert.equal(stream('header'), 'שורה 1: זרם ← כותרת עמוד (ריהוט הדף — לא נכנס לספר)');
  assert.equal(stream('footer'), 'שורה 1: זרם ← תחתית (ריהוט הדף — לא נכנס לספר)');
  assert.equal(stream('sep'), 'שורה 1: זרם ← מפריד (ריהוט הדף — לא נכנס לספר)');
  assert.doesNotMatch(stream('header'), /header/);
});

// ---------- הרחבות (עורך-הזרימה): פסקה באמצע שורה, חיתוך תקין, קישור ברמת-מילה ----------

// שורה 1 עם ארבע מילים, סגנונות, סימוני-חשד ופסקה שמתחילה במילה 2
const rich = () => {
  const d = doc();
  d.lines[0] = line(1, [100, 100, 900, 140], {
    text: 'אחת שתיים שלוש ארבע',
    text_ocr: 'אחת שתיים שלוש ארבע',
    words: [
      { text: 'אחת', styles: [], script: 'square' },
      { text: 'שתיים', styles: ['b'], script: 'square', conf: 0.99 },
      { text: 'שלוש', styles: [], script: 'square', conf: 0.2 },
      { text: 'ארבע', styles: ['i'], script: 'square' },
    ],
    para_breaks: [2],
    flags: { low_words: [2], mixed_line: true },
    alternatives: [{ i: 0, alts: [] }, { i: 2, alts: [] }],
    lm_flags: [{ i: 3, kinds: ['lm'] }],
  });
  return d;
};
const text1 = (d, value) => applyOp(d, { kind: 'text', page: 3, ids: [1], value }).lines[0];

test('vocab: הסוגים החדשים רשומים כהצעה (contract:false)', () => {
  assert.deepEqual(OP_KINDS.para_break, { he: 'פסקה באמצע שורה', ids: true, contract: false });
  assert.deepEqual(OP_KINDS.cut_ok, { he: 'החיתוך תקין', ids: false, contract: false });
});

test('validateOp para_break: שורה אחת, מילה 1–500, on בוליאני', () => {
  const ok = { kind: 'para_break', page: 3, ids: [1], value: { word: 1, on: true } };
  assert.equal(validateOp(doc(), ok), null);
  assert.equal(validateOp(doc(), { ...ok, value: { word: 500, on: false } }), null);
  assert.match(validateOp(doc(), { ...ok, value: { word: 0, on: true } }), /מספר-מילה/);
  assert.match(validateOp(doc(), { ...ok, value: { word: 501, on: true } }), /מספר-מילה/);
  assert.match(validateOp(doc(), { ...ok, value: { word: 1.5, on: true } }), /מספר-מילה/);
  assert.match(validateOp(doc(), { ...ok, value: { word: 2 } }), /on/);
  assert.match(validateOp(doc(), { ...ok, value: undefined }), /חסר/);
  assert.match(validateOp(doc(), { ...ok, ids: [1, 2] }), /לשורה אחת/);
  assert.match(validateOp(doc(), { ...ok, ids: [] }), /לא נבחרו/);
});

test('validateOp cut_ok: לעמוד (בלי שורות), ערך true בלבד', () => {
  assert.equal(validateOp(doc(), { kind: 'cut_ok', page: 3, value: true }), null);
  assert.equal(validateOp(doc(), { kind: 'cut_ok', page: 3, ids: [], value: true }), null);
  assert.match(validateOp(doc(), { kind: 'cut_ok', page: 3, value: 1 }), /true/);
  assert.match(validateOp(doc(), { kind: 'cut_ok', page: 3, ids: [1], value: true }), /אין שורות/);
});

test('validateOp frames_set: confirmed בוליאני בלבד', () => {
  const frames = [{ fid: 'a1b2c3', stream: 'main', bbox: [90, 90, 910, 200], order: 1 }];
  assert.equal(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames, confirmed: true } }), null);
  assert.match(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames, confirmed: 'yes' } }), /אישור/);
});

test('validateOp link_add: הצורה הישנה והחדשה, שתי שורות שונות, טווחים תקינים', () => {
  const v = { from_words: [0, 1], to_words: [2, 2], kind: 'dh' };
  const op = (extra) => ({ kind: 'link_add', page: 3, ids: [3, 1], value: v, ...extra });
  assert.equal(validateOp(doc(), op({ value: undefined })), null);
  assert.equal(validateOp(doc(), op()), null);
  assert.equal(validateOp(doc(), op({ value: { kind: 'note' } })), null);
  assert.match(validateOp(doc(), op({ ids: [1, 1] })), /שונות/);
  assert.match(validateOp(doc(), op({ value: { ...v, from_words: [2, 1] } })), /ההערה/);
  assert.match(validateOp(doc(), op({ value: { ...v, to_words: [-1, 0] } })), /הגוף/);
  assert.match(validateOp(doc(), op({ value: { ...v, to_words: [0] } })), /הגוף/);
  assert.match(validateOp(doc(), op({ value: { ...v, kind: 'join' } })), /סוג-קישור/);
  assert.match(validateOp(doc(), op({ value: 'x' })), /ערך-קישור/);
});

test('applyOp para_break: רשימה ממוינת וייחודית, הדלקה וכיבוי', () => {
  const pb = (d, word, on) => applyOp(d, { kind: 'para_break', page: 3, ids: [1], value: { word, on } });
  let d = pb(rich(), 3, true);
  assert.deepEqual(d.lines[0].para_breaks, [2, 3]);
  d = pb(d, 3, true);
  assert.deepEqual(d.lines[0].para_breaks, [2, 3]);
  d = pb(d, 2, false);
  assert.deepEqual(d.lines[0].para_breaks, [3]);
  assert.equal(d.lines[0]._touched, true);
  assert.deepEqual(pb(doc(), 1, true).lines[0].para_breaks, [1]);
});

test('applyOp text: מילה שנוספה בתחילה — סגנונות, גבול-פסקה וסימונים זזים איתה', () => {
  const l = text1(rich(), 'פתיחה אחת שתיים שלוש ארבע');
  assert.deepEqual(l.words.map((w) => w.styles), [[], [], ['b'], [], ['i']]);
  assert.equal(l.words[0].script, 'square');
  assert.deepEqual(l.para_breaks, [3]);
  assert.deepEqual(l.flags.low_words, [3]);
  assert.equal(l.flags.mixed_line, true);
  assert.deepEqual(l.alternatives.map((a) => a.i), [1, 3]);
  assert.deepEqual(l.lm_flags.map((f) => f.i), [4]);
  assert.equal(l.status, 'fixed');
  assert.equal(l._textEdited, true);
});

test('applyOp text: תיקון-אות — הסגנון נשאר, סימוני-החשד של המילה שתוקנה יורדים', () => {
  const l = text1(rich(), 'אחת שתיים שלושה ארבע');
  assert.deepEqual(l.words.map((w) => w.styles), [[], ['b'], [], ['i']]);
  assert.equal(l.words[2].text, 'שלושה');
  assert.equal(l.words[2].conf, null);
  assert.equal(l.words[1].conf, 0.99, 'מילה שלא השתנתה שומרת את הביטחון');
  assert.deepEqual(l.flags.low_words, []);
  assert.deepEqual(l.alternatives.map((a) => a.i), [0]);
  assert.deepEqual(l.lm_flags.map((f) => f.i), [3]);
  assert.deepEqual(l.para_breaks, [2]);
});

test('applyOp text: מחיקת מילת-הפתיחה של פסקה — הפסקה מתחילה במילה שאחריה', () => {
  const l = text1(rich(), 'אחת שתיים ארבע');
  assert.deepEqual(l.para_breaks, [2]);
  assert.equal(l.words[2].text, 'ארבע');
  assert.deepEqual(l.words[2].styles, ['i']);
  assert.deepEqual(l.lm_flags.map((f) => f.i), [2]);
  assert.deepEqual(l.flags.low_words, []);
});

test('applyOp text: מחיקת כל מה שלפני הפסקה — השורה עצמה פותחת פסקה', () => {
  const l = text1(rich(), 'שלוש ארבע');
  assert.equal(l.para_start, true);
  assert.deepEqual(l.para_breaks, []);
  // ו-para_start 0 מפורש מבטל גם גבול "במילה 0" שנשאר בנתונים
  const d = rich();
  d.lines[0].para_breaks = [0, 2];
  const after = applyOp(d, { kind: 'para_start', page: 3, ids: [1], value: 0 }).lines[0];
  assert.equal(after.para_start, false);
  assert.deepEqual(after.para_breaks, [2]);
});

test('applyOp text: שורה בלי para_breaks — לא נוסף שדה; בלי words — נוצרות', () => {
  const l = text1(doc(), 'חדש לגמרי כאן');
  assert.equal('para_breaks' in l, false);
  const d = doc();
  delete d.lines[0].words;
  assert.deepEqual(text1(d, 'אב גד').words.map((w) => w.text), ['אב', 'גד']);
});

test('applyOp text: קצות-קישור (טווחי-מילים) וציוני-הערות (marks) זזים עם הטקסט', () => {
  let d = rich();
  d.marks = { 1: [{ a: 10, b: 14, sign: '*' }, { a: 0, b: 3, sign: '(' }], 3: [{ a: 0, b: 1 }] };
  d = applyOp(d, { kind: 'link_add', page: 3, ids: [3, 1], value: { from_words: [0, 1], to_words: [2, 3], kind: 'note' } });
  d = applyOp(d, { kind: 'text', page: 3, ids: [1], value: 'פתיחה אחת שתיים שלוש ארבע' });
  const link = d.links.find((k) => k.from_line === 3);
  assert.deepEqual(link.to_words, [3, 4]);
  assert.deepEqual(link.from_words, [0, 1], 'הצד השני לא נגע');
  assert.deepEqual(d.marks[1], [{ a: 16, b: 20, sign: '*' }, { a: 6, b: 9, sign: '(' }]);
  assert.deepEqual(d.marks[3], [{ a: 0, b: 1 }]);
  // מחיקת המילה שעליה הציון — הציון יורד; טווח שכל מילותיו נמחקו — null
  const d2 = applyOp(d, { kind: 'text', page: 3, ids: [1], value: 'פתיחה אחת שתיים' });
  assert.deepEqual(d2.marks[1], [{ a: 6, b: 9, sign: '(' }]);
  assert.equal(d2.links.find((k) => k.from_line === 3).to_words, null);
});

test('applyOp cut_ok ו-frames_set confirmed', () => {
  assert.equal(applyOp(doc(), { kind: 'cut_ok', page: 3, value: true }).cut_ok, true);
  const frames = [{ fid: 'a1b2c3', stream: 'main', bbox: [90, 90, 910, 200], order: 1 }];
  let d = applyOp(doc(), { kind: 'frames_set', page: 3, value: { frames, confirmed: true } });
  assert.equal(d.frames_confirmed, true);
  d = applyOp(d, { kind: 'frames_set', page: 3, value: { frames } });
  assert.equal(d.frames_confirmed, false);
  d = applyOp(applyOp(doc(), { kind: 'frames_set', page: 3, value: { frames, confirmed: true } }), { kind: 'frames_clear', page: 3 });
  assert.equal(d.frames_confirmed, false);
});

test('applyOp link_add: טווחי-מילים וסוג נשמרים; הצורה הישנה = הערה בלי טווחים; קישור קודם מאותה שורה מוחלף', () => {
  const d = applyOp(doc(), { kind: 'link_add', page: 3, ids: [3, 1], value: { from_words: [0, 0], to_words: [1, 1], kind: 'dh' } });
  // _added: נוסף בעריכה הזו (LinksTab מציע להסיר את הפעולה עצמה)
  assert.deepEqual(d.links, [
    { from_line: 3, from_mark: null, to_line: 1, to_page: 3, kind: 'dh', conf: 1, src: 'human', suspect: null, _added: true, from_words: [0, 0], to_words: [1, 1] },
  ]);
  const d2 = applyOp(d, { kind: 'link_add', page: 3, ids: [3, 2] });
  assert.equal(d2.links.length, 1);
  assert.equal(d2.links[0].to_line, 2);
  assert.equal(d2.links[0].kind, 'note');
  assert.equal('from_words' in d2.links[0], false);
});

// עמוד דו-טורי עם שורה שחוצה את שני הטורים (החיתוך איחד אותן)
const twoCol = () => ({
  contract: 1,
  page: 3,
  size: [1000, 2000],
  frames: [],
  links: [],
  lines: [
    line(1, [100, 100, 900, 150], { order: 1, stream: 'main_heading', text: 'כותרת', words: [] }),
    line(2, [100, 200, 900, 240], { order: 2, text: 'ימין1 ימין2 שמאל1 שמאל2', text_ocr: '', words: [], para_start: true }),
    line(3, [520, 260, 900, 300], { order: 3 }),
    line(4, [520, 320, 900, 360], { order: 4 }),
    line(5, [100, 260, 480, 300], { order: 5, stream: 's_rashi' }),
    line(6, [100, 320, 480, 360], { order: 6, stream: 's_rashi' }),
  ],
});

test('line_split מודע-טורים: שורה שחצתה טורים — החצי הימני בראש הטור הימני, השמאלי בראש השמאלי', () => {
  const v = buildView(twoCol(), [{ kind: 'line_split', page: 3, ids: [2], value: { x: 500 } }]);
  const [right, left] = [tempLineId(0, 0), tempLineId(0, 1)].map((id) => v.lines.find((l) => l.id === id));
  assert.deepEqual(right.bbox, [500, 200, 900, 240]);
  assert.deepEqual(left.bbox, [100, 200, 500, 240]);
  assert.equal(right.order, 2);
  assert.equal(left.order, 4.5, 'אחרי הטור הימני, לפני השורה הבאה בטור השמאלי');
  assert.deepEqual(v.lines.map((l) => l.id), [1, right.id, 3, 4, left.id, 5, 6]);
  // טקסט משוער לתצוגה (לפי יחס-הרוחב): תחילת השורה בחצי הימני
  assert.equal(right.text, 'ימין1 ימין2');
  assert.equal(left.text, 'שמאל1 שמאל2');
  assert.equal(right.para_start, true);
  assert.equal(left.para_start, false);
  assert.ok(right._new && right._recut && left._recut);
  assert.equal(right.status, 'pending');
});

test('line_split: לפי תיבות-המילים כשיש; בשורה לועזית — השמאלי קודם', () => {
  const d = twoCol();
  d.lines[1].words = [
    { text: 'ימין1', bbox: [800, 200, 890, 240], styles: ['b'] },
    { text: 'ימין2', bbox: [520, 200, 600, 240], styles: [] },
    { text: 'שמאל1', bbox: [300, 200, 400, 240], styles: [] },
    { text: 'שמאל2', bbox: [110, 200, 200, 240], styles: [] },
  ];
  const v = buildView(d, [{ kind: 'line_split', page: 3, ids: [2], value: { x: 700 } }]);
  const right = v.lines.find((l) => l.id === tempLineId(0, 0));
  assert.equal(right.text, 'ימין1');
  assert.deepEqual(right.words.map((w) => w.styles), [['b']]);
  assert.equal(v.lines.find((l) => l.id === tempLineId(0, 1)).text, 'ימין2 שמאל1 שמאל2');

  const lat = doc();
  lat.lines[0] = line(1, [100, 100, 900, 140], { text: 'one two three four', script: 'latin', words: [] });
  const v2 = buildView(lat, [{ kind: 'line_split', page: 3, ids: [1], value: { x: 500 } }]);
  const [a, b] = v2.lines.filter((l) => l._new);
  assert.deepEqual(a.bbox, [100, 100, 500, 140], 'לועזית: החצי השמאלי נקרא ראשון');
  assert.equal(a.text, 'one two');
  assert.deepEqual(b.bbox, [500, 100, 900, 140]);
  assert.ok(a.order < b.order);
});

test('line_add: זרם מהשכנה בטור (אוטומטי — מסגרת גוברת), מקום מודע-טורים; זרם מפורש = human', () => {
  const add = (value) => ({ kind: 'line_add', page: 3, value });
  let v = buildView(twoCol(), [add({ bbox: [100, 380, 480, 420] })]);
  let nl = v.lines.find((l) => l._new);
  assert.equal(nl.stream, 's_rashi');
  assert.equal(nl.stream_src, 'auto');
  assert.equal(nl.order, 6.5);
  assert.equal(nl._recut, true);
  // בסוף הטור הימני — לפני הטור השמאלי
  v = buildView(twoCol(), [add({ bbox: [520, 380, 900, 420] })]);
  assert.equal(v.lines.find((l) => l._new).order, 4.5);
  // מסגרת שהשורה החדשה בתוכה קובעת את זרמה (כי לא נבחר זרם במפורש)
  const frames = [{ fid: 'f00001', stream: 'notes', bbox: [90, 370, 490, 430], order: 1 }];
  v = buildView(twoCol(), [add({ bbox: [100, 380, 480, 420] }), { kind: 'frames_set', page: 3, value: { frames } }]);
  nl = v.lines.find((l) => l._new);
  assert.equal(nl.stream, 'notes');
  assert.equal(nl.stream_src, 'frame');
  v = buildView(twoCol(), [add({ bbox: [100, 380, 480, 420] }), { kind: 'frames_set', page: 3, value: { frames } }, { kind: 'frames_clear', page: 3 }]);
  assert.equal(v.lines.find((l) => l._new).stream, 's_rashi');
  // זרם שנבחר ביד — המסגרת לא דורסת
  v = buildView(twoCol(), [add({ bbox: [100, 380, 480, 420], stream: 'margin' }), { kind: 'frames_set', page: 3, value: { frames } }]);
  nl = v.lines.find((l) => l._new);
  assert.equal(nl.stream, 'margin');
  assert.equal(nl.stream_src, 'human');
});

test('line_merge: הסדר המוקדם, המילים מחוברות, תחילת-פסקה מהראשונה', () => {
  const d = doc();
  d.lines[0].para_start = true;
  d.lines[0].words[1].styles = ['b'];
  const v = buildView(d, [{ kind: 'line_merge', page: 3, ids: [2, 1] }]);
  const m = v.lines.find((l) => l._new);
  assert.equal(m.order, 1);
  assert.equal(m.text, 'שורה 1 שורה 2');
  assert.deepEqual(m.words.map((w) => w.styles), [[], ['b'], [], []]);
  assert.equal(m.para_start, true);
  assert.equal(m._recut, true);
  assert.equal(v.lines[0].id, m.id);
});

test('bbox מסמן את השורה לזיהוי-מחדש', () => {
  const v = buildView(doc(), [{ kind: 'bbox', page: 3, ids: [2], value: [100, 150, 900, 195] }]);
  assert.equal(v.lines.find((l) => l.id === 2)._recut, true);
  assert.equal(v.lines.find((l) => l.id === 1)._recut, undefined);
});

test('CUT_KINDS / needsRecut / recutLineIds', () => {
  assert.deepEqual(CUT_KINDS, ['line_split', 'line_merge', 'line_add', 'bbox']);
  const ops = [
    { kind: 'text', page: 3, ids: [3], value: 'x' },
    { kind: 'bbox', page: 3, ids: [2], value: [100, 150, 900, 195] },
    { kind: 'line_merge', page: 3, ids: [3, 2] },
    { kind: 'line_split', page: 3, ids: [99], value: { x: 5 } },
    { kind: 'line_add', page: 3, value: { bbox: [1, 1, 5, 5] } },
  ];
  assert.equal(needsRecut(ops), true);
  assert.equal(needsRecut(ops.slice(0, 1)), false);
  assert.equal(needsRecut([{ kind: 'line_add', page: 3, value: { bbox: [1, 1, 5, 5] } }]), true);
  assert.equal(needsRecut([]), false);
  assert.equal(needsRecut(null), false);
  // רק שורות מקוריות, ממוין ובלי כפילויות (99 אינה בעמוד)
  assert.deepEqual(recutLineIds(doc(), ops), [2, 3]);
  assert.deepEqual(recutLineIds(doc(), []), []);
  assert.deepEqual(recutLineIds(null, [{ kind: 'bbox', ids: [4, -2] }]), [4]);
});

test('compactOps: טקסט נשמר כשאחריו פעולה שמתייחסת למספרי-המילים שלו', () => {
  const t = (value) => ({ kind: 'text', page: 3, ids: [1], value });
  const bold = { kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [2, 2], on: true } };
  const brk = { kind: 'para_break', page: 3, ids: [1], value: { word: 2, on: true } };
  // בלי פעולת-מילים ביניהם — הראשון נדרס
  assert.deepEqual(compactOps(doc(), [t('א ב'), t('א ב ג')]).map((o) => o.value), ['א ב ג']);
  // סגנון-תו שמתייחס לטקסט הראשון — שניהם נשמרים
  assert.deepEqual(compactOps(doc(), [t('א ב ג'), bold, t('א ב ג ד')]).map((o) => o.kind), ['text', 'styles', 'text']);
  assert.deepEqual(compactOps(doc(), [t('א ב ג'), brk, t('א ב ג ד')]).map((o) => o.kind), ['text', 'para_break', 'text']);
  // פעולת-מילים על שורה אחרת לא מונעת דריסה
  const other = { ...bold, ids: [2] };
  assert.deepEqual(compactOps(doc(), [t('א ב'), other, t('א ב ג')]).map((o) => o.kind), ['styles', 'text']);
  // קישור ברמת-מילה שנוגע בשורה
  const link = { kind: 'link_add', page: 3, ids: [3, 1], value: { to_words: [0, 0] } };
  assert.deepEqual(compactOps(doc(), [t('א ב'), link, t('א ב ג')]).map((o) => o.kind), ['text', 'link_add', 'text']);
  // חזרה לטקסט המקורי אחרי שינוי שנשמר — אינה "ללא-שינוי"
  assert.deepEqual(compactOps(doc(), [t('א ב'), bold, t('שורה 1')]).map((o) => o.value?.style || o.value), ['א ב', 'b', 'שורה 1']);
  // טקסט זהה לזה שלפניו — יורד
  assert.deepEqual(compactOps(doc(), [t('א ב'), bold, t('א ב')]).map((o) => o.kind), ['text', 'styles']);
});

test('compactOps: cut_ok — האחרון גובר; para_break נשמר בסדרו (הדלקה/כיבוי)', () => {
  const ops = [
    { kind: 'cut_ok', page: 3, value: true },
    { kind: 'para_break', page: 3, ids: [1], value: { word: 1, on: true } },
    { kind: 'para_break', page: 3, ids: [1], value: { word: 1, on: false } },
    { kind: 'cut_ok', page: 3, value: true },
  ];
  assert.deepEqual(compactOps(doc(), ops).map((o) => o.kind), ['para_break', 'para_break', 'cut_ok']);
});

test('describeOp: הסוגים החדשים בעברית', () => {
  assert.equal(describeOp(doc(), { kind: 'para_break', page: 3, ids: [1], value: { word: 2, on: true } }), 'שורה 1: פסקה חדשה מהמילה 3');
  assert.match(describeOp(doc(), { kind: 'para_break', page: 3, ids: [1], value: { word: 2, on: false } }), /ביטול/);
  assert.match(describeOp(doc(), { kind: 'cut_ok', page: 3, value: true }), /חיתוך השורות/);
  const frames = [{ fid: 'a1b2c3', stream: 'main', bbox: [90, 90, 910, 200], order: 1 }];
  assert.equal(describeOp(doc(), { kind: 'frames_set', page: 3, value: { frames, confirmed: true } }), 'מסגרות: 1 (אושרו כמות-שהן)');
  assert.equal(describeOp(doc(), { kind: 'link_add', page: 3, ids: [3, 1] }), 'שורה 3, 1: קישור ידני');
  assert.equal(
    describeOp(doc(), { kind: 'link_add', page: 3, ids: [3, 1], value: { from_words: [0, 1], to_words: [2, 2], kind: 'dh' } }),
    'שורה 3, 1: קישור דיבור-המתחיל (מילים 1–2 ← מילה 3)'
  );
  assert.equal(describeOp(doc(), { kind: 'link_add', page: 3, ids: [3, 1], value: { kind: 'note' } }), 'שורה 3, 1: קישור הערה');
  assert.equal(describeOp(doc(), { kind: 'line_merge', page: 3, ids: [1, 2] }), 'שורה 1, 2: איחוד לשורה אחת');
});

// ---------- תיקוני הביקורת (2026-09-30) ----------

test('validateOp styles: טווח-מילים חסום (אצלם הוא נפרש לרשימה — טווח ענק היה מפיל את הקליטה)', () => {
  const st = (words) => ({ kind: 'styles', page: 3, ids: [1], value: { style: 'b', words, on: true } });
  assert.match(validateOp(doc(), st([0, 2000000000])), /טווח/);
  assert.match(validateOp(doc(), st([0, 1.5])), /טווח/);
  assert.equal(validateOp(doc(), st([0, 1000])), null);
});

test('validateOp: תיבת-שורה קטנה מ-8×6 נפסלת (כמו אצלם); מסגרת — בלי מינימום', () => {
  assert.match(validateOp(doc(), { kind: 'bbox', page: 3, ids: [1], value: [100, 100, 107, 140] }), /קטנה מדי/);
  assert.match(validateOp(doc(), { kind: 'line_add', page: 3, value: { bbox: [100, 100, 300, 105] } }), /קטנה מדי/);
  assert.equal(validateOp(doc(), { kind: 'bbox', page: 3, ids: [1], value: [100, 100, 108, 106] }), null);
  const tiny = { kind: 'frames_set', page: 3, value: { frames: [{ fid: 'a1b2c3', stream: 'main', bbox: [1, 1, 3, 3], order: 1 }] } };
  assert.equal(validateOp(doc(), tiny), null);
});

test('validateOp frames_set: עד 40 מסגרות (אצלם נחתך שם); manual — רק true', () => {
  const fr = (n) => Array.from({ length: n }, (_, i) => ({ fid: `f${String(i).padStart(5, '0')}`, stream: 'main', bbox: [10, 10 + i * 20, 900, 25 + i * 20], order: i + 1 }));
  assert.equal(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames: fr(40) } }), null);
  assert.match(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames: fr(41) } }), /יותר מדי/);
  assert.equal(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames: fr(1), manual: true } }), null);
  assert.match(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames: fr(1), manual: false } }), /פריסה/);
  assert.match(validateOp(doc(), { kind: 'frames_set', page: 3, value: { frames: fr(1), manual: 'yes' } }), /פריסה/);
});

test('sanitizeOp: רק השדות שהחוזה מכיר — שדות זרים ושדות-עורך יורדים', () => {
  const junk = 'x'.repeat(50);
  assert.deepEqual(sanitizeOp({ kind: 'text', page: 3, ids: [1], value: 'א', _g: 'g', extra: junk }), { kind: 'text', page: 3, ids: [1], value: 'א' });
  assert.deepEqual(sanitizeOp({ kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 1, 7], on: true, junk } }), {
    kind: 'styles',
    page: 3,
    ids: [1],
    value: { style: 'b', on: true, words: [0, 1] },
  });
  assert.deepEqual(sanitizeOp({ kind: 'line_ok', page: 3, ids: [1], value: { junk } }), { kind: 'line_ok', page: 3, ids: [1] });
  assert.deepEqual(sanitizeOp({ kind: 'frames_auto', page: 3, value: junk }), { kind: 'frames_auto', page: 3 });
  const fs = sanitizeOp({
    kind: 'frames_set',
    page: 3,
    value: { frames: [{ fid: 'a1b2c3', stream: 'main', bbox: [1, 2, 30, 40], order: 1, seq: 2, snap: true, junk }], confirmed: true, manual: true, snap: true },
  });
  assert.deepEqual(fs.value, { frames: [{ fid: 'a1b2c3', stream: 'main', order: 1, bbox: [1, 2, 30, 40] }], confirmed: true, manual: true });
  assert.deepEqual(sanitizeOp({ kind: 'link_add', page: 3, ids: [3, 1], value: { from_words: [0, 0], kind: 'note', junk } }).value, {
    kind: 'note',
    from_words: [0, 0],
  });
  assert.deepEqual(sanitizeOp({ kind: 'line_add', page: 3, value: { bbox: [1, 2, 30, 40], text: 'א', stream: 'main', junk } }).value, {
    text: 'א',
    stream: 'main',
    bbox: [1, 2, 30, 40],
  });
  assert.deepEqual(sanitizeOp({ kind: 'certainty', page: 3, ids: [1], value: { v: 'ambiguous', why: 'כי', junk } }).value, { v: 'ambiguous', why: 'כי' });
  // ערך לא-תקין נשאר לא-תקין (הבדיקה פוסלת), לא "מתוקן" בשקט
  assert.match(validateOp(doc(), sanitizeOp({ kind: 'styles', page: 3, ids: [1], value: 'b' })), /סגנון-תו/);
});

test('vocab: isStreamKey כמו is_stream אצלם — אין כותרת לשוליים/לריהוט; keepHeading', () => {
  assert.equal(isStreamKey('margin_heading'), false);
  assert.equal(isStreamKey('header_heading'), false);
  assert.equal(isStreamKey('notes3_heading'), true);
  assert.equal(isStreamKey('s_rashi_heading'), true);
  assert.equal(keepHeading('notes', 'main_heading'), 'notes_heading');
  assert.equal(keepHeading('notes', 'main'), 'notes');
  assert.equal(keepHeading('margin', 'main_heading'), 'margin');
  assert.equal(keepHeading('header', 'main_heading'), 'header');
  assert.equal(keepHeading('s_rashi', 'notes_heading'), 's_rashi_heading');
  assert.equal(keepHeading('main_heading', 'main_heading'), 'main_heading');
  assert.equal(keepHeading('s_x_heading', 'main_heading'), 's_x_heading');
});

// שורת-כותרת ושורת-גוף בתוך מסגרת
const headed = (frames = []) => ({
  contract: 1,
  page: 3,
  size: [1200, 1700],
  links: [],
  frames,
  lines: [
    line(1, [640, 130, 1100, 170], { stream: 'main_heading', stream_src: 'frame', text: 'פרק שני', words: [] }),
    line(2, [640, 180, 1100, 212], { stream: 'main', stream_src: 'frame', text: 'אמר רבי', words: [] }),
  ],
});

test('מסגרת אינה מוחקת כותרת: שורת-כותרת נשארת כותרת של זרם-המסגרת (_keep_heading)', () => {
  const f = (stream) => [{ fid: 'a1b2c3', stream, bbox: [630, 120, 1110, 220], order: 1, seq: 1 }];
  // עמוד שיובא עם מסגרות, בלי שום פעולה
  let v = buildView(headed(f('main')), []);
  assert.equal(v.lines.find((l) => l.id === 1).stream, 'main_heading');
  assert.equal(v.lines.find((l) => l.id === 2).stream, 'main');
  // מסגרת של זרם אחר — כותרת של הזרם החדש; שוליים (אין להם כותרת) — שוליים
  v = buildView(headed(f('notes')), []);
  assert.deepEqual(v.lines.map((l) => l.stream), ['notes_heading', 'notes']);
  v = buildView(headed(f('margin')), []);
  assert.deepEqual(v.lines.map((l) => l.stream), ['margin', 'margin']);
  // "✓ המסגרות נכונות" על עמוד בלי מסגרות — הכותרת נשארת
  const d = headed();
  d.lines.forEach((l) => (l.stream_src = 'auto'));
  v = buildView(d, [{ kind: 'frames_set', page: 3, value: { frames: f('main'), manual: true, confirmed: true } }]);
  assert.equal(v.lines.find((l) => l.id === 1).stream, 'main_heading');
  assert.equal(v.lines.find((l) => l.id === 1).stream_src, 'frame');
});

test('מסגרת בתוך מסגרת: הקטנה ביותר שמכילה את מרכז השורה קובעת (כמו _where אצלם)', () => {
  const d = doc();
  d.lines.push(line(4, [100, 205, 900, 240]));
  const frames = [
    { fid: 'big001', stream: 'main', bbox: [50, 50, 950, 1600], order: 1 },
    { fid: 'head01', stream: 'main_heading', bbox: [90, 90, 910, 145], order: 2 },
    { fid: 'note01', stream: 'notes', bbox: [90, 195, 910, 245], order: 3 },
  ];
  const v = buildView(d, [{ kind: 'frames_set', page: 3, value: { frames } }]);
  const s = Object.fromEntries(v.lines.map((l) => [l.id, l.stream]));
  assert.equal(s[1], 'main_heading');
  assert.equal(s[4], 'notes');
  assert.equal(s[2], 'main');
  // שורה שבולטת מעט אבל מרכזה בפנים — מקבלת את זרם-המסגרת (לתצוגה, כמו אצלם)
  const v2 = buildView(doc(), [{ kind: 'frames_set', page: 3, value: { frames: [{ fid: 'n00001', stream: 'notes', bbox: [120, 95, 880, 200], order: 1 }] } }]);
  assert.equal(v2.lines.find((l) => l.id === 1).stream, 'notes');
});

test('סדר-הקריאה לפי מסגרות שנערכו: תיקון סדר-המסגרות משנה את סדר הטקסט', () => {
  // המחשב קרא את הטור השמאלי קודם
  const d = {
    contract: 1,
    page: 3,
    size: [1000, 1000],
    frames: [],
    links: [],
    lines: [
      line(1, [100, 100, 480, 130], { order: 1, text: 'שמאל-1' }),
      line(2, [100, 140, 480, 170], { order: 2, text: 'שמאל-2' }),
      line(3, [520, 100, 900, 130], { order: 3, text: 'ימין-1' }),
      line(4, [520, 140, 900, 170], { order: 4, text: 'ימין-2' }),
    ],
  };
  assert.deepEqual(buildView(d, []).lines.map((l) => l.id), [1, 2, 3, 4]);
  const frames = [
    { fid: 'rrrrrr', stream: 'main', bbox: [510, 90, 910, 180], order: 1 },
    { fid: 'llllll', stream: 'main', bbox: [90, 90, 490, 180], order: 2 },
  ];
  const v = buildView(d, [{ kind: 'frames_set', page: 3, value: { frames, manual: true } }]);
  assert.deepEqual(v.lines.map((l) => l.id), [3, 4, 1, 2]);
  assert.deepEqual(v.lines.map((l) => l.order), [1, 2, 3, 4]);
  // מסגרת אחת דו-טורית — טור ימין ואז שמאל; שורה מחוץ למסגרות — בסוף
  d.lines.push(line(5, [100, 900, 900, 930], { order: 0, text: 'בחוץ' }));
  const one = [{ fid: 'oooooo', stream: 'main', bbox: [90, 90, 910, 180], order: 1 }];
  const v2 = buildView(d, [{ kind: 'frames_set', page: 3, value: { frames: one } }]);
  assert.deepEqual(v2.lines.map((l) => l.id), [3, 4, 1, 2, 5]);
  // מסגרות שיובאו עם העמוד (בלי עריכה כאן) — הסדר שיובא נשמר
  assert.deepEqual(buildView({ ...d, frames }, []).lines.map((l) => l.id), [5, 1, 2, 3, 4]);
});

test('compactOps: manual:true של העריכה הראשונה עובר ל-frames_set ששרד', () => {
  const frames = [{ fid: 'aaaa1111', stream: 'main', bbox: [510, 90, 910, 140], order: 1 }];
  const ops = [
    { kind: 'frames_set', page: 3, value: { frames, manual: true } },
    { kind: 'frame_seq', page: 3, value: { fid: 'aaaa1111', seq: 1 } },
    { kind: 'frames_set', page: 3, value: { frames: [{ ...frames[0], bbox: [500, 90, 910, 150] }] } },
  ];
  const out = compactOps(doc(), ops);
  assert.deepEqual(out.map((o) => o.kind), ['frame_seq', 'frames_set']);
  assert.equal(out[1].value.manual, true);
  assert.deepEqual(out[1].value.frames[0].bbox, [500, 90, 910, 150]);
  // בלי manual בכלל — לא נוסף
  assert.equal(compactOps(doc(), [ops[2]])[0].value.manual, undefined);
});

test('applyOp text: הקלדה שבוטלה (הטקסט חזר לזה שיובא) — השורה אינה "תוקנה"', () => {
  const v = buildView(doc(), [{ kind: 'text', page: 3, ids: [1], value: 'שורה 1' }]);
  assert.equal(v.lines[0]._textEdited, false);
  const v2 = buildView(doc(), [{ kind: 'text', page: 3, ids: [1], value: 'שורה X' }]);
  assert.equal(v2.lines[0]._textEdited, true);
  const v3 = buildView(doc(), [
    { kind: 'text', page: 3, ids: [1], value: 'שורה X' },
    { kind: 'text', page: 3, ids: [1], value: 'שורה 1' },
  ]);
  assert.equal(v3.lines[0]._textEdited, false);
});

// ---------- הסדר לתוכנת-הספר ----------

const wline = (id, text, extra = {}) =>
  line(id, [100, id * 50, 900, id * 50 + 40], { text: null, text_ocr: text, words: text.split(' ').map((t) => ({ text: t, styles: [] })), ...extra });
const wdoc = () => ({ contract: 1, page: 3, size: [1000, 2000], frames: [], links: [], lines: [wline(5, 'אב גד הו זח'), wline(6, 'הערה על זה', { stream: 'notes' })] });
const styled = (v, id) =>
  v.lines
    .find((l) => l.id === id)
    .words.map((w, i) => (w.styles?.length ? `${i}:${w.text}:${w.styles.slice().sort().join('')}` : null))
    .filter(Boolean);
const sameView = (d, a, b) => {
  const pick = (v) =>
    v.lines
      .map((l) => ({ id: l.id, text: l.text ?? l.text_ocr, st: styled(v, l.id), br: l.para_breaks || [], ps: !!l.para_start }))
      .concat((v.links || []).map((k) => ({ link: [k.from_line, k.to_line, k.from_words || null, k.to_words || null] })));
  assert.deepEqual(pick(buildView(d, b)), pick(buildView(d, a)));
};

test('bookOrder: פעולות-מילים שלפני תיקון-טקסט — הטקסט הסופי קודם, והמספרים מתורגמים אליו', () => {
  const ops = [
    { kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [3, 3], on: true } },
    { kind: 'para_break', page: 3, ids: [5], value: { word: 2, on: true } },
    { kind: 'text', page: 3, ids: [5], value: 'א ב גד הו זח' },
  ];
  const out = bookOrder(wdoc(), compactOps(wdoc(), ops));
  assert.deepEqual(out, [
    { kind: 'text', page: 3, ids: [5], value: 'א ב גד הו זח' },
    { kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [4, 4], on: true } },
    { kind: 'para_break', page: 3, ids: [5], value: { word: 3, on: true } },
  ]);
  // אצלם (מספרים בלי יישור, לפי הסדר) = מה שהמתנדב ראה
  const finalWords = 'א ב גד הו זח'.split(' ');
  assert.equal(finalWords[out[1].value.words[0]], 'זח');
  assert.equal(finalWords[out[2].value.word], 'הו');
  sameView(wdoc(), ops, out);
});

test('bookOrder: כמה תיקונים לאותה שורה — רק הסופי; גבול שעבר לתחילה = para_start; מילה שנמחקה — הסגנון יורד', () => {
  const ops = [
    { kind: 'text', page: 3, ids: [5], value: 'אב גד הו זח טי' },
    { kind: 'styles', page: 3, ids: [5], value: { style: 'i', words: [1, 1], on: true } },
    { kind: 'para_break', page: 3, ids: [5], value: { word: 1, on: true } },
    { kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [0, 0], on: true } },
    { kind: 'text', page: 3, ids: [5], value: 'גד הו זח טי' },
  ];
  const out = bookOrder(wdoc(), compactOps(wdoc(), ops));
  assert.deepEqual(out.map((o) => o.kind), ['text', 'styles', 'para_start']);
  assert.equal(out[0].value, 'גד הו זח טי');
  assert.deepEqual(out[1].value.words, [0, 0]);
  sameView(wdoc(), ops, out);
  // הטקסט חזר בסוף לזה שיובא — אין פעולת-טקסט, והמספרים של הטקסט המקורי
  const back = [
    { kind: 'text', page: 3, ids: [5], value: 'אב זח' },
    { kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [1, 1], on: true } },
    { kind: 'text', page: 3, ids: [5], value: 'אב גד הו זח' },
  ];
  const out2 = bookOrder(wdoc(), compactOps(wdoc(), back));
  assert.deepEqual(out2, [{ kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [3, 3], on: true } }]);
  sameView(wdoc(), back, out2);
});

test('bookOrder: קישור ברמת-מילה — הטווחים בשתי השורות מתורגמים; שורות עם פעולות-חיתוך — בלי שינוי', () => {
  const ops = [
    { kind: 'link_add', page: 3, ids: [6, 5], value: { from_words: [0, 0], to_words: [3, 3], kind: 'note' } },
    { kind: 'text', page: 3, ids: [5], value: 'פתח אב גד הו זח' },
    { kind: 'text', page: 3, ids: [6], value: 'ההערה על זה' },
  ];
  const out = bookOrder(wdoc(), ops);
  assert.deepEqual(out.map((o) => o.kind), ['text', 'text', 'link_add']);
  assert.deepEqual(out[2].value, { from_words: [0, 0], to_words: [4, 4], kind: 'note' });
  sameView(wdoc(), ops, out);
  const cut = [
    { kind: 'styles', page: 3, ids: [5], value: { style: 'b', words: [3, 3], on: true } },
    { kind: 'text', page: 3, ids: [5], value: 'א ב גד הו זח' },
    { kind: 'bbox', page: 3, ids: [5], value: [100, 250, 900, 292] },
  ];
  assert.deepEqual(bookOrder(wdoc(), cut), cut);
});

test('packOps: אקראי — התצוגה של הרשימה הארוזה זהה לזו של המקורית (טקסט, סגנונות, פסקאות, קישורים)', () => {
  const vocab = ['אב', 'גד', 'הו', 'זח', 'טי', 'כל', 'מן', 'סע', 'פצ', 'קר'];
  for (let seedBase = 1; seedBase <= 4; seedBase++) {
    let seed = seedBase * 7919;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let trial = 0; trial < 150; trial++) {
      const d = wdoc();
      d.lines.push(wline(7, 'שלוש ארבע חמש שש'));
      if (rnd(2)) d.lines[0].para_breaks = [2];
      const texts = { 5: 'אב גד הו זח', 6: 'הערה על זה', 7: 'שלוש ארבע חמש שש' };
      const ops = [];
      const nOps = 3 + rnd(12);
      for (let k = 0; k < nOps; k++) {
        const id = [5, 6, 7][rnd(3)];
        const n = texts[id].split(' ').length;
        const r = rnd(6);
        if (r === 0 || r === 5) {
          const words = texts[id].split(' ');
          const m = rnd(3);
          if (m === 0) words.splice(rnd(words.length + 1), 0, vocab[rnd(vocab.length)]);
          else if (m === 1 && words.length > 1) words.splice(rnd(words.length), 1);
          else words[rnd(words.length)] = vocab[rnd(vocab.length)];
          texts[id] = words.join(' ');
          ops.push({ kind: 'text', page: 3, ids: [id], value: texts[id] });
        } else if (r === 1) {
          const a = rnd(n);
          ops.push({ kind: 'styles', page: 3, ids: [id], value: { style: ['b', 'i', 'big'][rnd(3)], words: [a, Math.min(n - 1, a + rnd(3))], on: rnd(4) > 0 } });
        } else if (r === 2 && n > 1) {
          ops.push({ kind: 'para_break', page: 3, ids: [id], value: { word: 1 + rnd(n - 1), on: rnd(3) > 0 } });
        } else if (r === 3) {
          const m = texts[6].split(' ').length;
          const t = texts[5].split(' ').length;
          const fw = [rnd(m), rnd(m)].sort((x, y) => x - y);
          const tw = [rnd(t), rnd(t)].sort((x, y) => x - y);
          ops.push({ kind: 'link_add', page: 3, ids: [6, 5], value: { from_words: fw, to_words: tw, kind: 'note' } });
        } else if (r === 4) {
          ops.push({ kind: 'line_ok', page: 3, ids: [id] });
        }
      }
      const packed = packOps(d, ops);
      if (packed.length) assert.equal(validateOps(d, packed), null, JSON.stringify(ops));
      sameView(d, ops, packed);
    }
  }
});

test('mergeLineOk: אישורי-השורות מאוחדים בסוף (עד 500 בפעולה); שורה שנחתכת מחדש — בלי אישור', () => {
  const ok = (ids) => ({ kind: 'line_ok', page: 3, ids });
  const ops = [ok([1]), { kind: 'text', page: 3, ids: [2], value: 'חדש' }, ok([2]), ok([1, 3]), { kind: 'bbox', page: 3, ids: [3], value: [100, 1500, 900, 1535] }];
  assert.deepEqual(mergeLineOk(doc(), ops), [ops[1], ops[4], ok([1, 2])]);
  const many = Array.from({ length: 1203 }, (_, i) => ok([i + 1]));
  const d = { ...doc(), lines: Array.from({ length: 1203 }, (_, i) => line(i + 1, [100, 10, 900, 40])) };
  const out = mergeLineOk(d, many);
  assert.deepEqual(out.map((o) => o.ids.length), [500, 500, 203]);
  assert.equal(validateOps(d, out), null);
  assert.deepEqual(mergeLineOk(doc(), [ops[1]]), [ops[1]]);
});

test('packOps: 62 שורות שאושרו פסקה-פסקה ← פעולת line_ok אחת (ספר של 92 עמודים נשאר מתחת לתקרה אצלם)', () => {
  const d = { ...doc(), lines: Array.from({ length: 62 }, (_, i) => line(i + 1, [100, 10 + i * 30, 900, 35 + i * 30])) };
  const ops = Array.from({ length: 62 }, (_, i) => ({ kind: 'line_ok', page: 3, ids: [i + 1] }));
  const packed = packOps(d, [...ops, { kind: 'text', page: 3, ids: [5], value: 'x' }]);
  assert.deepEqual(packed.map((o) => o.kind), ['text', 'line_ok']);
  assert.equal(packed[1].ids.length, 62);
});

// ---------- קישור לעמוד אחר ----------

// בעמוד 3: שורה 1 (גוף), 3 (הערות). 77 — שורה בעמוד 4, 55 — שורה בעמוד 2 (לא בעמוד הזה)
const cross = (ids, value) => ({ kind: 'link_add', page: 3, ids, value: { from_words: [0, 0], to_words: [1, 1], kind: 'note', ...value } });
const toFar = (extra = {}) => cross([3, 77], { to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', ...extra });
const fromFar = (extra = {}) => cross([55, 1], { from_page: 2, from_line_no: 20, from_text: 'ג והנה יש לומר', ...extra });

test('validateOp: קישור לעמוד אחר — מזהה זר אחד, רק כשהעמוד שלו מוצהר', () => {
  assert.equal(validateOp(doc(), toFar()), null);
  assert.equal(validateOp(doc(), fromFar()), null);
  // בלי הצהרה על העמוד (או הצהרה לצד השני) — סתם שורה שאינה כאן
  assert.equal(validateOp(doc(), cross([3, 77], {})), 'שורה שאינה בעמוד הזה');
  assert.equal(validateOp(doc(), cross([3, 77], { from_page: 4 })), 'שורה שאינה בעמוד הזה');
  // העמוד המוצהר: שלם, חיובי ולא העמוד הזה
  for (const to_page of [3, 0, -2, 4.5, '4', true]) assert.equal(validateOp(doc(), toFar({ to_page })), 'עמוד הקישור שגוי', String(to_page));
  // שני הצדדים זרים, מזהה זמני/שלילי, או מזהה שאינו מספר
  assert.equal(validateOp(doc(), cross([55, 77], { from_page: 2, to_page: 4 })), 'שורה שאינה בעמוד הזה');
  assert.equal(validateOp(doc(), cross([3, -5], { to_page: 4 })), 'שורה שאינה בעמוד הזה');
  assert.equal(validateOp(doc(), cross([3, '77'], { to_page: 4 })), 'שורה שאינה בעמוד הזה');
  // עמוד אחר מוצהר לצד שבעמוד הזה — לא תקין; העמוד הזה עצמו — מותר
  assert.equal(validateOp(doc(), cross([3, 1], { to_page: 4 })), 'קישור לעמוד אחר — רק אחד משני הצדדים יכול להיות בעמוד אחר');
  assert.equal(validateOp(doc(), toFar({ from_page: 2 })), 'קישור לעמוד אחר — רק אחד משני הצדדים יכול להיות בעמוד אחר');
  assert.equal(validateOp(doc(), cross([3, 1], { to_page: 3 })), null);
  // מספר-השורה והטקסט של הצד הזר
  assert.equal(validateOp(doc(), toFar({ to_line_no: -1 })), 'מספר-השורה בעמוד האחר לא תקין');
  assert.equal(validateOp(doc(), toFar({ to_line_no: 'x' })), 'מספר-השורה בעמוד האחר לא תקין');
  assert.equal(validateOp(doc(), toFar({ to_text: 5 })), 'הטקסט של השורה בעמוד האחר לא תקין');
  assert.equal(validateOp(doc(), toFar({ to_text: 'א'.repeat(MAX_FAR_TEXT + 1) })), 'הטקסט של השורה בעמוד האחר לא תקין');
  assert.equal(validateOp(doc(), toFar({ to_line_no: null, to_text: null })), null);
  // שאר הבדיקות של link_add עדיין חלות
  assert.equal(validateOp(doc(), toFar({ to_words: [3, 1] })), 'טווח-המילים בצד הגוף לא תקין');
  assert.equal(validateOp(doc(), toFar({ kind: 'x' })), 'סוג-קישור לא מוכר: x');
});

test('validateOp: כל פעולה אחרת — "שורה שאינה בעמוד הזה" גם עם הצהרה על עמוד', () => {
  assert.equal(validateOp(doc(), { kind: 'text', page: 3, ids: [77], value: 'x' }), 'שורה שאינה בעמוד הזה');
  assert.equal(validateOp(doc(), { kind: 'stream', page: 3, ids: [1, 77], value: 'main' }), 'שורה שאינה בעמוד הזה');
  assert.equal(validateOp(doc(), { kind: 'styles', page: 3, ids: [77], value: { style: 'b', words: [0, 0], on: true, to_page: 4 } }), 'שורה שאינה בעמוד הזה');
  // אישור/ביטול של קישור — רק מהעמוד של הפירוש
  assert.equal(validateOp(doc(), { kind: 'link_del', page: 3, value: { src_line: 55, page: 3 } }), 'שורת-המקור של הקישור חסרה');
  assert.equal(validateOps(doc(), [toFar(), fromFar(), { kind: 'text', page: 3, ids: [1], value: 'x' }]), null);
});

test('sanitizeOp: שדות הצד שבעמוד האחר נשמרים, זבל יורד', () => {
  assert.deepEqual(sanitizeOp({ ...toFar({ junk: 1 }), _g: 'g1' }), {
    kind: 'link_add',
    page: 3,
    ids: [3, 77],
    value: { kind: 'note', to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', from_words: [0, 0], to_words: [1, 1] },
  });
  assert.deepEqual(sanitizeOp(fromFar()).value, { kind: 'note', from_page: 2, from_line_no: 20, from_text: 'ג והנה יש לומר', from_words: [0, 0], to_words: [1, 1] });
});

test('farLinkSide: הצד הזר לפי ההצהרה (גם כשהשורה המקומית כבר לא בעמוד — אחרי פיצול)', () => {
  assert.deepEqual(farLinkSide(3, toFar().value), { side: 'to', index: 1, page: 4, lineNo: 11, text: 'ב ועוד נראה' });
  assert.deepEqual(farLinkSide(3, fromFar().value), { side: 'from', index: 0, page: 2, lineNo: 20, text: 'ג והנה יש לומר' });
  assert.equal(farLinkSide(3, { to_page: 3 }), null);
  assert.equal(farLinkSide(3, null), null);
});

test('applyOp link_add לעמוד אחר: הקישור נושא עמוד, שורה ותחילת-טקסט — כמו בחוזה-העמוד', () => {
  const d = applyOp(doc(), toFar());
  assert.deepEqual(d.links, [
    {
      from_line: 3,
      from_mark: null,
      to_line: 77,
      to_page: 4,
      to_line_no: 11,
      to_text: 'ב ועוד נראה',
      kind: 'note',
      conf: 1,
      src: 'human',
      suspect: null,
      _added: true,
      from_words: [0, 0],
      to_words: [1, 1],
    },
  ]);
  const f = applyOp(doc(), fromFar()).links[0];
  assert.deepEqual([f.from_line, f.from_page, f.from_line_no, f.from_text, f.to_line, f.to_page], [55, 2, 20, 'ג והנה יש לומר', 1, 3]);
  // קישור חדש מאותה שורת-פירוש (גם זרה) מחליף את הקודם
  assert.deepEqual(applyOp(applyOp(doc(), fromFar()), cross([55, 2], { from_page: 2 })).links.map((k) => k.to_line), [2]);
});

test('קישור לעמוד אחר עובר את כל הדרך להגשה: יישור-המילים של הצד המקומי, דחיסה, פיצול של שורה אחרת', () => {
  const d = doc();
  // הקישור נקבע על "שורה 3" (מילה 1 = "3"), ואחר כך נוספה מילה בתחילת השורה
  const ops = [
    { kind: 'line_split', page: 3, ids: [2], value: { x: 500 } },
    cross([3, 77], { from_words: [1, 1], to_words: [0, 2], to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה' }),
    { kind: 'text', page: 3, ids: [3], value: 'מילה שורה 3' },
  ];
  const packed = packOps(d, ops);
  assert.equal(validateOps(d, packed), null);
  const link = packed.find((o) => o.kind === 'link_add');
  assert.deepEqual(link.ids, [3, 77]);
  assert.deepEqual(link.value, { from_words: [2, 2], to_words: [0, 2], kind: 'note', to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה' });
  // הטקסט הסופי לפני הקישור (המספרים שלו מתייחסים אליו), הפיצול נשאר
  assert.deepEqual(packed.map((o) => o.kind), ['line_split', 'text', 'link_add']);
  // בתצוגה: הקישור עם הצד הזר, והמילה המקומית זזה עם הטקסט
  const v = buildView(d, ops);
  assert.deepEqual([v.links[0].to_page, v.links[0].to_line, v.links[0].from_words], [4, 77, [2, 2]]);
  // דחיסה בלבד — אין מה לדחוס בקישור, והמזהה הזר לא נוגע
  assert.deepEqual(compactOps(d, [toFar(), toFar()]).map((o) => o.ids), [[3, 77], [3, 77]]);
});

test('foreignLinkRefs / withForeignLines: מה השרת בודק, ומה הוא ממלא מהעמוד השמור', () => {
  const ops = [toFar({ to_line_no: 99, to_text: 'מה שהדפדפן שלח' }), { kind: 'text', page: 3, ids: [1], value: 'x' }, fromFar(), cross([3, 1], {})];
  const refs = foreignLinkRefs(doc(), ops);
  assert.deepEqual(
    refs.map(({ i, index, id, side, page }) => [i, index, id, side, page]),
    [
      [0, 1, 77, 'to', 4],
      [2, 0, 55, 'from', 2],
    ]
  );
  const long = '  ב ועוד נראה ' + 'א'.repeat(100);
  const found = new Map([['4:77', { id: 77, line_no: 11, text: long }]]);
  const out = withForeignLines(doc(), ops, found);
  assert.deepEqual([out[0].value.to_line_no, out[0].value.to_text.length, out[0].value.to_text.startsWith('ב ועוד')], [11, FAR_TEXT_SENT, true]);
  // שאר הפעולות — אותם אובייקטים
  assert.equal(out[1], ops[1]);
  assert.equal(out[2], ops[2]);
  assert.deepEqual(withForeignLines(doc(), [ops[1]], found), [ops[1]]);
});

test('describeOp: קישור לעמוד אחר — העמוד, השורה ותחילת הטקסט של הצד השני', () => {
  assert.equal(describeOp(doc(), toFar()), 'שורה 3 ← עמוד 4, שורה 12 «ב ועוד נראה»: קישור הערה (מילה 1 ← מילה 2)');
  assert.equal(describeOp(doc(), fromFar({ kind: 'dh' })), 'עמוד 2, שורה 21 «ג והנה יש לומר» ← שורה 1: קישור דיבור-המתחיל (מילה 1 ← מילה 2)');
});

// ---------- "לספר בלבד" (train_text, 2026-10-02) ----------

test('train_text: תצוגה, דחיסה (האחרונה קובעת), תיאור וצורת-החוזה', () => {
  const d = doc();
  const ops = [
    { kind: 'train_text', page: 3, ids: [1], value: 0 },
    { kind: 'train_text', page: 3, ids: [1], value: 1 },
    { kind: 'train_text', page: 3, ids: [2], value: 0 },
  ];
  const v = buildView(d, ops);
  assert.deepEqual(v.lines.map((l) => l.train_text), [1, 0, undefined]);
  assert.deepEqual(compactOps(d, ops).map((o) => [o.ids[0], o.value]), [[1, 1], [2, 0]]);
  assert.equal(describeOp(d, ops[0]), 'שורה 1: פגם בדפוס — נכנס לספר, לא לאימון');
  assert.equal(describeOp(d, ops[1]), 'שורה 1: חזרה לאימון (בלי "פגם בדפוס")');
  assert.deepEqual(sanitizeOp({ ...ops[0], _cmp: true, _g: 'g' }), { kind: 'train_text', page: 3, ids: [1], value: 0 });
  assert.equal(OP_KINDS.train_text.contract, true);
});

test('withBookOnly: תיקון-טקסט בשורה מקורית שעוד לא סומנה ← סימון נלווה לפניו; בלי שינוי / שורה מסומנת / שורה חדשה — בלי', () => {
  const d = doc();
  const v = buildView(d, [{ kind: 'train_text', page: 3, ids: [2], value: 0 }]);
  const t1 = { kind: 'text', page: 3, ids: [1], value: 'שורה אחת' };
  const opts = { coalesceKey: 'text:1' };
  const out = withBookOnly([t1, opts], v, 3);
  assert.deepEqual(out, [{ kind: 'train_text', page: 3, ids: [1], value: 0, _cmp: true }, t1, opts]);
  // כבר מסומנת (בתצוגה) / הטקסט לא השתנה / לא תיקון-טקסט / שורה זמנית
  assert.equal(withBookOnly([{ kind: 'text', page: 3, ids: [2], value: 'אחר' }], v, 3).length, 1);
  assert.equal(withBookOnly([{ kind: 'text', page: 3, ids: [1], value: 'שורה 1' }], v, 3).length, 1);
  assert.equal(withBookOnly([{ kind: 'line_ok', page: 3, ids: [1] }], v, 3).length, 1);
  assert.equal(withBookOnly([{ kind: 'text', page: 3, ids: [-5], value: 'x' }], v, 3).length, 1);
  // כמה שורות בבת אחת (תוכנית של העורך) — סימון לכל אחת, פעם אחת
  const two = withBookOnly([t1, { kind: 'text', page: 3, ids: [3], value: 'ג' }, { ...t1, value: 'עוד' }], v, 3);
  assert.deepEqual(two.filter((o) => o.kind === 'train_text').map((o) => o.ids[0]), [1, 3]);
});

test('dropIdleBookOnly: סימון אוטומטי על שורה שחזרה לטקסט המקורי יורד; ידני — נשאר', () => {
  const d = doc();
  const ops = [
    { kind: 'train_text', page: 3, ids: [1], value: 0, _cmp: true },
    { kind: 'text', page: 3, ids: [1], value: 'שורה אחת' },
    { kind: 'text', page: 3, ids: [1], value: 'שורה 1' },
    { kind: 'train_text', page: 3, ids: [2], value: 0, _cmp: true },
    { kind: 'text', page: 3, ids: [2], value: 'שורה שתיים' },
    { kind: 'train_text', page: 3, ids: [3], value: 0 },
  ];
  const out = dropIdleBookOnly(d, ops);
  assert.deepEqual(out.filter((o) => o.kind === 'train_text').map((o) => o.ids[0]), [2, 3]);
  assert.deepEqual(bookOnlyLineIds(out), [2, 3]);
  assert.deepEqual(bookOnlyLineIds([...out, { kind: 'train_text', page: 3, ids: [3], value: 1 }]), [2]);
  const manualOnly = [ops[5]];
  assert.equal(dropIdleBookOnly(d, manualOnly), manualOnly, 'בלי סימון אוטומטי — אותה רשימה');
});

// הנוסח הישן של "לספר בלבד" — הכפתור "פגם בדפוס" (#186): ודאות "לא בטוח" עם הסיבה הקבועה. אין לו עוד כפתור,
// אבל סימונים שכבר נעשו (טיוטות והגשות) נקראים, נספרים ומתוארים כ"לספר בלבד"
test('"פגם בדפוס" בנוסח הישן (ודאות "פגם בדפוס"): נקרא, נספר ומתואר כ"פגם בדפוס"; ודאות אחרת מבטלת אותו', () => {
  const d = doc();
  const legacy = { kind: 'certainty', page: 3, ids: [1], value: { v: 'ambiguous', why: PRINT_DEFECT_WHY } };
  assert.equal(isPrintDefectOp(legacy), true);
  assert.equal(isPrintDefectOp({ ...legacy, value: { v: 'ambiguous', why: 'לא ברור מה כתוב' } }), false);
  assert.equal(isPrintDefectOp({ ...legacy, kind: 'train_text', value: 0 }), false);
  assert.equal(isBookOnly(buildView(d, [legacy]).lines.find((l) => l.id === 1)), true);
  assert.equal(describeOp(d, legacy), 'שורה 1: פגם בדפוס — נכנס לספר, לא לאימון');
  assert.equal(describeOp(d, { ...legacy, value: { v: 'ambiguous', why: 'לא ברור' } }), 'שורה 1: לא בטוח — לא ברור');
  // נספר בחלון ההגשה ובסקירה, גם לצד train_text; ודאות אחרת אחריו (הסרת הסימון) — כבר לא
  assert.deepEqual(bookOnlyLineIds([legacy]), [1]);
  assert.deepEqual(bookOnlyLineIds([legacy, { kind: 'train_text', page: 3, ids: [2], value: 0 }]), [1, 2]);
  const off = [legacy, { kind: 'train_text', page: 3, ids: [1], value: 1 }, { kind: 'certainty', page: 3, ids: [1], value: { v: 'probable', why: null } }];
  assert.deepEqual(bookOnlyLineIds(off), []);
  assert.equal(isBookOnly(buildView(d, off).lines.find((l) => l.id === 1)), false);
  // ודאות אחרת שבאה עם train_text = 0 (העורך מעביר את הסימון) — עדיין "לספר בלבד"
  const moved = [legacy, { kind: 'certainty', page: 3, ids: [1], value: { v: 'certain', why: null } }, { kind: 'train_text', page: 3, ids: [1], value: 0 }];
  assert.deepEqual(bookOnlyLineIds(moved), [1]);
  // מצב "לספר בלבד" אינו מסמן שוב שורה שכבר מסומנת בנוסח הישן
  const v = buildView(d, [legacy]);
  assert.equal(withBookOnly([{ kind: 'text', page: 3, ids: [1], value: 'אחר' }], v, 3).length, 1);
});

// ריהוט (כותרת עמוד, תחתית, מפריד) אינו נכנס לספר — "לספר בלבד" אינו מסמן אותו (כמו הכפתור הישן, שהיה כבוי שם)
test('withBookOnly: תיקון-טקסט בריהוט — בלי סימון; ריהוט שמתנדב העביר לזרם של טקסט — כן', () => {
  const d = { ...doc(), lines: [...doc().lines, line(4, [400, 20, 600, 50], { stream: 'header', text: '12', text_ocr: '12' })] };
  const v = buildView(d, []);
  assert.equal(withBookOnly([{ kind: 'text', page: 3, ids: [4], value: '123' }], v, 3).length, 1);
  const v2 = buildView(d, [{ kind: 'stream', page: 3, ids: [4], value: 'main' }]);
  assert.deepEqual(withBookOnly([{ kind: 'text', page: 3, ids: [4], value: '123' }], v2, 3).map((o) => o.kind), ['train_text', 'text']);
});
