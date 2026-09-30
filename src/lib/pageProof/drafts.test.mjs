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
