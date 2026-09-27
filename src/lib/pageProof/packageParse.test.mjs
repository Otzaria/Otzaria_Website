import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePackageEntries, checkPageDoc, slimPageDoc } from './packageParse.js';
import { assignSequences, isDoubleSequence, requiredFor } from './sequences.js';
import { buildFixesFile, splitPrimary } from './fixesExport.js';

const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
const GID = 'e1996294b9324c678c5ef1842d6337b7';

const pageDoc = (page) => ({
  contract: 1,
  gid: GID,
  page,
  image: `pages/p00${page}.png`,
  size: [100, 200],
  lines: [{ id: page * 10, bbox: [1, 1, 50, 20], polygon: [[1, 1]], baseline: [[1, 1]] }],
});

// שמות-קבצים משובשים בכוונה (כמו ZIP בקידוד-OEM) — הזיהוי לפי תוכן
function entries() {
  return {
    'Ó·ÈÏ‰/': new Uint8Array(),
    'Ó·ÈÏ‰/ÁÂ·ÈÏ‰.json': enc({ contract: 1, gid: GID, title: 'בדיקה', script: 'square', pages: [{ page: 1, image: 'pages/p001.png' }, { page: 2, image: 'pages/p002.png' }] }),
    'Ó·ÈÏ‰/ÚÓÂ„-001.json': enc(pageDoc(1)),
    'Ó·ÈÏ‰/ÚÓÂ„-002.json': enc(pageDoc(2)),
    'Ó·ÈÏ‰/pages/p001.png': new Uint8Array([1]),
    'Ó·ÈÏ‰/pages/p002.png': new Uint8Array([2]),
  };
}

test('parsePackageEntries: מזהה חבילה לפי תוכן גם כששמות הקבצים משובשים', () => {
  const { packages, errors } = parsePackageEntries(entries());
  assert.deepEqual(errors, []);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].meta.gid, GID);
  assert.deepEqual(packages[0].pages.map((p) => p.doc.page), [1, 2]);
  assert.equal(packages[0].pages[0].imagePath, 'Ó·ÈÏ‰/pages/p001.png');
});

test('parsePackageEntries: עמוד בלי תמונה מדווח ולא מפיל את השאר', () => {
  const e = entries();
  delete e['Ó·ÈÏ‰/pages/p002.png'];
  const { packages, errors } = parsePackageEntries(e);
  assert.equal(packages[0].pages.length, 1);
  assert.match(errors[0], /תמונת-העמוד חסרה/);
});

test('parsePackageEntries: בלי קובץ-חבילה', () => {
  const { packages, errors } = parsePackageEntries({ 'a.json': enc({ x: 1 }) });
  assert.equal(packages.length, 0);
  assert.match(errors[0], /לא נמצא קובץ-חבילה/);
});

test('parsePackageEntries: נתיב-תמונה שיוצא מהתיקייה נדחה', () => {
  const e = entries();
  const d = pageDoc(1);
  d.image = '../evil.png';
  e['Ó·ÈÏ‰/ÚÓÂ„-001.json'] = enc(d);
  e['evil.png'] = new Uint8Array([1]);
  const { errors } = parsePackageEntries(e);
  assert.ok(errors.some((x) => /עמוד 1/.test(x)));
});

test('checkPageDoc: מזהה-שורה כפול ו-gid שונה', () => {
  const d = pageDoc(1);
  d.lines.push({ ...d.lines[0] });
  assert.match(checkPageDoc(d, GID), /כפול/);
  assert.match(checkPageDoc(pageDoc(1), 'other12345'), /gid/);
});

test('slimPageDoc מסיר polygon/baseline בלבד', () => {
  const s = slimPageDoc(pageDoc(1));
  assert.equal(s.lines[0].polygon, undefined);
  assert.deepEqual(s.lines[0].bbox, [1, 1, 50, 20]);
});

test('assignSequences: רצפים של 5 לפי הסדר העולה', () => {
  const m = assignSequences([12, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(m.get(1), 0);
  assert.equal(m.get(5), 0);
  assert.equal(m.get(6), 1);
  assert.equal(m.get(12), 1);
});

test('isDoubleSequence: דטרמיניסטי ובערך האחוז המבוקש', () => {
  assert.equal(isDoubleSequence(GID, 3), isDoubleSequence(GID, 3));
  assert.equal(isDoubleSequence(GID, 3, 0), false);
  assert.equal(isDoubleSequence(GID, 3, 100), true);
  let n = 0;
  for (let s = 0; s < 2000; s++) n += isDoubleSequence(GID, s, 10);
  assert.ok(n > 120 && n < 280, `${n}`);
  assert.equal(requiredFor(GID, 1, 100), 2);
});

test('splitPrimary: ההגשה הראשונה שאושרה לכל עמוד היא הראשית', () => {
  const subs = [
    { _id: 'b', page: 1, approvedAt: '2026-09-02', who: 'u2', ops: [] },
    { _id: 'a', page: 1, approvedAt: '2026-09-01', who: 'u1', ops: [] },
    { _id: 'c', page: 2, approvedAt: '2026-09-03', who: 'u2', ops: [] },
  ];
  const { primary, double } = splitPrimary(subs);
  assert.deepEqual(primary.map((s) => s._id), ['a', 'c']);
  assert.deepEqual(double.map((s) => s._id), ['b']);
});

test('buildFixesFile: who ו-when לכל פעולה, בלי ids ריקים', () => {
  const f = buildFixesFile(
    GID,
    [
      { page: 2, who: 'u1', submittedAt: '2026-09-23T10:00:00Z', ops: [{ kind: 'page_type', page: 2, value: 'title' }] },
      { page: 1, who: 'u2', submittedAt: '2026-09-23T11:00:00Z', ops: [{ kind: 'text', page: 1, ids: [10], value: 'x' }] },
    ],
    new Date('2026-09-24T00:00:00Z')
  );
  assert.equal(f.contract, 1);
  assert.equal(f.gid, GID);
  assert.equal(f.when, '2026-09-24T00:00:00');
  assert.deepEqual(f.ops.map((o) => o.page), [1, 2]);
  assert.equal(f.ops[0].who, 'u2');
  assert.equal(f.ops[0].when, '2026-09-23T11:00:00');
  assert.equal('ids' in f.ops[1], false);
});
