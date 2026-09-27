import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOp, validateOps, applyOp, buildView, compactOps, snapFrame, autoFrames, describeOp } from './ops.js';

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
