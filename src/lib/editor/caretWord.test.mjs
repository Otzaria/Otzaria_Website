import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineWords, lineStarts, caretInfo, offsetOfWord, wordIndexAtCol, lineCount, splitLines } from './caretWord.js';

const core = (w, line) => line.slice(w.coreStart, w.coreEnd);

test('lineWords: מילים לפי רווחים עם היסטים', () => {
  const ws = lineWords('  בראשית  ברא אלהים ');
  assert.deepEqual(
    ws.map((w) => [w.text, w.start, w.end, w.i]),
    [
      ['בראשית', 2, 8, 0],
      ['ברא', 10, 13, 1],
      ['אלהים', 14, 19, 2],
    ]
  );
});

test('lineWords: שורה ריקה / רווחים בלבד / null', () => {
  assert.deepEqual(lineWords(''), []);
  assert.deepEqual(lineWords('   \t '), []);
  assert.deepEqual(lineWords(null), []);
});

test('lineWords: גרעין בלי פיסוק בקצוות, גרש/גרשיים בפנים נשארים', () => {
  const s = `(תוס') "שלום" ר"ת, וכו'. —`;
  const ws = lineWords(s);
  assert.deepEqual(
    ws.map((w) => core(w, s)),
    [`תוס'`, 'שלום', 'ר"ת', `וכו'`, '']
  );
});

test('lineWords: ניקוד וטעמים נשארים בגרעין, גם לפני גרש', () => {
  const s = 'שָׁלוֹם׳ בְּרֵאשִׁ֖ית:';
  const ws = lineWords(s);
  assert.equal(core(ws[0], s), 'שָׁלוֹם׳');
  assert.equal(core(ws[1], s), 'בְּרֵאשִׁ֖ית');
});

test('lineWords: מקף עברי — מילה אחת כברירת מחדל, פיצול לפי בקשה', () => {
  const s = 'כל־העם אמרו';
  assert.equal(lineWords(s).length, 2);
  const ws = lineWords(s, { splitMaqaf: true });
  assert.deepEqual(
    ws.map((w) => [w.text, w.start, w.end, core(w, s)]),
    [
      ['כל־', 0, 3, 'כל'],
      ['העם', 3, 6, 'העם'],
      ['אמרו', 7, 11, 'אמרו'],
    ]
  );
  // מקף בסוף המילה אינו יוצר חלק ריק
  assert.deepEqual(lineWords('על־', { splitMaqaf: true }).map((w) => w.text), ['על־']);
});

test('lineStarts / lineCount / splitLines (כולל \\r\\n ושורות ריקות)', () => {
  assert.deepEqual(lineStarts('א\nבב\n\nג'), [0, 2, 5, 6]);
  assert.equal(lineCount(''), 1);
  assert.equal(lineCount('א\n'), 2);
  assert.deepEqual(splitLines('א\r\nב\n'), ['א', 'ב', '']);
});

test('wordIndexAtCol: בתוך, צמוד לסוף, ברווח (הבאה), אחרי האחרונה', () => {
  const ws = lineWords('אב גד הו');
  assert.equal(wordIndexAtCol(ws, 0), 0);
  assert.equal(wordIndexAtCol(ws, 2), 0);
  assert.equal(wordIndexAtCol(ws, 3), 1);
  assert.equal(wordIndexAtCol(lineWords('אב   גד'), 3), 1);
  assert.equal(wordIndexAtCol(lineWords('אב גד  '), 7), 1);
  assert.equal(wordIndexAtCol([], 0), -1);
});

test('caretInfo: שורה, עמודה ומילה', () => {
  const t = 'בראשית ברא\nאלהים את השמים';
  const c = caretInfo(t, 17);
  assert.equal(c.line, 1);
  assert.equal(c.col, 6);
  assert.equal(c.lineStart, 11);
  assert.equal(c.lineText, 'אלהים את השמים');
  assert.equal(c.word, 1);
  assert.equal(c.wordStart, 6);
  assert.equal(c.wordEnd, 8);
  assert.equal(c.inWord, true);
});

test('caretInfo: סמן מיד אחרי \\n שייך לשורה הבאה; לפניו — לקודמת', () => {
  const t = 'אב\nגד';
  assert.equal(caretInfo(t, 2).line, 0);
  assert.equal(caretInfo(t, 2).word, 0);
  assert.equal(caretInfo(t, 3).line, 1);
  assert.equal(caretInfo(t, 3).col, 0);
});

test('caretInfo: ברווח לפני מילה — המילה הבאה, inWord=false', () => {
  const c = caretInfo('אב    גד', 4);
  assert.equal(c.word, 1);
  assert.equal(c.inWord, false);
});

test('caretInfo: טקסט ריק, שורה ריקה, מיקום מחוץ לטווח', () => {
  const e = caretInfo('', 5);
  assert.deepEqual([e.line, e.col, e.word, e.wordStart, e.wordEnd], [0, 0, -1, -1, -1]);
  const m = caretInfo('אב\n\nגד', 3);
  assert.equal(m.line, 1);
  assert.equal(m.word, -1);
  assert.equal(caretInfo('אב גד', 999).word, 1);
  assert.equal(caretInfo('אב גד', -3).col, 0);
  assert.equal(caretInfo('אב גד', NaN).word, 0);
});

test('caretInfo: \\r\\n — ה-\\r אינו חלק מהשורה', () => {
  const c = caretInfo('אב\r\nגד', 1);
  assert.equal(c.lineText, 'אב');
  assert.equal(c.lineEnd, 2);
});

test('caretInfo: splitMaqaf עובר הלאה', () => {
  assert.equal(caretInfo('כל־העם', 4).word, 0);
  assert.equal(caretInfo('כל־העם', 4, { splitMaqaf: true }).word, 1);
});

test('offsetOfWord: הלוך-חזור מול caretInfo', () => {
  const t = 'בראשית ברא\n  אלהים את השמים\n\nואת';
  for (let line = 0; line < 4; line++) {
    const n = caretInfo(t, offsetOfWord(t, line, 0)).words.length;
    for (let w = 0; w < n; w++) {
      const off = offsetOfWord(t, line, w);
      const c = caretInfo(t, off);
      assert.equal(c.line, line);
      assert.equal(c.word, w);
      assert.equal(c.col, c.wordStart);
    }
  }
});

test('offsetOfWord: קצוות', () => {
  const t = 'אב גד\n\nהו';
  assert.equal(offsetOfWord(t, 0, -1), 0);
  assert.equal(offsetOfWord(t, 0, 99), 5);
  assert.equal(offsetOfWord(t, 1, 0), 6);
  assert.equal(offsetOfWord(t, 3, 0), -1);
  assert.equal(offsetOfWord(t, -1, 0), -1);
  assert.equal(offsetOfWord(t, 1.5, 0), -1);
  assert.equal(offsetOfWord('', 0, 0), 0);
});

test('lineWords: שמור לפי תוכן השורה ולפי splitMaqaf', () => {
  const s = 'alpha beta-gamma delta '.repeat(20);
  const a = lineWords(s);
  assert.equal(lineWords(s), a);
  assert.notEqual(lineWords(s, { splitMaqaf: true }), a);
  assert.deepEqual(lineWords(s + 'x').slice(0, 3), a.slice(0, 3));
});
