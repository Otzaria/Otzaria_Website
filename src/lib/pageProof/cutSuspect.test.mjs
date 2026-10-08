import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from './ops.js';
import { cutSuspects, cutSuspectText, nextCutSuspect, CUT_REASON_HE } from './cutSuspect.js';
import { handledItems } from './stages.js';

const L = (id, y, extra = {}) => ({ id, order: id, bbox: [100, y, 900, y + 40], text: `שורה ${id}`, stream: 'main', status: 'auto', ...extra });
const doc = () => ({
  page: 3,
  size: [1000, 1000],
  lines: [
    L(1, 100),
    L(2, 150, { flags: { cut_suspect: ['tall'] } }),
    L(3, 200, { flags: { cut_suspect: ['frag', 'dup'] } }),
    L(4, 250, { flags: { cut_suspect: [] } }),
    L(5, 300, { flags: { cut_suspect: ['cross', 'unknown_reason'] } }),
  ],
});

test('cutSuspects: מה שסומן, בלי סיבות לא מוכרות', () => {
  const s = cutSuspects(buildView(doc(), []));
  assert.deepEqual([...s.keys()], [2, 3, 5]);
  assert.deepEqual(s.get(5), ['cross']);
});

test('cutSuspects: שורה שתוקנה (תיבה / פיצול / איחוד / לא-שורה) יורדת; "החיתוך תקין" — אין חשודות', () => {
  const v = (ops) => [...cutSuspects(buildView(doc(), ops)).keys()];
  assert.deepEqual(v([{ kind: 'bbox', page: 3, ids: [2], value: [100, 150, 900, 175] }]), [3, 5]);
  assert.deepEqual(v([{ kind: 'status', page: 3, ids: [3], value: 'removed' }]), [2, 5]);
  assert.deepEqual(v([{ kind: 'line_split', page: 3, ids: [5], value: { x: 500 } }]), [2, 3]);
  assert.deepEqual(v([{ kind: 'cut_ok', page: 3, value: true }]), []);
  // ממתינה לזיהוי-מחדש (locked) — כמו שתוקנה
  assert.deepEqual([...cutSuspects(buildView(doc(), []), new Set([3])).keys()], [2, 5]);
  // חבילה ישנה בלי השדה — אין
  assert.equal(cutSuspects(buildView({ page: 3, size: [1000, 1000], lines: [L(1, 100)] }, [])).size, 0);
  assert.equal(cutSuspects(null).size, 0);
});

test('nextCutSuspect: לפי סדר-הקריאה, וחוזרת להתחלה', () => {
  const v = buildView(doc(), []);
  const s = cutSuspects(v);
  assert.equal(nextCutSuspect(v, s, null), 2);
  assert.equal(nextCutSuspect(v, s, 2), 3);
  assert.equal(nextCutSuspect(v, s, 5), 2);
  assert.equal(nextCutSuspect(v, s, 1), 2);
  assert.equal(nextCutSuspect(v, new Map(), 1), null);
});

test('cutSuspectText: נוסח לכל סיבה, בלי כפילות (tall/double)', () => {
  assert.equal(cutSuspectText(['tall', 'double']), CUT_REASON_HE.tall);
  assert.equal(cutSuspectText(['frag', 'dup']), `${CUT_REASON_HE.frag} · ${CUT_REASON_HE.dup}`);
  assert.equal(cutSuspectText([]), '');
});

test('handledItems (מבנה): "שורות חשודות בחיתוך: N" — רק בעמוד שסומן, ו"טופלו" אחרי "החיתוך תקין"', () => {
  const item = (ops) => handledItems('structure', { view: buildView(doc(), ops), ops }).find((x) => x.key === 'suspects');
  assert.deepEqual([item([]).label, item([]).done], ['שורות חשודות בחיתוך: 3', false]);
  const ok = [{ kind: 'cut_ok', page: 3, value: true }];
  assert.equal(item(ok).done, true);
  const plain = { page: 3, size: [1000, 1000], lines: [L(1, 100)] };
  assert.equal(handledItems('structure', { view: buildView(plain, []), ops: [] }).find((x) => x.key === 'suspects'), undefined);
});
