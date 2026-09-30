import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoFrames, columnRanges, columnOf, headingStream } from './autoFrames.js';

// שורות בסדר-קריאה (order = id), כמו בחוזה
let nextId = 1;
const L = (bbox, stream = 'main', extra = {}) => {
  const id = nextId++;
  return { id, line_no: id - 1, order: id, bbox, text: 'x', status: 'pending', stream, ...extra };
};
// n שורות בטור [x0..x1], מ-y0 בגובה 32 ובמרווח 46
const col = (x0, x1, y0, n, stream = 'main') => Array.from({ length: n }, (_, k) => L([x0, y0 + k * 46, x1, y0 + 32 + k * 46], stream));
const fidGen = () => {
  let n = 0;
  return () => `f${String(++n).padStart(3, '0')}`;
};
const frames = (lines) => autoFrames({ lines }, fidGen());
// [זרם, seq, x0, y0] לפי הסדר בעמוד — מספיק כדי לראות איזו מסגרת היכן
const shape = (fr) => fr.map((f) => [f.stream, f.seq, f.bbox[0], f.bbox[1]]);
const inside = (b, f) => b[0] >= f[0] && b[1] >= f[1] && b[2] <= f[2] && b[3] <= f[3];

const R = () => col(640, 1100, 230, 6);
const Lc = () => col(100, 560, 230, 4);

test('headingStream: רק זרמי-כותרת שתוכנת-הספר מכירה', () => {
  assert.equal(headingStream('main'), 'main_heading');
  assert.equal(headingStream('main_heading'), 'main_heading');
  assert.equal(headingStream('notes2'), 'notes2_heading');
  assert.equal(headingStream('s_rashi'), 's_rashi_heading');
  assert.equal(headingStream('margin'), null);
  assert.equal(headingStream('header'), null);
  assert.equal(headingStream('sep'), null);
});

test('columnRanges / columnOf: מרזב לפי כיסוי; שורה חוצה אחת לא סוגרת אותו', () => {
  const two = [...R(), ...Lc()];
  assert.deepEqual(columnRanges(two), [[640, 1100], [100, 560]]);
  const cross = L([100, 600, 1100, 632]);
  const cols = columnRanges([...two, cross]);
  assert.equal(cols.length, 2);
  assert.equal(columnOf(two[0], cols), 0);
  assert.equal(columnOf(two[7], cols), 1);
  assert.equal(columnOf(cross, cols), -1);
  // נכנסת עמוק לטור השני — חוצה, גם כשרובה בטור אחד
  assert.equal(columnOf(L([400, 300, 1100, 332]), cols), -1);
  // גלישה קטנה אל המרזב — עדיין בטור
  assert.equal(columnOf(L([610, 300, 1100, 332]), cols), 0);
  // טקסט בטור אחד (שורות-סוף-פסקה קצרות מימין) — טור אחד
  const ragged = [L([100, 0, 1100, 30]), L([700, 40, 1100, 70]), L([100, 80, 1100, 110]), L([450, 120, 750, 150])];
  assert.equal(columnRanges(ragged).length, 1);
  assert.deepEqual(columnRanges([]), []);
});

test('שני טורים: מסגרת לכל טור, הימני ראשון', () => {
  const fr = frames([...R(), ...Lc()]);
  assert.deepEqual(shape(fr), [['main', 1, 640, 230], ['main', 2, 100, 230]]);
  assert.deepEqual(fr.map((f) => f.order), [1, 2]);
  assert.deepEqual(fr.map((f) => f.fid), ['f001', 'f002']);
});

test('שורה שנחתכה על פני שני הטורים (באמצע / בשורה האחרונה) — לא מאחדת את הטורים; נשארת בחוץ', () => {
  const r = R();
  const l = col(100, 560, 230, 6);
  const mid = L([100, r[2].bbox[1], 1100, r[2].bbox[3]]);
  const fr = frames([...r.filter((_, k) => k !== 2), ...l.filter((_, k) => k !== 2), mid]);
  assert.deepEqual(shape(fr), [['main', 1, 640, 230], ['main', 2, 100, 230]]);
  assert.ok(!fr.some((f) => inside(mid.bbox, f.bbox)));

  const last = L([100, r[5].bbox[1], 1100, r[5].bbox[3]]);
  const fr2 = frames([...R().filter((_, k) => k !== 5), ...col(100, 560, 230, 5), last]);
  assert.equal(fr2.length, 2);
  assert.ok(!fr2.some((f) => inside(last.bbox, f.bbox)));

  // חיתוך חלקי (רוב השורה בטור הימני, אבל נכנסת עמוק לשמאלי) — המסגרת הימנית לא מתרחבת אליו
  const part = L([400, r[2].bbox[1], 1100, r[2].bbox[3]]);
  const fr3 = frames([...r.filter((_, k) => k !== 2), ...l, part]);
  assert.equal(fr3.length, 2);
  assert.equal(fr3[0].bbox[0], 640);
});

test('כותרת מעל שני טורים: מסגרת-כותרת ראשונה (1), אחריה הימני (2) והשמאלי (3)', () => {
  for (const hb of [[380, 130, 820, 185], [250, 130, 950, 185]]) {
    const fr = frames([L(hb, 'main_heading'), ...R(), ...Lc()]);
    assert.deepEqual(
      shape(fr).map(([s, q, x]) => [s, q, x]),
      [['main_heading', 1, hb[0]], ['main', 2, 640], ['main', 3, 100]]
    );
  }
  // כותרת בשוליים — אין לה זרם-כותרת בתוכנת-הספר
  const m = frames([L([380, 130, 820, 185], 'margin_heading'), ...col(640, 1100, 230, 3, 'margin'), ...col(100, 560, 230, 3, 'margin')]);
  assert.equal(m[0].stream, 'margin');
});

test('כותרת באמצע העמוד ופתיח של שתי שורות מחלקים את הטורים לרצועות', () => {
  const head = [...col(640, 1100, 230, 3), ...col(100, 560, 230, 3), L([380, 380, 820, 420], 'main_heading'), ...col(640, 1100, 440, 3), ...col(100, 560, 440, 3)];
  assert.deepEqual(
    shape(frames(head)).map(([s, q, x]) => [s, q, x]),
    [['main', 1, 640], ['main', 2, 100], ['main_heading', 3, 380], ['main', 4, 640], ['main', 5, 100]]
  );
  const block = [...col(640, 1100, 230, 4), ...col(100, 560, 230, 4), L([100, 430, 1100, 462]), L([100, 476, 1100, 508]), ...col(640, 1100, 530, 3), ...col(100, 560, 530, 3)];
  assert.deepEqual(
    shape(frames(block)).map(([, q, x, y]) => [q, x, y]),
    [[1, 640, 230], [2, 100, 230], [3, 100, 430], [4, 640, 530], [5, 100, 530]]
  );
});

test('דף שרובו ברוחב מלא ורק חלקו דו-טורי — גוש ואחריו שני טורים', () => {
  const fr = frames([...col(100, 1100, 100, 8), ...col(640, 1100, 500, 3), ...col(100, 560, 500, 3)]);
  assert.deepEqual(shape(fr).map(([, q, x, y]) => [q, x, y]), [[1, 100, 100], [2, 640, 500], [3, 100, 500]]);
  // שורות קצרות מפוזרות (שורת-לועזית משמאל, סופי-פסקאות מימין) — לא טורים
  const mixed = [
    L([100, 0, 1100, 30]),
    L([100, 40, 450, 70]),
    L([100, 80, 1100, 110]),
    L([700, 120, 1100, 150]),
    L([100, 160, 1100, 190]),
    L([100, 200, 420, 230]),
    L([800, 240, 1100, 270]),
    L([100, 280, 1100, 310]),
  ];
  assert.equal(frames(mixed).length, 1);
});

test('הטור השמאלי מתחיל גבוה יותר — הימני עדיין ראשון; טור אחד — מסגרת אחת', () => {
  const fr = frames([...col(640, 1100, 330, 3), ...col(100, 560, 230, 3)]);
  assert.deepEqual(shape(fr).map(([, q, x]) => [q, x]), [[1, 640], [2, 100]]);
  const one = frames([L([100, 100, 1100, 132]), L([700, 146, 1100, 178]), L([100, 192, 1100, 224]), L([450, 238, 750, 270])]);
  assert.deepEqual(shape(one), [['main', 1, 100, 100]]);
});

test('כמה זרמים: בין הזרמים — לפי סדר-הקריאה של המחשב; ריהוט ושורות שהוסרו — בלי מסגרת', () => {
  // השוליים מתחילים גבוה מהראשי, אבל המחשב קורא אותם אחרי הראשי וההערות (order נקבע ביצירה)
  const main = [...R(), ...Lc()];
  const notes = [...col(640, 1100, 1200, 3, 'notes'), ...col(100, 560, 1200, 2, 'notes')];
  const margin = col(1110, 1190, 150, 2, 'margin');
  const header = L([400, 40, 800, 70], 'header');
  const gone = L([100, 1500, 1100, 1530], 'main', { status: 'removed' });
  const fr = frames([header, ...main, ...notes, ...margin, gone]);
  assert.deepEqual(shape(fr).map(([s, q, x]) => [s, q, x]), [
    ['main', 1, 640],
    ['main', 2, 100],
    ['notes', 1, 640],
    ['notes', 2, 100],
    ['margin', 1, 1110],
  ]);
  assert.deepEqual(fr.map((f) => f.order), [1, 2, 3, 4, 5]);
  // בלי order בשורות — לפי ראש המסגרת, ובתוך הזרם עדיין ימין ← שמאל
  const noOrder = [...col(640, 1100, 330, 3), ...col(100, 560, 230, 3)].map(({ order, ...l }) => (void order, l));
  assert.deepEqual(shape(frames(noOrder)).map(([, q, x]) => [q, x]), [[1, 640], [2, 100]]);
});

// ---- עמודים מבולגנים: רק שורות רציפות של טור נכנסות למסגרת-הטור ----

// עמוד-הדוגמה של העורך (58 שורות — רק התיבות, בסדר-הקריאה של המחשב): למעלה שני טורים, 14 שורות
// מימין (604–617) ו-14 משמאל (622–635, האחרונה קצרה) עם מרזב צר; מתחתם טקסט על כל הרוחב, ובו שתי
// שורות שנחתכו לשני חלקים: 618|638 — החצאים נוגעים זה בזה, והשמאלי עובר את המרזב; 619|644 — חלק
// ימני קצר וחלק שמאלי ארוך שחוצה את המרזב. 636 ו-640 — "מפריד" (ריהוט).
const SAMPLE = [
  [602, 'header', [2005, 104, 2264, 180]], [603, 'header', [773, 85, 1732, 182]], [621, 'header', [322, 80, 501, 175]],
  [604, 'main', [1275, 204, 2400, 274]], [605, 'main', [1275, 271, 2398, 343]], [606, 'main', [1524, 340, 2274, 417]],
  [607, 'main', [1271, 412, 2394, 484]], [608, 'main', [1271, 484, 2364, 557]], [609, 'main', [1255, 556, 2389, 630]],
  [610, 'main', [1266, 636, 2388, 702]], [611, 'main', [1261, 701, 2386, 772]], [612, 'main', [2275, 761, 2382, 852]],
  [613, 'main', [1266, 775, 2316, 840]], [614, 'main', [1249, 843, 2314, 915]], [615, 'main', [1254, 915, 2379, 984]],
  [616, 'main', [1259, 986, 2376, 1054]], [617, 'main', [1236, 1048, 2367, 1127]], [622, 'main', [145, 187, 1237, 277]],
  [623, 'main', [146, 267, 1237, 346]], [624, 'main', [143, 335, 1223, 424]], [625, 'main', [131, 410, 1217, 498]],
  [626, 'main', [131, 485, 1174, 566]], [627, 'main', [133, 556, 1251, 631]], [628, 'main', [128, 631, 1241, 704]],
  [629, 'main', [116, 695, 1230, 769]], [630, 'main', [122, 765, 1217, 842]], [631, 'main', [117, 840, 1234, 915]],
  [632, 'main', [116, 918, 1172, 988]], [633, 'main', [95, 978, 1198, 1061]], [634, 'main', [95, 1048, 1232, 1127]],
  [635, 'main', [88, 1117, 434, 1204]], [636, 'sep', [981, 1178, 1452, 1255]], [637, 'main', [87, 1260, 2367, 1346]],
  [618, 'main', [1462, 1352, 2354, 1414]], [638, 'main', [80, 1344, 1488, 1413]], [639, 'main', [89, 1406, 2360, 1486]],
  [640, 'sep', [652, 1481, 1768, 1556]], [641, 'main', [78, 1550, 2356, 1619]], [642, 'main', [75, 1619, 2355, 1695]],
  [643, 'main', [554, 1696, 1853, 1763]], [619, 'main', [1901, 1770, 2351, 1841]], [644, 'main', [71, 1762, 2115, 1836]],
  [645, 'main', [59, 1834, 2355, 1909]], [646, 'main', [30, 1909, 2355, 1976]], [647, 'main', [63, 1984, 2355, 2052]],
  [648, 'main', [12, 2052, 2355, 2129]], [649, 'main', [22, 2128, 2355, 2205]], [650, 'main', [33, 2205, 2355, 2272]],
  [651, 'main', [54, 2272, 2355, 2348]], [652, 'main', [58, 2347, 2355, 2423]], [620, 'main', [49, 2412, 2331, 2489]],
  [653, 'main', [54, 2491, 2331, 2579]], [654, 'main', [57, 2574, 2333, 2654]], [655, 'main', [56, 2647, 2328, 2724]],
  [656, 'main', [58, 2722, 2326, 2796]], [657, 'main', [33, 2793, 2325, 2856]], [658, 'main', [33, 2855, 2323, 2953]],
  [659, 'footer', [169, 2958, 312, 3017]],
];
const sampleLines = () =>
  SAMPLE.map(([id, stream, bbox], i) => ({ id, line_no: i, order: i + 1, bbox, text: 'x', status: 'pending', stream }));
const centerIn = (b, f) => (b[0] + b[2]) / 2 >= f[0] && (b[0] + b[2]) / 2 <= f[2] && (b[1] + b[3]) / 2 >= f[1] && (b[1] + b[3]) / 2 <= f[3];
const unionOf = (bs) => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

test('עמוד מבולגן (עמוד-הדוגמה): מסגרות-הטורים נגמרות בשורה האחרונה של הטור; השורות שנחתכו לשניים — בגוש שמתחת', () => {
  const lines = sampleLines();
  const fr = frames(lines);
  assert.deepEqual(
    fr.map((f) => [f.stream, f.seq, f.order, f.bbox]),
    [
      ['main', 1, 1, [1236, 204, 2400, 1127]],
      ['main', 2, 2, [88, 187, 1251, 1204]],
      ['main', 3, 3, [12, 1260, 2367, 2953]],
    ]
  );
  const content = lines.filter((l) => l.stream === 'main');
  const held = (f) => content.filter((l) => centerIn(l.bbox, f.bbox)).map((l) => l.id);
  // הטור הימני — בדיוק 604–617, והמסגרת נגמרת בתחתית 617 (לפני התיקון: עד 1414, עם החצי הימני 618)
  assert.deepEqual(held(fr[0]), range(604, 617));
  assert.equal(fr[0].bbox[3], 1127);
  // הטור השמאלי — בדיוק 622–635 (לפני התיקון: גם 637 ו-638, ורוחב עד 1488 — אל תוך הטור הימני)
  assert.deepEqual(held(fr[1]), range(622, 635));
  // הגוש: כל השורות שמתחת לטורים, כולל ארבעת החצאים
  assert.deepEqual(held(fr[2]).sort((a, b) => a - b), content.filter((l) => l.bbox[1] >= 1260).map((l) => l.id).sort((a, b) => a - b));
  for (const id of [618, 638, 619, 644]) assert.ok(held(fr[2]).includes(id), `שורה ${id}`);
  // כל מסגרת צמודה בדיוק לשורות שמרכזן בתוכה, ואין שורה ששייכת לשתי מסגרות
  for (const f of fr) assert.deepEqual(f.bbox, unionOf(content.filter((l) => centerIn(l.bbox, f.bbox)).map((l) => l.bbox)));
  for (const l of content) assert.ok(fr.filter((f) => centerIn(l.bbox, f.bbox)).length <= 1, `שורה ${l.id}`);
});

test('שורה שנחתכה לשני חצאים מתחת לטורים (אחרי שורה אחת על כל הרוחב) — לא מותחת את מסגרות-הטורים', () => {
  const right = col(640, 1100, 230, 4);
  const left = col(100, 560, 230, 4);
  const full = L([100, 414, 1100, 446]);
  // החצאים נוגעים זה בזה, והשמאלי עובר את המרזב אל הטור הימני
  const halves = [L([700, 460, 1100, 492]), L([100, 460, 720, 492])];
  const tail = [L([100, 506, 1100, 538]), L([100, 552, 1100, 584])];
  const fr = frames([...right, ...left, full, ...halves, ...tail]);
  assert.deepEqual(
    fr.map((f) => [f.seq, f.bbox]),
    [
      [1, [640, 230, 1100, 400]],
      [2, [100, 230, 560, 400]],
      [3, [100, 414, 1100, 584]],
    ]
  );
  // גם כשהחצאים הם השורה האחרונה בעמוד (אחרי שורה אחת על כל הרוחב) — גוש אחד איתה
  const fr2 = frames([...col(640, 1100, 230, 4), ...col(100, 560, 230, 4), L([100, 414, 1100, 446]), L([700, 460, 1100, 492]), L([100, 460, 720, 492])]);
  assert.deepEqual(fr2.map((f) => f.bbox), [[640, 230, 1100, 400], [100, 230, 560, 400], [100, 414, 1100, 492]]);
});

test('שורה שנחתכה לשניים צמודה לשורה האחרונה של הטורים (בלי שורה חוצה ביניהן) — בגוש שמתחת, לא בטורים', () => {
  const block = () => [...col(640, 1100, 230, 3), ...col(100, 560, 230, 3)];
  const tail = () => [L([100, 414, 1100, 446]), L([100, 460, 1100, 492])];
  // החצי השמאלי נכנס 80 פיקסלים אל הטור הימני (פחות מ"חוצה", אבל עמוק מדי לשורת-טור)
  const fr = frames([...block(), L([700, 368, 1100, 400]), L([100, 368, 720, 400]), ...tail()]);
  assert.deepEqual(fr.map((f) => f.bbox), [[640, 230, 1100, 354], [100, 230, 560, 354], [100, 368, 1100, 492]]);
  // החצי השמאלי חוצה, והימני הקצר גבוה ממנו בשני פיקסלים — נספר אחריו, ולא נדבק לטור הימני
  const fr2 = frames([...block(), L([900, 366, 1100, 398]), L([100, 368, 905, 400]), ...tail()]);
  assert.deepEqual(fr2.map((f) => f.bbox), [[640, 230, 1100, 354], [100, 230, 560, 354], [100, 366, 1100, 492]]);
});

test('שורה קצרה (סוף פסקה) בטקסט שעל כל הרוחב — חלק מהגוש, לא מסגרת-טור משלה', () => {
  const fullAt = (y) => L([100, y, 1100, y + 32]);
  const fr = frames([...col(640, 1100, 230, 3), ...col(100, 560, 230, 3), fullAt(368), fullAt(414), L([800, 460, 1100, 492]), fullAt(506), fullAt(552)]);
  assert.deepEqual(fr.map((f) => f.bbox), [[640, 230, 1100, 354], [100, 230, 560, 354], [100, 368, 1100, 584]]);
  // בסוף העמוד, אחרי גוש של כמה שורות
  const end = frames([...col(640, 1100, 230, 3), ...col(100, 560, 230, 3), fullAt(368), fullAt(414), L([800, 460, 1100, 492])]);
  assert.deepEqual(end.map((f) => f.bbox), [[640, 230, 1100, 354], [100, 230, 560, 354], [100, 368, 1100, 492]]);
});

test('שורה שנחתכה בדיוק במרזב, בין שני גושים של כמה שורות — חלק מהגוש, ולא רצועה של שתי מסגרות קטנות', () => {
  const fullAt = (y) => L([100, y, 1100, y + 32]);
  const cutAtGutter = [L([640, 460, 1100, 492]), L([100, 460, 560, 492])];
  const fr = frames([...col(640, 1100, 230, 3), ...col(100, 560, 230, 3), fullAt(368), fullAt(414), ...cutAtGutter, fullAt(506), fullAt(552)]);
  assert.deepEqual(fr.map((f) => f.bbox), [[640, 230, 1100, 354], [100, 230, 560, 354], [100, 368, 1100, 584]]);
});

test('חיתוך שגוי בשורה שלפני האחרונה, והטור הימני ארוך בשורה — השורה האחרונה נשארת בטור; כותרת מעל שורה ראשונה וחיתוך שגוי', () => {
  const r = col(640, 1100, 230, 6);
  const cut = L([100, r[4].bbox[1], 1100, r[4].bbox[3]]);
  const fr = frames([...r.filter((_, k) => k !== 4), ...col(100, 560, 230, 4), cut]);
  assert.deepEqual(fr.map((f) => f.bbox), [[640, 230, 1100, 492], [100, 230, 560, 400]]);
  assert.ok(!fr.some((f) => inside(cut.bbox, f.bbox)));

  // כותרת, שורה ראשונה בשני הטורים, שורה שנחתכה על פני שניהם, ועוד שלוש — כותרת + שני טורים
  const r2 = col(640, 1100, 230, 5);
  const l2 = col(100, 560, 230, 5);
  const cut2 = L([100, r2[1].bbox[1], 1100, r2[1].bbox[3]]);
  const fr2 = frames([L([380, 150, 820, 200], 'main_heading'), ...r2.filter((_, k) => k !== 1), ...l2.filter((_, k) => k !== 1), cut2]);
  assert.deepEqual(
    fr2.map((f) => [f.stream, f.seq, f.bbox]),
    [
      ['main_heading', 1, [380, 150, 820, 200]],
      ['main', 2, [640, 230, 1100, 446]],
      ['main', 3, [100, 230, 560, 446]],
    ]
  );
});

test('פס ריק גבוה: לרוחב שני הטורים — שתי רצועות; בטור אחד — רק הטור נשבר; בזרם של טור אחד — שתי מסגרות', () => {
  // איור על כל הרוחב בין שני חלקי העמוד: ימין-עליון, שמאל-עליון, ימין-תחתון, שמאל-תחתון
  const fr = frames([...col(640, 1100, 230, 3), ...col(100, 560, 230, 3), ...col(640, 1100, 700, 3), ...col(100, 560, 700, 3)]);
  assert.deepEqual(
    fr.map((f) => [f.seq, f.bbox[0], f.bbox[1], f.bbox[3]]),
    [
      [1, 640, 230, 354],
      [2, 100, 230, 354],
      [3, 640, 700, 824],
      [4, 100, 700, 824],
    ]
  );
  // רווח גדול בטור הימני בלבד (השמאלי רציף) — הימני בשני חלקים, קודם שניהם ואחר כך השמאלי
  const one = frames([...col(640, 1100, 230, 3), ...col(640, 1100, 700, 3), ...col(100, 560, 230, 14)]);
  assert.deepEqual(one.map((f) => [f.seq, f.bbox[0], f.bbox[1], f.bbox[3]]), [[1, 640, 230, 354], [2, 640, 700, 824], [3, 100, 230, 860]]);
  // הערות-צד בשני מקומות בגובה העמוד — מסגרת לכל אחת, ולא אחת לכל הגובה
  const side = frames([...col(1110, 1190, 150, 2, 'margin'), ...col(1110, 1190, 900, 2, 'margin')]);
  assert.deepEqual(side.map((f) => [f.stream, f.seq, f.bbox]), [['margin', 1, [1110, 150, 1190, 228]], ['margin', 2, [1110, 900, 1190, 978]]]);
  // שורה שנחתכה על פני שני הטורים ממלאת את מקומה: אין "פס ריק" גם כשהשורות מרווחות
  const spaced = (x0, x1) => [0, 1, 3, 4].map((k) => L([x0, 230 + k * 60, x1, 262 + k * 60]));
  const cut = L([100, 350, 1100, 382]);
  const sp = frames([...spaced(640, 1100), ...spaced(100, 560), cut]);
  assert.deepEqual(sp.map((f) => f.bbox), [[640, 230, 1100, 502], [100, 230, 560, 502]]);
});

test('newFid מקבל את המזהים שכבר נלקחו; אין שורות — אין מסגרות', () => {
  const seen = [];
  const fr = autoFrames({ lines: [...R(), ...Lc()] }, (taken) => {
    seen.push([...taken]);
    return `id${taken.size}x`;
  });
  assert.deepEqual(fr.map((f) => f.fid), ['id0x', 'id1x']);
  assert.deepEqual(seen, [[], ['id0x']]);
  assert.deepEqual(autoFrames({ lines: [] }, fidGen()), []);
  assert.deepEqual(autoFrames({}, fidGen()), []);
});
