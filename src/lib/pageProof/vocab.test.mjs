import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamMenu, streamName, registerVocab, PARA_STYLES, CHAR_STYLES, PAGE_TYPES, SCRIPTS, CERTAINTY, FURNITURE_STREAMS, BUILTIN_STREAMS } from './vocab.js';
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

// אוצר-מילים נוסף מצרכן שמטמיע את העורך (תוכנת-הספר): סגנונות-פסקה של ספר מסוים ועוד —
// עוברים את הבדיקה ומקבלים שם בעברית; בלי registerVocab (האתר) — הכול כמו קודם
test('registerVocab: סגנון-פסקה וערך-ודאות נוספים עוברים את validateOp, ובהסרה — שוב לא מוכרים', () => {
  const doc = { page: 7, size: [1000, 1000], lines: [{ id: 1, line_no: 0, text: 'שורה', stream: 'main', bbox: [10, 10, 900, 50] }] };
  const para = { kind: 'para', page: 7, ids: [1], value: 'book_intro' };
  const cert = { kind: 'certainty', page: 7, ids: [1], value: { v: 'clear', why: null } };
  assert.equal(validateOp(doc, para), 'סגנון-פסקה לא מוכר: book_intro');
  assert.equal(validateOp(doc, cert), 'ערך-ודאות לא מוכר');

  const undo = registerVocab({ paraStyles: { book_intro: { he: 'פסקת פתיחה', group: 'text' } }, certainty: { clear: 'ניקוי' } });
  try {
    assert.equal(validateOp(doc, para), null);
    assert.equal(validateOp(doc, cert), null);
    assert.deepEqual(PARA_STYLES.book_intro, { he: 'פסקת פתיחה', group: 'text' });
    assert.equal(describeOp(doc, para), 'שורה 1: סגנון-פסקה ← פסקת פתיחה');
  } finally {
    undo();
  }
  assert.equal(Object.hasOwn(PARA_STYLES, 'book_intro'), false);
  assert.equal(Object.hasOwn(CERTAINTY, 'clear'), false);
  assert.equal(validateOp(doc, para), 'סגנון-פסקה לא מוכר: book_intro');
});

test('registerVocab: מפתח מובנה אינו נדרס; מפתח לא-תקין נדחה; שם חסר ← המפתח; קבוצה לא מוכרת ← text', () => {
  const bodyBefore = { ...PARA_STYLES.body };
  const undo = registerVocab({
    paraStyles: { body: { he: 'דריסה', group: 'head' }, 'bad key': { he: 'x' }, '': { he: 'x' }, '9x': {}, odd: { he: 'משונה', group: 'weird' } },
    charStyles: { b: { he: 'דריסה' }, wavy: { he: 'גלי' } },
    pageTypes: { regular: 'דריסה', index: 'מפתח' },
    scripts: { square: 'דריסה', yiddish: 'יידיש' },
  });
  try {
    assert.deepEqual(PARA_STYLES.body, bodyBefore);
    assert.equal(Object.hasOwn(PARA_STYLES, 'bad key'), false);
    assert.equal(Object.hasOwn(PARA_STYLES, ''), false);
    assert.deepEqual(PARA_STYLES['9x'], { he: '9x', group: 'text' });
    assert.deepEqual(PARA_STYLES.odd, { he: 'משונה', group: 'text' });
    assert.notEqual(CHAR_STYLES.b.he, 'דריסה');
    assert.deepEqual(CHAR_STYLES.wavy, { he: 'גלי', sign: '✦' });
    assert.equal(PAGE_TYPES.regular, 'עמוד רגיל');
    assert.equal(PAGE_TYPES.index, 'מפתח');
    assert.equal(SCRIPTS.square, 'מרובע');
    assert.equal(SCRIPTS.yiddish, 'יידיש');
  } finally {
    undo();
  }
  for (const [t, k] of [[PARA_STYLES, '9x'], [PARA_STYLES, 'odd'], [CHAR_STYLES, 'wavy'], [PAGE_TYPES, 'index'], [SCRIPTS, 'yiddish']]) {
    assert.equal(Object.hasOwn(t, k), false, k);
  }
  assert.deepEqual(PARA_STYLES.body, bodyBefore);
  // בלי ארגומנט / ארגומנט ריק — כלום, והסרה כפולה בטוחה
  const none = registerVocab();
  none();
  none();
  registerVocab(null)();
});
