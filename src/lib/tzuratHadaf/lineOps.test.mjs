// שבירת שורות בצורת הדף (lineOps.js): הזזת מילים בין שורות, דחיית פעולות לא חוקיות, וגזירת העוגנים.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLineOps,
  applyLineOps,
  deriveAnchors,
  opFirstWordUp,
  opLastWordDown,
  opStartAt,
  flattenBlock,
} from './lineOps.js';

const w = (t, wi, ref = 'r1') => ({ t, ref, wi });
// גוש של שלוש שורות: [a b c] [d e] [f g h]
const model = () => ({
  blocks: [
    {
      id: 'g',
      kind: 'g',
      lines: [
        { i: 0, words: [w('a', 0), w('b', 1), w('c', 2)] },
        { i: 1, words: [w('d', 3), w('e', 4)] },
        { i: 2, words: [w('f', 5), w('g', 6), w('h', 7)] },
      ],
    },
    { id: 't', kind: 't', lines: [{ i: 0, words: [w('x', 0, 'r2')] }] },
  ],
});
const texts = (m, id) => m.blocks.find((b) => b.id === id).lines.map((l) => l.words.map((x) => x.t).join(''));

test('בלי פעולות: המודל כמו שהוא', () => {
  const { model: m, rejected } = applyLineOps(model(), []);
  assert.deepEqual(texts(m, 'g'), ['abc', 'de', 'fgh']);
  assert.equal(rejected.length, 0);
});

test('המילה האחרונה יורדת לשורה הבאה, והראשונה עולה לקודמת', () => {
  const b = model().blocks[0];
  const down = opLastWordDown(b, 0); // c -> שורה 1
  assert.deepEqual(down, { op: 'start', block: 'g', line: 1, ref: 'r1', wi: 2 });
  let r = applyLineOps(model(), [down]);
  assert.deepEqual(texts(r.model, 'g'), ['ab', 'cde', 'fgh']);
  const up = opFirstWordUp(r.model.blocks[0], 2); // f -> שורה 1
  r = applyLineOps(model(), [down, up]);
  assert.deepEqual(texts(r.model, 'g'), ['ab', 'cdef', 'gh']);
});

test('השורה מתחילה במילה מהשורה הקודמת או מתוכה', () => {
  const b = model().blocks[0];
  let r = applyLineOps(model(), [opStartAt(b, 1, b.lines[0].words[1])]); // שורה 1 מתחילה ב-b
  assert.deepEqual(texts(r.model, 'g'), ['a', 'bcde', 'fgh']);
  r = applyLineOps(model(), [opStartAt(b, 2, b.lines[2].words[1])]); // שורה 2 מתחילה ב-g
  assert.deepEqual(texts(r.model, 'g'), ['abc', 'def', 'gh']);
});

test('פעולות לא חוקיות נדחות עם סיבה, והשאר חלות', () => {
  const ops = [
    { op: 'start', block: 'g', line: 0, ref: 'r1', wi: 1 }, // שורה ראשונה
    { op: 'start', block: 'g', line: 1, ref: 'r1', wi: 0 }, // משאיר את שורה 0 ריקה
    { op: 'start', block: 'g', line: 1, ref: 'r1', wi: 6 }, // שתי שורות קדימה
    { op: 'start', block: 'g', line: 1, ref: 'r9', wi: 1 }, // אין כזו מילה
    { op: 'start', block: 'zz', line: 1, ref: 'r1', wi: 1 }, // אין כזה גוש
    { op: 'start', block: 'g', line: 1, ref: 'r1', wi: 4 }, // חוקית: [abcd] [e] [fgh]
  ];
  const r = applyLineOps(model(), ops);
  assert.deepEqual(
    r.rejected.map((x) => x.reason),
    ['first_line', 'out_of_range', 'out_of_range', 'no_word', 'unknown_line']
  );
  assert.deepEqual(texts(r.model, 'g'), ['abcd', 'e', 'fgh']);
});

test('המודל המקורי אינו משתנה', () => {
  const m = model();
  applyLineOps(m, [opLastWordDown(m.blocks[0], 0)]);
  assert.deepEqual(texts(m, 'g'), ['abc', 'de', 'fgh']);
});

test('עוגנים: start עם המילה הראשונה אחרי כל הפעולות, confirm לשורה שאושרה, ובלי שורות שלא נגעו בהן', () => {
  const b = model().blocks[0];
  const ops = [
    opLastWordDown(b, 0), // שורה 1 מתחילה ב-c
    { op: 'confirm', block: 'g', line: 2 },
    { op: 'confirm', block: 't', line: 0 },
    { op: 'confirm', block: 'g', line: 1 }, // confirm אחרי start לא מבטל את ה-start
  ];
  assert.deepEqual(deriveAnchors(model(), ops), [
    { block: 'g', line: 1, ref: 'r1', wi: 2, action: 'start' },
    { block: 'g', line: 2, action: 'confirm' },
    { block: 't', line: 0, action: 'confirm' },
  ]);
});

test('start על המילה המקורית נשמר כעוגן (קביעה מפורשת)', () => {
  const ops = [{ op: 'start', block: 'g', line: 1, ref: 'r1', wi: 3 }];
  assert.deepEqual(deriveAnchors(model(), ops), [{ block: 'g', line: 1, ref: 'r1', wi: 3, action: 'start' }]);
});

test('עזרי הפעולות מחזירים null כשאין מה להזיז', () => {
  const b = { id: 'g', lines: [{ i: 0, words: [w('a', 0)] }, { i: 1, words: [w('b', 1)] }] };
  assert.equal(opFirstWordUp(b, 1), null); // מילה אחת בשורה
  assert.equal(opLastWordDown(b, 1), null); // אין שורה הבאה
  assert.equal(opFirstWordUp(b, 0), null); // שורה ראשונה
  assert.equal(opStartAt(b, 0, b.lines[0].words[0]), null);
  const noRef = { id: 'g', lines: [{ i: 0, words: [{ t: 'א' }, { t: 'ב' }] }, { i: 1, words: [w('c', 2)] }] };
  assert.equal(opLastWordDown(noRef, 0), null);
});

test('flattenBlock: שורה ריקה מקבלת את מקום ההתחלה של הבאה', () => {
  const { words, starts } = flattenBlock({ lines: [{ words: [w('a', 0)] }, { words: [] }, { words: [w('b', 1)] }] });
  assert.equal(words.length, 2);
  assert.deepEqual(starts, [0, 1, 1]);
});

test('normalizeLineOps: צורה תקינה עוברת, שגויה נדחית בעברית', () => {
  assert.deepEqual(normalizeLineOps(null), { ops: [] });
  assert.deepEqual(normalizeLineOps([{ op: 'confirm', block: 'g', line: 2, extra: 1 }]), {
    ops: [{ op: 'confirm', block: 'g', line: 2 }],
  });
  for (const bad of [{}, [{ op: 'x', block: 'g', line: 1 }], [{ op: 'start', block: 'g', line: 1 }], [{ op: 'confirm', block: '', line: 1 }], [{ op: 'confirm', block: 'g', line: 1.5 }]]) {
    assert.ok(normalizeLineOps(bad).error, JSON.stringify(bad));
  }
});

test('שורה מדומה וגוש נעול אינם מקבלים פעולות', () => {
  const m = {
    blocks: [
      {
        id: 'g',
        lines: [
          { i: 0, words: [w('a', 0), w('b', 1)] },
          { i: -1, fake: true, words: [w('הדרן', 2)] },
          { i: 1, words: [w('c', 3), w('d', 4)] },
          { i: 2, words: [w('e', 5), w('f', 6)] },
        ],
      },
      { id: 'mg0', editable: false, lines: [{ i: 0, words: [w('x', 0, 'r3')] }, { i: 1, words: [w('y', 1, 'r3'), w('z', 2, 'r3')] }] },
    ],
  };
  const g = m.blocks[0];
  assert.equal(opFirstWordUp(g, 2), null); // השורה הקודמת מדומה
  assert.equal(opLastWordDown(g, 0), null); // השורה הבאה מדומה
  assert.equal(opStartAt(g, 1, g.lines[1].words[0]), null);
  assert.ok(opFirstWordUp(g, 3)); // בין שתי שורות אמיתיות
  assert.equal(opFirstWordUp(m.blocks[1], 1), null);
  const r = applyLineOps(m, [
    { op: 'start', block: 'g', line: 1, ref: 'r1', wi: 4 },
    { op: 'confirm', block: 'g', line: -1 },
    { op: 'start', block: 'mg0', line: 1, ref: 'r3', wi: 2 },
    { op: 'start', block: 'g', line: 2, ref: 'r1', wi: 4 },
  ]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['fake_line', 'fake_line', 'locked']);
  assert.deepEqual(texts(r.model, 'g'), ['ab', 'הדרן', 'c', 'def']);
});
