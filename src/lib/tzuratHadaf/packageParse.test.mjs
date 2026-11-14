import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, parsePageRecord, parseItemRecord, parsePracticeRecord, parseJsonl, imageEntry, checkModel, pushError, MAX_ERRORS } from './packageParse.js';

const manifest = { format: 'tzurat-review/1', slug: 'berakhot', masechet: 'ברכות', order: 1, buildId: 'b1', full: true };
const pageRec = {
  dafKey: '002a',
  daf: 'ב.',
  order: 0,
  pdf: { file: 'x.pdf', page: 11 },
  scan: { file: 'images/002a.scan.png', w: 2629, h: 3555 },
  ours: { file: 'images/002a.ours.webp', w: 2629, h: 3555 },
  nonVilna: false,
  changed: false,
  model: { blocks: [{ id: 'g', kind: 'g', lines: [{ i: 0, ours: [0.1, 0.1, 0.3, 0.01], scan: null, words: [{ t: 'א', ref: 'r', wi: 0 }] }] }] },
};
const itemRec = {
  sourceKey: 'berakhot|g|ref|4|rep',
  dafKey: '002a',
  kind: 'g',
  cls: 'c_substitution',
  question: 'replace',
  ref: 'ref',
  wi: 4,
  n: 1,
  otz: ['א'],
  print: ['ב'],
  box: { x: 0.41, y: 0.22, w: 0.06, h: 0.016 },
  score: 4.5,
  hints: { te: 'print' },
};

test('manifest: תקין, פורמט שגוי, slug לא תקין', () => {
  const m = parseManifest(manifest);
  assert.equal(m.value.slug, 'berakhot');
  assert.equal(m.value.full, true);
  assert.ok(parseManifest({ ...manifest, format: 'x' }).error);
  assert.ok(parseManifest({ ...manifest, slug: 'Ber akhot' }).error);
  assert.ok(parseManifest({ ...manifest, slug: '../etc' }).error);
  assert.ok(parseManifest({ ...manifest, buildId: '' }).error);
  assert.ok(parseManifest(null).error);
  assert.equal(parseManifest({ ...manifest, full: 'yes' }).value.full, false);
});

test('imageEntry: רק התבנית הקבועה', () => {
  assert.deepEqual(imageEntry('images/002a.scan.png'), { dafKey: '002a', side: 'scan', ext: 'png' });
  assert.deepEqual(imageEntry('images/010b.ours.jpeg'), { dafKey: '010b', side: 'ours', ext: 'jpg' });
  assert.equal(imageEntry('images/../002a.scan.png'), null);
  assert.equal(imageEntry('images/002a.scan.png/x'), null);
  assert.equal(imageEntry('x/002a.scan.png'), null);
});

test('רשומת עמוד: תקינה ושגיאות', () => {
  const p = parsePageRecord(pageRec);
  assert.equal(p.value.dafKey, '002a');
  assert.equal(p.value.scan.ext, 'png');
  assert.equal(p.value.ours.ext, 'webp');
  assert.ok(parsePageRecord({ ...pageRec, dafKey: '2a' }).error);
  assert.ok(parsePageRecord({ ...pageRec, scan: null }).error);
  assert.ok(parsePageRecord({ ...pageRec, scan: { file: 'images/003a.scan.png', w: 1, h: 1 } }).error);
  assert.ok(parsePageRecord({ ...pageRec, scan: { ...pageRec.scan, w: 0 } }).error);
  assert.equal(parsePageRecord({ ...pageRec, ours: undefined }).value.ours, null);
  assert.ok(parsePageRecord({ ...pageRec, model: { blocks: 'x' } }).error);
});

test('מודל: מזהים כפולים ושורות', () => {
  assert.ok(checkModel({ blocks: [{ id: 'g', lines: [] }, { id: 'g', lines: [] }] }).error);
  assert.ok(checkModel({ blocks: [{ id: 'g', lines: [{ i: 0 }, { i: 0 }] }] }).error);
  assert.ok(checkModel({ blocks: [{ id: 'g', lines: [{ i: 0, ours: [1, 2] }] }] }).error);
  assert.deepEqual(checkModel(null).value, { blocks: [] });
  // שורה מדומה (fake, i שלילי) וגוש נעול — תקינים; i שלילי בלי fake — לא
  assert.ok(!checkModel({ blocks: [{ id: 'mg0', editable: false, lines: [{ i: -1, fake: true }, { i: 0 }] }] }).error);
  assert.ok(checkModel({ blocks: [{ id: 'g', lines: [{ i: -1 }] }] }).error);
});

test('רשומת החלטה: תקינה, sourceKey של מסכת אחרת, בלי מילים, box שגוי', () => {
  const r = parseItemRecord(itemRec, 'berakhot');
  assert.equal(r.value.question, 'replace');
  assert.deepEqual(r.value.box, itemRec.box);
  assert.ok(parseItemRecord({ ...itemRec, sourceKey: 'shabbat|g|x|1|rep' }, 'berakhot').error);
  assert.ok(parseItemRecord({ ...itemRec, otz: [], print: [] }, 'berakhot').error);
  assert.ok(parseItemRecord({ ...itemRec, box: { x: 2, y: 0, w: 0.1, h: 0.1 } }, 'berakhot').error);
  assert.equal(parseItemRecord({ ...itemRec, box: null }, 'berakhot').value.box, null);
  assert.equal(parseItemRecord({ ...itemRec, question: undefined, print: [] }, 'berakhot').value.question, 'otz_only');
});

test('רשומת תרגול: expected ו-explain', () => {
  const r = parsePracticeRecord({ ...itemRec, expected: 'print', explain: 'כך נדפס' }, 'berakhot');
  assert.equal(r.value.expected, 'print');
  assert.equal(r.value.explain, 'כך נדפס');
  assert.ok(parsePracticeRecord({ ...itemRec, expected: 'unclear' }, 'berakhot').error);
  assert.ok(parsePracticeRecord({ ...itemRec, expected: 'other' }, 'berakhot').error);
  assert.equal(parsePracticeRecord({ ...itemRec, expected: 'other', text: 'גמ\'' }, 'berakhot').value.expectedText, "גמ'");
});

test('parseJsonl: שורות ריקות ושורה פגומה', () => {
  const rows = parseJsonl('{"a":1}\n\n{bad\r\n{"b":2}\n');
  assert.deepEqual(rows, [{ line: 1, value: { a: 1 } }, { line: 3, error: 'JSON לא תקין' }, { line: 4, value: { b: 2 } }]);
});

test('pushError: עד MAX_ERRORS', () => {
  const errs = [];
  for (let i = 0; i < 50; i++) pushError(errs, `שורה ${i}`);
  assert.equal(errs.length, MAX_ERRORS);
});
