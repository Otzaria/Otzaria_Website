// "בטל קישור" ו"החזר לאוטומטי" (linkCancel.js), והפעולה link_reset (ops.js): מה הביטול עושה לכל סוג של
// קישור — אוטומטי, ידני שהגיע עם העמוד, שנוסף עכשיו (בעמוד ולעמוד אחר), שבא מעמוד אחר — ומה ההחזרה עושה
// לקישור שבוטל עכשיו ולקישור שבוטל קודם ("אין קישור" — to_line ריק). קישור שבוטל אינו ממוספר ואין לו סימן.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkPlan, cancelledLinks, linkEndLabel, linkSourceHe, isIncomingFar, LINK_HE, isCancelledLink } from './linkCancel.js';
import { buildView, validateOp, sanitizeOp, describeOp, packOps } from './ops.js';
import { linksInDisplayOrder, linkEndpoints } from './flowEdit.js';

const P = 4;
const line = (id, text, stream = 'main') => ({ id, line_no: id - 1, order: id, bbox: [100, id * 50, 900, id * 50 + 40], text, text_ocr: text, stream, status: 'pending' });
// קישורים בעמוד: 1 — אוטומטי (הערה 6 ← גוף 1), 2 — ידני של מתנדב קודם (7 ← 2), 3 — "אין קישור" שבוטל קודם (8),
// 4 — בא מעמוד 3 (הפירוש שם) אל שורה 3 כאן
const base = () => ({
  page: P,
  revision: 1,
  size: [1000, 1000],
  lines: [
    line(1, 'אמר רבי יוחנן'),
    line(2, 'משום רבי שמעון'),
    line(3, 'ועוד מילים כאן'),
    line(6, 'א רבי יוחנן הוא', 'notes'),
    line(7, 'ב משום רבי', 'notes'),
    line(8, 'ג עוד הערה', 'notes'),
  ],
  links: [
    { from_line: 6, to_line: 1, to_page: P, kind: 'note', conf: 0.84, src: 'auto', from_words: [0, 0], to_words: [1, 2] },
    { from_line: 7, to_line: 2, to_page: P, kind: 'note', conf: 1, src: 'human', from_words: [0, 0], to_words: [0, 0] },
    { from_line: 8, to_line: null, to_page: null, kind: 'link', conf: 1, src: 'human' },
    { from_line: 555, from_page: 3, from_line_no: 20, from_text: 'ג והנה', to_line: 3, to_page: P, kind: 'dh', conf: 0.7, src: 'auto', to_words: [0, 0] },
  ],
});
const linkOf = (v, from) => v.links.find((k) => k.from_line === from);

test('קישור שבוטל ("אין קישור"): לא ממוספר ולא מסומן בטקסט', () => {
  const v = buildView(base(), []);
  assert.equal(isCancelledLink(linkOf(v, 8)), true);
  assert.equal(isCancelledLink(linkOf(v, 6)), false);
  assert.deepEqual(linksInDisplayOrder(v).map((x) => [x.link.from_line, x.n]), [[6, 1], [7, 2], [555, 3]]);
  const eps = linkEndpoints(v);
  assert.equal(eps.has(8), false, 'בלי ① על שורת ההערה שהקישור שלה בוטל');
  assert.equal(eps.get(6).get(0)[0].n, 1);
});

test('בטל קישור: אוטומטי וידני שהגיעו עם העמוד ← link_del; קישור מעמוד אחר ← מבטלים שם; מבוטל ← כלום', () => {
  const v = buildView(base(), []);
  for (const from of [6, 7]) {
    assert.deepEqual(unlinkPlan(v, linkOf(v, from)), { action: 'op', op: { kind: 'link_del', page: P, value: { src_line: from, page: P } } });
  }
  const far = unlinkPlan(v, linkOf(v, 555));
  assert.equal(far.action, 'far');
  assert.equal(far.hint, LINK_HE.farHint(3));
  assert.match(far.hint, /בעמוד 3/);
  assert.equal(isIncomingFar(linkOf(v, 555), P), true);
  assert.deepEqual(unlinkPlan(v, linkOf(v, 8)), { action: 'none' });
  assert.deepEqual(unlinkPlan(v, null), { action: 'none' });
  // link_del תקין מול העמוד, ואחריו הקישור אינו בתצוגה
  const del = unlinkPlan(v, linkOf(v, 7)).op;
  assert.equal(validateOp(base(), del), null);
  assert.equal(linkOf(buildView(base(), [del]), 7), undefined);
});

test('בטל קישור שנוסף עכשיו (בעמוד ולעמוד אחר) ← הפעולה link_add עצמה יורדת, בלי link_del', () => {
  const same = { kind: 'link_add', page: P, ids: [8, 3], value: { kind: 'note', from_words: [0, 0], to_words: [1, 1] } };
  const far = { kind: 'link_add', page: P, ids: [8, 901], value: { kind: 'note', from_words: [0, 0], to_words: [0, 0], to_page: 5, to_line_no: 2, to_text: 'שם' } };
  for (const op of [same, far]) {
    const v = buildView(base(), [op]);
    const k = linkOf(v, 8);
    assert.equal(k._added, true);
    const plan = unlinkPlan(v, k);
    assert.equal(plan.action, 'remove');
    assert.equal(plan.match(op), true);
    assert.equal(plan.match({ ...op, ids: [8, 2] }), false, 'קישור אחר מאותה שורה — לא');
    assert.equal(plan.match({ kind: 'link_del', page: P, value: { src_line: 8, page: P } }), false);
  }
});

test('קישורים שבוטלו: בעריכה הזו ← הפעולה יורדת; קודם ← link_reset; ההחזרה בדרך ← אפשר לבטל אותה', () => {
  const b = base();
  const delAuto = { kind: 'link_del', page: P, value: { src_line: 6, page: P } };
  const delHuman = { kind: 'link_del', page: P, value: { src_line: 7, page: P } };
  const ops = [delAuto, delHuman, { ...delAuto }];
  const v = buildView(b, ops);
  const got = cancelledLinks(b, ops, v);
  assert.deepEqual(got.map((c) => [c.key, c.when, c.auto, !!c.pending]), [
    ['now:6', 'now', true, false],
    ['now:7', 'now', false, false],
    ['before:8', 'before', true, false],
  ]);
  assert.equal(got[0].label, '6: «א»');
  // "החזר לאוטומטי" לקישור שבוטל עכשיו ← כל ה-link_del שלו יורדים (גם כפולים), ורק הם
  assert.equal(got[0].restore.action, 'remove');
  assert.deepEqual(ops.filter((o) => got[0].restore.match(o)), [delAuto, ops[2]]);
  assert.equal(got[0].restore.match(delHuman), false);
  // קודם ← link_reset {src_line, page} — תקין מול העמוד
  assert.deepEqual(got[2].restore, { action: 'op', op: { kind: 'link_reset', page: P, value: { src_line: 8, page: P } } });
  assert.equal(validateOp(b, got[2].restore.op), null);

  // ההחזרה בדרך: הקישור מסומן "יחזור לאוטומטי", ו"ביטול" מוריד את ה-link_reset
  const reset = got[2].restore.op;
  const v2 = buildView(b, [reset]);
  assert.equal(linkOf(v2, 8)._reset, true);
  const c2 = cancelledLinks(b, [reset], v2).find((c) => c.key === 'before:8');
  assert.equal(c2.pending, true);
  assert.equal(c2.restore.action, 'remove');
  assert.equal(c2.restore.match(reset), true);
  // בלי העמוד שיובא (רק התצוגה) — עדיין "בדרך", לפי הסימון בתצוגה
  assert.equal(cancelledLinks(v2, [], v2).find((c) => c.key === 'before:8').pending, true);

  // קישור חדש מאותה שורה אחרי הביטול — אינו "מבוטל"
  const add = { kind: 'link_add', page: P, ids: [8, 3], value: { kind: 'note' } };
  const v3 = buildView(b, [delAuto, add, { kind: 'link_add', page: P, ids: [6, 3], value: { kind: 'note' } }]);
  assert.deepEqual(cancelledLinks(b, [delAuto], v3).map((c) => c.key), []);
});

test('link_reset: בדיקה, ניקוי, החלה, תיאור ודחיסה', () => {
  const b = base();
  const op = { kind: 'link_reset', page: P, value: { src_line: 8, page: P } };
  assert.equal(validateOp(b, op), null);
  assert.equal(validateOp(b, { ...op, value: { src_line: 3, page: P } }), 'אין בעמוד קישור מהשורה הזו');
  assert.equal(validateOp(b, { ...op, value: { src_line: 99, page: P } }), 'שורת-המקור של הקישור חסרה');
  assert.equal(validateOp(b, { ...op, value: { src_line: 8, page: 5 } }), 'עמוד הקישור שגוי');
  assert.equal(validateOp(b, { ...op, ids: [8] }), 'לפעולה הזו אין שורות');
  assert.deepEqual(sanitizeOp({ ...op, value: { src_line: 8, page: P, extra: 1 }, _g: 'x' }), op);
  assert.equal(describeOp(b, op), 'קישור — חזרה לאוטומטי (שורה 8)');
  // נשלח כמות-שהוא (לא נדחס עם link_del שלפניו — תוכנת-הספר מחילה לפי הסדר)
  const del = { kind: 'link_del', page: P, value: { src_line: 6, page: P } };
  assert.deepEqual(packOps(b, [del, op]), [del, op]);
});

test('התוויות: מספר-השורה והמילים שבטווח; צד בעמוד אחר; אוטומטי/אושר', () => {
  const v = buildView(base(), []);
  assert.equal(linkEndLabel(v, 'from', linkOf(v, 6)), '6: «א»');
  assert.equal(linkEndLabel(v, 'to', linkOf(v, 6)), '1: «רבי יוחנן»');
  assert.equal(linkEndLabel(v, 'from', linkOf(v, 555)), 'עמוד 3, שורה 21: «ג והנה»');
  assert.equal(linkEndLabel(v, 'from', linkOf(v, 8)), '8: ג עוד הערה');
  assert.equal(linkEndLabel(v, 'from', { from_line: 77 }), 'שורה 77');
  assert.equal(linkSourceHe(linkOf(v, 6)), 'אוטומטי 84%');
  assert.equal(linkSourceHe(linkOf(v, 7)), 'אושר');
});

test('unlinkPlan: קישור חדש שהחליף קישור חי מאותה שורה ← remove + link_del לישן (ובלי בסיס / בלי קישור קודם — בלי)', () => {
  const doc = {
    page: 1,
    size: [1000, 1000],
    lines: [
      { id: 1, line_no: 0, text: 'גוף מילה', bbox: [0, 0, 900, 20], stream: 'main' },
      { id: 2, line_no: 1, text: 'גוף אחר', bbox: [0, 30, 900, 50], stream: 'main' },
      { id: 3, line_no: 2, text: 'הערה כאן', bbox: [0, 60, 900, 80], stream: 'notes' },
    ],
    links: [{ from_line: 3, to_line: 1, to_page: 1, kind: 'note', src: 'auto', conf: 0.6 }],
  };
  const add = { kind: 'link_add', page: 1, ids: [3, 2], value: { kind: 'note' } };
  const v = buildView(doc, [add]);
  const k = v.links.find((x) => x.from_line === 3);
  const plan = unlinkPlan(v, k, 1, doc);
  assert.equal(plan.action, 'remove');
  assert.equal(plan.match(add), true);
  assert.deepEqual(plan.add, [{ kind: 'link_del', page: 1, value: { src_line: 3, page: 1 } }]);
  // אחרי ההסרה וה-link_del: אין קישור חי מהשורה
  const after = buildView(doc, plan.add);
  assert.equal(linksInDisplayOrder(after).length, 0);
  assert.deepEqual(unlinkPlan(v, k, 1).add, [], 'בלי בסיס — רק ההסרה');
  const fresh = buildView({ ...doc, links: [] }, [add]);
  assert.deepEqual(unlinkPlan(fresh, fresh.links[0], 1, { ...doc, links: [] }).add, []);
});

test('validateOp link_reset: רק לקישור שבוטל', () => {
  const lines = [{ id: 1, line_no: 0, text: 'א', bbox: [0, 0, 10, 10] }, { id: 3, line_no: 1, text: 'ב', bbox: [0, 20, 10, 30] }];
  const op = { kind: 'link_reset', page: 1, value: { src_line: 3, page: 1 } };
  const live = { page: 1, size: [100, 100], lines, links: [{ from_line: 3, to_line: 1, src: 'human' }] };
  const gone = { ...live, links: [{ from_line: 3, to_line: null, src: 'human' }] };
  assert.equal(validateOp(gone, op), null);
  assert.equal(validateOp(live, op), 'הקישור מהשורה הזו לא בוטל');
  assert.equal(validateOp({ ...live, links: [] }, op), 'אין בעמוד קישור מהשורה הזו');
});
