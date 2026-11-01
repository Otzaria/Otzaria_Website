import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { lineAlignmentFor } from './caretTrack.js';
import { alignLines } from './lineAlign.js';

const page = (n) => Array.from({ length: n }, (_, i) => ({
  text: `אמר רבי יהודה אמר רב דברי תורה וחכמים מצוות ישראל ודברי שלום ${i}`,
  bbox: [10, i * 25, 700, i * 25 + 20], stream: 'main', words: []
}));

test('הקלדת תווים בעמוד בן 200 שורות אינה מריצה מחדש יישור ריבועי יקר', () => {
  const scan = page(200);
  const text = scan.map((l) => l.text).join('\n');
  lineAlignmentFor(text, scan);
  const times = [];
  for (let i = 1; i <= 3; i++) {
    // כל פעם טקסט חדש: המטמון של היישור הקודם אינו יכול להסתיר את עלות העריכה.
    const start = performance.now();
    const al = lineAlignmentFor(text + 'א'.repeat(i), scan);
    times.push(performance.now() - start);
    assert.deepEqual(al.map((a) => a.scanIndex), scan.map((_, j) => j));
  }
  const median = times.sort((a, b) => a - b)[1];
  // מרווח למכונות CI עמוסות; לפני התיקון התרחיש לקח מקומית כ-1,000ms לעריכה.
  assert.ok(median < 150, `חציון זמן עריכה: ${median.toFixed(1)}ms`);
});

test('גם עם שגיאות OCR בכל שורה, ה-DP משתמש בנתוני השוואה מוכנים מראש', () => {
  const scan = page(200);
  const text = scan.map((l) => l.text.replace('רבי', 'רכה').replace('שלום', 'סלום'));
  const start = performance.now();
  const al = alignLines(text, scan);
  const elapsed = performance.now() - start;
  assert.deepEqual(al.map((a) => a.scanIndex), scan.map((_, i) => i));
  assert.ok(elapsed < 400, `יישור עם שגיאות OCR: ${elapsed.toFixed(1)}ms`);
});
