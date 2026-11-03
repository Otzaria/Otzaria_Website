import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWrap, isLineForLine } from './wrapMode.js';

const scan = (n) => Array.from({ length: n }, (_, i) => ({ bbox: [0, i * 40, 800, i * 40 + 30] }));
const line = (words) => Array.from({ length: words }, () => 'מילה').join(' ');

test('שורה מול שורה: מספר שורות כמו בצילום ואורכים דומים → off', () => {
  const text = Array.from({ length: 10 }, () => line(8)).join('\n');
  assert.equal(isLineForLine(text, scan(10)), true);
  assert.equal(effectiveWrap('off', text, scan(10)), 'off');
});

test('כל העמוד בשורה אחת → soft', () => {
  assert.equal(effectiveWrap('off', line(200), scan(30)), 'soft');
});

test('גוש בצילום של שורות מעטות (מתחת לסף המעקב הזורם) → soft', () => {
  assert.equal(effectiveWrap('off', line(40), scan(2)), 'soft');
});

test('רוב השורות תואמות אבל פסקה אחת הודבקה לשורה אחת → soft', () => {
  const lines = Array.from({ length: 24 }, () => line(8));
  lines[5] = line(40);
  assert.equal(effectiveWrap('off', lines.join('\n'), scan(30)), 'soft');
});

test('שורות קצרות (כותרת, סוף פסקה) לא מפריעות ל-off', () => {
  const lines = Array.from({ length: 12 }, () => line(8));
  lines[0] = 'כותרת';
  lines[6] = line(2);
  assert.equal(effectiveWrap('off', lines.join('\n'), scan(12)), 'off');
});

test('תגיות HTML לא נספרות באורך', () => {
  const lines = Array.from({ length: 6 }, () => line(8));
  lines[2] = `<b>${line(8)}</b><span class="xxxxxxxxxxxxxxxxxxxx"></span><i></i><b></b><i></i><b></b>x</span>`;
  assert.equal(effectiveWrap('off', lines.join('\n'), scan(6)), 'off');
});

test('אין עדיין שורות צילום → soft', () => {
  assert.equal(effectiveWrap('off', line(8), []), 'soft');
  assert.equal(effectiveWrap('off', line(8), null), 'soft');
});

test('בקשת soft/undefined עוברת כמות שהיא', () => {
  assert.equal(effectiveWrap('soft', line(8), scan(1)), 'soft');
  assert.equal(effectiveWrap(undefined, line(200), scan(30)), undefined);
});

test('טקסט ריק עם צילום → off (אין מה לגלוש)', () => {
  assert.equal(effectiveWrap('off', '', scan(5)), 'off');
});
