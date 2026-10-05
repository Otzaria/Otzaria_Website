import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, STAGE_TEXT, cutOpsOf, finishStructure, handledItems, initialStage, isStage, stageFocus } from './stages.js';

// שני השלבים של דף המתנדב (docs/63 §3) — הכללים הטהורים.

const TEXT = { kind: 'text', page: 4, ids: [1], value: 'מתוקן' };
const SPLIT = { kind: 'line_split', page: 4, ids: [2], value: { x: 500 } };
const ADD = { kind: 'line_add', page: 4, value: { bbox: [1, 1, 50, 20] } };
const BBOX = { kind: 'bbox', page: 4, ids: [3], value: [1, 1, 60, 20] };

test('השלבים, והמיקוד של כל שלב בעורך', () => {
  assert.deepEqual(STAGES, ['structure', 'text']);
  assert.equal(isStage('structure'), true);
  assert.equal(isStage('nope'), false);
  const s = stageFocus('structure');
  assert.deepEqual([s.textReadOnly, s.dimText, s.scanReadOnly], [true, true, false]);
  assert.deepEqual([...s.hide].sort(), ['bookOnly', 'charStyles', 'link', 'paraStyle', 'paragraphs', 'suspicious']);
  const t = stageFocus('text');
  assert.deepEqual([t.textReadOnly, t.scanReadOnly, t.hide.length], [false, true, 0]);
  assert.equal(stageFocus(null), null, 'בלי שלב (תוכנת-הספר) — הכול פתוח');
});

test('השלב בפתיחה: השמור; טיוטה בעבודה מלפני השלבים ← "טקסט"; חזר מזיהוי-מחדש ← "טקסט"; אחרת "מבנה"', () => {
  assert.equal(initialStage({ saved: 'structure', inProgress: true, revision: 3 }), 'structure');
  assert.equal(initialStage({ saved: 'text' }), 'text');
  assert.equal(initialStage({ saved: null, inProgress: true }), 'text');
  assert.equal(initialStage({ saved: 'junk', inProgress: false, revision: 2 }), 'text');
  assert.equal(initialStage({ saved: null, inProgress: false, revision: 1 }), 'structure');
  assert.equal(initialStage(), 'structure');
});

test('"✓ המבנה נכון": בלי שינוי-חיתוך ← טקסט; עם — זיהוי-מחדש כשאפשר, אחרת טקסט עם השורות נעולות', () => {
  assert.deepEqual(finishStructure({ ops: [TEXT], canRecut: true }), { next: 'text' });
  assert.deepEqual(finishStructure({ ops: [] }), { next: 'text' });
  assert.deepEqual(finishStructure({ ops: [TEXT, SPLIT, ADD], canRecut: true }), { next: 'recut', cut: [SPLIT, ADD] });
  assert.deepEqual(finishStructure({ ops: [TEXT, SPLIT, BBOX], canRecut: false }), { next: 'text', locked: 2 });
  // חצי-אישור מקומי אינו נספר
  assert.deepEqual(cutOpsOf([{ ...SPLIT, _local: true }, null, BBOX]), [BBOX]);
});

test('"במה כבר טיפלתי" — מבנה: מסגרות, חיתוך, תיקוני-חיתוך, נשלח וחזר', () => {
  let items = handledItems('structure', { view: { frames_confirmed: true, cut_ok: false }, ops: [TEXT] });
  assert.deepEqual(items.map((i) => [i.key, i.done]), [
    ['frames', true],
    ['cut', false],
  ]);
  items = handledItems('structure', { view: { cut_ok: true }, ops: [SPLIT, BBOX], recut: { sentAt: 'x', backAt: null } });
  assert.deepEqual(items.map((i) => [i.key, i.done, i.label]), [
    ['frames', false, 'מסגרות אושרו'],
    ['cut', true, 'חיתוך נבדק'],
    ['cutFixes', null, 'תיקוני-חיתוך: 2'],
    ['recut', false, 'נשלח לזיהוי-מחדש'],
  ]);
  assert.equal(handledItems('structure', { recut: { sentAt: 'x', backAt: 'y' } }).at(-1).label, 'נשלח לזיהוי-מחדש וחזר');
});

test('"במה כבר טיפלתי" — טקסט: פסקאות N/M, פגם בדפוס, סגנונות וקישורים מהטיוטה', () => {
  const ops = [
    TEXT,
    { kind: 'train_text', page: 4, ids: [1], value: 0 },
    { kind: 'para', page: 4, ids: [2], value: 'h2' },
    { kind: 'styles', page: 4, ids: [1], value: { style: 'b', words: [0, 0], on: true } },
    { kind: 'link_add', page: 4, ids: [3, 1] },
    { kind: 'seg_ok', page: 4, ids: [2], value: 1, _local: true },
  ];
  const items = handledItems('text', { ops, approval: { approved: 3, total: 5 }, recut: { sentAt: 'x', backAt: 'y' } });
  assert.deepEqual(items.map((i) => i.label), ['פסקאות שאושרו 3/5', 'חזר מזיהוי-מחדש', 'שורות עם פגם בדפוס: 1', 'סגנונות שסומנו: 2', 'קישורים: 1']);
  assert.equal(items[0].done, false);
  assert.equal(handledItems('text', { approval: { approved: 2, total: 2 } })[0].done, true);
  assert.deepEqual(handledItems('text', { approval: { approved: 0, total: 0 } }), [], 'בלי פסקאות ובלי תיקונים — כלום');
  assert.deepEqual(handledItems('weird', {}), []);
});

test('הנוסחים — "פגם בדפוס", ושורות נעולות', () => {
  assert.match(STAGE_TEXT.recutLocked(1), /^תיקון-החיתוך לא נשלח/);
  assert.match(STAGE_TEXT.recutLocked(3), /^3 תיקוני-החיתוך/);
  assert.match(STAGE_TEXT.recutSent, /יחזור אליכם לשלב הטקסט/);
  assert.equal(JSON.stringify(STAGE_TEXT).includes('לספר בלבד'), false);
});
