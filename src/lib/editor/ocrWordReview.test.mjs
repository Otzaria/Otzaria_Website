import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromLayout, fromProof } from './trackingSource.js';
import { buildPageWordReview, reviewTextWords, reviewWordsOfLine, replaceReviewedWord, wordReviewForText } from './ocrWordReview.js';
import { serializeOcrPageData } from '../ocr/ocrPageDataView.js';

// Production shape: the OCR reads a perfectly plausible Hebrew word; only the
// language model flags it. Shape heuristics cannot find this regression.
const line = { k: 28, order: 1, inText: true, stream: 'main', bbox: [0, 0, 500, 20],
  text: 'והנה היא פוסרת את הצרה', words: [[400, 490, .99], [300, 390, .99], [200, 290, .99], [100, 190, .99], [0, 90, .99]],
  lm: [{ i: 2, word: 'פוסרת', alts: [{ text: 'פוטרת', gain: 35.094 }] }] };
const layout = { layoutVersion: 1, image: { width: 500, height: 700 }, toSource: [1, 0, 0, 0, 1, 0], lines: [line] };
const source = (lines = [line]) => fromLayout({ ...layout, lines });

test('saved API layout → normalized source → model-only word, suggestion and count', () => {
  const data = serializeOcrPageData({ page: { _id: 'p' }, record: { job: 'j', layoutStatus: 'ok', layoutJson: JSON.stringify(layout) }, state: 'current', image: null, contentSha256: null });
  const review = buildPageWordReview({ content: line.text }, fromLayout(data.layout));
  assert.equal(review.available, true);
  assert.equal(review.count, 1);
  assert.equal(review.suspects[0].text, 'פוסרת');
  assert.deepEqual(review.suspects[0].reasons, ['language_model']);
  assert.deepEqual(review.suspects[0].suggestions, [{ text: 'פוטרת', sources: ['language'], p: null }]);
  assert.equal(review.fields.content.text.slice(review.suspects[0].start, review.suspects[0].end), 'פוסרת');
});

test('confidence, calibrated alternatives and LM are combined without duplicate words or suggestions', () => {
  const l = { ...line, alternatives: [{ i: 2, word: 'פוסרת', p: .3, alts: [{ text: 'פוטרת', p: .6 }] }], words: line.words.map((w, i) => i === 2 ? [w[0], w[1], .6] : w) };
  const r = buildPageWordReview({ content: line.text }, source([l]));
  assert.equal(r.count, 1);
  assert.deepEqual(r.suspects[0].reasons, ['low_conf', 'alternatives', 'language_model']);
  assert.deepEqual(r.suspects[0].suggestions, [{ text: 'פוטרת', p: .6, sources: ['recognition', 'language'] }]);
  assert.equal(r.suspects[0].p, .3);
});

test('logical indexes survive reversed/filtered geometry and absent word boxes', () => {
  const l = { ...line, words: null, alternatives: [{ i: 0, word: 'והנה', alts: [{ text: 'והני', p: .4 }] }] };
  assert.equal(buildPageWordReview({ content: line.text }, source([l])).count, 2);
  const reversed = { ...line, words: [...line.words].reverse() };
  assert.equal(buildPageWordReview({ content: line.text }, source([reversed])).suspects[0].text, 'פוסרת');
});

test('flowing text, HTML, newlines and both columns share one sequence and one count', () => {
  const other = { ...line, k: 29, order: 2, text: 'דבר נוסף נגמר', words: null, lm: [{ i: 1, word: 'נוסף', alts: [{ text: 'נוסך', gain: 2 }] }] };
  for (const texts of [
    { content: line.text + ' ' + other.text },
    { content: 'והנה\nהיא <b>פוסרת</b>\nאת הצרה\nדבר נוסף נגמר' },
    { right: 'והנה היא', left: '<b>פוסרת</b> את הצרה דבר נוסף נגמר' }
  ]) {
    const r = buildPageWordReview(texts, source([line, other]));
    assert.deepEqual(r.suspects.map((s) => s.text), ['פוסרת', 'נוסף']);
    r.suspects.forEach((s) => assert.equal(r.fields[s.column].text.slice(s.start, s.end), s.text));
  }
});

test('insertions move a flag; correction/deletion/split/join drop it; undo restores it', () => {
  const S = source();
  assert.equal(buildPageWordReview({ content: 'מילה חדשה ' + line.text }, S).suspects[0].start, ('מילה חדשה ' + line.text).indexOf('פוסרת'));
  for (const text of [line.text.replace('פוסרת', 'פוטרת'), line.text.replace('פוסרת ', ''), line.text.replace('פוסרת', 'פו סרת'), line.text.replace('פוסרת את', 'פוסרתאת')]) {
    assert.equal(buildPageWordReview({ content: text }, S).count, 0, text);
  }
  assert.equal(buildPageWordReview({ content: line.text }, S).count, 1);
  // A final-letter correction must not keep flags via tracking's loose normalizer.
  const l = { ...line, text: 'ראש שלומ סוף', words: null, lm: [{ i: 1, word: 'שלומ', alts: [] }] };
  assert.deepEqual(buildPageWordReview({ content: 'ראש שלום סוף' }, source([l])).suspects, []);
});

test('no transfer from an ambiguous deleted repeated word or a different text', () => {
  const l = { ...line, text: 'ראש פוסרת פוסרת סוף', words: null, lm: [{ i: 1, word: 'פוסרת', alts: [] }] };
  assert.equal(buildPageWordReview({ content: 'ראש פוסרת סוף' }, source([l])).count, 0);
  assert.equal(buildPageWordReview({ content: 'אחר לגמרי מילים אחרות' }, source()).count, 0);
});

test('moving a repeated word drops ambiguous model suggestions, including across columns; undo restores them', () => {
  const l = { ...line, text: 'פתיחה אמר רב אמר רב סיום', words: null,
    lm: [{ i: 3, word: 'אמר', alts: [{ text: 'אומר', gain: 5 }] }] };
  const S = source([l]);
  const before = buildPageWordReview({ content: l.text }, S);
  assert.equal(before.count, 1);
  assert.equal(before.suspects[0].start, l.text.lastIndexOf('אמר'));
  assert.equal(before.suspects[0].suggestions[0].text, 'אומר');

  // Cut the last רב and paste it before the first אמר. Both אמר words remain,
  // but equal repeat counts do not identify which LCS pairing is correct.
  for (const texts of [
    { content: 'פתיחה רב אמר רב אמר סיום' },
    { right: 'פתיחה רב אמר', left: 'רב אמר סיום' }
  ]) assert.deepEqual(buildPageWordReview(texts, S).suspects, []);

  const restored = buildPageWordReview({ right: 'פתיחה אמר רב', left: 'אמר רב סיום' }, S);
  assert.equal(restored.count, 1);
  assert.equal(restored.suspects[0].column, 'left');
  assert.equal(restored.suspects[0].start, 0);
  assert.equal(restored.suspects[0].suggestions[0].text, 'אומר');
});

test('common prefix and suffix are not greedy anchors when repeated-word LCS pairings are ambiguous', () => {
  const text = 'א ב א ב';
  const l = { ...line, text, words: null,
    lm: text.split(' ').map((word, i) => ({ i, word, alts: [{ text: 'חלופה', gain: 1 }] })) };
  assert.equal(buildPageWordReview({ content: text }, source([l])).count, 4);
  // A common first א and last ב exist, but neither pair is in every optimal LCS.
  assert.deepEqual(buildPageWordReview({ content: 'א א ב ב' }, source([l])).suspects, []);
});

test('a repeated word retains a flag when context makes its pair mandatory despite changed counts', () => {
  const l = { ...line, text: 'אמר רב', words: null,
    lm: [{ i: 0, word: 'אמר', alts: [{ text: 'אומר', gain: 1 }] }] };
  const r = buildPageWordReview({ content: 'אמר רב רב אמר' }, source([l]));
  assert.equal(r.count, 1);
  assert.equal(r.suspects[0].start, 0);
  assert.equal(r.suspects[0].suggestions[0].text, 'אומר');
});

test('no word is reused across columns; furniture and inText:false do not contribute', () => {
  const only = { ...line, text: 'פוסרת', words: null, lm: [{ i: 0, word: 'פוסרת', alts: [] }] };
  assert.equal(buildPageWordReview({ right: 'פוסרת', left: 'פוסרת' }, source([only])).count, 0); // ambiguous duplication
  const r = buildPageWordReview({ content: line.text }, source([{ ...line, inText: false }]));
  assert.equal(r.count, 0);
  assert.equal(r.available, false);
  assert.equal(buildPageWordReview({ content: line.text }, source([{ ...line, stream: 'footer' }])).count, 0);
});

test('legacy PageProof markers, low_words, and Unicode quotes', () => {
  const proof = fromProof({ lines: [{ id: 1, bbox: [0, 0, 100, 20], text: 'ר"ת שלום', words: [{ text: 'ר"ת', conf: .99 }, { text: 'שלום', conf: .99 }],
    flags: { low_words: [1] }, lm_flags: [{ i: 0, word: 'ר"ת', rec: [{ text: 'ר"ד', gain: 2 }], lm: [{ text: 'ר"ש', gain: 1 }] }] }] });
  const r = buildPageWordReview({ content: 'ר״ת שלום' }, proof);
  assert.equal(r.count, 2);
  assert.deepEqual(r.suspects[0].suggestions.map((s) => s.sources), [['context'], ['language']]);
});

test('malformed optional marker members never break the editor or attach to the wrong word', () => {
  const l = { ...line, alternatives: [null, { i: 2, word: 'אחר', alts: [{ text: 'שגוי' }] }], lm: [{ i: 2, word: 'פוסרת', alts: [null, { text: '<img src=x>' }, { text: 'פוטרת', p: NaN }, { text: 'פוסרת' }] }], flags: { low_words: {} } };
  assert.deepEqual(reviewWordsOfLine(l)[2].suggestions, [{ text: 'פוטרת', sources: ['language'], p: null }]);
});

test('visible text ranges exclude tags/attributes/entities; partial formatting is preserved on replacement', () => {
  const raw = '<h2>פו<b>סר</b>ת</h2> <img src="data:image/png;base64,שלומ3"> &nbsp; שלום';
  const tokens = reviewTextWords(raw);
  assert.deepEqual(tokens.map((w) => w.text), ['פוסרת', 'שלום']);
  const next = replaceReviewedWord(raw, tokens[0], 'פוטרת');
  assert.equal(next.value, '<h2>פו<b>טר</b>ת</h2> <img src="data:image/png;base64,שלומ3"> &nbsp; שלום');
  assert.equal(replaceReviewedWord('מילה ' + raw, tokens[0], 'פוטרת'), null);
  assert.equal(replaceReviewedWord(raw, tokens[0], '<b>פוטרת</b>'), null);
});

test('stale review ranges are never used between a keystroke and React render', () => {
  const r = buildPageWordReview({ content: line.text }, source());
  assert.equal(wordReviewForText(line.text, r.fields.content).length, 1);
  assert.equal(wordReviewForText('מילה ' + line.text, r.fields.content).length, 0);
});

test('large repetitive pages stay bounded, without positional attribution', () => {
  const text = Array.from({ length: 5000 }, (_, i) => i === 2500 ? 'פוסרת' : 'שלום').join(' ');
  const l = { ...line, text, words: null, lm: [{ i: 2500, word: 'פוסרת', alts: [] }] };
  assert.equal(buildPageWordReview({ content: text.replace('פוסרת', 'פוטרת') }, source([l])).count, 0);
});

test('large identical repetitive pages retain flags without an LCS matrix; ambiguous duplication drops them', () => {
  const tokens = Array(1500).fill('אמר');
  const text = tokens.join(' ');
  const l = { ...line, text, words: null, lm: [{ i: 1200, word: 'אמר', alts: [{ text: 'אומר', gain: 1 }] }] };
  const S = source([l]);
  const unchanged = buildPageWordReview({ content: text }, S);
  assert.equal(unchanged.count, 1);
  assert.equal(unchanged.suspects[0].start, tokens.slice(0, 1200).join(' ').length + 1);
  assert.deepEqual(buildPageWordReview({ content: text + ' אמר' }, S).suspects, []);
});

test('a long repetitive page preserves other unchanged flags after an unrelated correction', () => {
  const tokens = Array.from({ length: 1500 }, (_, i) => i === 500 ? 'ישן' : i % 2 ? 'רב' : 'אמר');
  const l = { ...line, text: tokens.join(' '), words: null, lm: [
    { i: 500, word: 'ישן', alts: [{ text: 'מתוקן', gain: 1 }] },
    { i: 1200, word: 'אמר', alts: [{ text: 'אומר', gain: 1 }] }
  ] };
  const S = source([l]);
  assert.equal(buildPageWordReview({ content: l.text }, S).count, 2);
  const corrected = [...tokens];
  corrected[500] = 'מתוקן';
  const r = buildPageWordReview({ content: corrected.join(' ') }, S);
  assert.equal(r.count, 1);
  assert.equal(r.suspects[0].text, 'אמר');
  assert.equal(r.suspects[0].start, corrected.slice(0, 1200).join(' ').length + 1);
  assert.equal(r.suspects[0].suggestions[0].text, 'אומר');
});


test('a correction of a repeated word does not hide anchored occurrences elsewhere', () => {
  const l = { ...line, text: 'הקדמה פוסרת התחלה סוף פוסרת חתימה', words: null, lm: [{ i: 1, word: 'פוסרת', alts: [] }, { i: 4, word: 'פוסרת', alts: [] }] };
  const r = buildPageWordReview({ content: 'הקדמה פוטרת התחלה סוף פוסרת חתימה' }, source([l]));
  assert.equal(r.count, 1);
  assert.equal(r.suspects[0].start, 'הקדמה פוטרת התחלה סוף '.length);
});

test('stored local word confidence is usable without a fresh detection', () => {
  const s = { lines: [{ text: 'שלום עולם', words: [{ text: 'שלום', conf: .99 }, { text: 'עולם', conf: .4 }] }] };
  const r = buildPageWordReview({ content: 'שלום עולם' }, s);
  assert.equal(r.available, true);
  assert.deepEqual(r.suspects.map((w) => [w.text, w.reasons]), [['עולם', ['low_conf']]]);
});
