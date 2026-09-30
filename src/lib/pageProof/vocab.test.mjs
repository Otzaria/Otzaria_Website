import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamMenu, streamName, PARA_STYLES, FURNITURE_STREAMS, BUILTIN_STREAMS } from './vocab.js';
import { validateOp, describeOp } from './ops.js';
import { buildFixesFile } from './fixesExport.js';

// התפריט "זרם" שבסרגל: זרמי-התוכן בסדר הקבוע, ואחריהם תמיד "ריהוט הדף"

test('streamMenu: זרמי-התוכן בסדר הקבוע (בסדר העמוד היו מעורבבים), בלי כותרות וכפילויות', () => {
  // כך מגיע עמוד אמיתי: streams בסדר העמוד (הריהוט בראש) ואחריהם אוצר-המילים
  const streams = [
    { key: 'header', he: 'כותרת עמוד', color: '#9ca3af' },
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'sep', he: 'מפריד', color: '#9ca3af' },
    { key: 's_rashi', he: 'רש"י', color: '#123456' },
    { key: 'margin', he: 'שוליים', color: '#c2410c' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
    { key: 'main', he: 'ראשי (כפול)', color: '#000000' },
    { key: 'notes_heading', he: 'כותרת הערות', color: '#0e7f3c' },
  ];
  const m = streamMenu(streams);
  assert.deepEqual(
    m.content.map((s) => s.key),
    ['main', 'notes', 'margin', 's_rashi']
  );
  assert.equal(m.content[0].he, 'ראשי', 'הראשון שהופיע נשאר');
  assert.deepEqual(
    m.furniture.map((s) => s.key),
    FURNITURE_STREAMS
  );
  assert.equal(m.furniture[0].he, 'כותרת עמוד');
});

test('streamMenu: ריהוט הדף תמיד בתפריט — גם כשהעמוד לא הביא אותו באוצר-המילים שלו', () => {
  const m = streamMenu([{ key: 'main', he: 'ראשי', color: '#1a56db' }]);
  assert.deepEqual(
    m.furniture,
    FURNITURE_STREAMS.map((key) => ({ key, he: BUILTIN_STREAMS[key].he, color: BUILTIN_STREAMS[key].color }))
  );
  assert.deepEqual(streamMenu(null), { content: [], furniture: m.furniture });
  // שם/צבע מהעמוד גוברים על המובנים; זרם בלי שם — שם מובנה או המפתח
  const own = streamMenu([
    { key: 'footer', he: 'מספר הדף', color: '#111111' },
    { key: 'notes2' },
    { key: 's_x' },
    null,
    { key: '' },
  ]);
  assert.deepEqual(own.furniture[1], { key: 'footer', he: 'מספר הדף', color: '#111111' });
  assert.deepEqual(
    own.content.map((s) => [s.key, s.he]),
    [
      ['notes2', BUILTIN_STREAMS.notes2.he],
      ['s_x', 's_x'],
    ]
  );
});

test('streamName: שם הזרם בעברית — גם לכותרת, ולזרם ששמו נקבע בספר', () => {
  const doc = { streams: [{ key: 'notes', he: 'רש"י', color: '#123456' }], stream_vocab: [{ key: 's_tos', he: 'תוספות', color: '#654321' }] };
  assert.equal(streamName(doc, 'main'), 'ראשי');
  assert.equal(streamName(doc, 'main_heading'), 'כותרת');
  assert.equal(streamName(null, 'notes_heading'), 'כותרת הערות', 'בלי שם מהספר — השם המובנה של הכותרת');
  assert.equal(streamName(doc, 'notes'), 'רש"י');
  assert.equal(streamName(doc, 'notes_heading'), 'כותרת רש"י', 'הספר שינה את שם הזרם — הכותרת לפיו');
  assert.equal(streamName(doc, 's_tos'), 'תוספות');
  assert.equal(streamName(doc, 's_tos_heading'), 'כותרת תוספות');
  assert.equal(streamName(doc, 'header'), 'כותרת עמוד');
  assert.equal(streamName(doc, 'sep'), 'מפריד');
});

// ארבעת סוגי-הפסקה שנוספו לסרגל — מוכרים בחוזה מקצה לקצה: הבדיקה של
// הפעולה, התיאור ברשימת-השינויים, וקובץ-התיקונים שיוצא לתוכנת-הספר
test('סעיף ממוספר, הגהה, שירה, תוכן-עניינים: פעולת para תקינה, מתוארת בעברית ויוצאת בקובץ-התיקונים', () => {
  const doc = { page: 7, size: [1000, 1000], lines: [{ id: 1, line_no: 0, text: 'א גרסינן', stream: 'main', bbox: [10, 10, 900, 50] }] };
  const ops = ['list', 'gloss', 'poem', 'toc'].map((value) => ({ kind: 'para', page: 7, ids: [1], value }));
  for (const op of ops) {
    assert.ok(Object.hasOwn(PARA_STYLES, op.value), op.value);
    assert.equal(validateOp(doc, op), null, op.value);
    assert.equal(describeOp(doc, op), `שורה 1: סגנון-פסקה ← ${PARA_STYLES[op.value].he}`);
  }
  const file = buildFixesFile('g1', [{ _id: 's1', page: 7, who: 'u1', approvedAt: new Date(0), ops }], new Date(0));
  assert.deepEqual(
    file.ops.map((o) => [o.kind, o.value]),
    ops.map((o) => ['para', o.value])
  );
  assert.equal(validateOp(doc, { kind: 'para', page: 7, ids: [1], value: 'poetry' }), 'סגנון-פסקה לא מוכר: poetry');
});
