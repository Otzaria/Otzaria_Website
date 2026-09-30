import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUGGESTION_GROUPS,
  popupWordKey,
  wordText,
  formatPct,
  suggestionData,
  hasSuggestions,
  moveActive,
  placePopup,
} from './wordPopup.js';

const line = {
  id: 7,
  text: 'אמר  רבי יוחנן',
  alternatives: [{ i: 1, word: 'רבי', p: 0.35, alts: [{ text: 'רב', p: 0.4 }, { text: 'רבו', p: 0.15 }], other_p: 0.1 }],
  lm_flags: [{ i: 1, word: 'רבי', kinds: ['lm', 'rec'], lm: [{ text: 'רבה', gain: 1.2 }, { text: 'רב', gain: 2 }], rec: [{ text: 'רבו', gain: 0.8 }] }],
};

test('מפתח-המילה וטקסט המילה לפי אותו כלל-פיצול של tokenize', () => {
  assert.equal(popupWordKey(7, 1), '7:1');
  assert.equal(popupWordKey(-2, 0), '-2:0');
  assert.equal(wordText(line, 0), 'אמר');
  assert.equal(wordText(line, 2), 'יוחנן', 'רווח כפול אינו מילה');
  assert.equal(wordText(line, 3), null);
  assert.equal(wordText(line, -1), null);
  assert.equal(wordText({ text: '' }, 0), null);
});

test('אחוזים: עיגול, וקצוות שאינם הופכים ל-0% או 100%', () => {
  assert.equal(formatPct(0.347), '35%');
  assert.equal(formatPct(0), '0%');
  assert.equal(formatPct(1), '100%');
  assert.equal(formatPct(0.001), '<1%');
  assert.equal(formatPct(0.998), '>99%');
  assert.equal(formatPct(null), '');
  assert.equal(formatPct(Number.NaN), '');
});

test('רשימת ההצעות: rec קודם, אחריו חלופות לפי הסתברות, ואז מודל-השפה — בלי כפילויות', () => {
  const d = suggestionData(line, 1);
  assert.equal(d.word, 'רבי');
  assert.equal(d.p, 0.35);
  assert.equal(d.otherP, 0.1);
  assert.deepEqual(d.kinds, ['lm', 'rec']);
  assert.deepEqual(
    d.items.map((x) => [x.text, x.kind]),
    [
      ['רבו', 'rec'],
      ['רב', 'alt'],
      ['רבה', 'lm'],
    ]
  );
  // rec שהיא גם חלופת-זיהוי — עם ההסתברות שלה ועם also
  assert.equal(d.items[0].p, 0.15);
  assert.deepEqual(d.items[0].also, ['alt']);
  // "רב" הוצעה גם ע"י מודל-השפה — מופיעה פעם אחת, כחלופה, ו-also מציין את lm
  assert.deepEqual(d.items[1].also, ['lm']);
  assert.equal(d.items[1].gain, null);
  assert.equal(d.items[2].p, null);
  assert.equal(d.items[2].gain, 1.2);
  assert.equal(SUGGESTION_GROUPS.map((g) => g.kind).join(','), 'rec,alt,lm');
});

test('הצעה זהה למילה או ריקה — מושמטת; מילה בלי הצעות — אין חלונית', () => {
  const l = {
    text: 'שלום עולם',
    alternatives: [{ i: 0, p: 0.5, alts: [{ text: 'שלום', p: 0.3 }, { text: '  ', p: 0.1 }, { text: ' שלוס ', p: 0.1 }] }],
  };
  const d = suggestionData(l, 0);
  assert.deepEqual(
    d.items.map((x) => x.text),
    ['שלוס']
  );
  assert.equal(hasSuggestions(l, 0), true);
  assert.equal(hasSuggestions(l, 1), false, 'למילה 1 אין הצעות');
  assert.equal(suggestionData(l, 5), null, 'אין מילה כזו');
  assert.equal(hasSuggestions(null, 0), false);
  // חשד בלי הצעות (רק סבירות נמוכה) — אין מה להציע
  assert.equal(hasSuggestions({ text: 'א ב', alternatives: [{ i: 0, p: 0.2, alts: [] }] }, 0), false);
});

test('תזוזה במקלדת עם גלישה', () => {
  assert.equal(moveActive(0, 1, 3), 1);
  assert.equal(moveActive(2, 1, 3), 0);
  assert.equal(moveActive(0, -1, 3), 2);
  assert.equal(moveActive(-1, 1, 3), 0, 'בלי בחירה — חץ למטה = הראשונה');
  assert.equal(moveActive(-1, -1, 3), 2, 'בלי בחירה — חץ למעלה = האחרונה');
  assert.equal(moveActive(0, 1, 0), 0);
});

test('מיקום: מתחת למילה, מיושר לקצה הימני שלה', () => {
  const p = placePopup({ left: 300, top: 100, right: 360, bottom: 120 }, { width: 200, height: 150 }, { width: 1000, height: 800 });
  assert.deepEqual(p, { top: 124, left: 160, above: false });
});

test('מיקום: מעל המילה כשאין מקום מתחת', () => {
  const p = placePopup({ left: 300, top: 700, right: 360, bottom: 720 }, { width: 200, height: 150 }, { width: 1000, height: 800 });
  assert.equal(p.above, true);
  assert.equal(p.top, 700 - 4 - 150);
});

test('מיקום: נשאר בתוך המסך (שוליים) גם ליד הקצוות', () => {
  const nearRightEdgeLeft = placePopup({ left: 5, top: 10, right: 40, bottom: 30 }, { width: 200, height: 100 }, { width: 1000, height: 800 });
  assert.equal(nearRightEdgeLeft.left, 8, 'לא יוצא משמאל');
  const wide = placePopup({ left: 980, top: 10, right: 1000, bottom: 30 }, { width: 200, height: 100 }, { width: 1000, height: 800 }, { align: 'left' });
  assert.equal(wide.left, 1000 - 8 - 200, 'לא יוצא מימין');
  const tall = placePopup({ left: 300, top: 300, right: 360, bottom: 320 }, { width: 200, height: 2000 }, { width: 1000, height: 800 });
  assert.equal(tall.top, 8, 'חלונית גבוהה מהמסך — מראש המסך');
});

test('מיקום: קלט חסר אינו מפיל', () => {
  const p = placePopup(null, null, null);
  assert.equal(typeof p.top, 'number');
  assert.equal(typeof p.left, 'number');
});
