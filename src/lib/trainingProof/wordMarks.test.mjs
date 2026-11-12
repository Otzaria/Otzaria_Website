// מילים חשודות בשורת-זיהוי — wordMarks.js (טהור)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMarks, marksForText, markedSegments, replaceWord } from './wordMarks.js';
import { publicItem } from './shape.js';
import { ocrItem } from './testFixtures.js';

const T = 'אמר רבי יצחק לא היה צריך';

test('cleanMarks: מקום, רמה ועד 3 חלופות; פריט פגום יורד', () => {
  const raw = [
    {
      i: 2,
      word: 'יצחק',
      level: 'fix',
      sugg: ['יצחק,', 'יצחק', ' ', 'יצחקי', 'צחק', 'עוד'],
      p: 0.9,
      why: ['x'],
    },
    { i: 0, word: 'אמר', level: 'check', sugg: ['אמד'] },
    { i: 1, word: 'רב', level: 'check' }, // המילה אינה במקום
    { i: 9, word: 'צריך', level: 'check' }, // מחוץ לשורה
    { i: 3, word: 'לא', level: 'other' },
    { i: 4, word: 'היה', level: 'fix', sugg: ['<b>'] }, // בלי חלופה תקינה ← check
    { i: 0, word: 'אמר', level: 'fix', sugg: ['אמד'] }, // כפילות
    'junk',
    null,
  ];
  assert.deepEqual(cleanMarks(raw, T), [
    { i: 0, word: 'אמר', level: 'check' },
    { i: 2, word: 'יצחק', level: 'fix', sugg: ['יצחק,', 'יצחקי', 'צחק'] },
    { i: 4, word: 'היה', level: 'check' },
  ]);
  assert.equal(cleanMarks(undefined, T), null);
  assert.equal(cleanMarks('x', T), null);
  assert.equal(cleanMarks([{ i: 1, word: 'רב', level: 'check' }], T), null);
});

test('marksForText: מילה שזזה נשארת, מילה שתוקנה — הסימון יורד', () => {
  const ms = [
    { i: 2, word: 'יצחק', level: 'fix', sugg: ['יצחקי'] },
    { i: 4, word: 'היה', level: 'check' },
  ];
  assert.deepEqual(
    marksForText(ms, T).map((m) => m.i),
    [2, 4]
  );
  assert.deepEqual(
    marksForText(ms, 'ו אמר רבי יצחק לא היה צריך').map((m) => m.i),
    [3, 5]
  );
  assert.deepEqual(
    marksForText(ms, 'אמר רבי יצחקי לא היה צריך').map((m) => m.word),
    ['היה']
  );
  assert.deepEqual(marksForText(null, T), []);
});

test('markedSegments: הטקסט כמו שהוא, מילה מסומנת במקטע משלה', () => {
  const segs = markedSegments('אמר  רבי יצחק', [{ i: 1, word: 'רבי', level: 'check' }]);
  assert.deepEqual(
    segs.map((s) => s.text),
    ['אמר  ', 'רבי', ' יצחק']
  );
  assert.equal(segs.map((s) => s.text).join(''), 'אמר  רבי יצחק');
  assert.equal(segs[1].mark.word, 'רבי');
  assert.deepEqual(markedSegments('א ב', []), [{ text: 'א ב' }]);
});

test('replaceWord: רק המילה, הרווחים נשמרים', () => {
  assert.deepEqual(replaceWord('אמר  רבי יצחק', 1, 'רב'), {
    text: 'אמר  רב יצחק',
    caret: 7,
  });
  assert.equal(replaceWord('אמר', 4, 'x'), null);
});

test('publicItem: marks רק כשיש, בצורה הנקייה; חבילה ישנה — null', () => {
  const d = { _id: 'abc', section: 'ocr', status: 'held', payload: ocrItem(0) };
  assert.equal(publicItem(d).marks, null);
  const text = publicItem(d).text;
  const w = text.split(' ')[1];
  const s = publicItem({
    ...d,
    payload: ocrItem(0, {
      marks: [
        {
          i: 1,
          word: w,
          level: 'fix',
          sugg: ['x1', 'x2', 'x3', 'x4'],
          p: 0.8,
          why: ['למה'],
        },
      ],
    }),
  });
  assert.deepEqual(s.marks, [{ i: 1, word: w, level: 'fix', sugg: ['x1', 'x2', 'x3'] }]);
});
