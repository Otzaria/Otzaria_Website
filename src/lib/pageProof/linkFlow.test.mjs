import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView, validateOp } from './ops.js';
import { FURNITURE_TAB, buildParagraphs } from './textModel.js';
import {
  LINK_ERRORS,
  LINK_HINTS,
  baseStream,
  tabOfLine,
  isCommentaryStream,
  wordStartPos,
  linkEnd,
  planLink,
  farLabel,
  pageNoParam,
  pageLinesOf,
  otherPageView,
  otherPageTabs,
  defaultOtherTab,
  otherPagePick,
  planOtherPageLink,
} from './linkFlow.js';

const L = (id, order, text, extra = {}) => ({
  id,
  order,
  line_no: id - 1,
  bbox: [100, order * 50, 900, order * 50 + 40],
  text,
  text_ocr: text,
  stream: 'main',
  status: 'pending',
  words: text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, styles: [] })),
  ...extra,
});

const base = () => ({
  page: 7,
  size: [1000, 2000],
  lines: [
    L(1, 1, 'אמר רבי יוחנן משום'),
    L(2, 2, 'רבי שמעון בן יוחאי'),
    L(3, 3, 'רבי יוחנן. הוא בעל הגמרא', { stream: 'notes', para_start: true, para_style: 'dh' }),
    L(4, 4, 'ועוד הערה', { stream: 'notes', para_start: true }),
    L(5, 5, '12', { stream: 'header' }),
    L(6, 6, 'שוליים כאן', { stream: 'margin' }),
  ],
});
const at = (lineId, offset) => ({ lineId, offset });
const caret = (lineId, offset) => ({ anchor: at(lineId, offset), focus: at(lineId, offset) });
const range = (a, b) => ({ anchor: at(...a), focus: at(...b) });

test('עזרים: זרם-בסיס, לשונית של שורה, זרם הערות/פירוש, מקום תחילת מילה', () => {
  assert.equal(baseStream('notes2_heading'), 'notes2');
  assert.equal(baseStream(null), 'main');
  assert.equal(tabOfLine({ stream: 'main_heading' }), 'main');
  assert.equal(tabOfLine({ stream: 'footer' }), FURNITURE_TAB);
  assert.equal(isCommentaryStream('notes'), true);
  assert.equal(isCommentaryStream('notes3_heading'), true);
  assert.equal(isCommentaryStream('margin'), true);
  assert.equal(isCommentaryStream('s_rashi'), true);
  assert.equal(isCommentaryStream('main'), false);
  assert.deepEqual(wordStartPos({ id: 1, text: 'אמר רבי יוחנן' }, 2), at(1, 8));
  assert.deepEqual(wordStartPos({ id: 1, text: 'אמר' }, 9), at(1, 0));
});

test('linkEnd: המילה שבסמן, בחירה בשורה אחת, בחירה על פני שורות', () => {
  const v = buildView(base());
  assert.deepEqual(linkEnd(v, 'main', caret(1, 5)), { lineId: 1, words: [1, 1], tabKey: 'main', text: 'רבי', stream: 'main' });
  assert.deepEqual(linkEnd(v, 'notes', range([3, 0], [3, 9])).words, [0, 1]);
  const multi = linkEnd(v, 'main', range([1, 9], [2, 3]));
  assert.deepEqual([multi.lineId, multi.words, multi.hint], [1, [2, 3], LINK_HINTS.multiLine]);
  assert.equal(linkEnd(v, 'notes', range([3, 0], [3, 9])).text, 'רבי יוחנן.');
});

test('linkEnd: אין מילה / ריהוט / שורה זמנית', () => {
  const v = buildView(base());
  assert.deepEqual(linkEnd(v, 'main', null), { error: LINK_ERRORS.noWord });
  assert.deepEqual(linkEnd(v, FURNITURE_TAB, caret(5, 0)), { error: LINK_ERRORS.furniture });
  assert.deepEqual(linkEnd(buildView(base(), [{ kind: 'text', page: 7, ids: [1], value: 'אמר  רבי' }]), 'main', caret(1, 4)), {
    error: LINK_ERRORS.noWord,
  });
  const split = buildView(base(), [{ kind: 'line_split', page: 7, ids: [1], value: { x: 500 } }]);
  const temp = split.lines.find((l) => l.id < 0);
  assert.deepEqual(linkEnd(split, 'main', caret(temp.id, 0)), { error: LINK_ERRORS.temp });
});

test('planLink: צד ההערה הוא from גם כשנבחר שני; ד"ה ← kind dh; הפעולה תקינה', () => {
  const b = base();
  const v = buildView(b);
  const body = linkEnd(v, 'main', caret(1, 9));
  const note = linkEnd(v, 'notes', range([3, 0], [3, 9]));
  const r = planLink(v, body, note);
  assert.deepEqual(r.op, { kind: 'link_add', page: 7, ids: [3, 1], value: { from_words: [0, 1], to_words: [2, 2], kind: 'dh' } });
  assert.equal(validateOp(b, r.op), null);
  // צד-ההערה נבחר קודם — אותו כיוון; פסקה רגילה ← note
  const plain = planLink(v, linkEnd(v, 'notes', caret(4, 1)), body);
  assert.deepEqual(plain.op.ids, [4, 1]);
  assert.equal(plain.op.value.kind, 'note');
  // שני זרמי-הערות (הערות ↔ שוליים): הראשון שנבחר הוא from
  assert.deepEqual(planLink(v, linkEnd(v, 'margin', caret(6, 0)), note).op.ids, [6, 3]);
});

test('planLink: אותו זרם / ריהוט / שורה שנעלמה — שגיאה', () => {
  const v = buildView(base());
  const a = linkEnd(v, 'main', caret(1, 0));
  const b = linkEnd(v, 'main', caret(2, 0));
  assert.deepEqual(planLink(v, a, b), { error: LINK_ERRORS.sameStream });
  assert.deepEqual(planLink(v, a, a), { error: LINK_ERRORS.sameStream });
  assert.deepEqual(planLink(v, a, { lineId: 5, words: [0, 0] }), { error: LINK_ERRORS.furniture });
  const gone = buildView(base(), [{ kind: 'status', page: 7, ids: [1], value: 'removed' }]);
  assert.deepEqual(planLink(gone, a, linkEnd(v, 'notes', caret(4, 0))), { error: LINK_ERRORS.gone });
});

// ---------- קישור לעמוד אחר ----------

// עמוד 8 כפי שהשרת מחזיר אותו (pageLinesOf): גוף, ד"ה בהערות, וריהוט
const FAR = [
  { id: 101, line_no: 0, order: 1, stream: 'main', para_start: true, para_style: null, text: 'והלכה כרבי יוחנן' },
  { id: 102, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: 'dh', text: 'כרבי יוחנן. שהוא בעל הגמרא' },
  { id: 103, line_no: 2, order: 3, stream: 'header', para_start: false, para_style: null, text: '8' },
];
const farView = (v) => otherPageView(v, 8, FAR);

test('farLabel / pageNoParam', () => {
  assert.equal(farLabel(4, 11, 77, 'ב ועוד נראה'), 'עמוד 4, שורה 12: «ב ועוד נראה»');
  assert.equal(farLabel(4, null, 77, ''), 'עמוד 4, שורה 77');
  assert.equal(farLabel(4, 0, 77, 'א'.repeat(40)), `עמוד 4, שורה 1: «${'א'.repeat(32)}…»`);
  for (const [raw, n] of [['8', 8], [' 7 ', 7], [['9'], 9], ['100000', 100000]]) assert.equal(pageNoParam(raw), n, String(raw));
  for (const raw of ['0', '-3', 'x', '12a', '4.5', '100001', '', null, undefined]) assert.equal(pageNoParam(raw), null, String(raw));
});

test('pageLinesOf: לקריאה בלבד — בסדר-הקריאה, בלי שורות שהוסרו או זמניות, רק השדות הדרושים', () => {
  const doc = {
    page: 8,
    lines: [
      { id: 2, line_no: 1, order: 2, stream: 'notes', para_start: 1, para_style: 'dh', text: 'שנייה', text_ocr: 'x', bbox: [0, 0, 9, 9], polygon: [[1, 2]], words: [{}] },
      { id: 1, line_no: 0, order: 1, text_ocr: 'ראשונה', para_breaks: [2, 'x', -1] },
      { id: 3, line_no: 2, order: 3, status: 'removed', text: 'הוסרה' },
      { id: -4, order: 4, text: 'זמנית' },
    ],
  };
  assert.deepEqual(pageLinesOf(doc), [
    { id: 1, line_no: 0, order: 1, stream: 'main', para_start: false, para_style: null, text: 'ראשונה', para_breaks: [2] },
    { id: 2, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: 'dh', text: 'שנייה' },
  ]);
  assert.deepEqual(pageLinesOf(null), []);
});

test('otherPageView / otherPageTabs / defaultOtherTab: העמוד האחר לפי זרמים כמו העורך, בלי ריהוט', () => {
  const v = buildView(base());
  const fv = farView(v);
  assert.equal(fv.page, 8);
  assert.deepEqual(otherPageTabs(fv).map((t) => t.key), ['main', 'notes']);
  assert.deepEqual(buildParagraphs(fv, 'notes').map((p) => [p.first.lineId, p.style]), [[102, 'dh']]);
  // צד-הערה ← נפתח הגוף; צד-גוף ← ההערות; אין "זרם שני" — הראשונה
  assert.equal(defaultOtherTab(otherPageTabs(fv), 'notes'), 'main');
  assert.equal(defaultOtherTab(otherPageTabs(fv), 'main_heading'), 'notes');
  assert.equal(defaultOtherTab([{ key: 'main' }], 'main'), 'main');
  assert.equal(defaultOtherTab([], 'main'), null);
});

test('otherPagePick: מילה בשורה של העמוד האחר; ריהוט ומילה שאינה — שגיאה', () => {
  const fv = farView(buildView(base()));
  assert.deepEqual(otherPagePick(fv, 102, 1), {
    page: 8,
    lineId: 102,
    lineNo: 1,
    stream: 'notes',
    words: [1, 1],
    text: 'יוחנן.',
    lineText: 'כרבי יוחנן. שהוא בעל הגמרא',
  });
  assert.deepEqual(otherPagePick(fv, 103, 0), { error: LINK_ERRORS.furniture });
  assert.deepEqual(otherPagePick(fv, 101, 9), { error: LINK_ERRORS.farWord });
  assert.deepEqual(otherPagePick(fv, 999, 0), { error: LINK_ERRORS.farWord });
});

test('planOtherPageLink: הצד הזר מוצהר בערך (גוף ← to_*, פירוש ← from_*); הכיוון והסוג כמו planLink; הפעולה תקינה', () => {
  const b = base();
  const v = buildView(b);
  const fv = farView(v);
  // גוף כאן (שורה 1, "יוחנן"), ד"ה בעמוד 8 — הפירוש הוא ה-from, והסוג מהפסקה שלו שם
  const body = linkEnd(v, 'main', caret(1, 9));
  const r1 = planOtherPageLink(v, body, otherPagePick(fv, 102, 0), fv);
  assert.deepEqual(r1.op, {
    kind: 'link_add',
    page: 7,
    ids: [102, 1],
    value: { from_words: [0, 0], to_words: [2, 2], kind: 'dh', from_page: 8, from_line_no: 1, from_text: 'כרבי יוחנן. שהוא בעל הגמרא' },
  });
  assert.equal(validateOp(b, r1.op), null);
  // הערה כאן (שורה 4, פסקה רגילה), גוף בעמוד 8
  const note = linkEnd(v, 'notes', caret(4, 0));
  const r2 = planOtherPageLink(v, note, otherPagePick(fv, 101, 1), fv);
  assert.deepEqual(r2.op, {
    kind: 'link_add',
    page: 7,
    ids: [4, 101],
    value: { from_words: [0, 0], to_words: [1, 1], kind: 'note', to_page: 8, to_line_no: 0, to_text: 'והלכה כרבי יוחנן' },
  });
  assert.equal(validateOp(b, r2.op), null);
  // ד"ה כאן (שורה 3) — הסוג מהפסקה המקומית
  assert.equal(planOtherPageLink(v, linkEnd(v, 'notes', caret(3, 0)), otherPagePick(fv, 101, 0), fv).op.value.kind, 'dh');
});

test('planOtherPageLink: אותו זרם / ריהוט / אותו עמוד / הצד הראשון נעלם — שגיאה', () => {
  const v = buildView(base());
  const fv = farView(v);
  const body = linkEnd(v, 'main', caret(1, 0));
  assert.deepEqual(planOtherPageLink(v, body, otherPagePick(fv, 101, 0), fv), { error: LINK_ERRORS.sameStream });
  assert.deepEqual(planOtherPageLink(v, body, { ...otherPagePick(fv, 102, 0), stream: 'header' }, fv), { error: LINK_ERRORS.furniture });
  assert.deepEqual(planOtherPageLink(v, body, { ...otherPagePick(fv, 102, 0), page: 7 }, fv), { error: LINK_ERRORS.samePage });
  assert.deepEqual(planOtherPageLink(v, body, { error: 'x' }, fv), { error: LINK_ERRORS.farWord });
  const gone = buildView(base(), [{ kind: 'status', page: 7, ids: [1], value: 'removed' }]);
  assert.deepEqual(planOtherPageLink(gone, body, otherPagePick(fv, 102, 0), fv), { error: LINK_ERRORS.gone });
});
