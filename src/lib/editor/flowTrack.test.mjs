import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignWordWidths, buildFlow, countsAgree, fallbackScanIndex, flowCaret, flowOffsetFromScan, matchParagraphs, pickTarget, scanTargets, shouldUseFlow, softBreaks, visibleMap } from './flowTrack.js';

// שורת צילום ברוחב 300 (x מ-10 עד 310) בגובה 20; סוף פסקה — שורה קצרה (מתחילה ב-x0 גדול)
const L = (y, x0 = 10, paraEnd = false, stream = 'main') => ({ stream, paraEnd, bbox: [x0, y, 310, y + 20] });

test('visibleMap: תגיות HTML לא נספרות; < שאינו תגית נספר', () => {
  const m = visibleMap('<b>אב</b> ג');
  assert.equal(m.len, 4);
  assert.equal(m.vis[3], 0); // תחילת "אב" אחרי <b>
  assert.equal(m.vis[5], 2); // אחרי "אב", לפני </b>
  assert.equal(m.vis[m.vis.length - 1], 4);
  assert.equal(visibleMap('a < b').len, 5);
  assert.equal(visibleMap('').len, 0);
  assert.equal(visibleMap(null).len, 0);
});

test('shouldUseFlow: הרבה פחות שורות טקסט משורות צילום; שורות ריקות/תגיות בלבד לא נספרות', () => {
  const S = [0, 30, 60, 90, 120, 150].map((y) => L(y));
  assert.equal(shouldUseFlow('פסקה אחת ארוכה\n\nועוד אחת', S), true);
  assert.equal(shouldUseFlow('א\nב\nג\nד\nה\nו', S), false);
  assert.equal(shouldUseFlow('א\n<br>\n<p></p>', S), true);
  assert.equal(shouldUseFlow('', S), false);
  assert.equal(shouldUseFlow('א', S.slice(0, 3)), false); // מעט מדי שורות צילום
  assert.equal(shouldUseFlow('א', null), false);
});

test('matchParagraphs: 1:1 כשהיחסים תואמים', () => {
  assert.deepEqual(matchParagraphs([100, 50, 200], [600, 300, 1200]), [
    { t0: 0, t1: 1, s0: 0, s1: 1 },
    { t0: 1, t1: 2, s0: 1, s1: 2 },
    { t0: 2, t1: 3, s0: 2, s1: 3 },
  ]);
  assert.deepEqual(matchParagraphs([], [1]), []);
  assert.deepEqual(matchParagraphs([1], []), []);
});

test('matchParagraphs: כותרת בשורה נפרדת בטקסט מול פסקה אחת בצילום → 2:1', () => {
  assert.deepEqual(matchParagraphs([40, 300, 200], [3400, 2000]), [
    { t0: 0, t1: 2, s0: 0, s1: 1 },
    { t0: 2, t1: 3, s0: 1, s1: 2 },
  ]);
});

// כל הטקסט וכל הצילום מכוסים, ברצף
function assertCovers(g, n, m) {
  assert.equal(g[0].t0, 0);
  assert.equal(g[0].s0, 0);
  assert.equal(g.at(-1).t1, n);
  assert.equal(g.at(-1).s1, m);
  for (let k = 1; k < g.length; k++) {
    assert.equal(g[k].t0, g[k - 1].t1);
    assert.equal(g[k].s0, g[k - 1].s1);
  }
}

test('matchParagraphs: פסקה קצרה מאוד שאין לה מקבילה — קבוצה ריקה בצד אחד', () => {
  // כותרת קצרה מאוד בטקסט: זולה יותר לדלג עליה מלצרף
  const h = matchParagraphs([10, 300, 200], [1860, 1200]);
  assert.deepEqual(h[0], { t0: 0, t1: 1, s0: 0, s1: 0 });
  assertCovers(h, 3, 2);
  // שורת צילום קטנה (כתם/מספר) באמצע — בלי טקסט
  const s = matchParagraphs([300, 200], [3000, 40, 2000]);
  assert.deepEqual(s[1], { t0: 1, t1: 1, s0: 1, s1: 2 });
  assertCovers(s, 2, 3);
});

// שתי פסקאות בצילום: שורות 0–2 (2 קצרה) ו-3–4 (4 קצרה); טקסט: פסקה בשורה לכל אחת
const SCAN = [L(0), L(30), L(60, 160, true), L(90), L(120, 160, true)].map((l, i) => ({ ...l, words: i === 1 ? [{ bbox: [210, 30, 310, 50] }, { bbox: [110, 30, 200, 50] }, { bbox: [10, 30, 100, 50] }] : undefined }));
const P1 = Array.from({ length: 15 }, (_, i) => `מילה${i}`).join(' ');
const P2 = Array.from({ length: 12 }, (_, i) => `דבר${i}`).join(' ');
const TEXT = `${P1}\n${P2}`;

test('buildFlow: פסקאות לפי paraEnd, קבוצות בשורות הצילום', () => {
  const m = buildFlow(TEXT, SCAN);
  assert.deepEqual(m.paras.map((p) => p.line), [0, 1]);
  assert.deepEqual(m.groups, [
    { t0: 0, t1: 1, s0: 0, s1: 3 },
    { t0: 1, t1: 2, s0: 3, s1: 5 },
  ]);
  assert.equal(m.widths[2], 150);
  assert.equal(buildFlow('', SCAN), null);
  assert.equal(buildFlow(TEXT, [{ bbox: [1, 2] }]), null);
});

test('buildFlow: בלי paraEnd — מחושב לפי paragraphEnds לכל זרם', () => {
  const noPe = SCAN.map(({ paraEnd, ...l }) => l);
  assert.deepEqual(buildFlow(TEXT, noPe).groups, buildFlow(TEXT, SCAN).groups);
});

test('flowCaret: מילה בתחילת/אמצע/סוף פסקה → השורה הנכונה, תמיד dashed', () => {
  const m = buildFlow(TEXT, SCAN);
  const first = flowCaret(TEXT, 0, SCAN, m);
  assert.equal(first.scanIndex, 0);
  assert.equal(first.kind, 'dashed');
  assert.equal(first.wordBox[2], 310); // מימין
  assert.equal(flowCaret(TEXT, TEXT.indexOf('מילה7 '), SCAN, m).scanIndex, 1);
  const last = flowCaret(TEXT, TEXT.indexOf('מילה14'), SCAN, m);
  assert.equal(last.scanIndex, 2);
  assert.equal(flowCaret(TEXT, TEXT.indexOf('דבר0'), SCAN, m).scanIndex, 3);
  assert.equal(flowCaret(TEXT, TEXT.indexOf('דבר11'), SCAN, m).scanIndex, 4);
  // שורת צילום עם מילים — נבחרת המילה החופפת
  const mid = flowCaret(TEXT, TEXT.indexOf('מילה7 '), SCAN, m);
  assert.ok(SCAN[1].words.some((w) => w.bbox === mid.wordBox));
  // בלי מודל — בלי תיבה
  assert.equal(flowCaret(TEXT, 0, SCAN, null).lineBox, null);
});

test('flowCaret / flowOffsetFromScan: הלוך-חזור נוחת על אותה מילה בערך', () => {
  const m = buildFlow(TEXT, SCAN);
  const words = [...TEXT.matchAll(/\S+/g)];
  let ok = 0;
  for (const w of words) {
    const t = flowCaret(TEXT, w.index, SCAN, m);
    const x = (t.wordBox[0] + t.wordBox[2]) / 2;
    const back = flowOffsetFromScan(TEXT, SCAN, m, t.scanIndex, x);
    const k = words.findIndex((q) => q.index === back);
    assert.ok(k >= 0, 'תחילת מילה');
    if (Math.abs(k - words.indexOf(w)) <= 1) ok++;
  }
  assert.ok(ok >= words.length - 2, `${ok}/${words.length}`);
  // קצה ימני של שורת הצילום הראשונה של פסקה → תחילת הפסקה
  assert.equal(flowOffsetFromScan(TEXT, SCAN, m, 3, 310), TEXT.indexOf('דבר0'));
  assert.equal(flowOffsetFromScan(TEXT, SCAN, m, 99, 0), -1);
  assert.equal(flowOffsetFromScan(TEXT, SCAN, null, 0, 0), -1);
});

test('פסקת טקסט בלי מקבילה (כותרת) → תחילת הקבוצה הבאה; שורת צילום בלי מקבילה → תחילת הפסקה הבאה', () => {
  const model = {
    paras: [{ line: 0, len: 5 }, { line: 1, len: 100 }],
    groups: [{ t0: 0, t1: 1, s0: 0, s1: 0 }, { t0: 1, t1: 2, s0: 0, s1: 3 }],
    widths: [300, 300, 150],
  };
  assert.equal(fallbackScanIndex(model, 0), 0);
  const text = `כותרת\n${P1}`;
  const t = flowCaret(text, 0, SCAN, model);
  assert.equal(t.scanIndex, 0);
  assert.deepEqual(t.lineBox, SCAN[0].bbox);
  assert.equal(t.kind, 'dashed');
  assert.equal(t.wordBox[2], 310);
  // הכותרת בסוף העמוד — השורה האחרונה של הקבוצה הקודמת
  const tail = { ...model, groups: [{ t0: 0, t1: 1, s0: 0, s1: 3 }, { t0: 1, t1: 2, s0: 3, s1: 3 }] };
  assert.equal(fallbackScanIndex(tail, 1), 2);
  assert.equal(fallbackScanIndex({ ...model, groups: [{ t0: 0, t1: 2, s0: 0, s1: 0 }] }, 0), null);
  // שורת צילום 0 שאין לה טקסט → תחילת הפסקה הבאה
  const extra = { paras: [{ line: 0, len: 100 }], groups: [{ t0: 0, t1: 0, s0: 0, s1: 1 }, { t0: 0, t1: 1, s0: 1, s1: 3 }], widths: [300, 300, 150] };
  assert.equal(flowOffsetFromScan(P1, SCAN, extra, 0, 200), 0);
});

// ---- עמוד שלם בשורה אחת: עוגנים בתוך השורה, ויישור מילים לפי רוחב ----

test('softBreaks: אחרי ": " ולפני <b>; לא בקצוות ולא קטעים קצרים מדי', () => {
  const a = 'א'.repeat(40);
  const b = 'ב'.repeat(40);
  assert.deepEqual(softBreaks(`${a}: ${b}`), [42]);
  assert.deepEqual(softBreaks(`${a} <b>${b}</b>`), [41]);
  // נקודתיים ומיד אחריהן הדגשה — חיתוך אחד
  assert.deepEqual(softBreaks(`${a}: <b>${b}</b>`), [42]);
  // נקודתיים בסוף / קרוב להתחלה — בלי חיתוך
  assert.deepEqual(softBreaks(`${a}:`), []);
  assert.deepEqual(softBreaks(`אב: ${a}`), []);
  // נקודתיים בלי רווח אחריהן (למשל 12:30) — לא עוגן
  assert.deepEqual(softBreaks(`${a}:${b}`), []);
  assert.deepEqual(softBreaks(''), []);
});

test('alignWordWidths: דפוס הרוחבות מתקן סחף; מילה שהזיהוי חיבר → 2:1; קלט ריק/גדול → null', () => {
  const t = [2, 6, 3, 8, 2, 5, 7, 3, 4, 9];
  const w = t.map((x) => x * 10);
  assert.deepEqual([...alignWordWidths(t, w)], t.map((_, i) => i));
  // הזיהוי חיבר את המילים 1 ו-2 בצילום למילה אחת
  const merged = [w[0], w[1] + w[2] + 5, ...w.slice(3)];
  const m = alignWordWidths(t, merged);
  assert.equal(m[1], 1);
  assert.equal(m[2], 1);
  assert.equal(m[3], 2);
  assert.equal(m[9], 8);
  assert.equal(alignWordWidths([], [1]), null);
  assert.equal(alignWordWidths([1, 2], [3, 4], { maxCells: 4 }), null);
});

test('עמוד בשורה אחת עם נקודתיים: מתחלק לקטעים, ומילים מסומנות לפי היישור ברוחב', () => {
  // שתי פסקאות בצילום, 3 שורות כל אחת; בכל שורה 5 מילים ברוחבים שונים
  const lens = [3, 7, 2, 5, 4, 6, 2, 8, 3, 4, 5, 2, 6, 3, 7, 4, 2, 6, 3, 5, 7, 2, 4, 6, 3, 5, 2, 8, 4, 3];
  const words = lens.map((n, i) => 'ש'.repeat(n - (i === 14 ? 1 : 0)) + (i === 14 ? ':' : ''));
  const text = words.join(' ');
  const scan = [];
  for (let li = 0; li < 6; li++) {
    const y = li * 30;
    let x = 310;
    const ws = [];
    for (let k = 0; k < 5; k++) {
      const wd = lens[li * 5 + k] * 10;
      ws.push({ bbox: [x - wd, y, x, y + 20] });
      x -= wd + 8;
    }
    scan.push({ stream: 'main', paraEnd: li === 2 || li === 5, bbox: [x + 8, y, 310, y + 20], words: ws });
  }
  const model = buildFlow(text, scan);
  assert.equal(model.paras.length, 2);
  assert.equal(model.paras[1].from > 0, true);
  assert.deepEqual(model.groups.map((g) => [g.s0, g.s1]), [[0, 3], [3, 6]]);
  const starts = [...text.matchAll(/\S+/g)].map((m) => m.index);
  for (const i of [0, 4, 7, 14, 15, 22, 29]) {
    const t = flowCaret(text, starts[i], scan, model);
    assert.equal(t.scanIndex, Math.floor(i / 5), `מילה ${i}`);
    assert.deepEqual(t.wordBox, scan[Math.floor(i / 5)].words[i % 5].bbox, `מילה ${i}`);
    assert.equal(t.kind, 'dashed');
  }
});

test('pickTarget: התיבה שמכילה את x; כמה מילים על אותה תיבה — חלוקה מימין לשמאל; הקרובה; שורה בלי יעד', () => {
  const T = [
    { off: 0, si: 0, box: [200, 0, 300, 20] },
    { off: 5, si: 0, box: [100, 0, 190, 20] },
    { off: 9, si: 0, box: [100, 0, 190, 20] },
    { off: 14, si: 2, box: [10, 40, 300, 60] },
  ];
  assert.equal(pickTarget(T, 0, 250).off, 0);
  assert.equal(pickTarget(T, 0, 180).off, 5); // החצי הימני
  assert.equal(pickTarget(T, 0, 110).off, 9); // החצי השמאלי
  assert.equal(pickTarget(T, 0, 195).off, 0); // ברווח — הקרובה (מרחק שווה: הראשונה)
  assert.equal(pickTarget(T, 0, 50).off, 9);
  assert.equal(pickTarget(T, 1, 150).off, 14); // שורה בלי יעד — הבאה
  assert.equal(pickTarget(T, 5, 150).off, 14); // אחרי הכל — האחרונה
  assert.equal(pickTarget([], 0, 0), null);
  assert.deepEqual(scanTargets([3], () => ({ scanIndex: 1, wordBox: [1, 2, 3, 4] })), [{ off: 3, si: 1, box: [1, 2, 3, 4] }]);
  assert.deepEqual(scanTargets([3], () => ({ scanIndex: null, wordBox: null })), [{ off: 3, si: null, box: null }]);
});

test('flowOffsetFromScan הוא ההופכי המדויק של flowCaret: כל מילה חוזרת לעצמה (גם בלי מילים מזוהות)', () => {
  // שש שורות, מספר מילים משתנה בצילום (פיצול/איחוד של הזיהוי) — יישור לפי רוחב
  const widths = [[60, 40, 90, 50], [70, 30, 80, 40, 30], [100, 60, 80], [50, 50, 50, 50, 40], [90, 70, 60], [80, 60]];
  const lines = widths.map((ws, i) => {
    let x = 310;
    const words = ws.map((w) => {
      const b = [x - w, i * 30, x, i * 30 + 20];
      x -= w + 10;
      return { bbox: b };
    });
    return { stream: 'main', paraEnd: i === 5, bbox: [x + 10, i * 30, 310, i * 30 + 20], words };
  });
  const lens = [6, 4, 9, 5, 7, 3, 8, 4, 3, 10, 6, 8, 5, 5, 5, 5, 4, 9, 7, 6, 8, 6];
  const text = lens.map((n, i) => String.fromCharCode(0x05d0 + (i % 22)).repeat(n)).join(' ');
  const starts = [...text.matchAll(/\S+/g)].map((m) => m.index);
  for (const variant of [lines, lines.map(({ words, ...l }) => l)]) {
    const m = buildFlow(text, variant);
    let ok = 0;
    for (const off of starts) {
      const t = flowCaret(text, off, variant, m);
      const back = flowOffsetFromScan(text, variant, m, t.scanIndex, (t.wordBox[0] + t.wordBox[2]) / 2);
      if (back === off) ok++;
    }
    assert.ok(ok >= starts.length * 0.95, `${ok}/${starts.length}`);
  }
});

test('countsAgree: הפרש של מילה אחת או עד 20%', () => {
  assert.equal(countsAgree(10, 11), true);
  assert.equal(countsAgree(2, 3), true);
  assert.equal(countsAgree(100, 118), true);
  assert.equal(countsAgree(100, 130), false);
  assert.equal(countsAgree(0, 5), false);
});

// היישור הישן — טבלה מלאה ו-Math.log בכל תא — כרפרנס: הגרסה עם הרצועה השמורה והלוגריתמים
// המחושבים מראש חייבת לתת בדיוק אותה תוצאה
function alignReference(tLens, sWidths, { band = 0.15, joinCost = 0.45, skipCost = 0.9 } = {}) {
  const n = tLens.length;
  const m = sWidths.length;
  const T = tLens.reduce((x, y) => x + y, 0);
  const W = sWidths.reduce((x, y) => x + y, 0);
  const r = W / T;
  const sm = 0.3 * (W / m);
  const cost = (t, w) => Math.abs(Math.log((t * r + sm) / (w + sm)));
  const D = new Float64Array((n + 1) * (m + 1)).fill(Infinity);
  const P = new Uint8Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  const B = Math.max(12, Math.ceil(band * Math.max(n, m)));
  const relax = (k, c, mv) => { if (c < D[k]) { D[k] = c; P[k] = mv; } };
  D[0] = 0;
  for (let i = 0; i <= n; i++) {
    const mid = (i * m) / n;
    for (let j = Math.max(0, Math.floor(mid - B)); j <= Math.min(m, Math.ceil(mid + B)); j++) {
      const d = D[at(i, j)];
      if (d === Infinity) continue;
      if (i < n && j < m) relax(at(i + 1, j + 1), d + cost(tLens[i], sWidths[j]), 1);
      if (i + 1 < n && j < m) relax(at(i + 2, j + 1), d + cost(tLens[i] + tLens[i + 1], sWidths[j]) + joinCost, 2);
      if (i < n && j + 1 < m) relax(at(i + 1, j + 2), d + cost(tLens[i], sWidths[j] + sWidths[j + 1]) + joinCost, 3);
      if (i < n) relax(at(i + 1, j), d + skipCost, 4);
      if (j < m) relax(at(i, j + 1), d + skipCost, 5);
    }
  }
  if (D[at(n, m)] === Infinity) return null;
  const map = new Int32Array(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const mv = P[at(i, j)];
    if (mv === 1) map[--i] = --j;
    else if (mv === 2) { j--; map[--i] = j; map[--i] = j; }
    else if (mv === 3) { j -= 2; map[--i] = j; }
    else if (mv === 4) i--;
    else if (mv === 5) j--;
    else break;
  }
  return map;
}

test('alignWordWidths (רצועה שמורה + לוגריתמים מראש) זהה ליישור בטבלה המלאה', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [n, m] of [[5, 5], [40, 37], [120, 131], [300, 260], [64, 90]]) {
    const t = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 8));
    const w = Array.from({ length: m }, (_, j) => (t[Math.min(n - 1, Math.floor((j * n) / m))] || 3) * 10 * (0.7 + 0.6 * rnd()));
    assert.deepEqual(Array.from(alignWordWidths(t, w) || []), Array.from(alignReference(t, w) || []), `${n}x${m}`);
  }
});

test('visibleMap: שמור לפי תוכן — אותה תוצאה (אותו אובייקט) לאותה שורה', () => {
  const s = 'ab<b>cd</b>ef'.repeat(50);
  const a = visibleMap(s);
  assert.equal(visibleMap(String(s)), a);
  assert.equal(a.len, 300);
  assert.notEqual(visibleMap(s + 'x'), a);
});
