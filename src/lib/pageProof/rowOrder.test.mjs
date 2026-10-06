import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildView, rowsRtl, ROW_RULE } from './ops.js';

// המקרים המשותפים לתוכנת-הספר (orderguard.py, row_order_cases.json) — אותו קובץ בשני המאגרים
const CASES = JSON.parse(fs.readFileSync(new URL('./rowOrder.cases.json', import.meta.url), 'utf8'));

test('rowsRtl: the shared row-order cases', () => {
  for (const c of CASES.cases) {
    assert.deepEqual(rowsRtl(c.items).map((it) => it.id), c.expect, c.name);
  }
});

test('rowsRtl: the rule constants match the shared file', () => {
  assert.deepEqual(ROW_RULE, CASES.rule);
});

test('rowsRtl: does not mutate its input', () => {
  const items = CASES.cases[0].items.map((it) => ({ ...it }));
  const before = JSON.stringify(items);
  rowsRtl(items);
  assert.equal(JSON.stringify(items), before);
});

test('frame order: two lines of one column with tall boxes stay top to bottom', () => {
  // הסדר אחרי עריכת-מסגרות בעורך = הסדר שהתוכנה מחשבת (core/page/frames + orderguard)
  const line = (id, bbox, order) => ({
    id, bbox, order, line_no: id, text: `שורה ${id}`, text_ocr: `שורה ${id}`, status: 'pending',
    stream: 'main', stream_src: 'auto', words: [], flags: {},
  });
  const doc = {
    lines: [line(1, [1292, 1740, 2435, 1823], 1), line(2, [1289, 1669, 2477, 1791], 2), line(3, [1290, 1850, 2440, 1930], 3)],
    frames: [{ fid: 'f1', stream: 'main', bbox: [1200, 1600, 2500, 1950], order: 1 }],
    frames_confirmed: true,
  };
  assert.deepEqual(buildView(doc, []).lines.map((l) => l.id), [2, 1, 3]);
});
