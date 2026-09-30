import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnOf, placeOrder, orderAfter, neighbourStream, COLUMN_OVERLAP } from './placement.js';

// עמוד דו-טורי: כותרת על כל הרוחב, טור ימני (A, נקרא ראשון), טור שמאלי (B),
// והערות על כל הרוחב בתחתית
const L = (id, bbox, order, stream = 'main', extra = {}) => ({ id, bbox, order, stream, status: 'pending', ...extra });
const page = () => [
  L(1, [100, 100, 900, 150], 1, 'main_heading'),
  L(2, [520, 200, 900, 240], 2),
  L(3, [520, 260, 900, 300], 3),
  L(4, [520, 320, 900, 360], 4),
  L(5, [100, 200, 480, 240], 5, 's_rashi'),
  L(6, [100, 260, 480, 300], 6, 's_rashi'),
  L(7, [100, 320, 480, 360], 7, 's_rashi'),
  L(8, [100, 1500, 900, 1540], 8, 'notes'),
];
const ids = (ls) => ls.map((l) => l.id).sort((a, b) => a - b);

test('columnOf: שורות הטור + השורות הפרושות על כל הרוחב, בלי הטור השני ובלי מוסרות', () => {
  assert.deepEqual(ids(columnOf(page(), [110, 380, 470, 420])), [1, 5, 6, 7, 8]);
  assert.deepEqual(ids(columnOf(page(), [530, 380, 890, 420])), [1, 2, 3, 4, 8]);
  const withRemoved = page().map((l) => (l.id === 6 ? { ...l, status: 'removed' } : l));
  assert.deepEqual(ids(columnOf(withRemoved, [110, 380, 470, 420])), [1, 5, 7, 8]);
  assert.deepEqual(columnOf(page(), null), []);
});

test('columnOf: סף החפיפה 30% מהרוחב הצר', () => {
  assert.equal(COLUMN_OVERLAP, 0.3);
  // רוחב 120, חופף 40 לכל טור (33%) — בשני הטורים
  const both = ids(columnOf(page().filter((l) => [3, 6].includes(l.id)), [440, 270, 560, 290]));
  assert.deepEqual(both, [3, 6]);
  // רוחב 110: לטור A חופף 40 (36%), לטור B רק 30 (27%)
  const one = ids(columnOf(page().filter((l) => [3, 6].includes(l.id)), [450, 270, 560, 290]));
  assert.deepEqual(one, [3]);
});

test('placeOrder: שורה חדשה בסוף הטור השמאלי — אחרי שורתו האחרונה', () => {
  assert.equal(placeOrder(page(), [100, 380, 480, 420]), 7.5);
});

test('placeOrder: סוף הטור הימני נכנס לפני הטור השמאלי (לא אחרי ההערות שמתחת)', () => {
  // השכנה מעל (שורה 4, הדוקה) מול ההערה שמתחת (פרושה על שני הטורים)
  assert.equal(placeOrder(page(), [520, 380, 900, 420]), 4.5);
});

test('placeOrder: ראש הטור השמאלי מתחת לכותרת — לפני השורה הבאה בטור שלו, לא אחרי הכותרת', () => {
  assert.equal(placeOrder(page(), [100, 160, 480, 195]), 4.5);
  // ובטור הימני — מיד אחרי הכותרת
  assert.equal(placeOrder(page(), [520, 160, 900, 195]), 1.5);
});

test('placeOrder: ראש העמוד — לפני השורה הראשונה', () => {
  assert.equal(placeOrder(page(), [100, 20, 900, 60]), 0.5);
});

test('placeOrder: ייחודיות — הוספה שנייה באותו מקום נכנסת בין הקודמת לשכנתה', () => {
  const lines = page();
  const first = placeOrder(lines, [100, 380, 480, 420]);
  lines.push(L(-1, [100, 380, 480, 420], first, 's_rashi'));
  const second = placeOrder(lines, [100, 370, 480, 400]);
  assert.ok(second > 7 && second < first, `${second}`);
  assert.ok(!lines.some((l) => l.order === second));
});

test('placeOrder: טור ריק — לפי מרכז אנכי בין כל השורות; דטרמיניסטי', () => {
  const o = placeOrder(page(), [950, 270, 990, 290]);
  assert.equal(o, placeOrder(page().reverse(), [950, 270, 990, 290]));
  assert.ok(o > 6 && o < 7, `${o}`);
});

test('placeOrder: בלי שורות — 1; כל השורות הוסרו — אחרי האחרונה', () => {
  assert.equal(placeOrder([], [0, 0, 10, 10]), 1);
  assert.equal(placeOrder(null, [0, 0, 10, 10]), 1);
  const removed = page().map((l) => ({ ...l, status: 'removed' }));
  assert.equal(placeOrder(removed, [100, 380, 480, 420]), 8.5);
});

test('orderAfter: אמצע הדרך לסדר הבא, או חצי אחרי האחרון', () => {
  assert.equal(orderAfter(page(), 2), 2.5);
  assert.equal(orderAfter(page(), 2.5), 2.75);
  assert.equal(orderAfter(page(), 8), 8.5);
});

test('neighbourStream: הזרם של השורה הקרובה באותו טור', () => {
  assert.equal(neighbourStream(page(), [100, 380, 480, 420]), 's_rashi');
  assert.equal(neighbourStream(page(), [520, 380, 900, 420]), 'main');
  assert.equal(neighbourStream(page(), [100, 1460, 900, 1490]), 'notes');
});

test('neighbourStream: בלי _heading, ותוכן קודם לריהוט; טור ריק — main', () => {
  // הכי קרובה היא הכותרת (main_heading) — שורה חדשה היא טקסט רגיל
  assert.equal(neighbourStream(page(), [520, 152, 900, 170]), 'main');
  // כותרת-העמוד (ריהוט) קרובה יותר, אבל שורת-התוכן גוברת
  const lines = [L(9, [300, 20, 700, 50], 0, 'header'), ...page()];
  assert.equal(neighbourStream(lines, [520, 60, 900, 90]), 'main');
  // רק ריהוט בטור — ממנו
  assert.equal(neighbourStream([L(9, [300, 20, 700, 50], 0, 'header')], [300, 60, 700, 90]), 'header');
  assert.equal(neighbourStream(page(), [950, 270, 990, 290]), 'main');
  assert.equal(neighbourStream([], [0, 0, 10, 10]), 'main');
});
