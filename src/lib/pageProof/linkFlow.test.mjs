import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView, validateOp } from './ops.js';
import { FURNITURE_TAB } from './textModel.js';
import { LINK_ERRORS, LINK_HINTS, baseStream, tabOfLine, isCommentaryStream, wordStartPos, linkEnd, planLink } from './linkFlow.js';

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
