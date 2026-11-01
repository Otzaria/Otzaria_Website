import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_LAYOUT_LIMITS,
  validatePageLayoutInput,
  parseExpectedVersion,
  displaySize,
  trackToStored,
  storedToTrack,
  parseSize,
} from './pageLayoutValidation.js';

const base = () => ({
  source: 'local-tesseract',
  size: [100, 200],
  lines: [{ bbox: [10, 10, 90, 30], words: [{ bbox: [10, 10, 40, 30], text: ' שלום ', conf: 0.912 }, { bbox: [50, 10, 90, 30] }] }],
});

test('קלט תקין מנורמל: stream ברירת מחדל, טקסט נחתך מרווחים, conf מעוגל', () => {
  const r = validatePageLayoutInput(base());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.lines[0], {
    bbox: [10, 10, 90, 30],
    stream: 'main',
    words: [{ bbox: [10, 10, 40, 30], text: 'שלום', conf: 0.91 }, { bbox: [50, 10, 90, 30] }],
  });
  assert.equal(r.value.wordCount, 2);
});

test('חריגה קטנה מהגבולות נחתכת; חריגה גדולה נדחית בעברית', () => {
  const b = base();
  b.lines[0].bbox = [-1, 10, 101.5, 30];
  assert.deepEqual(validatePageLayoutInput(b).value.lines[0].bbox, [0, 10, 100, 30]);
  b.lines[0].bbox = [0, 10, 110, 30];
  assert.deepEqual(validatePageLayoutInput(b), { ok: false, error: 'שורה 1: התיבה חורגת מגבולות התמונה' });
});

test('שגיאות מבנה: מקור, ממדים, תיבה, מילים, זרם, conf, טקסט ארוך', () => {
  const cases = [
    [(b) => (b.source = 'gemini'), 'מקור התיבות אינו תקין'],
    [(b) => (b.size = [100.5, 200]), /ממדי התמונה אינם תקינים/],
    [(b) => (b.size = [0, 200]), /ממדי התמונה אינם תקינים/],
    [(b) => (b.lines = []), 'אין שורות לשמירה'],
    [(b) => (b.lines = 'x'), 'רשימת השורות חסרה'],
    [(b) => (b.lines[0].bbox = [1, 2, 3]), 'שורה 1: תיבה לא תקינה (נדרשים ארבעה מספרים)'],
    [(b) => (b.lines[0].bbox = [1, 2, '3', 4]), 'שורה 1: תיבה לא תקינה (נדרשים ארבעה מספרים)'],
    [(b) => (b.lines[0].bbox = [50, 10, 40, 30]), 'שורה 1: תיבה ריקה או הפוכה'],
    [(b) => (b.lines[0].words[1].bbox = [NaN, 1, 2, 3]), 'שורה 1, מילה 2: תיבה לא תקינה (נדרשים ארבעה מספרים)'],
    [(b) => (b.lines[0].stream = 'a b'), 'שורה 1: שם זרם לא תקין'],
    [(b) => (b.lines[0].words = {}), 'שורה 1: רשימת המילים אינה תקינה'],
    [(b) => (b.lines[0].words[0].conf = 1.5), 'שורה 1, מילה 1: רמת ודאות לא תקינה (0 עד 1)'],
    [(b) => (b.lines[0].words[0].text = 'א'.repeat(65)), /טקסט ארוך מדי/],
    [(b) => (b.lines[0].words[0].text = 5), 'שורה 1, מילה 1: טקסט לא תקין'],
  ];
  for (const [mut, err] of cases) {
    const b = base();
    mut(b);
    const r = validatePageLayoutInput(b);
    assert.equal(r.ok, false);
    if (err instanceof RegExp) assert.match(r.error, err);
    else assert.equal(r.error, err);
  }
  assert.deepEqual(validatePageLayoutInput(null), { ok: false, error: 'גוף הבקשה אינו תקין' });
});

test('תקרות: שורות, מילים לשורה, מילים בעמוד', () => {
  const line = { bbox: [0, 0, 10, 10], words: [] };
  const b = base();
  b.lines = Array.from({ length: PAGE_LAYOUT_LIMITS.maxLines + 1 }, () => line);
  assert.match(validatePageLayoutInput(b).error, /יותר מדי שורות/);
  b.lines = [{ bbox: [0, 0, 10, 10], words: Array.from({ length: PAGE_LAYOUT_LIMITS.maxWordsPerLine + 1 }, () => ({ bbox: [0, 0, 1, 1] })) }];
  assert.match(validatePageLayoutInput(b).error, /שורה 1: יותר מדי מילים/);
  const full = { bbox: [0, 0, 10, 10], words: Array.from({ length: PAGE_LAYOUT_LIMITS.maxWordsPerLine }, () => ({ bbox: [0, 0, 1, 1] })) };
  b.lines = Array.from({ length: Math.ceil(PAGE_LAYOUT_LIMITS.maxWords / PAGE_LAYOUT_LIMITS.maxWordsPerLine) + 1 }, () => full);
  assert.match(validatePageLayoutInput(b).error, /יותר מדי מילים בעמוד/);
});

test('expectedSize: אי-התאמה לתמונה בפועל → שגיאה', () => {
  assert.equal(validatePageLayoutInput(base(), { expectedSize: [100, 200] }).ok, true);
  assert.match(validatePageLayoutInput(base(), { expectedSize: [200, 100] }).error, /אינם תואמים לתמונת העמוד/);
});

test('parseExpectedVersion / parseSize / displaySize', () => {
  assert.deepEqual(parseExpectedVersion(undefined), { ok: true, value: undefined });
  assert.deepEqual(parseExpectedVersion(0), { ok: true, value: 0 });
  assert.equal(parseExpectedVersion(-1).ok, false);
  assert.equal(parseExpectedVersion('2').ok, false);
  assert.equal(parseSize([1, 20001]), null);
  assert.deepEqual(displaySize({ width: 10, height: 20, orientation: 1 }), [10, 20]);
  assert.deepEqual(displaySize({ width: 10, height: 20, orientation: 6 }), [20, 10]);
  assert.deepEqual(displaySize({ width: 10, height: 20 }), [10, 20]);
  assert.equal(displaySize({ width: null, height: 20 }), null);
  assert.equal(displaySize(null), null);
});

test('trackToStored: מבנה אחיד (local) → גוף PUT תקף; חיתוך לגבולות; בלי ids', () => {
  const track = {
    level: 'word', source: 'local', size: [100, 200],
    lines: [
      { id: 't0', stream: 'main', bbox: [10, 10, 100.4, 30], text: 'x', words: [{ text: 'א', bbox: [60, 10, 100.4, 30], conf: 0.5 }, { text: '', bbox: [10, 10, 50, 30] }] },
      { id: 't1', stream: 'main', bbox: [5, 5, 5, 9] },
    ],
  };
  const out = trackToStored(track);
  assert.deepEqual(out, {
    source: 'local-tesseract', size: [100, 200],
    lines: [{ bbox: [10, 10, 100, 30], words: [{ bbox: [60, 10, 100, 30], text: 'א', conf: 0.5 }, { bbox: [10, 10, 50, 30] }] }],
  });
  assert.equal(validatePageLayoutInput(out, { expectedSize: [100, 200] }).ok, true);
  assert.equal(trackToStored(track, { includeText: false }).lines[0].words[0].text, undefined);
  assert.equal(trackToStored({ source: 'layout', size: [1, 1], lines: [{ bbox: [0, 0, 1, 1] }] }), null);
  assert.equal(trackToStored({ source: 'local', size: null, lines: [] }), null);
});

test('storedToTrack: רשומה שמורה → מבנה אחיד, מילים מימין לשמאל, level לפי מילים', () => {
  const t = storedToTrack({ source: 'local-tesseract', size: [100, 200], lines: [{ bbox: [0, 0, 90, 20], stream: 'main', words: [{ bbox: [0, 0, 40, 20] }, { bbox: [50, 0, 90, 20], text: 'ב', conf: 0.8 }] }] });
  assert.equal(t.level, 'word');
  assert.equal(t.source, 'local');
  assert.deepEqual(t.lines[0].words.map((w) => w.bbox[0]), [50, 0]);
  assert.equal(t.lines[0].id, 's0');
  assert.equal(storedToTrack({ source: 'profile', size: [10, 10], lines: [{ bbox: [0, 0, 5, 5], words: [] }] }).level, 'line');
  assert.equal(storedToTrack({ source: 'x', size: [10, 10], lines: [] }).level, 'off');
  assert.equal(storedToTrack(null).level, 'off');
});
