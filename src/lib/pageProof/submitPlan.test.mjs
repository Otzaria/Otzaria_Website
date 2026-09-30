import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBMIT_CHOICE,
  SUBMIT_ERRORS,
  MAX_IDS_PER_OP,
  cleanOps,
  recheckLineIds,
  restLineIds,
  lineOkOps,
  submitSummary,
  planSubmission,
} from './submitPlan.js';
import { buildView } from './ops.js';
import { untouchedLineIds } from './view.js';

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
  ...extra,
});

// עמוד 7: ארבע שורות-תוכן (1–3 ראשי, 4 הערות) ושורת ריהוט (5)
const doc = (extra = {}) => ({
  contract: 1,
  gid: 'abcdef123456',
  page: 7,
  size: [1000, 2000],
  frames: [],
  links: [],
  lines: [
    line(1, [100, 100, 900, 140]),
    line(2, [100, 150, 900, 190]),
    line(3, [100, 200, 900, 240]),
    line(4, [100, 1500, 900, 1530], { stream: 'notes' }),
    line(5, [100, 20, 900, 50], { stream: 'header' }),
  ],
  ...extra,
});

const P = 7;
const okOp = (ids) => ({ kind: 'line_ok', page: P, ids });
const textOp = (id, value) => ({ kind: 'text', page: P, ids: [id], value });

// מה שהעורך מעביר לדף: הפעולות + השורות שלא נגעו בהן (לפי התצוגה)
const ctx = (ops, d = doc()) => ({ baseDoc: d, ops, untouched: untouchedLineIds(buildView(d, ops)) });

test('cleanOps: רק צורת-החוזה — בלי _g/_c/_t ובלי שדות זרים', () => {
  const out = cleanOps([
    { kind: 'text', page: P, ids: [1], value: 'א', _g: 'g1', _c: 'text:1', _t: 5, extra: 1 },
    { kind: 'cut_ok', page: P, value: true },
    { kind: 'frames_clear', page: P, ids: 'x' },
  ]);
  assert.deepEqual(out, [
    { kind: 'text', page: P, ids: [1], value: 'א' },
    { kind: 'cut_ok', page: P, value: true },
    { kind: 'frames_clear', page: P },
  ]);
  assert.deepEqual(cleanOps(null), []);
});

test('SUBMIT (הכול אושר): הפעולות נקיות ודחוסות — בלי line_ok נוסף; אישורי-השורות מאוחדים בסוף', () => {
  const ops = [
    { ...okOp([1, 2, 3]), _g: 'g1' },
    { ...okOp([4]), _g: 'g2' },
    { ...textOp(2, 'שורה שתיים'), _c: 'text:2', _t: 1 },
  ];
  const plan = planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.SUBMIT });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, [textOp(2, 'שורה שתיים'), okOp([1, 2, 3, 4])]);
});

test('ONLY_APPROVED: שולח רק את מה שאושר ותוקן — אין line_ok לשורות שלא נגעו בהן', () => {
  const ops = [okOp([1, 2]), textOp(4, 'הערה מתוקנת')];
  const plan = planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.ONLY_APPROVED });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, [textOp(4, 'הערה מתוקנת'), okOp([1, 2])]);
  assert.equal(plan.ops.filter((o) => o.kind === 'line_ok').length, 1);
});

test('APPROVE_REST: מוסיף line_ok לשורות-התוכן שלא נגעו בהן (לא ריהוט, לא מאושרות, לא מתוקנות)', () => {
  const ops = [okOp([1]), textOp(2, 'שורה שתיים')];
  const plan = planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.APPROVE_REST, readAll: true });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, [textOp(2, 'שורה שתיים'), okOp([1, 3, 4])]);
});

test('APPROVE_REST: בלי "קראתי את כל הטקסט" — שגיאה, ולא נשלח דבר', () => {
  const plan = planSubmission({ ...ctx([]), choice: SUBMIT_CHOICE.APPROVE_REST, readAll: false });
  assert.deepEqual(plan, { ok: false, error: SUBMIT_ERRORS.readAll });
});

test('APPROVE_REST בלי שום פעולה: line_ok לכל שורות-התוכן (כמו "כל השאר נכון" הישן)', () => {
  const plan = planSubmission({ ...ctx([]), choice: SUBMIT_CHOICE.APPROVE_REST, readAll: true });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, [okOp([1, 2, 3, 4])]);
});

test('APPROVE_REST: שורה שפעולת-חיתוך נגעה בה (bbox) אינה מאושרת — היא תיקרא מחדש', () => {
  const ops = [{ kind: 'bbox', page: P, ids: [3], value: [100, 195, 900, 245] }];
  const plan = planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.APPROVE_REST, readAll: true });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops, [...ops, okOp([1, 2, 4])]);
});

test('APPROVE_REST: שורות שנוצרו בפיצול (מזהה זמני) ושורה שהוסרה אינן מאושרות', () => {
  const ops = [
    { kind: 'line_split', page: P, ids: [1], value: { x: 500 } },
    { kind: 'status', page: P, ids: [2], value: 'removed' },
  ];
  const plan = planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.APPROVE_REST, readAll: true });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ops.at(-1), okOp([3, 4]));
});

test('הגשה ריקה אסורה: ONLY_APPROVED בלי פעולות — הסבר בעברית', () => {
  const plan = planSubmission({ ...ctx([]), choice: SUBMIT_CHOICE.ONLY_APPROVED });
  assert.deepEqual(plan, { ok: false, error: SUBMIT_ERRORS.emptyOnly });
  assert.match(plan.error, /אין מה להגיש/);
});

test('הגשה ריקה אסורה גם כשכל הפעולות מתבטלות בדחיסה (תיקון שהוחזר למקור)', () => {
  const ops = [textOp(1, 'שורה'), textOp(1, 'שורה 1')];
  assert.deepEqual(planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.ONLY_APPROVED }), { ok: false, error: SUBMIT_ERRORS.emptyOnly });
  assert.deepEqual(planSubmission({ ...ctx(ops), choice: SUBMIT_CHOICE.SUBMIT }), { ok: false, error: SUBMIT_ERRORS.empty });
});

test('APPROVE_REST ריק (אין שורות-תוכן ואין פעולות) — שגיאה', () => {
  const d = doc({ lines: [line(5, [100, 20, 900, 50], { stream: 'header' })] });
  const plan = planSubmission({ baseDoc: d, ops: [], untouched: [], choice: SUBMIT_CHOICE.APPROVE_REST, readAll: true });
  assert.deepEqual(plan, { ok: false, error: SUBMIT_ERRORS.empty });
});

test('בחירה לא מוכרת — שגיאה', () => {
  assert.deepEqual(planSubmission({ ...ctx([okOp([1])]), choice: 'nope' }), { ok: false, error: SUBMIT_ERRORS.choice });
});

test('פעולה לא תקינה נתפסת לפני השליחה (אותה בדיקה של השרת)', () => {
  const plan = planSubmission({ ...ctx([{ kind: 'stream', page: P, ids: [1], value: 'לא-זרם' }]), choice: SUBMIT_CHOICE.SUBMIT });
  assert.equal(plan.ok, false);
  assert.match(plan.error, /פעולה 1/);
});

test('lineOkOps: חלוקה לחלקים של עד MAX_IDS_PER_OP שורות', () => {
  const ids = Array.from({ length: MAX_IDS_PER_OP * 2 + 3 }, (_, i) => i + 1);
  const ops = lineOkOps(P, ids);
  assert.equal(ops.length, 3);
  assert.deepEqual(ops.map((o) => o.ids.length), [MAX_IDS_PER_OP, MAX_IDS_PER_OP, 3]);
  assert.deepEqual(ops.flatMap((o) => o.ids), ids);
  assert.deepEqual(lineOkOps(P, []), []);
});

test('restLineIds: בלי כפילויות, בלי מזהים זמניים ובלי שורות נעולות', () => {
  const ops = [{ kind: 'line_merge', page: P, ids: [2, 3] }];
  assert.deepEqual(restLineIds({ baseDoc: doc(), ops, untouched: [1, 1, -11, 2, 3, 4, 'x'] }), [1, 4]);
  assert.deepEqual(restLineIds({ baseDoc: doc(), ops: [], untouched: undefined }), []);
});

test('recheckLineIds: שורות מעבר-שני, בלי שורות שהוסרו', () => {
  const d = doc();
  d.lines[1].recheck = true;
  d.lines[3].recheck = true;
  d.lines[3].status = 'removed';
  assert.deepEqual(recheckLineIds(d), [2]);
  assert.deepEqual(recheckLineIds(null), []);
});

test('submitSummary: לא הכול אושר — שתי בחירות, ספירות ומעבר-שני', () => {
  const d = doc();
  d.lines[2].recheck = true;
  const ops = [okOp([1, 2]), { ...textOp(1, 'שורה אחת'), _g: 'x' }];
  const s = submitSummary({ ...ctx(ops, d), approval: { approved: 1, total: 3 } });
  assert.deepEqual(s, {
    opCount: 2,
    restCount: 2,
    approval: { approved: 1, total: 3 },
    allApproved: false,
    choices: [SUBMIT_CHOICE.APPROVE_REST, SUBMIT_CHOICE.ONLY_APPROVED],
    recut: false,
    recheckCount: 1,
  });
});

test('submitSummary: כל הפסקאות אושרו — רק "הגש"', () => {
  const ops = [okOp([1, 2, 3, 4])];
  const s = submitSummary({ ...ctx(ops), approval: { approved: 3, total: 3 } });
  assert.equal(s.allApproved, true);
  assert.deepEqual(s.choices, [SUBMIT_CHOICE.SUBMIT]);
  assert.equal(s.restCount, 0);
});

test('submitSummary: העורך מדווח שהכול אושר — גובר, גם אם נשארו שורות שלא נגעו בהן', () => {
  const s = submitSummary({ ...ctx([okOp([1])]), approval: { approved: 4, total: 4 } });
  assert.equal(s.allApproved, true);
  assert.equal(s.restCount, 3);
});

test('submitSummary: בלי מידע-אישור מהעורך — לפי השורות שנשארו', () => {
  assert.equal(submitSummary({ ...ctx([]) }).allApproved, false);
  assert.equal(submitSummary({ ...ctx([okOp([1, 2, 3, 4])]) }).allApproved, true);
  assert.equal(submitSummary({ ...ctx([]), approval: { approved: 'x', total: 3 } }).approval, null);
  assert.deepEqual(submitSummary({ ...ctx([]), approval: { approved: 9, total: 3 } }).approval, { approved: 3, total: 3 });
});

test('submitSummary: פעולת-חיתוך — recut, והשורה הנעולה אינה נספרת בשאר', () => {
  const ops = [{ kind: 'bbox', page: P, ids: [1], value: [100, 95, 900, 145] }];
  const s = submitSummary({ ...ctx(ops), approval: null });
  assert.equal(s.recut, true);
  assert.equal(s.restCount, 3);
  assert.equal(s.opCount, 1);
});
