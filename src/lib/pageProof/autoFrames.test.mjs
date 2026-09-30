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
