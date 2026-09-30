import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_PREFIX,
  legacyDraftKey,
  draftKeyFor,
  pageRevisionNumber,
  pageRevision,
  pageDraftKey,
  isDraftKeyOf,
  staleDraftKeys,
  readDraftOps,
  cleanupPageDrafts,
  removePageDrafts,
  draftKeyRevision,
  carryDraftOps,
  droppedOpLabel,
} from './drafts.js';
import { docRevision } from './textModel.js';

// localStorage מדומה (אותו ממשק: getItem/setItem/removeItem/key/length)
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

const ID = '64b7f0c2a1b2c3d4e5f60718';
const OTHER = '64b7f0c2a1b2c3d4e5f60719';
const line = (id) => ({ id, order: id, bbox: [100, id * 50, 900, id * 50 + 40], text: `שורה ${id}`, stream: 'main' });
const page = (extra = {}, docExtra = {}) => ({
  id: ID,
  page: 4,
  doc: { page: 4, size: [1000, 2000], lines: [line(1), line(2)], ...docExtra },
  ...extra,
});
const draft = (ops) => JSON.stringify({ ops, at: 1 });
const okOp = { kind: 'line_ok', page: 4, ids: [1] };

test('מפתחות: הישן בלי גרסה, החדש עם מזהה-הגרסה', () => {
  assert.equal(legacyDraftKey(ID), `${DRAFT_PREFIX}${ID}`);
  assert.equal(draftKeyFor(ID, '2:abc'), `${DRAFT_PREFIX}${ID}:2:abc`);
  assert.equal(pageDraftKey(page()), `${DRAFT_PREFIX}${ID}:${docRevision(page().doc)}`);
});

test('pageRevisionNumber: revision שב-doc קודם, אחריו של העמוד השמור, אחרת 1', () => {
  assert.equal(pageRevisionNumber(page()), 1);
  assert.equal(pageRevisionNumber(page({ revision: 3 })), 3);
  assert.equal(pageRevisionNumber(page({ revision: 3 }, { revision: 2 })), 2);
  assert.equal(pageRevisionNumber(page({ revision: null })), 1);
  assert.equal(pageRevisionNumber(page({ revision: 'x' })), 1);
  assert.equal(pageRevisionNumber(null), 1);
});

test('pageRevision: גרסה אחרת או שורות אחרות — מפתח אחר; אותו עמוד — אותו מפתח', () => {
  assert.equal(pageRevision(page()), pageRevision(page()));
  assert.equal(pageRevision(page()), pageRevision(page({ revision: 1 })));
  assert.notEqual(pageRevision(page()), pageRevision(page({ revision: 2 })));
  assert.notEqual(pageRevision(page()), pageRevision(page({}, { lines: [line(1), line(3)] })));
  assert.match(pageRevision(page({ revision: 2 })), /^2:/);
});

test('isDraftKeyOf/staleDraftKeys: רק טיוטות של העמוד הזה, בלי המפתח הנוכחי', () => {
  const cur = draftKeyFor(ID, '2:aaa');
  const keys = [legacyDraftKey(ID), draftKeyFor(ID, '1:bbb'), cur, legacyDraftKey(OTHER), draftKeyFor(OTHER, '1:ccc'), 'pageProof.helpSeen', `${legacyDraftKey(ID)}x`];
  assert.deepEqual(staleDraftKeys(keys, ID, cur), [legacyDraftKey(ID), draftKeyFor(ID, '1:bbb')]);
  assert.equal(isDraftKeyOf(`${legacyDraftKey(ID)}x`, ID), false);
  assert.equal(isDraftKeyOf(null, ID), false);
  assert.equal(isDraftKeyOf(legacyDraftKey(''), ''), false);
});

test('readDraftOps: רשימת הפעולות, או null לטיוטה פגומה', () => {
  assert.deepEqual(readDraftOps(draft([okOp])), [okOp]);
  assert.equal(readDraftOps('{'), null);
  assert.equal(readDraftOps(JSON.stringify({ at: 1 })), null);
  assert.equal(readDraftOps(null), null);
});

test('cleanupPageDrafts: מוחק גרסאות אחרות של העמוד, שומר את הנוכחית ואת של עמודים אחרים', () => {
  const p = page({ revision: 2 });
  const key = pageDraftKey(p);
  const s = memStorage({
    [key]: draft([okOp]),
    [draftKeyFor(ID, '1:old')]: draft([okOp]),
    [legacyDraftKey(ID)]: draft([okOp]),
    [draftKeyFor(OTHER, '1:x')]: draft([okOp]),
    'pageProof.helpSeen': '1',
  });
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.key, key);
  assert.equal(res.migrated, false);
  assert.deepEqual(res.removed.sort(), [draftKeyFor(ID, '1:old'), legacyDraftKey(ID)].sort());
  assert.deepEqual(s.keys(), [key, draftKeyFor(OTHER, '1:x'), 'pageProof.helpSeen'].sort());
});

test('cleanupPageDrafts: טיוטה ישנה תקפה עוברת למפתח החדש (גרסה 1) ואז הישן נמחק', () => {
  const p = page();
  const s = memStorage({ [legacyDraftKey(ID)]: draft([okOp]) });
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.migrated, true);
  assert.deepEqual(res.removed, [legacyDraftKey(ID)]);
  assert.deepEqual(readDraftOps(s.getItem(pageDraftKey(p))), [okOp]);
  assert.equal(s.getItem(legacyDraftKey(ID)), null);
});

test('cleanupPageDrafts: טיוטה ישנה שאינה תקפה לעמוד (שורה שאינה בו) — נמחקת, לא עוברת', () => {
  const p = page();
  const s = memStorage({ [legacyDraftKey(ID)]: draft([{ kind: 'line_ok', page: 4, ids: [99] }]) });
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.migrated, false);
  assert.deepEqual(s.keys(), []);
});

test('cleanupPageDrafts: טיוטה ישנה אינה עוברת לעמוד בגרסה 2 — היא של הגרסה הקודמת', () => {
  const p = page({ revision: 2 });
  const s = memStorage({ [legacyDraftKey(ID)]: draft([okOp]) });
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.migrated, false);
  assert.deepEqual(s.keys(), []);
});

test('cleanupPageDrafts: טיוטה קיימת במפתח החדש אינה נדרסת בטיוטה הישנה', () => {
  const p = page();
  const mine = draft([{ kind: 'line_ok', page: 4, ids: [2] }]);
  const s = memStorage({ [pageDraftKey(p)]: mine, [legacyDraftKey(ID)]: draft([okOp]) });
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.migrated, false);
  assert.equal(s.getItem(pageDraftKey(p)), mine);
  assert.equal(s.getItem(legacyDraftKey(ID)), null);
});

test('cleanupPageDrafts: בלי אחסון או בלי מזהה-עמוד — לא עושה דבר', () => {
  assert.deepEqual(cleanupPageDrafts(null, page()).removed, []);
  const s = memStorage({ [legacyDraftKey(ID)]: draft([okOp]) });
  assert.deepEqual(cleanupPageDrafts(s, { doc: page().doc }, 'k').removed, []);
  assert.deepEqual(s.keys(), [legacyDraftKey(ID)]);
});

test('removePageDrafts: כל הטיוטות של העמוד — ורק שלו', () => {
  const s = memStorage({
    [legacyDraftKey(ID)]: '1',
    [draftKeyFor(ID, '1:a')]: '1',
    [draftKeyFor(ID, '2:b')]: '1',
    [draftKeyFor(OTHER, '1:a')]: '1',
  });
  assert.equal(removePageDrafts(s, ID).length, 3);
  assert.deepEqual(s.keys(), [draftKeyFor(OTHER, '1:a')]);
  assert.deepEqual(removePageDrafts(null, ID), []);
});


test('cleanupPageDrafts: טיוטה ישנה עם קישור לעמוד אחר (העמוד מוצהר) — תקפה ועוברת; בלי הצהרה — לא', () => {
  const far = { kind: 'link_add', page: 4, ids: [1, 77], value: { kind: 'note', from_words: [0, 0], to_words: [0, 0], to_page: 5, to_line_no: 0, to_text: 'ב ועוד' } };
  const p = page();
  const s = memStorage({ [legacyDraftKey(ID)]: draft([far]) });
  assert.equal(cleanupPageDrafts(s, p).migrated, true);
  assert.deepEqual(readDraftOps(s.getItem(pageDraftKey(p))), [far]);
  const s2 = memStorage({ [legacyDraftKey(ID)]: draft([{ ...far, value: { kind: 'note' } }]) });
  assert.equal(cleanupPageDrafts(s2, p).migrated, false);
});

// ---------- עמוד שחזר מזיהוי-מחדש: הטיוטה עוברת לגרסה החדשה ----------

// גרסה 1: שורות 1–3; גרסה 2 (אחרי זיהוי-מחדש): שורה 3 נחתכה לשתיים — 31, 32
const rev1 = () => page({ revision: 1 }, { revision: 1, lines: [line(1), line(2), line(3)] });
const rev2 = () => page({ revision: 2 }, { revision: 2, lines: [line(1), line(2), line(31), line(32)] });
const OLD_DRAFT = [
  { kind: 'line_split', page: 4, ids: [3], value: { x: 500 } },
  { kind: 'text', page: 4, ids: [1], value: 'שורה אחת מתוקנת', _g: 'g1' },
  { kind: 'text', page: 4, ids: [3], value: 'טקסט על שורה שנחתכה מחדש' },
  { kind: 'line_ok', page: 4, ids: [2] },
  { kind: 'seg_ok', page: 4, ids: [2], value: 0, _local: true },
  { kind: 'cut_ok', page: 4, value: true },
];

test('draftKeyRevision: מספר-הגרסה שבמפתח; המפתח הישן ומפתחות אחרים — null', () => {
  assert.equal(draftKeyRevision(draftKeyFor(ID, '2:abc'), ID), 2);
  assert.equal(draftKeyRevision(draftKeyFor(ID, '17:abc'), ID), 17);
  assert.equal(draftKeyRevision(legacyDraftKey(ID), ID), null);
  assert.equal(draftKeyRevision(draftKeyFor(OTHER, '2:abc'), ID), null);
  assert.equal(draftKeyRevision(draftKeyFor(ID, 'x:abc'), ID), null);
  assert.equal(draftKeyRevision(null, ID), null);
});

test('carryDraftOps: חיתוך לא עובר (נעשה כבר); מה שתקף מול הגרסה החדשה — עובר בסדרו; השאר — dropped', () => {
  const { kept, dropped, cut } = carryDraftOps(rev2().doc, OLD_DRAFT);
  assert.equal(cut, 1);
  assert.deepEqual(kept.map((o) => o.kind), ['text', 'line_ok', 'seg_ok']);
  assert.equal(kept[0]._g, 'g1', 'שדות-העורך נשמרים (קבוצות-ביטול)');
  // טקסט על שורה שכבר אינה; "החיתוך תקין" — את החיתוך החדש בודקים מחדש
  assert.deepEqual(dropped.map((o) => o.kind), ['text', 'cut_ok']);
  // פעולה מקומית על שורה שאינה — לא עוברת (ואינה מדווחת)
  const local = carryDraftOps(rev2().doc, [{ kind: 'seg_ok', page: 4, ids: [3], value: 0, _local: true }]);
  assert.deepEqual([local.kept, local.dropped, local.cut], [[], [], 0]);
  assert.deepEqual(carryDraftOps(rev2().doc, null), { kept: [], dropped: [], cut: 0 });
});

test('droppedOpLabel: סוג-הפעולה בעברית, ולתיקון-טקסט — מה שהוקלד (מקוצר)', () => {
  assert.equal(droppedOpLabel({ kind: 'text', value: 'קצר' }), 'טקסט: «קצר»');
  assert.equal(droppedOpLabel({ kind: 'text', value: 'א'.repeat(60) }), `טקסט: «${'א'.repeat(40)}…»`);
  assert.equal(droppedOpLabel({ kind: 'cut_ok' }), 'החיתוך תקין');
  assert.equal(droppedOpLabel({ kind: 'styles' }), 'סגנון-תו');
});

test('cleanupPageDrafts: עמוד שחזר מזיהוי-מחדש — מה שתקף מהטיוטה הקודמת עובר אליו, ו-carried מספר מה לא עבר', () => {
  const k1 = pageDraftKey(rev1());
  const s = memStorage({ [k1]: draft(OLD_DRAFT), [draftKeyFor(OTHER, '1:x')]: draft([okOp]) });
  const p = rev2();
  const res = cleanupPageDrafts(s, p);
  assert.equal(res.key, pageDraftKey(p));
  assert.deepEqual(readDraftOps(s.getItem(res.key)).map((o) => o.kind), ['text', 'line_ok', 'seg_ok']);
  assert.deepEqual(res.carried, { from: k1, kept: 2, cut: 1, dropped: ['טקסט: «טקסט על שורה שנחתכה מחדש»', 'החיתוך תקין'] });
  assert.deepEqual(res.removed, [k1]);
  assert.deepEqual(s.keys(), [res.key, draftKeyFor(OTHER, '1:x')].sort());
});

test('cleanupPageDrafts: כמה גרסאות קודמות — עוברת האחרונה שבהן; כבר יש טיוטה לגרסה החדשה — לא נדרסת', () => {
  const p = page({ revision: 3 }, { revision: 3, lines: [line(1), line(2)] });
  const s = memStorage({
    [draftKeyFor(ID, '1:old')]: draft([{ kind: 'text', page: 4, ids: [1], value: 'ישן מאוד' }]),
    [draftKeyFor(ID, '2:mid')]: draft([{ kind: 'text', page: 4, ids: [1], value: 'מהגרסה השנייה' }]),
  });
  const res = cleanupPageDrafts(s, p);
  assert.deepEqual(readDraftOps(s.getItem(res.key)).map((o) => o.value), ['מהגרסה השנייה']);
  assert.equal(res.carried.from, draftKeyFor(ID, '2:mid'));

  const s2 = memStorage({ [pageDraftKey(p)]: draft([okOp]), [draftKeyFor(ID, '2:mid')]: draft([{ kind: 'text', page: 4, ids: [1], value: 'x' }]) });
  const res2 = cleanupPageDrafts(s2, p);
  assert.equal(res2.carried, null);
  assert.deepEqual(readDraftOps(s2.getItem(pageDraftKey(p))), [okOp]);
  assert.deepEqual(res2.removed, [draftKeyFor(ID, '2:mid')]);
});

test('cleanupPageDrafts: בטיוטה הקודמת רק חיתוך (נשלח לזיהוי-מחדש) — אין מה להעביר ואין מה לספר', () => {
  const s = memStorage({ [pageDraftKey(rev1())]: draft([OLD_DRAFT[0]]) });
  const res = cleanupPageDrafts(s, rev2());
  assert.equal(res.carried, null);
  assert.deepEqual(s.keys(), []);
});
