import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inverseOps } from './inverseOps.js';
import { applyOp, packOps, sanitizeOps } from './ops.js';
import { planSubmission } from './submitPlan.js';

const line = (id, extra = {}) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main', ...extra });
const words2 = [{ text: 'שורה', styles: ['b'] }, { text: '1', styles: [] }];
const DOC = {
  page: 7,
  revision: 1,
  size: [1000, 2000],
  page_type: 'regular',
  lines: [line(1, { para_style: 'body', words: words2, para_breaks: [1] }), line(2, { stream: 'notes', para_start: true, train_text: 0 }), line(3, { status: 'removed' })],
  links: [
    { from_line: 2, to_line: 1, to_page: 7, kind: 'note', from_words: [0, 1] },
    { from_line: 3, to_line: 55, to_page: 8, to_line_no: 4, to_text: 'תחילת השורה', kind: 'note' },
  ],
};
// כל פעולה הפוכה מסומנת revert — כדי שהדחיסה לפני ההגשה לא תוריד אותה
const R = (o) => ({ ...o, revert: true });

test('inverseOps: טקסט — הטקסט שבעמוד המקורי; זרם — הזרם של כל שורה', () => {
  // תיקון-טקסט הפוך נושא גם את מצב-השורה שבעמוד המקורי (תוכנת-הספר מחזירה גם אותו)
  assert.deepEqual(inverseOps(DOC, { kind: 'text', page: 7, ids: [1], value: 'תוקן' }), [
    R({ kind: 'text', page: 7, ids: [1], value: 'שורה 1', revert_status: 'pending' }),
  ]);
  assert.deepEqual(inverseOps(DOC, { kind: 'stream', page: 7, ids: [1, 2], value: 'side' }), [
    R({ kind: 'stream', page: 7, ids: [1], value: 'main' }),
    R({ kind: 'stream', page: 7, ids: [2], value: 'notes' }),
  ]);
});

test('inverseOps: מחיקה/שחזור, תחילת-פסקה, "פגם בדפוס" (train_text) וסוג-עמוד — הערך הקודם', () => {
  assert.deepEqual(inverseOps(DOC, { kind: 'status', page: 7, ids: [1], value: 'removed' }), [R({ kind: 'status', page: 7, ids: [1], value: 'restore' })]);
  assert.deepEqual(inverseOps(DOC, { kind: 'status', page: 7, ids: [3], value: 'restore' }), [R({ kind: 'status', page: 7, ids: [3], value: 'removed' })]);
  assert.deepEqual(inverseOps(DOC, { kind: 'para_start', page: 7, ids: [2], value: 0 }), [R({ kind: 'para_start', page: 7, ids: [2], value: 1 })]);
  assert.deepEqual(inverseOps(DOC, { kind: 'train_text', page: 7, ids: [1], value: 0 }), [R({ kind: 'train_text', page: 7, ids: [1], value: 1 })]);
  assert.deepEqual(inverseOps(DOC, { kind: 'page_type', page: 7, value: 'title' }), [R({ kind: 'page_type', page: 7, value: 'regular' })]);
});

test('inverseOps: סגנון-תו וגבול-פסקה — למצב שבעמוד המקורי, לא היפוך של on', () => {
  // "מודגש" על שתי המילים: הראשונה הייתה מודגשת (נשארת), השנייה לא (יורדת)
  assert.deepEqual(inverseOps(DOC, { kind: 'styles', page: 7, ids: [1], value: { style: 'b', words: [0, 1], on: true } }), [
    R({ kind: 'styles', page: 7, ids: [1], value: { style: 'b', words: [0, 0], on: true } }),
    R({ kind: 'styles', page: 7, ids: [1], value: { style: 'b', words: [1, 1], on: false } }),
  ]);
  // גבול שהיה בעמוד והמתנדב הקודם "הוסיף" שוב — ההיפוך משאיר אותו
  assert.deepEqual(inverseOps(DOC, { kind: 'para_break', page: 7, ids: [1], value: { word: 1, on: true } }), [
    R({ kind: 'para_break', page: 7, ids: [1], value: { word: 1, on: true } }),
  ]);
});

test('inverseOps: קישור — מחזיר את הקישור שהיה (גם לעמוד אחר), או מבטל קישור שלא היה', () => {
  assert.deepEqual(inverseOps(DOC, { kind: 'link_add', page: 7, ids: [2, 3] }), [
    R({ kind: 'link_add', page: 7, ids: [2, 1], value: { from_words: [0, 1], kind: 'note' } }),
  ]);
  assert.deepEqual(inverseOps(DOC, { kind: 'link_add', page: 7, ids: [1, 3] }), [R({ kind: 'link_del', page: 7, value: { src_line: 1, page: 7 } })]);
  assert.deepEqual(inverseOps(DOC, { kind: 'link_del', page: 7, value: { src_line: 2, page: 7 } }), [
    R({ kind: 'link_add', page: 7, ids: [2, 1], value: { from_words: [0, 1], kind: 'note' } }),
  ]);
  const far = R({ kind: 'link_add', page: 7, ids: [3, 55], value: { kind: 'note', to_page: 8, to_line_no: 4, to_text: 'תחילת השורה' } });
  assert.deepEqual(inverseOps(DOC, { kind: 'link_add', page: 7, ids: [3, 1] }), [far], 'קישור לעמוד אחר שהוחלף — חוזר');
  assert.deepEqual(inverseOps(DOC, { kind: 'link_del', page: 7, value: { src_line: 3, page: 7 } }), [far], 'קישור לעמוד אחר שבוטל — חוזר');
});

test('inverseOps: בלי היפוך בחוזה (אישור-שורה, חיתוך, "החיתוך תקין") — ריק; חצי-אישור מקומי — ריק', () => {
  assert.deepEqual(inverseOps(DOC, { kind: 'line_ok', page: 7, ids: [1] }), []);
  assert.deepEqual(inverseOps(DOC, { kind: 'line_split', page: 7, ids: [1], value: { x: 500 } }), []);
  assert.deepEqual(inverseOps(DOC, { kind: 'cut_ok', page: 7, value: true }), []);
  assert.deepEqual(inverseOps(DOC, { kind: 'seg_ok', page: 7, ids: [1], value: 0, _local: true }), []);
});

test('inverseOps: אחרי הפעולה וההפוכה — העמוד כמו המקורי (בשדות שהפעולה נוגעת בהם)', () => {
  for (const op of [
    { kind: 'text', page: 7, ids: [1], value: 'אחר' },
    { kind: 'stream', page: 7, ids: [2], value: 'main' },
    { kind: 'para_start', page: 7, ids: [2], value: 0 },
    { kind: 'styles', page: 7, ids: [1], value: { style: 'b', words: [0, 1], on: false } },
  ]) {
    let d = applyOp(DOC, op);
    for (const inv of inverseOps(DOC, op)) d = applyOp(d, inv);
    // סימוני-המילים — רק לסגנון-תו (תיקון-טקסט מיישר את המילים מחדש, וזה עניין של applyText, לא של ההיפוך)
    const sty = op.kind === 'styles';
    const pick = (doc) => doc.lines.map((l) => [l.id, l.text, l.stream, !!l.para_start, sty ? JSON.stringify((l.words || []).map((w) => w.styles)) : '']);
    assert.deepEqual(pick(d), pick(DOC), op.kind);
  }
});

test('הדחיסה לפני ההגשה (packOps בשרת, planSubmission בדפדפן) שומרת את הפעולות ההפוכות — גם כשהן "זהות למקור"', () => {
  const base = { ...DOC, lines: [line(1), line(2), line(3)], links: [] };
  const prev = [
    { kind: 'text', page: 7, ids: [1], value: 'תוקן' },
    { kind: 'status', page: 7, ids: [2], value: 'removed' },
    { kind: 'stream', page: 7, ids: [3], value: 'side' },
  ];
  const inv = prev.flatMap((o) => inverseOps(base, o));
  assert.equal(inv.length, 3);
  assert.equal(inv[0].revert_status, 'pending');
  assert.deepEqual(packOps(base, sanitizeOps(inv)), inv);
  // revert_status רק עם revert, רק בתיקון-טקסט, ורק ממצבים מוכרים
  assert.equal(sanitizeOps([{ ...inv[0], revert: undefined }])[0].revert_status, undefined);
  assert.equal(sanitizeOps([{ ...inv[0], revert_status: 'removed' }])[0].revert_status, undefined);
  const plan = planSubmission({ baseDoc: base, ops: inv, untouched: [], choice: 'submit' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, inv);
  // בלי הסימון — אותו טקסט ושחזור על שורה שאינה מחוקה יורדים, כמו תמיד
  const plain = inv.map(({ revert: _r, revert_status: _s, ...o }) => o);
  assert.deepEqual(packOps(base, sanitizeOps(plain)).map((o) => o.kind), ['stream']);
});
