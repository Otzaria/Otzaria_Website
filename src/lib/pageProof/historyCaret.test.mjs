import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from './ops.js';
import { textChangeCaret, historyCaret } from './historyCaret.js';

test('textChangeCaret: אחרי מה שנוסף, במקום מה שנמחק, והחלפה', () => {
  assert.equal(textChangeCaret('יוחנןאב', 'יוחנן'), 5, 'ביטול הקלדה — הסמן בסוף המילה');
  assert.equal(textChangeCaret('יוחנןא', 'יוחנןאב'), 7, 'ביטול מחיקה — אחרי האות שחזרה');
  assert.equal(textChangeCaret('אב גד', 'אב הו גד'), 6, 'אחרי "הו " שנוסף');
  assert.equal(textChangeCaret('אבג', 'אדג'), 2);
  assert.equal(textChangeCaret('אאא', 'אא'), 2, 'אות כפולה — הסמן בסוף הרצף');
  assert.equal(textChangeCaret('אב', 'אב'), null);
  assert.equal(textChangeCaret(null, 'א'), 1);
});

test('historyCaret: השורה של פעולת-הטקסט שבוטלה; בלי שינוי-טקסט — null', () => {
  const doc = {
    page: 1,
    size: [100, 100],
    lines: [
      { id: 1, order: 1, text: 'אמר רבי', text_ocr: 'אמר רבי', stream: 'main', words: [] },
      { id: 2, order: 2, text: 'יוחנן', text_ocr: 'יוחנן', stream: 'main', words: [] },
    ],
  };
  const op = { kind: 'text', page: 1, ids: [2], value: 'יוחנןאב' };
  const withOp = buildView(doc, [op]);
  const without = buildView(doc, []);
  assert.deepEqual(historyCaret(withOp, without, [op]), { lineId: 2, offset: 5 }, 'ביטול');
  assert.deepEqual(historyCaret(without, withOp, [op]), { lineId: 2, offset: 7 }, 'חזרה');
  const style = { kind: 'styles', page: 1, ids: [1], value: { style: 'b', words: [0, 0], on: true } };
  assert.equal(historyCaret(buildView(doc, [style]), without, [style]), null);
  assert.equal(historyCaret(without, without, [op]), null);
});
