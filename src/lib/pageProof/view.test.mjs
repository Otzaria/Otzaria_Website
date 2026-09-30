import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wordTokens,
  replaceWord,
  normRect,
  linesInRect,
  hitLine,
  hitFrame,
  straddlingLineIds,
  streamChoices,
  untouchedLineIds,
  newFid,
} from './view.js';

const L = (id, bbox, extra = {}) => ({ id, bbox, text: 'אחת שתיים שלוש', stream: 'main', status: 'pending', ...extra });

test('wordTokens: אינדקסים וסימונים לפי מספר-המילה', () => {
  const t = wordTokens({
    text: 'אחת  שתיים שלוש',
    flags: { low_words: [0] },
    words: [{ conf: 1 }, { conf: 0.5 }, { conf: 1, styles: ['b'] }],
    alternatives: [{ i: 2, alts: [] }],
    lm_flags: [{ i: 1, kinds: ['lm'] }],
  });
  const words = t.filter((x) => x.kind === 'word');
  assert.deepEqual(words.map((w) => w.i), [0, 1, 2]);
  assert.deepEqual(words.map((w) => w.low), [true, true, false]);
  assert.ok(words[2].alt);
  assert.deepEqual(words[1].lmKinds, ['lm']);
  assert.deepEqual(words[2].styles, ['b']);
  assert.equal(t[1].text, '  ');
});

test('replaceWord שומר רווחים', () => {
  assert.equal(replaceWord('אחת  שתיים שלוש', 1, 'שני'), 'אחת  שני שלוש');
});

test('normRect ובחירה בגרירה לפי מרכז', () => {
  assert.deepEqual(normRect([10, 20], [0, 5]), [0, 5, 10, 20]);
  const lines = [L(1, [0, 0, 10, 10]), L(2, [100, 100, 110, 110])];
  assert.deepEqual(linesInRect(lines, [0, 0, 50, 50]), [1]);
});

test('hitLine/hitFrame: הקטנה ביותר גוברת', () => {
  const lines = [L(1, [0, 0, 100, 100]), L(2, [10, 10, 20, 20])];
  assert.equal(hitLine(lines, [15, 15]).id, 2);
  assert.equal(hitLine(lines, [500, 500]), null);
  assert.equal(hitFrame([{ fid: 'a', bbox: [0, 0, 100, 100] }], [50, 50]).fid, 'a');
});

test('straddlingLineIds: שורה שחוצה את גבול המסגרת', () => {
  const lines = [L(1, [10, 10, 90, 20]), L(2, [50, 30, 150, 40]), L(3, [300, 300, 310, 310])];
  const s = straddlingLineIds(lines, [{ fid: 'a', bbox: [0, 0, 100, 100] }]);
  assert.deepEqual([...s], [2]);
  assert.equal(straddlingLineIds(lines, []).size, 0);
});

test('straddlingLineIds: סובלנות של פיקסל אחד — כמו בתוכנת-הספר', () => {
  const f = [{ fid: 'a', bbox: [100, 100, 500, 500] }];
  // פיקסל אחד מחוץ — עדיין בפנים; שניים — בולטת
  assert.equal(straddlingLineIds([L(1, [99, 200, 400, 220])], f).size, 0);
  assert.deepEqual([...straddlingLineIds([L(2, [98, 200, 400, 220])], f)], [2]);
  assert.deepEqual([...straddlingLineIds([L(3, [150, 200, 502, 220])], f)], [3]);
});

test('straddlingLineIds: רק שורות-תוכן — ריהוט שנוגע בקצה של מסגרת אינו מסומן', () => {
  const f = [{ fid: 'a', bbox: [100, 100, 500, 500] }];
  // המפריד שמתחת לשומר-הדף בעמוד-הדוגמה: התיבה שלו חופפת את תחתית המסגרת
  for (const stream of ['sep', 'header', 'footer']) assert.equal(straddlingLineIds([L(1, [300, 480, 700, 560], { stream })], f).size, 0, stream);
  // שורת-תוכן באותו מקום — בולטת; כותרת (של תוכן) — גם
  assert.deepEqual([...straddlingLineIds([L(2, [300, 480, 700, 560]), L(3, [300, 480, 700, 560], { stream: 'notes_heading' })], f)], [2, 3]);
});

test('streamChoices: של הספר ואז אוצר-המילים, בלי כפילויות', () => {
  const c = streamChoices({ streams: [{ key: 'main', he: 'ראשי', color: '#1' }], stream_vocab: [{ key: 'main' }, { key: 'notes', he: 'הערות' }] });
  assert.deepEqual(c.map((s) => s.key), ['main', 'notes']);
});

test('untouchedLineIds מדלג על ריהוט, חדשות ומתוקנות', () => {
  const v = { lines: [L(1, [0, 0, 1, 1]), L(2, [0, 0, 1, 1], { _textEdited: true }), L(3, [0, 0, 1, 1], { stream: 'header' }), L(-1, [0, 0, 1, 1], { _new: true })] };
  assert.deepEqual(untouchedLineIds(v), [1]);
});

test('untouchedLineIds: במעבר שני — בלי השורות שאושרו בסבב הקודם (_preOk)', () => {
  const v = { lines: [L(1, [0, 0, 1, 1]), L(2, [0, 0, 1, 1]), L(3, [0, 0, 1, 1])], _preOk: new Set([1, 3]) };
  assert.deepEqual(untouchedLineIds(v), [2]);
});

test('newFid: 6 תווים ולא תפוס', () => {
  let n = 0;
  const seq = [0.1, 0.1, 0.2];
  const taken = new Set([Math.floor(0.1 * 0xffffff).toString(16).padStart(6, '0')]);
  const f = newFid(taken, () => seq[n++]);
  assert.match(f, /^[0-9a-f]{6}$/);
  assert.ok(!taken.has(f));
});
