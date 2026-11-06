import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFlow, flowCaret, flowOffsetFromScan } from './flowTrack.js';
import { buildFlowTextMap } from './flowTextMap.js';
import { lineWords } from './caretWord.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/rashba-flow.json', import.meta.url)));
const scan = fixture.lines.map((l) => ({ ...l, words: l.words.map((w, i) => ({ text: l.text.split(/\s+/)[i], bbox: [w[0], l.bbox[1], w[1], l.bbox[3]] })) }));

test('Rashba page 3: all 649 flowing words map to their OCR boxes across both columns, in both directions', () => {
  const m = buildFlow(fixture.text, scan);
  const expected = scan.flatMap((l, si) => l.words.map((w) => ({ ...w, si })));
  const words = lineWords(fixture.text);
  assert.equal(words.length, 649);
  words.forEach((w, i) => {
    const t = flowCaret(fixture.text, w.start, scan, m);
    assert.equal(t.scanIndex, expected[i].si, `word ${i}: ${w.text}`);
    assert.deepEqual(t.wordBox, expected[i].bbox);
    assert.equal(t.kind, 'solid');
    assert.equal(flowOffsetFromScan(fixture.text, scan, m, t.scanIndex, (t.wordBox[0] + t.wordBox[2]) / 2), w.start);
  });
});

test('text alignment survives insertions, deletions, spelling corrections, markup and new paragraphs', () => {
  const original = fixture.text;
  const edited = '<b>' + original.replace('דשות', 'רשות').replace('בטוחות', 'בטוחות חדשות').replace('מרובה.', 'מרובה מאוד.\n').replace('מעידי ', '') + '</b>';
  const m = buildFlow(edited, scan);
  const originalMap = buildFlowTextMap(original, scan);
  for (const word of ['משטרי', 'תשובה', 'הזקופין', 'מדחשוון']) {
    const off = edited.indexOf(word);
    const expected = originalMap.byOffset.get(original.indexOf(word));
    const t = flowCaret(edited, off, scan, m);
    assert.equal(t.scanIndex, expected.si, word);
    assert.deepEqual(t.wordBox, expected.box, word);
    assert.equal(t.kind, 'solid');
    assert.equal(flowOffsetFromScan(edited, scan, m, t.scanIndex, (t.wordBox[0] + t.wordBox[2]) / 2), off);
  }
  const inserted = flowCaret(edited, edited.indexOf('חדשות'), scan, m);
  assert.equal(inserted.wordBox, null);
  assert.equal(inserted.lineEstimated, true);
  const corrected = flowCaret(edited, edited.indexOf('רשות'), scan, m);
  assert.deepEqual(corrected.wordBox, scan[2].words[0].bbox);
});

test('unlabelled or incomplete OCR words keep the geometry fallback; oversized unrelated gaps remain unmapped', () => {
  assert.equal(buildFlowTextMap(fixture.text, scan.map((l) => ({ ...l, words: l.words.map(({ bbox }) => ({ bbox })) }))), null);
  assert.equal(buildFlowTextMap(fixture.text, [{ ...scan[0], words: [] }]), null);
  const unrelated = Array.from({ length: 1000 }, () => 'אחרת').join(' ');
  const map = buildFlowTextMap(unrelated, scan);
  assert.ok(map.targets.every((t) => t.box === null));
});

test('OCR split/merged words use textual alignment and bound joined boxes to one scan line', () => {
  const l = (texts, y) => ({ bbox: [0, y, 100, y + 10], words: texts.map((text, i) => ({ text, bbox: [80 - i * 20, y, 95 - i * 20, y + 10] })) });
  const S = [l(['בית', 'המקדש'], 0), l(['שלוםעולם'], 20), l(['סוף'], 40), l(['עמוד'], 60)];
  const text = 'ביתהמקדש שלום עולם סוף עמוד';
  const m = buildFlow(text, S);
  assert.deepEqual(flowCaret(text, 0, S, m).wordBox, [60, 0, 95, 10]);
  assert.deepEqual(flowCaret(text, text.indexOf('שלום'), S, m).wordBox, S[1].words[0].bbox);
  assert.deepEqual(flowCaret(text, text.indexOf('עולם'), S, m).wordBox, S[1].words[0].bbox);
});
