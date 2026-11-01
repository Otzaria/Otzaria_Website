import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facingCaretY, facingLineHeight, linePitch, followScroll, followSlack, holdScanLine, proportionalWordBox, wordBoxFor } from './scanFollow.js';
import { caretInfo } from './caretWord.js';

test('facingLineHeight: pitch·zoom קטום', () => {
  assert.equal(facingLineHeight(42, 1, 24, 48), 42);
  assert.equal(facingLineHeight(42, 0.3, 24, 48), 24);
  assert.equal(facingLineHeight(42, 2, 24, 48), 48);
  assert.equal(facingLineHeight(NaN, 1, 24, 48), 24);
  assert.equal(facingLineHeight(0, 1, 24, 48), 24);
  assert.equal(facingLineHeight(100, 1, 30, 20), 30); // max<min → min
});

test('linePitch: חציון מרחקי המרכזים; שורה אחת — גובהה', () => {
  const lines = [0, 40, 80, 125, 160].map((y) => ({ bbox: [0, y, 100, y + 30] }));
  assert.equal(linePitch(lines), 40);
  assert.equal(linePitch([{ bbox: [0, 10, 5, 32] }]), 22);
  assert.equal(linePitch([]), 0);
  assert.equal(linePitch([{ bbox: null }]), 0);
});

test('followScroll: מרכז השורה מול מרכז הסמן', () => {
  // lineMid 500 · zoom 0.5 = 250; caret במרחק 100 מראש החלון → 150
  assert.equal(followScroll({ lineMidPx: 500, zoom: 0.5, caretMidInViewport: 100, viewportH: 600, contentH: 3000 }), 150);
  assert.equal(followScroll({ lineMidPx: 500, zoom: 0.5, caretMidInViewport: 100, viewportH: 600, contentH: 3000, contentOffset: 20 }), 170);
});

test('followScroll: קטימה לראש ולסוף', () => {
  assert.equal(followScroll({ lineMidPx: 50, zoom: 1, caretMidInViewport: 300, viewportH: 600, contentH: 3000 }), 0);
  assert.equal(followScroll({ lineMidPx: 2990, zoom: 1, caretMidInViewport: 100, viewportH: 600, contentH: 3000 }), 2400);
  assert.equal(followScroll({ lineMidPx: 500, zoom: 1, caretMidInViewport: 100, viewportH: 600, contentH: 300 }), 0);
});

test('followScroll: סמן מחוץ לחלון — 40% מהחלון; ליד הקצה — קטום לשוליים, עדיין מולו', () => {
  const p = { lineMidPx: 1000, zoom: 1, viewportH: 500, contentH: 5000 };
  assert.equal(followScroll({ ...p, caretMidInViewport: -50 }), 800);
  assert.equal(followScroll({ ...p, caretMidInViewport: 520 }), 800);
  assert.equal(followScroll({ ...p, caretMidInViewport: NaN }), 800);
  // סמן בתחתית החלון (עורך שגולל רק עד שהסמן נראה): השורה ב-480, לא ב-200
  assert.equal(followScroll({ ...p, caretMidInViewport: 495 }), 520);
  assert.equal(followScroll({ ...p, caretMidInViewport: 3 }), 980);
});

test('facingCaretY: בתוך השוליים — כמו שהוא; ליד הקצה — קטום; מחוץ לחלון — NaN', () => {
  assert.equal(facingCaretY(250, 500, 20), 250);
  assert.equal(facingCaretY(495, 500, 20), 480);
  assert.equal(facingCaretY(0, 500, 20), 20);
  assert.ok(Number.isNaN(facingCaretY(501, 500, 20)));
  assert.ok(Number.isNaN(facingCaretY(NaN, 500, 20)));
  assert.equal(facingCaretY(5, 10, 20), 5);
});

test('followScroll: קלט לא תקין → null', () => {
  assert.equal(followScroll({ lineMidPx: NaN, zoom: 1, caretMidInViewport: 0, viewportH: 1, contentH: 1 }), null);
  assert.equal(followScroll({ lineMidPx: 1, zoom: 0, caretMidInViewport: 0, viewportH: 1, contentH: 1 }), null);
  assert.equal(followScroll({ lineMidPx: 1, zoom: 1, caretMidInViewport: 0, viewportH: 0, contentH: 1 }), null);
});

test('proportionalWordBox: RTL לפי תווים', () => {
  assert.deepEqual(proportionalWordBox([0, 10, 100, 30], 0, 10, 100), [90, 10, 100, 30]);
  assert.deepEqual(proportionalWordBox([0, 10, 100, 30], 90, 100, 100), [0, 10, 10, 30]);
  // קטימה ומקרי קצה
  assert.deepEqual(proportionalWordBox([0, 0, 100, 10], -5, 200, 50), [0, 0, 100, 10]);
  assert.deepEqual(proportionalWordBox([0, 0, 100, 10], 5, 2, 10), [50, 0, 50, 10]);
  assert.equal(proportionalWordBox(null, 0, 1, 1), null);
  assert.deepEqual(proportionalWordBox([0, 0, 100, 10], 0, 0, 0), [100, 0, 100, 10]);
});

const line = {
  bbox: [0, 10, 1000, 40],
  words: [
    { text: 'בראשית', bbox: [700, 10, 1000, 40] },
    { text: 'ברא', bbox: [450, 10, 650, 40] },
    { text: 'אלהים', bbox: [0, 10, 400, 40] },
  ],
};

test('wordBoxFor: התאמה בטוחה → solid', () => {
  const r = wordBoxFor(line, caretInfo('בראשית ברא אלהים', 8));
  assert.deepEqual(r.box, [450, 10, 650, 40]);
  assert.equal(r.kind, 'solid');
  assert.equal(r.alignment.length, 3);
});

test('wordBoxFor: מילה שונה מאוד → dashed; מילה שנוספה → dashed משוערת', () => {
  assert.equal(wordBoxFor(line, caretInfo('בראשית קטעז אלהים', 8)).kind, 'dashed');
  const r = wordBoxFor(line, caretInfo('בראשית ברא חדש אלהים', 12));
  assert.equal(r.kind, 'dashed');
  assert.ok(r.box[0] >= 400 - 1e-9 && r.box[2] <= 450 + 1e-9);
});

test('wordBoxFor: רק תיבת שורה → under יחסי', () => {
  const r = wordBoxFor({ bbox: [0, 0, 180, 20] }, caretInfo('אבגד הוזח', 0));
  assert.equal(r.kind, 'under');
  assert.deepEqual(r.box, [100, 0, 180, 20]);
});

test('wordBoxFor: יישור ממוחזר (memo) ומקרי קצה', () => {
  const c = caretInfo('בראשית ברא אלהים', 0);
  const first = wordBoxFor(line, c);
  const again = wordBoxFor(line, caretInfo('בראשית ברא אלהים', 12), { alignment: first.alignment });
  assert.equal(again.alignment, first.alignment);
  assert.deepEqual(again.box, [0, 10, 400, 40]);
  assert.equal(wordBoxFor(null, c).box, null);
  assert.equal(wordBoxFor(line, caretInfo('', 0)).box, null);
});

test('followSlack: שורה בראש התמונה מול סמן בתחתית — חסר מרווח מעל', () => {
  // שורה ב-100, סמן ב-500 מתוך 600: היעד 100−500 = −400 → 400 מעל
  assert.deepEqual(followSlack({ lineMidPx: 100, zoom: 1, caretMidInViewport: 500, viewportH: 600, contentH: 3000, edge: 20 }), { top: 400, bottom: 0 });
  // שורה בתחתית, סמן למעלה: היעד 2950−100 = 2850 > 2400 → 450 מתחת
  assert.deepEqual(followSlack({ lineMidPx: 2950, zoom: 1, caretMidInViewport: 100, viewportH: 600, contentH: 3000, edge: 20 }), { top: 0, bottom: 450 });
});

test('followSlack: אין חוסר כשאפשר לגלול; קטום לגובה החלון; סמן מחוץ לחלון — כלום', () => {
  assert.deepEqual(followSlack({ lineMidPx: 1500, zoom: 1, caretMidInViewport: 300, viewportH: 600, contentH: 3000 }), { top: 0, bottom: 0 });
  assert.deepEqual(followSlack({ lineMidPx: 0, zoom: 1, caretMidInViewport: 580, viewportH: 600, contentH: 3000, edge: 10 }), { top: 580, bottom: 0 });
  assert.deepEqual(followSlack({ lineMidPx: 0, zoom: 1, caretMidInViewport: 900, viewportH: 600, contentH: 3000 }), { top: 0, bottom: 0 });
  assert.deepEqual(followSlack({ lineMidPx: NaN, zoom: 1, caretMidInViewport: 300, viewportH: 600, contentH: 3000 }), { top: 0, bottom: 0 });
});

test('holdScanLine — אותה שורה בצילום ונראית בנוחות: לא גוללים; שורה חדשה או קרובה לקצה: מיישרים', () => {
  assert.equal(holdScanLine({ sameLine: true, lineMidInViewport: 300, viewportH: 600 }), true);
  assert.equal(holdScanLine({ sameLine: false, lineMidInViewport: 300, viewportH: 600 }), false);
  // קרוב לקצה (פחות מ-15% מהחלון) — מיישרים גם באותה שורה
  assert.equal(holdScanLine({ sameLine: true, lineMidInViewport: 50, viewportH: 600 }), false);
  assert.equal(holdScanLine({ sameLine: true, lineMidInViewport: 560, viewportH: 600 }), false);
  assert.equal(holdScanLine({ sameLine: true, lineMidInViewport: NaN, viewportH: 600 }), false);
  assert.equal(holdScanLine({ sameLine: true, lineMidInViewport: 100, viewportH: 0 }), false);
});
