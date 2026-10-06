import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  pageSize,
  clampZoom,
  zoomStep,
  fitZoom,
  clientToImage,
  isDrag,
  zoomAnchorScroll,
  defaultZoomAnchor,
  normBox,
  clampBox,
  boxOk,
  MIN_LINE_BOX,
  lineBoxOk,
  moveBoxWithin,
  resizeBoxCorner,
  resizeOk,
  cornerPoint,
  CORNERS,
  EDGES,
  HANDLES,
  handleRects,
  frameBase,
  isObjectFrame,
  headingStream,
  byOrder,
  renumber,
  seqInStream,
  streamFrameCount,
  reorderInStream,
  moveInOrder,
  removeFrame,
  patchFrame,
  readsBefore,
  insertIndex,
  insertFrame,
  stableFid,
  suggestedFrames,
  framesState,
  frameForOp,
  framesSetOp,
  frameSeqOps,
  frameEditOps,
  frameLabel,
  frameOfLine,
  streamChips,
  FURNITURE_CHOICE,
  NOTES_RUNHEAD_CHOICE,
  furnitureMarks,
  detectedStream,
  furnitureLabelAnchor,
  streamLabel,
  choiceInfo,
  furnitureStreamFor,
  resolveFrameStream,
  drawStreamFor,
  nearestLine,
  wordAtPoint,
  selectionInfo,
  toggleSelection,
  outsideLineIds,
  recutSet,
  caretMarker,
  scrollToReveal,
  revealLeft,
  alignScroll,
  wordBoxOf,
  POPOVER_CLEAR,
  popoverBeside,
  badgeAnchor,
  straddleClaim,
} from './scanGeometry.js';
import { validateOp, buildView, FRAME_PAD } from './ops.js';
import { FURNITURE_TAB, FURNITURE_TAB_HE } from './textModel.js';

const L = (id, bbox, stream = 'main', extra = {}) => ({
  id,
  line_no: id - 1,
  order: id,
  bbox,
  text: `שורה ${id}`,
  text_ocr: `שורה ${id}`,
  status: 'pending',
  stream,
  stream_src: 'auto',
  words: [],
  ...extra,
});

// עמוד דו-טורי בזרם הראשי — הטור השמאלי מתחיל גבוה מהימני (כותרת-משנה
// מעל הימני) — והערות על כל הרוחב בתחתית
const twoCols = () => ({
  contract: 1,
  page: 7,
  size: [1000, 2000],
  frames: [],
  links: [],
  streams: [{ key: 'main', he: 'ראשי', color: '#1a56db' }, { key: 'notes', he: 'הערות', color: '#0e7f3c' }],
  stream_vocab: [
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
    { key: 'notes2', he: "הערות ב'", color: '#7c3aed' },
    { key: 'header', he: 'כותרת עמוד', color: '#9ca3af' },
  ],
  lines: [
    L(1, [520, 300, 900, 340]),
    L(2, [520, 350, 900, 390]),
    L(3, [100, 200, 480, 240]),
    L(4, [100, 250, 480, 290]),
    L(5, [100, 1500, 900, 1540], 'notes'),
    L(6, [400, 40, 600, 70], 'header'),
  ],
});

const F = (fid, stream, bbox, order, extra = {}) => ({ fid, stream, bbox, order, ...extra });

// ---------- זום וקואורדינטות ----------

test('clampZoom / zoomStep / fitZoom', () => {
  assert.equal(clampZoom(0.001), MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom('x'), 1);
  assert.equal(clampZoom(-2), 1);
  assert.equal(zoomStep(1, 1), 1.25);
  assert.equal(zoomStep(1, -1), 0.8);
  assert.equal(zoomStep(MAX_ZOOM, 1), MAX_ZOOM);
  // בלי זחילה של שברים אחרי כמה צעדים
  assert.equal(zoomStep(zoomStep(zoomStep(1.048576, 1), 1), -1), 1.3107);
  assert.equal(fitZoom(520, 1000), 0.5);
  assert.equal(fitZoom(0, 1000), MIN_ZOOM);
  assert.equal(fitZoom(500, 0), 1);
  assert.deepEqual(pageSize({ size: [800, 1200] }), [800, 1200]);
  assert.deepEqual(pageSize({}), [1000, 1400]);
});

test('clientToImage: לפי מלבן ה-SVG, ובלעדיו לפי הזום', () => {
  const rect = { left: 10, top: 20, width: 500, height: 1000 };
  assert.deepEqual(clientToImage({ clientX: 260, clientY: 520 }, rect, 1000, 2000, 0.5), [500, 1000]);
  assert.deepEqual(clientToImage({ clientX: 50, clientY: 30 }, { left: 0, top: 0, width: 0, height: 0 }, 1000, 2000, 0.5), [100, 60]);
});

test('isDrag: סף בפיקסלי-מסך', () => {
  assert.equal(isDrag([0, 0], [3, 3]), false);
  assert.equal(isDrag([0, 0], [4, 4]), true);
  assert.equal(isDrag([0, 0], [0, 9], 10), false);
});

test('zoomAnchorScroll: הנקודה נשארת מתחת לעכבר', () => {
  assert.deepEqual(zoomAnchorScroll({ img: [400, 600], view: [100, 50] }, 0.5), { left: 100, top: 250 });
  assert.deepEqual(zoomAnchorScroll({ img: [10, 10], view: [100, 100] }, 1), { left: 0, top: 0 });
});

test('defaultZoomAnchor: בתחילת הדף — ימין-למעלה; אחרת — מרכז החלון', () => {
  const a = defaultZoomAnchor({ left: 0, top: 0, width: 400, height: 300 }, 0.5);
  assert.deepEqual(a, { img: [800, 0], view: [400, 0] });
  // הגדלה פי 2 מהתאמה-לרוחב: הצד הימני של הדף נשאר בחלון, והדף לא נגלל למטה
  assert.deepEqual(zoomAnchorScroll(a, 1), { left: 400, top: 0 });
  const b = defaultZoomAnchor({ left: 100, top: 200, width: 400, height: 300 }, 1);
  assert.deepEqual(b, { img: [300, 350], view: [200, 150] });
});

// ---------- תיבות ----------

test('normBox / clampBox / boxOk', () => {
  assert.deepEqual(normBox([10, 20], [0, 5]), [0, 5, 10, 20]);
  assert.deepEqual(clampBox([-5.4, 10.6, 1200, 30], 1000, 2000), [0, 11, 1000, 30]);
  assert.deepEqual(clampBox([50, 60, 10, 20], 1000, 2000), [10, 20, 50, 60]);
  assert.equal(clampBox(null, 10, 10), null);
  assert.equal(boxOk([0, 0, 8, 8], 8), true);
  assert.equal(boxOk([0, 0, 7, 20], 8), false);
  assert.equal(boxOk([0, 0, NaN, 1]), false);
});

test('lineBoxOk: לפחות 8×6 פיקסלי-תמונה, כמו בתוכנת-הספר', () => {
  assert.deepEqual(MIN_LINE_BOX, [8, 6]);
  assert.equal(lineBoxOk([10, 10, 18, 16]), true);
  assert.equal(lineBoxOk([10, 10, 17, 40]), false);
  assert.equal(lineBoxOk([10, 10, 400, 15]), false);
  assert.equal(lineBoxOk(null), false);
});

test('moveBoxWithin: הגודל נשמר והתיבה לא יוצאת מהתמונה', () => {
  assert.deepEqual(moveBoxWithin([100, 100, 200, 150], [30, -20], 1000, 2000), [130, 80, 230, 130]);
  assert.deepEqual(moveBoxWithin([100, 100, 200, 150], [950, -500], 1000, 2000), [900, 0, 1000, 50]);
});

test('resizeBoxCorner: כל פינה מזיזה את שתי הצלעות שלה; היפוך מנורמל', () => {
  const b = [100, 100, 300, 200];
  assert.deepEqual(resizeBoxCorner(b, 'se', [50, 20], 1000, 2000), [100, 100, 350, 220]);
  assert.deepEqual(resizeBoxCorner(b, 'nw', [-50, -20], 1000, 2000), [50, 80, 300, 200]);
  assert.deepEqual(resizeBoxCorner(b, 'ne', [10, 10], 1000, 2000), [100, 110, 310, 200]);
  assert.deepEqual(resizeBoxCorner(b, 'sw', [300, 0], 1000, 2000), [300, 100, 400, 200]);
  assert.deepEqual(resizeBoxCorner(b, 'se', [900, 0], 1000, 2000), [100, 100, 1000, 200]);
  assert.deepEqual(cornerPoint(b, 'nw'), [100, 100]);
  assert.deepEqual(cornerPoint(b, 'se'), [300, 200]);
});

test('ידיות-צלע: כל אחת משנה רק את הצלע שלה (גם בגרירה אלכסונית); מרכז הידית — אמצע הצלע', () => {
  const b = [100, 100, 300, 200];
  assert.deepEqual(HANDLES, [...CORNERS, ...EDGES]);
  assert.deepEqual(resizeBoxCorner(b, 'n', [40, -30], 1000, 2000), [100, 70, 300, 200]);
  assert.deepEqual(resizeBoxCorner(b, 's', [40, 30], 1000, 2000), [100, 100, 300, 230]);
  assert.deepEqual(resizeBoxCorner(b, 'e', [25, 90], 1000, 2000), [100, 100, 325, 200]);
  assert.deepEqual(resizeBoxCorner(b, 'w', [-25, 90], 1000, 2000), [75, 100, 300, 200]);
  // גרירה מעבר לצלע הנגדית — מנורמל; קטום לתמונה
  assert.deepEqual(resizeBoxCorner(b, 'w', [250, 0], 1000, 2000), [300, 100, 350, 200]);
  assert.deepEqual(resizeBoxCorner(b, 'n', [0, -500], 1000, 2000), [100, 0, 300, 200]);
  assert.deepEqual(cornerPoint(b, 'n'), [200, 100]);
  assert.deepEqual(cornerPoint(b, 's'), [200, 200]);
  assert.deepEqual(cornerPoint(b, 'e'), [300, 150]);
  assert.deepEqual(cornerPoint(b, 'w'), [100, 150]);
});

test('handleRects: 8 ידיות בגודל קבוע במסך; ידית-צלע מתקצרת בשורה דקה ולא יורדת מתחת למינימום', () => {
  const b = [100, 100, 300, 200];
  const r = handleRects(b, 1);
  assert.deepEqual(r.map((h) => h.handle), HANDLES);
  const at = Object.fromEntries(r.map((h) => [h.handle, h]));
  assert.deepEqual(at.nw, { handle: 'nw', x: 95, y: 95, width: 10, height: 10 });
  assert.deepEqual(at.n, { handle: 'n', x: 192, y: 96, width: 16, height: 8 });
  assert.deepEqual(at.e, { handle: 'e', x: 296, y: 142, width: 8, height: 16 });
  // בזום 0.5 — גודל כפול בפיקסלי-תמונה (אותו גודל על המסך)
  assert.equal(handleRects(b, 0.5)[0].width, 20);
  // שורה דקה (15 פיקסלי-מסך): ידיות-הצלע הצדדיות בגובה המינימום, לא מכסות את הפינות
  const thin = Object.fromEntries(handleRects([100, 100, 400, 115], 1).map((h) => [h.handle, h]));
  assert.equal(thin.w.height, 6);
  assert.equal(thin.n.width, 16);
  assert.deepEqual(handleRects(null, 1), []);
});

// ---------- מסגרות ----------

test('byOrder / renumber: יציב, מסגרת בלי order בסוף', () => {
  const fr = [F('c', 'main', [0, 0, 1, 1], 3), F('x', 'main', [0, 0, 1, 1], null), F('a', 'main', [0, 0, 1, 1], 1), F('b', 'main', [0, 0, 1, 1], 3)];
  assert.deepEqual(byOrder(fr).map((f) => f.fid), ['a', 'c', 'b', 'x']);
  assert.deepEqual(renumber(fr).map((f) => [f.fid, f.order]), [['a', 1], ['c', 2], ['b', 3], ['x', 4]]);
  assert.equal(frameBase('notes_heading'), 'notes');
  assert.equal(frameBase(null), 'main');
  assert.equal(isObjectFrame({ kind: 'table' }), true);
  assert.equal(isObjectFrame({ kind: 'bogus' }), false);
  assert.equal(isObjectFrame({}), false);
});

// כמו core/page/frames.py: "גמרא 1, רש"י 1, גמרא 2, רש"י 2"
const gemara = () => [
  F('gg01', 'main', [300, 100, 700, 900], 1),
  F('rr01', 's_rashi', [720, 100, 950, 900], 2),
  F('gg02', 'main', [300, 950, 700, 1400], 3),
  F('rr02', 's_rashi', [720, 950, 950, 1400], 4),
  F('tb01', 'main', [50, 100, 250, 400], 5, { kind: 'table' }),
];

test('seqInStream: לפי הסדר בתוך הזרם; כותרת נספרת בזרם שלה; אובייקט לא נספר', () => {
  const s = seqInStream(gemara());
  assert.deepEqual([...s.entries()], [['gg01', 1], ['rr01', 1], ['gg02', 2], ['rr02', 2]]);
  const h = seqInStream([F('h', 'main_heading', [0, 0, 9, 9], 1), F('m', 'main', [0, 10, 9, 19], 2)]);
  assert.equal(h.get('h'), 1);
  assert.equal(h.get('m'), 2);
  assert.equal(streamFrameCount(gemara(), 's_rashi'), 2);
  assert.equal(streamFrameCount(gemara(), 'main_heading'), 2);
});

test('reorderInStream: המקומות של הזרם נשארים, רק מי שבהם מתחלף', () => {
  const out = reorderInStream(gemara(), 'rr02', 1);
  assert.deepEqual(out.map((f) => f.fid), ['gg01', 'rr02', 'gg02', 'rr01', 'tb01']);
  assert.deepEqual(out.map((f) => f.order), [1, 2, 3, 4, 5]);
  assert.equal(seqInStream(out).get('rr02'), 1);
  // מספר מחוץ לטווח — נקטם; אותו מקום — בלי שינוי; אובייקט — בלי שינוי
  assert.deepEqual(reorderInStream(gemara(), 'gg01', 9).map((f) => f.fid), ['gg02', 'rr01', 'gg01', 'rr02', 'tb01']);
  assert.deepEqual(reorderInStream(gemara(), 'gg01', 1).map((f) => f.fid), ['gg01', 'rr01', 'gg02', 'rr02', 'tb01']);
  assert.deepEqual(reorderInStream(gemara(), 'tb01', 1).map((f) => f.fid), ['gg01', 'rr01', 'gg02', 'rr02', 'tb01']);
});

test('moveInOrder / removeFrame / patchFrame', () => {
  assert.deepEqual(moveInOrder(gemara(), 'rr01', -1).map((f) => f.fid), ['rr01', 'gg01', 'gg02', 'rr02', 'tb01']);
  assert.deepEqual(moveInOrder(gemara(), 'gg01', -1).map((f) => f.fid), ['gg01', 'rr01', 'gg02', 'rr02', 'tb01']);
  assert.deepEqual(moveInOrder(gemara(), 'tb01', 1).map((f) => f.fid), ['gg01', 'rr01', 'gg02', 'rr02', 'tb01']);
  const rm = removeFrame(gemara(), 'rr01');
  assert.deepEqual(rm.map((f) => [f.fid, f.order]), [['gg01', 1], ['gg02', 2], ['rr02', 3], ['tb01', 4]]);
  const p = patchFrame(gemara(), 'tb01', { kind: null, stream: 'notes' });
  assert.equal(Object.hasOwn(p[4], 'kind'), false);
  assert.equal(p[4].stream, 'notes');
  assert.equal(patchFrame(gemara(), 'gg01', { kind: 'figure' })[0].kind, 'figure');
});

test('readsBefore / insertIndex: כותרת מעל ← ראשונה; טור שמאלי ← אחרי הימני; הערות ← בסוף', () => {
  const right = [520, 100, 900, 900];
  const left = [100, 100, 480, 900];
  const notes = [100, 1500, 900, 1600];
  assert.equal(readsBefore(left, right), false);
  assert.equal(readsBefore(right, left), true);
  assert.equal(readsBefore([100, 20, 900, 80], right), true);
  const fr = [F('r', 'main', right, 1), F('n', 'notes', notes, 2)];
  assert.equal(insertIndex(fr, left), 1);
  assert.equal(insertIndex(fr, [100, 20, 900, 80]), 0);
  assert.equal(insertIndex(fr, [100, 1700, 900, 1800]), 2);
  assert.equal(insertIndex(fr, null), 2);
  const ins = insertFrame(fr, F('l', 'main', left, 0));
  assert.deepEqual(ins.map((f) => [f.fid, f.order]), [['r', 1], ['l', 2], ['n', 3]]);
});

test('stableFid: דטרמיניסטי, 6 ספרות-הקס, בלי כפילות', () => {
  const a = stableFid('7|main|1');
  assert.match(a, /^[0-9a-f]{6}$/);
  assert.equal(stableFid('7|main|1'), a);
  const taken = new Set([a]);
  const b = stableFid('7|main|1', taken);
  assert.notEqual(b, a);
  assert.ok(taken.has(b));
});

test('suggestedFrames: מסגרת לכל טור; בתוך הזרם — הטור הימני ראשון; יציב ותקין לחוזה', () => {
  const d = twoCols();
  const s = suggestedFrames(d);
  assert.equal(s.length, 3); // שני טורי ראשי + הערות (בלי ריהוט)
  const main = s.filter((f) => f.stream === 'main');
  // הטור הימני (x ≥ 520) הוא 1 בזרם אף שהשמאלי מתחיל גבוה יותר
  const seqs = seqInStream(s);
  const right = main.find((f) => f.bbox[0] > 500);
  const left = main.find((f) => f.bbox[0] < 500);
  assert.equal(seqs.get(right.fid), 1);
  assert.equal(seqs.get(left.fid), 2);
  assert.ok(right.order < left.order);
  assert.deepEqual(s.map((f) => f.order), [1, 2, 3]);
  assert.ok(s.every((f) => !Object.hasOwn(f, 'seq')));
  // צמודות לטקסט: איחוד השורות + הריפוד של מסגרת שצוירה ביד, בתוך התמונה
  assert.equal(FRAME_PAD, 4);
  assert.deepEqual(right.bbox, [516, 296, 904, 394]);
  // אותם מזהים בחישוב חוזר
  assert.deepEqual(suggestedFrames(twoCols()).map((f) => f.fid), s.map((f) => f.fid));
  for (const op of frameEditOps(7, s, 1000, 2000, { materialise: true })) assert.equal(validateOp(d, op), null, JSON.stringify(op));
  assert.deepEqual(suggestedFrames({ page: 1, size: [10, 10], lines: [] }), []);
});

test('suggestedFrames: כותרת מעל שני טורים — הכותרת 1, הימני 2, השמאלי 3; "✓" שולח את הסדר הזה', () => {
  const d = {
    ...twoCols(),
    lines: [
      L(1, [350, 100, 650, 150], 'main_heading'),
      L(2, [520, 200, 900, 240]),
      L(3, [520, 250, 900, 290]),
      L(4, [100, 200, 480, 240]),
      L(5, [100, 250, 480, 290]),
    ],
  };
  const s = suggestedFrames(d);
  const seqs = seqInStream(s);
  assert.deepEqual(
    s.map((f) => [f.order, f.stream, seqs.get(f.fid), f.bbox[0]]),
    [
      [1, 'main_heading', 1, 346],
      [2, 'main', 2, 516],
      [3, 'main', 3, 96],
    ]
  );
  const [set, ...seqOps] = frameEditOps(7, s, 1000, 2000, { materialise: true, extra: { confirmed: true } });
  assert.deepEqual(set.value.frames.map((f) => [f.order, f.stream]), [[1, 'main_heading'], [2, 'main'], [3, 'main']]);
  assert.deepEqual(seqOps.map((o) => o.value.seq), [1, 2, 3]);
  for (const op of [set, ...seqOps]) assert.equal(validateOp(d, op), null);
});

test('suggestedFrames: צמודות לשורות גם בעמוד רחב (הריפוד אינו גדל עם רוחב העמוד)', () => {
  const d = {
    ...twoCols(),
    size: [3000, 4000],
    lines: [L(1, [1600, 300, 2700, 340]), L(2, [1600, 350, 2700, 390]), L(3, [1600, 400, 2500, 440])],
  };
  const [f] = suggestedFrames(d);
  assert.deepEqual(f.bbox, [1596, 296, 2704, 444]);
  // כל שורה כולה בתוך המסגרת (הסובלנות של תוכנת-הספר — פיקסל אחד)
  for (const l of d.lines) assert.ok(l.bbox[0] >= f.bbox[0] && l.bbox[1] >= f.bbox[1] && l.bbox[2] <= f.bbox[2] && l.bbox[3] <= f.bbox[3]);
});

test('headingStream (דרך scanGeometry): שוליים וריהוט — בלי כותרת', () => {
  assert.equal(headingStream('notes'), 'notes_heading');
  assert.equal(headingStream('margin'), null);
  assert.equal(headingStream('footer'), null);
});

test('framesState: מסגרות-העמוד / נערכו עד אפס / הצעה', () => {
  const d = twoCols();
  const sug = framesState(d);
  assert.equal(sug.suggested, true);
  assert.equal(sug.frames.length, 3);

  const withFrames = { ...d, frames: [F('aa11bb', 'main', [90, 90, 910, 400], 2), F('cc22dd', 'notes', [90, 1490, 910, 1550], 1)] };
  const st = framesState(withFrames);
  assert.equal(st.suggested, false);
  assert.equal(st.edited, false);
  assert.deepEqual(st.frames.map((f) => [f.fid, f.order]), [['cc22dd', 1], ['aa11bb', 2]]);

  const cleared = buildView(d, [{ kind: 'frames_clear', page: 7 }]);
  assert.deepEqual(framesState(cleared), { frames: [], suggested: false, edited: true, confirmed: false });

  const conf = buildView(d, frameEditOps(7, sug.frames, 1000, 2000, { materialise: true, extra: { confirmed: true } }));
  const cs = framesState(conf);
  assert.equal(cs.suggested, false);
  assert.equal(cs.confirmed, true);
  assert.deepEqual(cs.frames.map((f) => f.fid), sug.frames.map((f) => f.fid));
});

test('frameForOp / framesSetOp / frameSeqOps / frameEditOps', () => {
  const d = twoCols();
  const fr = [F('aa11bb', 'main', [90.4, 90, 910, 400], 1, { seq: 9, _x: 1 }), F('tt00tt', 'main', [10, 10, 60, 60], 2, { kind: 'table' })];
  assert.deepEqual(frameForOp(fr[0], 1000, 2000), { fid: 'aa11bb', stream: 'main', bbox: [90, 90, 910, 400], order: 1 });
  assert.equal(frameForOp(fr[1], 1000, 2000).kind, 'table');

  const set = framesSetOp(7, fr, 1000, 2000, { confirmed: true });
  assert.equal(set.kind, 'frames_set');
  assert.equal(set.value.confirmed, true);
  assert.equal(validateOp(d, set), null);

  // אובייקט אינו במניין-הזרם — אין לו frame_seq
  assert.deepEqual(frameSeqOps(7, fr), [{ kind: 'frame_seq', page: 7, value: { fid: 'aa11bb', seq: 1 } }]);

  const mat = frameEditOps(7, gemara(), 1000, 2000, { materialise: true });
  assert.equal(mat[0].value.manual, true);
  assert.equal(mat.filter((o) => o.kind === 'frame_seq').length, 4);

  const one = frameEditOps(7, reorderInStream(gemara(), 'rr02', 1), 1000, 2000, { seqFids: ['rr02'] });
  assert.equal(one.length, 2);
  assert.equal(one[0].value.manual, undefined);
  assert.deepEqual(one[1].value, { fid: 'rr02', seq: 1 });
  assert.equal(frameEditOps(7, gemara(), 1000, 2000).length, 1);
  for (const op of [...mat, ...one]) assert.equal(validateOp(d, op), null);
});

test('frameEditOps + buildView: מספר-בזרם שנקבע נשאר גם בתצוגה', () => {
  const d = { ...twoCols(), frames: gemara().slice(0, 4) };
  const next = reorderInStream(framesState(d).frames, 'rr02', 1);
  const v = buildView(d, frameEditOps(7, next, 1000, 2000, { seqFids: ['rr02'] }));
  const st = framesState(v);
  assert.equal(seqInStream(st.frames).get('rr02'), 1);
  assert.equal(seqInStream(st.frames).get('rr01'), 2);
  assert.equal(st.suggested, false);
  assert.equal(st.edited, true);
});

test('frameLabel', () => {
  const d = twoCols();
  assert.equal(frameLabel(d, F('a', 'main', [0, 0, 1, 1], 1), 1), 'ראשי 1');
  assert.equal(frameLabel(d, F('a', 'notes', [0, 0, 1, 1], 1), 2), 'הערות 2');
  assert.equal(frameLabel(d, F('a', 'main_heading', [0, 0, 1, 1], 1), 1), 'ראשי — כותרת 1');
  assert.equal(frameLabel(d, F('a', 'main', [0, 0, 1, 1], 1, { kind: 'figure' }), null), 'איור');
  assert.equal(frameLabel(d, F('a', 's_rashi', [0, 0, 1, 1], 1), null), 's_rashi');
});

test('frameOfLine: הקטנה שמכילה את מרכז השורה; אובייקט לא קולט', () => {
  const fr = [F('big', 'main', [0, 0, 1000, 2000], 1), F('small', 'notes', [90, 1490, 910, 1550], 2), F('tb01', 'main', [100, 1495, 900, 1545], 3, { kind: 'table' })];
  assert.equal(frameOfLine(fr, L(5, [100, 1500, 900, 1540])).fid, 'small');
  assert.equal(frameOfLine(fr, L(1, [520, 300, 900, 340])).fid, 'big');
  assert.equal(frameOfLine([], L(1, [520, 300, 900, 340])), null);
  assert.equal(frameOfLine(fr, { id: 1 }), null);
});

test('streamChips: תוכן / כותרות / ריהוט / עוד', () => {
  const d = { ...twoCols(), streams: [...twoCols().streams, { key: 'margin', he: 'שוליים', color: '#c2410c' }] };
  const c = streamChips(d, [F('x', 's_rashi', [0, 0, 1, 1], 1)]);
  assert.deepEqual(c.content.map((s) => s.key), ['main', 'notes', 'margin', 's_rashi']);
  // כותרת לכל זרם-תוכן שיש לו כותרת בתוכנת-הספר (לשוליים אין)
  assert.deepEqual(c.headings.map((s) => [s.key, s.he, s.base]), [
    ['main_heading', 'כותרת', 'main'],
    ['notes_heading', 'כותרת הערות', 'notes'],
    ['s_rashi_heading', 'כותרת s_rashi', 's_rashi'],
  ]);
  assert.equal(c.headings[1].color, '#0e7f3c');
  assert.deepEqual(c.furniture.map((s) => s.key).sort(), ['footer', 'header', 'sep']);
  assert.deepEqual(c.more.map((s) => s.key), ['notes2']);
  assert.deepEqual(c.moreHeadings.map((s) => [s.key, s.he]), [['notes2_heading', "כותרת הערות ב'"]]);
  assert.equal(c.content.find((s) => s.key === 'notes').he, 'הערות');
  // כל הזרמים לבחירה תקינים לחוזה (ו"ריהוט הדף" עצמו אינו זרם — נפתר בציור)
  const all = [...c.content, ...c.headings, ...c.furniture, ...c.more, ...c.moreHeadings];
  for (const s of all) {
    const op = { kind: 'frames_set', page: 7, value: { frames: [{ fid: 'aa11bb', stream: s.key, bbox: [10, 10, 50, 50], order: 1 }] } };
    assert.equal(validateOp(d, op), null, s.key);
  }
  const bare = streamChips({ lines: [] });
  assert.deepEqual(bare.content.map((s) => s.key), ['main']);
  assert.deepEqual(bare.headings.map((s) => s.key), ['main_heading']);
});

test('streamLabel / choiceInfo: "ריהוט הדף", כותרות, וזרם ששמו נקבע בספר', () => {
  const d = { streams: [{ key: 'main', he: 'ראשי', color: '#1a56db' }, { key: 'notes', he: 'רש"י', color: '#123456' }, { key: 's_tos', he: 'תוספות', color: '#654321' }] };
  assert.equal(FURNITURE_CHOICE, FURNITURE_TAB);
  assert.equal(streamLabel(d, FURNITURE_CHOICE), FURNITURE_TAB_HE);
  assert.equal(streamLabel(d, 'main_heading'), 'כותרת');
  assert.equal(streamLabel(d, 'notes_heading'), 'כותרת רש"י');
  assert.equal(streamLabel(d, 's_tos_heading'), 'כותרת תוספות');
  assert.equal(streamLabel(d, 'notes'), 'רש"י');
  assert.deepEqual(choiceInfo(d, FURNITURE_CHOICE), { key: FURNITURE_TAB, he: 'ריהוט הדף', color: '#9ca3af', heading: false });
  assert.deepEqual(choiceInfo(d, 's_tos_heading'), { key: 's_tos_heading', he: 'כותרת תוספות', color: '#654321', heading: true });
});

test('furnitureStreamFor / resolveFrameStream: לפי שורות-הריהוט שבמסגרת, ואחרת לפי המקום בעמוד', () => {
  const lines = [
    L(1, [400, 40, 600, 70], 'header'),
    L(2, [480, 1900, 520, 1930], 'main', { _auto: { stream: 'footer', stream_src: 'auto' } }),
    L(3, [100, 1500, 900, 1540], 'notes'),
    L(4, [100, 1950, 900, 1960], 'sep', { status: 'removed' }),
  ];
  // מסגרת סביב כותרת-העמוד — header; סביב מספר-העמוד (שמסגרת "ראשי" לקחה) — footer כמו שיובא
  assert.equal(furnitureStreamFor([390, 30, 610, 80], lines, 2000), 'header');
  assert.equal(furnitureStreamFor([470, 1890, 530, 1940], lines, 2000), 'footer');
  // בלי שורות-ריהוט בפנים — לפי המקום: בחצי העליון כותרת עמוד, בתחתון תחתית (כמו book/rules.py)
  assert.equal(furnitureStreamFor([100, 100, 900, 140], lines, 2000), 'header');
  assert.equal(furnitureStreamFor([90, 1490, 910, 1550], lines, 2000), 'footer');
  // שורה שהוסרה אינה קובעת
  assert.equal(furnitureStreamFor([90, 1945, 910, 1965], lines, 2000), 'footer');
  assert.equal(furnitureStreamFor(null, lines, 2000), 'header');
  // בחירה אחרת — כמות-שהיא
  assert.equal(resolveFrameStream('notes_heading', [0, 0, 10, 10], lines, 2000), 'notes_heading');
  assert.equal(resolveFrameStream(FURNITURE_CHOICE, [390, 30, 610, 80], lines, 2000), 'header');
});

test('"כותרת-רצה של ההערות": נשמרת ככותרת עמוד, וריהוט שיש מתחתיו טקסט אינו "תחתית" (פורום, 2026-10-01)', () => {
  const lines = [
    L(1, [400, 40, 600, 70], 'header'),
    L(2, [100, 120, 900, 1100], 'main'),
    L(3, [380, 1160, 620, 1190], 'notes_heading'),
    L(4, [100, 1220, 900, 1800], 'notes'),
    L(5, [480, 1900, 520, 1930], 'footer'),
  ];
  // הבחירה המפורשת — תמיד header, בכל מקום בעמוד (אינה זרם בחוזה)
  assert.equal(resolveFrameStream(NOTES_RUNHEAD_CHOICE, [380, 1160, 620, 1190], lines, 2000), 'header');
  assert.equal(streamLabel(null, NOTES_RUNHEAD_CHOICE), 'כותרת-רצה של ההערות');
  assert.equal(choiceInfo(null, NOTES_RUNHEAD_CHOICE).heading, false);
  // "ריהוט הדף" סביב כותרת-רצה מעל ההערות, בחצי התחתון: יש מתחתיה טקסט — כותרת עמוד, לא תחתית
  assert.equal(furnitureStreamFor([370, 1150, 630, 1200], lines.filter((l) => l.id !== 3), 2000), 'header');
  // מספר-העמוד בסוף העמוד (רק ריהוט מתחתיו) — עדיין תחתית
  assert.equal(furnitureStreamFor([470, 1890, 530, 1940], lines.filter((l) => l.id !== 5), 2000), 'footer');
  // טקסט מתחת אבל לא באותו רוחב (טור אחר) אינו קובע
  assert.equal(furnitureStreamFor([920, 1850, 990, 1880], lines, 2000), 'footer');
});

test('furnitureMarks: שורות-ריהוט בלי מסגרת סביבן (לסימון באפור במצב "מסגרות")', () => {
  const lines = [
    L(1, [400, 40, 600, 70], 'header'),
    L(2, [100, 120, 900, 1100], 'main'),
    L(3, [480, 1900, 520, 1930], 'footer'),
    L(4, [100, 1950, 900, 1960], 'sep', { status: 'removed' }),
    L(5, [100, 1110, 900, 1115], 'sep'),
  ];
  const ids = (fr) => furnitureMarks(lines, fr).map((m) => m.id);
  // שורה שהוסרה — לא מסומנת
  assert.deepEqual(ids([]), [1, 3, 5]);
  // רק מסגרת-ריהוט מכסה — בה כבר רואים את השורה: כותרת עמוד, תחתית, מפריד, ו"ריהוט הדף" / "כותרת-רצה
  // של ההערות" אם הגיעו כבחירה
  assert.deepEqual(ids([{ fid: 'a', stream: 'header', bbox: [390, 30, 610, 80], order: 1 }]), [3, 5]);
  assert.deepEqual(ids([{ fid: 'a', stream: 'footer', bbox: [470, 1890, 530, 1940], order: 1 }]), [1, 5]);
  assert.deepEqual(ids([{ fid: 'a', stream: 'sep', bbox: [90, 1105, 910, 1120], order: 1 }]), [1, 3]);
  assert.deepEqual(ids([{ fid: 'a', stream: FURNITURE_CHOICE, bbox: [390, 30, 610, 80], order: 1 }]), [3, 5]);
  assert.deepEqual(ids([{ fid: 'a', stream: NOTES_RUNHEAD_CHOICE, bbox: [390, 30, 610, 80], order: 1 }]), [3, 5]);
  // סקירת #186: מסגרת של טקסט רגיל — גם גדולה, על כל הטקסט — אינה מסתירה ריהוט שזוהה
  assert.deepEqual(ids([{ fid: 'b', stream: 'main', bbox: [90, 30, 910, 1120], order: 1 }]), [1, 3, 5]);
  assert.deepEqual(ids([{ fid: 'b', stream: 'notes', bbox: [0, 0, 1000, 2000], order: 1 }]), [1, 3, 5]);
  // ...וגם לא מסגרת-כותרת ("כותרת", "כותרת הערות")
  assert.deepEqual(ids([{ fid: 'c', stream: 'main_heading', bbox: [390, 30, 610, 80], order: 1 }]), [1, 3, 5]);
  assert.deepEqual(ids([{ fid: 'c', stream: 'notes_heading', bbox: [470, 1890, 530, 1940], order: 1 }]), [1, 3, 5]);
  // מסגרת-אובייקט (טבלה/איור) אינה "מכסה" ריהוט — גם כשהזרם שלה ריהוט
  assert.deepEqual(ids([{ fid: 'd', stream: 'main', kind: 'table', bbox: [0, 0, 1000, 2000], order: 1 }]), [1, 3, 5]);
  assert.deepEqual(ids([{ fid: 'd', stream: 'header', kind: 'figure', bbox: [390, 30, 610, 80], order: 1 }]), [1, 3, 5]);
  assert.deepEqual(furnitureMarks(lines, [])[0], { id: 1, bbox: [400, 40, 600, 70], stream: 'header', inText: false, byHand: false });
  assert.deepEqual(furnitureMarks(null, null), []);
});

// סקירת #186: בתצוגה (buildView) מסגרת-טקסט נותנת לשורות שבתוכה את הזרם שלה — כותרת-רצה שמסגרת
// "ראשי" גדולה בלעה נראית "ראשי". היא עדיין ריהוט שזוהה: מסומנת, ו-inText אומר שכך היא תיכנס לספר כטקסט
test('furnitureMarks על התצוגה: ריהוט שמסגרת-טקסט בלעה — מסומן (inText); בתוך מסגרת-ריהוט — לא; זרם שנקבע ביד קובע', () => {
  const base = {
    ...twoCols(),
    lines: [L(1, [400, 40, 600, 70], 'header'), L(2, [100, 120, 900, 1100], 'main'), L(3, [480, 1900, 520, 1930], 'footer')],
  };
  const marks = (frames, ops = []) => furnitureMarks(buildView({ ...base, frames }, ops).lines, frames);
  const big = { fid: 'aa11bb', stream: 'main', bbox: [90, 30, 910, 1120], order: 1 };
  // מסגרת "ראשי" על כל הטקסט, כולל כותרת-הרצה: בתצוגה השורה "ראשי" — ועדיין מסומנת, עם inText
  assert.equal(buildView({ ...base, frames: [big] }).lines.find((l) => l.id === 1).stream, 'main');
  assert.deepEqual(marks([big]), [
    { id: 1, bbox: [400, 40, 600, 70], stream: 'header', inText: true, byHand: false },
    { id: 3, bbox: [480, 1900, 520, 1930], stream: 'footer', inText: false, byHand: false },
  ]);
  // מסגרת "כותרת עמוד" קטנה בתוך הגדולה — הפנימית קובעת: השורה ריהוט, וכבר רואים אותה
  const head = { fid: 'cc22dd', stream: 'header', bbox: [390, 30, 610, 80], order: 2 };
  assert.deepEqual(marks([big, head]).map((m) => m.id), [3]);
  // מסגרת-אובייקט אינה בולעת שורות ואינה מכסה
  assert.deepEqual(marks([{ fid: 'ee33ff', stream: 'main', kind: 'table', bbox: [0, 0, 1000, 2000], order: 1 }]).map((m) => [m.id, m.inText]), [
    [1, false],
    [3, false],
  ]);
  // המתנדב קבע לכותרת-הרצה "ראשי" ביד — כבר אינה ריהוט, ואין סימון
  assert.deepEqual(marks([big], [{ kind: 'stream', page: 7, ids: [1], value: 'main' }]).map((m) => m.id), [3]);
  // ...ושורה שסומנה "כותרת עמוד" ביד — ריהוט שסומן ביד (byHand), והזרם שנקבע ביד גובר על המסגרת: לא inText
  assert.deepEqual(marks([big], [{ kind: 'stream', page: 7, ids: [2], value: 'header' }]).map((m) => [m.id, m.inText, m.byHand]), [
    [1, true, false],
    [2, false, true],
    [3, false, false],
  ]);
});

// סקירה: העמוד חזר מתוכנת-הספר אחרי שהמסגרות הוחלו שם — כל שורה במסגרת קיבלה את הזרם שלה (stream_src 'frame'),
// כך שגם הזרם שיובא (_auto) בא ממסגרת; מה שזוהה לשורה נשאר בניחוש של הניתוח (pred.stream)
test('furnitureMarks אחרי סבב בתוכנת-הספר: הזרם שיובא בא ממסגרת — לפי pred.stream', () => {
  const big = { fid: 'aa11bb', stream: 'main', bbox: [90, 30, 910, 1120], order: 1 };
  const head = L(1, [400, 40, 600, 70], 'main', { stream_src: 'frame', pred: { stream: { v: 'header', conf: 0.9, why: 'כותרת-רצה' } } });
  const base = { ...twoCols(), frames: [big], lines: [head, L(2, [100, 120, 900, 1100], 'main', { stream_src: 'frame' }), L(3, [480, 1900, 520, 1930], 'footer')] };
  const v = buildView(base, []);
  assert.deepEqual(v.lines.find((l) => l.id === 1)._auto, { stream: 'main', stream_src: 'frame' });
  assert.equal(detectedStream(v.lines.find((l) => l.id === 1)), 'header');
  assert.equal(detectedStream(v.lines.find((l) => l.id === 2)), 'main');
  assert.deepEqual(furnitureMarks(v.lines, base.frames).map((m) => [m.id, m.stream, m.inText]), [
    [1, 'header', true],
    [3, 'footer', false],
  ]);
  // המתנדב הקטין את המסגרת כך שכותרת-הרצה מחוצה לה — עדיין מסומנת, ובלי "בתוך מסגרת של טקסט"
  const small = { ...big, bbox: [90, 110, 910, 1120] };
  const op = { kind: 'frames_set', page: 7, value: { frames: [small], manual: true } };
  const v2 = buildView(base, [op]);
  assert.deepEqual(furnitureMarks(v2.lines, v2.frames).map((m) => [m.id, m.inText]), [
    [1, false],
    [3, false],
  ]);
  // ...או ציירה סביבה "ריהוט הדף": הזרם שזוהה (מ-pred) קובע את זרם-הריהוט — כותרת עמוד
  assert.equal(furnitureStreamFor([390, 30, 610, 80], v.lines, 2000), 'header');
  // בלי pred — אין ממה לדעת: הזרם של המסגרת
  assert.equal(detectedStream({ stream: 'main', stream_src: 'frame', _auto: { stream: 'main', stream_src: 'frame' } }), 'main');
  assert.equal(detectedStream({ stream: 'main', stream_src: 'frame' }), 'main');
  assert.equal(detectedStream({ stream: 'notes', stream_src: 'human' }), 'notes');
  assert.equal(detectedStream(null), undefined);
});

test('furnitureStreamFor: קו-מפריד שמסגרת "ראשי" בלעה בתוכנת-הספר (pred: מפריד) — "ריהוט הדף" סביבו הוא מפריד, לא כותרת עמוד', () => {
  const lines = [
    L(1, [100, 120, 900, 1100], 'main', { stream_src: 'frame' }),
    L(2, [100, 1110, 900, 1115], 'main', { stream_src: 'frame', pred: { stream: { v: 'sep' } } }),
    L(3, [100, 1200, 900, 1800], 'notes'),
  ];
  const v = buildView({ ...twoCols(), frames: [{ fid: 'aa11bb', stream: 'main', bbox: [90, 110, 910, 1120], order: 1 }], lines }, []);
  assert.equal(furnitureStreamFor([90, 1105, 910, 1120], v.lines, 2000), 'sep');
  // ...והמפריד אינו "טקסט שמתחתיו" לריהוט שמעליו
  assert.equal(furnitureStreamFor([470, 1080, 530, 1100], v.lines.filter((l) => l.id !== 1 && l.id !== 3), 2000), 'footer');
});

// סקירה: מסגרות חופפות — הזרם של השורה הוא של המסגרת הקטנה ביותר שמכילה את מרכזה (ops.applyFrameStreams);
// "ריהוט הדף" רחב שסביבו אינו מכסה אותה כשמסגרת-כותרת צמודה בתוכו לקחה אותה
test('furnitureMarks: מסגרות חופפות — לפי המסגרת שהשורה שייכת אליה (הקטנה ביותר)', () => {
  const band = { fid: 'aa11bb', stream: 'header', bbox: [0, 0, 1000, 110], order: 1 };
  const heading = { fid: 'cc22dd', stream: 'main_heading', bbox: [390, 30, 610, 80], order: 2 };
  const text = { fid: 'ee33ff', stream: 'main', bbox: [90, 110, 910, 1900], order: 3 };
  const base = { ...twoCols(), lines: [L(1, [400, 40, 600, 70], 'header'), L(2, [100, 120, 900, 160], 'main')] };
  const frames = [band, heading, text];
  const v = buildView({ ...base, frames }, []);
  assert.equal(v.lines.find((l) => l.id === 1).stream, 'main_heading');
  assert.equal(frameOfLine(frames, v.lines.find((l) => l.id === 1)).fid, 'cc22dd');
  assert.deepEqual(furnitureMarks(v.lines, frames).map((m) => [m.id, m.inText]), [[1, true]]);
  // בלי מסגרת-הכותרת — ה"ריהוט הדף" הרחב הוא המסגרת שלה, ואין סימון
  const v2 = buildView({ ...base, frames: [band, text] }, []);
  assert.deepEqual(furnitureMarks(v2.lines, [band, text]), []);
});

test('furnitureMarks: חלקי-פיצול ושורה מאוחדת של כותרת-רצה יורשים את מה שזוהה לה — מסומנים גם בתוך מסגרת של טקסט', () => {
  const big = { fid: 'aa11bb', stream: 'main', bbox: [90, 30, 910, 1120], order: 1 };
  const base = {
    ...twoCols(),
    frames: [big],
    lines: [L(1, [400, 40, 600, 70], 'header'), L(2, [610, 40, 700, 70], 'header'), L(3, [100, 120, 900, 1100], 'main')],
  };
  const split = buildView(base, [{ kind: 'line_split', page: 7, ids: [1], value: { x: 500 } }]);
  const halves = split.lines.filter((l) => l._new);
  assert.equal(halves.length, 2);
  assert.deepEqual(halves.map((l) => l._auto), [
    { stream: 'header', stream_src: 'auto' },
    { stream: 'header', stream_src: 'auto' },
  ]);
  const halfMarks = furnitureMarks(split.lines, [big]).filter((m) => halves.some((h) => h.id === m.id));
  assert.equal(halfMarks.length, 2);
  assert.ok(halfMarks.every((m) => m.inText && m.stream === 'header'));
  const merged = buildView(base, [{ kind: 'line_merge', page: 7, ids: [1, 2] }]);
  const m = merged.lines.find((l) => l._new);
  assert.deepEqual(furnitureMarks(merged.lines, [big]).filter((x) => x.id === m.id).map((x) => [x.stream, x.inText]), [['header', true]]);
  // ...וגם הניחוש (pred.stream) של כותרת-רצה שהמסגרות שלה הוחלו בתוכנת-הספר
  const up = { ...base, lines: [L(1, [400, 40, 600, 70], 'main', { stream_src: 'frame', pred: { stream: { v: 'header' } } }), base.lines[2]] };
  const upSplit = buildView(up, [{ kind: 'line_split', page: 7, ids: [1], value: { x: 500 } }]);
  assert.deepEqual(upSplit.lines.filter((l) => l._new).map((l) => l.pred), [{ stream: { v: 'header' } }, { stream: { v: 'header' } }]);
  assert.equal(furnitureMarks(upSplit.lines, [big]).filter((x) => upSplit.lines.some((l) => l._new && l.id === x.id)).length, 2);
});

test('furnitureLabelAnchor: התווית מעל תיבת-השורה, לא על הדיו; בראש התמונה — מתחתיה', () => {
  assert.deepEqual(furnitureLabelAnchor([400, 40, 600, 70], 1), { left: 400, top: 39, above: true });
  assert.deepEqual(furnitureLabelAnchor([400, 40, 600, 70], 0.5), { left: 200, top: 19, above: true });
  // אין מעליה מקום לתווית (16 פיקסלים ועוד שניים) — מתחת לתיבה
  assert.deepEqual(furnitureLabelAnchor([400, 30, 600, 70], 0.5), { left: 200, top: 36, above: false });
  assert.deepEqual(furnitureLabelAnchor([400, 0, 600, 30], 1), { left: 400, top: 31, above: false });
});

test('drawStreamFor', () => {
  assert.equal(drawStreamFor('notes'), 'notes');
  assert.equal(drawStreamFor('main_heading'), 'main');
  // לשונית "ריהוט הדף" בטקסט — הבחירה "ריהוט הדף" (הזרם האמיתי נקבע בציור)
  assert.equal(drawStreamFor(FURNITURE_TAB), FURNITURE_CHOICE);
  assert.equal(drawStreamFor('bogus'), 'main');
  assert.equal(drawStreamFor(undefined), 'main');
});

// ---------- שורות ----------

test('nearestLine: המכילה; בתוך מסגרת — הקרובה; בלי מסגרת — רק מכילה; מוסרות לא', () => {
  const lines = twoCols().lines.concat(L(9, [520, 400, 900, 440], 'main', { status: 'removed' }));
  assert.equal(nearestLine(lines, [600, 320]).id, 1);
  assert.equal(nearestLine(lines, [600, 345]), null);
  assert.equal(nearestLine(lines, [600, 345], [500, 280, 920, 420]).id, 1);
  assert.equal(nearestLine(lines, [600, 420], [500, 280, 920, 460]).id, 2);
  assert.equal(nearestLine(lines, [600, 420]), null);
  assert.equal(nearestLine(lines, [5, 5], [0, 0, 10, 10]), null);
});

test('wordAtPoint: לפי תיבות-המילים', () => {
  const line = { words: [{ bbox: [800, 0, 900, 10] }, { bbox: [650, 0, 780, 10] }, { text: 'חדשה' }, { bbox: [500, 0, 600, 10] }] };
  assert.equal(wordAtPoint(line, [850, 5]), 0);
  assert.equal(wordAtPoint(line, [700, 5]), 1);
  assert.equal(wordAtPoint(line, [620, 5]), 3);
  assert.equal(wordAtPoint(line, [100, 5]), 3);
  assert.equal(wordAtPoint({ words: [{ text: 'x' }] }, [1, 1]), null);
});

test('selectionInfo / toggleSelection', () => {
  const lines = [L(1, [0, 0, 10, 10]), L(2, [0, 20, 10, 30]), L(3, [0, 40, 10, 50], 'main', { status: 'removed' }), L(-11, [0, 60, 10, 70], 'main', { _new: true })];
  const a = selectionInfo(lines, [1, 2]);
  assert.equal(a.canMerge, true);
  assert.equal(a.resizeId, null);
  assert.deepEqual(a.live, [1, 2]);
  const b = selectionInfo(lines, [1, 3, -11, 99]);
  assert.equal(b.count, 3);
  assert.deepEqual(b.live, [1]);
  assert.deepEqual(b.removed, [3]);
  assert.deepEqual(b.temp, [-11]);
  assert.equal(b.canMerge, false);
  assert.equal(selectionInfo(lines, [2]).resizeId, 2);
  assert.equal(selectionInfo(lines, [3]).resizeId, null);
  assert.equal(selectionInfo(lines, [1, -11]).canMerge, false);
  assert.deepEqual(toggleSelection([1, 2], [3], false), [3]);
  assert.deepEqual(toggleSelection([1, 2], [2, 3], true).sort(), [1, 3]);
  assert.deepEqual(toggleSelection([1], [], false), []);
});

test('outsideLineIds: שורות-תוכן שלא נוגעות באף מסגרת (בלי ריהוט ובלי מוסרות)', () => {
  const lines = [
    L(1, [520, 300, 900, 340]),
    L(2, [100, 200, 480, 240]),
    L(3, [100, 1500, 900, 1540], 'notes'),
    L(4, [400, 40, 600, 70], 'header'),
    L(5, [100, 1600, 900, 1640], 'main', { status: 'removed' }),
    L(6, [450, 310, 560, 330]), // בולטת (נוגעת במסגרת) — לא "מחוץ"
  ];
  const fr = [F('a', 'main', [510, 290, 910, 350], 1), F('t', 'main', [90, 190, 300, 250], 2, { kind: 'table' })];
  assert.deepEqual([...outsideLineIds(lines, fr)], [3]);
  assert.equal(outsideLineIds(lines, []).size, 0);
});

test('recutSet: _recut מהתצוגה + הנעולות', () => {
  const lines = [L(1, [0, 0, 1, 1], 'main', { _recut: true }), L(2, [0, 0, 1, 1]), L(3, [0, 0, 1, 1])];
  assert.deepEqual([...recutSet(lines, new Set([3]))].sort(), [1, 3]);
  assert.deepEqual([...recutSet(lines, [2])].sort(), [1, 2]);
  assert.deepEqual([...recutSet(lines)], [1]);
});

// ---------- סמן השורה הנוכחית ----------

test('caretMarker: פס על השורה + חץ מחוץ לקצה הימני של המסגרת', () => {
  const d = twoCols();
  const fr = [F('m1', 'main', [510, 290, 910, 400], 1)];
  const m = caretMarker(d, fr, 1, { size: 10, gap: 2 });
  assert.deepEqual(m.band, [520, 300, 900, 340]);
  assert.equal(m.frameFid, 'm1');
  assert.equal(m.color, '#1a56db');
  assert.deepEqual(m.arrow, [[912, 320], [922, 315], [922, 325]]);
  // בלי מסגרת — בקצה השורה
  assert.deepEqual(caretMarker(d, [], 1, { size: 10, gap: 2 }).arrow[0], [902, 320]);
  // אין מקום מימין בתמונה — החץ בתוך המסגרת
  const edge = caretMarker(d, [F('m1', 'main', [510, 290, 995, 400], 1)], 1, { size: 10, gap: 2 });
  assert.deepEqual(edge.arrow, [[983, 320], [993, 315], [993, 325]]);
  // שורה לועזית — בצד שמאל
  const latin = { ...d, lines: [L(1, [520, 300, 900, 340], 'main', { script: 'latin' })] };
  assert.deepEqual(caretMarker(latin, [], 1, { size: 10, gap: 2 }).arrow[0], [518, 320]);
  assert.equal(caretMarker(d, fr, 99), null);
  assert.equal(caretMarker(d, fr, null), null);
  const removed = { ...d, lines: [L(1, [520, 300, 900, 340], 'main', { status: 'removed' })] };
  assert.equal(caretMarker(removed, fr, 1), null);
});

test('scrollToReveal: גלויה ← null; מחוץ לחלון ← ממורכזת; רחבה ← יישור לימין', () => {
  const vp = { left: 0, top: 0, width: 400, height: 300 };
  assert.equal(scrollToReveal([50, 50, 150, 80], 1, vp), null);
  assert.deepEqual(scrollToReveal([50, 1000, 150, 1040], 1, vp), { left: 0, top: 870 });
  assert.deepEqual(scrollToReveal([500, 1000, 900, 1040], 0.5, vp), { left: 150, top: 360 });
  assert.deepEqual(scrollToReveal([0, 100, 2000, 140], 1, { ...vp, left: 1700 }), null);
  assert.deepEqual(scrollToReveal([0, 100, 2000, 140], 1, { ...vp, left: 2200 }), { left: 1624, top: 0 });
  assert.equal(scrollToReveal([0, 0, 1, 1], 1, { left: 0, top: 0, width: 0, height: 0 }), null);
  // גלויה כולה, קרובה לקצה — לא גוללים (הסריקה לא "בורחת" מתחת לעכבר)
  assert.equal(scrollToReveal([50, 250, 150, 290], 1, vp), null);
  assert.equal(scrollToReveal([2, 250, 398, 300], 1, vp), null);
  // חתוכה בפיקסל אחד — כן
  assert.deepEqual(scrollToReveal([50, 262, 150, 301], 1, vp), { left: 0, top: 132 });
});

test('revealLeft / alignScroll: ראש השורה מול ראש השורה של הסמן בטקסט', () => {
  const vp = { left: 0, top: 500, width: 400, height: 300 };
  const max = { left: 600, top: 3000 };
  // השורה בפיקסל 800 בתמונה (זום 1), הסמן 120 פיקסלים מראש החלון — גלילה ל-680
  assert.deepEqual(alignScroll([50, 800, 350, 840], 1, vp, 120, max), { left: 0, top: 680 });
  // כבר מול הסמן (סטייה של פיקסל) — אין מה להזיז
  assert.equal(alignScroll([50, 800, 350, 840], 1, { ...vp, top: 681 }, 120, max), null);
  // בזום 0.5
  assert.deepEqual(alignScroll([50, 800, 350, 840], 0.5, vp, 100, max), { left: 0, top: 300 });
  // קטום לטווח הגלילה: ראש העמוד — 0; סוף העמוד — המרבי
  assert.deepEqual(alignScroll([50, 30, 350, 70], 1, vp, 200, max), { left: 0, top: 0 });
  assert.deepEqual(alignScroll([50, 3280, 350, 3320], 1, vp, 10, { left: 0, top: 3000 }), { left: 0, top: 3000 });
  // הסמן מעל החלון / מתחתיו — השורה עדיין כולה בחלון (שוליים 8)
  assert.deepEqual(alignScroll([50, 800, 350, 840], 1, vp, -200, max), { left: 0, top: 792 });
  assert.deepEqual(alignScroll([50, 800, 350, 840], 1, vp, 900, max), { left: 0, top: 548 });
  // אופקית: המילה מחוץ לחלון — למרכז; בחלון — בלי שינוי
  assert.deepEqual(alignScroll([0, 800, 1000, 840], 1, vp, 120, max, { wordBox: [700, 800, 760, 840] }), { left: 530, top: 680 });
  assert.equal(alignScroll([0, 800, 1000, 840], 1, { ...vp, top: 680 }, 120, max, { wordBox: [100, 800, 160, 840] }), null);
  assert.equal(revealLeft([100, 0, 160, 10], 1, vp), 0);
  // קלט חסר
  assert.equal(alignScroll(null, 1, vp, 120, max), null);
  assert.equal(alignScroll([50, 800, 350, 840], 1, vp, NaN, max), null);
  assert.equal(alignScroll([50, 800, 350, 840], 1, { ...vp, height: 0 }, 120, max), null);
});

test('wordBoxOf: תיבת-המילה; גובה אפס — בגובה השורה; בלי תיבה — null', () => {
  const line = { bbox: [100, 200, 900, 240], words: [{ text: 'א', bbox: [800, 205, 900, 238] }, { text: 'ב', bbox: [650, 0, 780, 0] }, { text: 'ג' }] };
  assert.deepEqual(wordBoxOf(line, 0), [800, 205, 900, 238]);
  assert.deepEqual(wordBoxOf(line, 1), [650, 200, 780, 240]);
  assert.equal(wordBoxOf(line, 2), null);
  assert.equal(wordBoxOf(line, 7), null);
  assert.equal(wordBoxOf(line, -1), null);
  assert.equal(wordBoxOf(line, null), null);
  assert.equal(wordBoxOf({ words: line.words }, 0), null);
});

// החלונית לא על קווי המסגרת ולא על הידיות: מחוץ ל"טבעת" של clear סביב הקו
const ringFree = (p, size, bbox, zoom, clear = POPOVER_CLEAR) => {
  const r = [p.left, p.top, p.left + size.width, p.top + size.height];
  const F = bbox.map((v) => v * zoom);
  const outer = [F[0] - clear, F[1] - clear, F[2] + clear, F[3] + clear];
  const inner = [F[0] + clear, F[1] + clear, F[2] - clear, F[3] - clear];
  const hits = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
  const within = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
  return !hits(r, outer) || within(r, inner);
};
const inView = (p, size, vp) => p.left >= vp.left && p.top >= vp.top && p.left + size.width <= vp.left + vp.width && p.top + size.height <= vp.top + vp.height;

test('popoverBeside: לצד המסגרת, בצד שיש בו יותר מקום; מיושרת לראש החלק הגלוי', () => {
  const size = { width: 300, height: 180 };
  const vp = { left: 0, top: 0, width: 1000, height: 800 };
  // טור ימני — משמאלו יש מקום
  const right = [600, 100, 950, 700];
  const a = popoverBeside(right, 1, vp, size);
  assert.equal(a.side, 'left');
  assert.equal(a.left + size.width, 600 - POPOVER_CLEAR);
  assert.equal(a.top, 100);
  assert.ok(ringFree(a, size, right, 1) && inView(a, size, vp));
  // טור שמאלי — מימין לו
  const left = [50, 100, 400, 700];
  const b = popoverBeside(left, 1, vp, size);
  assert.equal(b.side, 'right');
  assert.equal(b.left, 400 + POPOVER_CLEAR);
  assert.ok(ringFree(b, size, left, 1));
  // המסגרת מתחילה מעל החלון (גלול) — החלונית בראש החלון, לא מעליו
  const c = popoverBeside(right, 1, { ...vp, top: 300 }, size);
  assert.equal(c.top, 306);
  assert.ok(inView(c, size, { ...vp, top: 300 }));
});

test('popoverBeside: מסגרת ברוחב מלא — מעליה או מתחתיה; אין מקום בחוץ — בתוכה, רחוק מהקווים', () => {
  const size = { width: 300, height: 180 };
  const vp = { left: 0, top: 0, width: 1000, height: 800 };
  // כותרת ברוחב העמוד בראש החלון — מתחתיה, מיושרת לצד ימין
  const head = [20, 40, 980, 120];
  const a = popoverBeside(head, 1, vp, size);
  assert.equal(a.side, 'below');
  assert.equal(a.top, 120 + POPOVER_CLEAR);
  assert.equal(a.left + size.width, 980);
  assert.ok(ringFree(a, size, head, 1));
  // הערות בתחתית — מעליהן
  const notes = [20, 600, 980, 780];
  const b = popoverBeside(notes, 1, vp, size);
  assert.equal(b.side, 'above');
  assert.ok(ringFree(b, size, notes, 1) && inView(b, size, vp));
  // מסגרת גדולה מהחלון בכל כיוון — בתוכה, בפינה השמאלית-העליונה של החלק הגלוי
  const big = [10, 0, 990, 3000];
  const c = popoverBeside(big, 1, { ...vp, top: 1000 }, size);
  assert.equal(c.side, 'inside');
  assert.deepEqual([c.left, c.top], [10 + POPOVER_CLEAR, 1006]);
  assert.ok(ringFree(c, size, big, 1));
  // לוח צר: אין מקום בשום צד — עדיין לא על הקווים
  const narrow = { left: 0, top: 0, width: 620, height: 700 };
  for (const f of [[330, 60, 610, 690], [10, 60, 290, 690], [20, 20, 600, 680]]) {
    const p = popoverBeside(f, 1, narrow, size);
    assert.ok(ringFree(p, size, f, 1), JSON.stringify({ f, p }));
    assert.ok(inView(p, size, narrow), JSON.stringify({ f, p }));
  }
});

test('popoverBeside: אין מקום לחלונית ברוחבה לצד המסגרת — מצטמצמת לרוחב שיש, ולא עולה על הקווים והידיות', () => {
  // כמו בלוח של מסך 1366×768: הטור השני צר מהחלונית (300)
  const size = { width: 300, height: 265 };
  const vp = { left: 0, top: 0, width: 658, height: 442 };
  const sized = (p) => ({ width: p.width ?? size.width, height: size.height });
  // טור ימני — משמאלו 292 פיקסלים: מצטמצמת ל-292, צמודה ל-12 פיקסלים מהקו
  const right = [310, 51, 605, 357];
  const a = popoverBeside(right, 1, vp, size);
  assert.deepEqual([a.side, a.width, a.left + a.width, a.top], ['left', 292, 310 - POPOVER_CLEAR, 51]);
  assert.ok(ringFree(a, sized(a), right, 1) && inView(a, sized(a), vp));
  // טור שמאלי — אין מקום משמאלו; מימינו 278
  const left = [19, 47, 362, 357];
  const b = popoverBeside(left, 1, vp, size);
  assert.deepEqual([b.side, b.width, b.left], ['right', 278, 362 + POPOVER_CLEAR]);
  assert.ok(ringFree(b, sized(b), left, 1) && inView(b, sized(b), vp));
  // יש מקום לרוחב המלא — בלי צמצום (בלי width)
  const c = popoverBeside(right, 1, { ...vp, width: 1000 }, size);
  assert.equal(c.width, undefined);
  // צר מהמינימום — לא מצטמצמת: בתוך המסגרת, רחוק מהקווים
  const d = popoverBeside([200, 20, 560, 430], 1, { ...vp, width: 760 }, { width: 300, height: 200 });
  assert.equal(d.width, undefined);
  assert.equal(d.side, 'inside');
  assert.ok(ringFree(d, { width: 300, height: 200 }, [200, 20, 560, 430], 1));
  // עם מינימום נמוך יותר (minWidth) — כן
  const e = popoverBeside([200, 20, 560, 430], 1, { ...vp, width: 760 }, { width: 300, height: 200 }, { minWidth: 150 });
  assert.deepEqual([e.side, e.width, e.left + e.width], ['left', 182, 200 - POPOVER_CLEAR]);
});

test('popoverBeside: עיגול לפיקסל שלם אינו מכניס את החלונית לשוליים שסביב הקו (זום שבור)', () => {
  // המקרה מהדפדפן (1920×1080): בצד שמאל יש מקום, אבל עיגול של 0.3 פיקסל "הכניס" את החלונית
  // לטבעת — והיא נשלחה לתוך המסגרת, על הטקסט
  const z = 0.3609467455621302;
  const size = { width: 300, height: 265 };
  const vp = { left: 0, top: 0, width: 935, height: 790 };
  const box = [1232, 200, 2404, 1418];
  const p = popoverBeside(box, z, vp, size);
  assert.equal(p.side, 'left');
  assert.equal(p.width, undefined);
  assert.ok(p.left + size.width <= box[0] * z - POPOVER_CLEAR);
  assert.ok(ringFree(p, size, box, z));
});

test('resizeOk: ציר שהידית מזיזה — לפחות min או לפחות כמו שהיה; ציר אחר אינו נבדק', () => {
  const thin = [100, 200, 900, 230]; // שורה דקה: 30 פיקסלים — בזום 0.2 = 6 פיקסלי-מסך
  const min = 8 / 0.2; // 8 פיקסלי-מסך בזום 0.2
  // צלע ימנית של שורה דקה — מותר (הגובה לא השתנה ואינו נבדק)
  assert.equal(resizeOk(thin, [100, 200, 950, 230], 'e', min), true);
  // פינה שמזיזה גם את הגובה — כל עוד לא קטן ממה שהיה
  assert.equal(resizeOk(thin, [100, 200, 950, 232], 'se', min), true);
  assert.equal(resizeOk(thin, [100, 200, 950, 215], 'se', min), false);
  // שורה רגילה שמכווצים עד כמעט-אפס — לא
  assert.equal(resizeOk([100, 200, 900, 300], [100, 200, 900, 210], 's', min), false);
  assert.equal(resizeOk([100, 200, 900, 300], [100, 200, 900, 240], 's', min), true);
  assert.equal(resizeOk([100, 200, 900, 300], [100, 200, 130, 300], 'w', min), false);
  // תיבה מנוונת / לא תיבה
  assert.equal(resizeOk(thin, [100, 200, 100, 230], 'w', 1), false);
  assert.equal(resizeOk(thin, null, 'e', 1), false);
});

test('popoverBeside: זום, וחלון קטן מהחלונית — נשארת בתוך החלון ככל האפשר', () => {
  const size = { width: 300, height: 180 };
  const p = popoverBeside([1200, 200, 1900, 1400], 0.5, { left: 0, top: 0, width: 1000, height: 800 }, size);
  assert.equal(p.side, 'left');
  assert.equal(p.left, 600 - POPOVER_CLEAR - 300);
  const tiny = popoverBeside([10, 10, 50, 50], 1, { left: 0, top: 0, width: 200, height: 100 }, size);
  assert.equal(tiny.left, 6);
  assert.equal(tiny.top, 6);
});

test('badgeAnchor: בתוך המסגרת כשהיא בראש התמונה', () => {
  assert.deepEqual(badgeAnchor([100, 200, 500, 400], 0.5), { x: 250, y: 100, inside: false });
  assert.equal(badgeAnchor([100, 10, 500, 400], 0.5).inside, true);
});

test('straddleClaim: "השורה שייכת למסגרת הזו" — המסגרת שמכילה את רובה, ופעולת stream אחת', () => {
  const view = { page: 7, lines: [L(1, [480, 100, 900, 140]), L(2, [520, 150, 930, 190], 'main', { stream_src: 'frame' })] };
  const frames = [
    { fid: 'aa', stream: 'notes', bbox: [100, 90, 500, 200], order: 1 },
    { fid: 'bb', stream: 'main', bbox: [510, 90, 910, 200], order: 2 },
  ];
  // שורה 1: 20 פיקסלים בשמאלית, 390 בימנית — הימנית ("ראשי")
  const c1 = straddleClaim(view, 1, frames);
  assert.equal(c1.frame.fid, 'bb');
  assert.deepEqual(c1.op, { kind: 'stream', page: 7, ids: [1], value: 'main' });
  assert.equal(straddleClaim(view, 2, frames).frame.fid, 'bb');
  // מסגרת-אובייקט (טבלה/איור) אינה נחשבת; בלי חפיפה — null
  assert.equal(straddleClaim(view, 1, [{ fid: 'tt', stream: 'main', kind: 'table', bbox: [0, 0, 1000, 1000] }]), null);
  assert.equal(straddleClaim(view, 1, [{ fid: 'zz', stream: 'main', bbox: [0, 500, 100, 600] }]), null);
  assert.equal(straddleClaim(view, 99, frames), null);
});

test('straddleClaim: שורת-כותרת נשארת כותרת של הזרם; שורה שנוצרה בתיקון או שהוסרה — אין פעולה', () => {
  const frames = [{ fid: 'nn', stream: 'notes', bbox: [100, 90, 500, 200], order: 1 }];
  const heading = { page: 1, lines: [L(3, [120, 100, 520, 140], 'notes', { _auto: { stream: 'main_heading', stream_src: 'auto' } })] };
  assert.equal(straddleClaim(heading, 3, frames).value, 'notes_heading');
  const temp = { page: 1, lines: [L(-1, [120, 100, 520, 140], 'notes', { _new: true })] };
  assert.equal(straddleClaim(temp, -1, frames), null);
  const removed = { page: 1, lines: [L(4, [120, 100, 520, 140], 'notes', { status: 'removed' })] };
  assert.equal(straddleClaim(removed, 4, frames), null);
});
