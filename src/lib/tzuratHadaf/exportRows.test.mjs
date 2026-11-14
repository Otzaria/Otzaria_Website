import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTypes, parseSince, metaRow, decisionRow, anchorRows, checkRows, reportRow, contributorRow, EXPORT_TYPES } from './exportRows.js';

const at = new Date('2026-10-25T10:00:00Z');

test('parseTypes: ריק — הכול; יחיד/רבים; לא מוכר', () => {
  assert.deepEqual(parseTypes(null).types, [...EXPORT_TYPES]);
  assert.deepEqual(parseTypes('anchors,decisions').types, ['decision', 'anchor']);
  assert.deepEqual(parseTypes('report').types, ['report']);
  assert.deepEqual(parseTypes('manual,checks').types, ['decision', 'check']);
  assert.ok(parseTypes('bogus').error);
});

test('parseSince', () => {
  assert.equal(parseSince('').since, null);
  assert.equal(parseSince('2026-10-01T00:00:00Z').since.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.ok(parseSince('yesterday').error);
});

test('metaRow', () => {
  assert.deepEqual(metaRow(null, at), { type: 'meta', format: 'tzurat-review-export/1', exportedAt: at.toISOString(), since: null });
});

const item = {
  _id: 'i1',
  sourceKey: 'berakhot|g|r|4|rep',
  slug: 'berakhot',
  masechet: 'ברכות',
  daf: 'ב.',
  dafKey: '002a',
  kind: 'g',
  ref: 'r',
  wi: 4,
  n: 1,
  otz: ['א'],
  print: ['ב'],
  box: null,
  answers: [
    { user: 'u1', who: 'otz-u1', verdict: 'print', text: null, via: 'fast', at },
    { user: 'u2', verdict: 'print', text: null, via: 'page', at },
  ],
  status: 'agreed',
  decision: { verdict: 'print', text: null, at },
};

test('decisionRow: רק agreed/resolved, לא תרגול', () => {
  const r = decisionRow(item);
  assert.equal(r.type, 'decision');
  assert.equal(r.verdict, 'print');
  assert.equal(r.answers[1].who, 'otz-u2');
  assert.equal(r.resolvedBy, null);
  assert.equal(r.at, at.toISOString());
  assert.equal(decisionRow({ ...item, status: 'open' }), null);
  assert.equal(decisionRow({ ...item, practice: true }), null);
  const res = decisionRow({ ...item, status: 'resolved', resolved: { verdict: 'other', text: 'ג', by: 'a1', at } });
  assert.equal(res.verdict, 'other');
  assert.equal(res.text, 'ג');
  assert.equal(res.resolvedBy, 'otz-a1');
  assert.equal(JSON.stringify(r).includes('name'), false);
});

const sub = {
  _id: 's1',
  slug: 'berakhot',
  dafKey: '002a',
  user: 'u1',
  who: 'otz-u1',
  round: 2,
  buildId: 'b1',
  status: 'approved',
  reviewedAt: at,
  anchors: [
    { block: 'g', line: 7, ref: 'r', wi: 3, action: 'start' },
    { block: 'g', line: 8, action: 'confirm' },
  ],
  checks: { blocks: 'issue', headers: 'ok', junk: 'x' },
};

test('anchorRows/checkRows: רק מאושרות', () => {
  const rows = anchorRows(sub, { masechet: 'ברכות', daf: 'ב.' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    type: 'anchor', slug: 'berakhot', masechet: 'ברכות', daf: 'ב.', dafKey: '002a', block: 'g', line: 7, ref: 'r', wi: 3, action: 'start',
    who: 'otz-u1', submission: 's1', round: 2, buildId: 'b1', at: at.toISOString(),
  });
  assert.equal('ref' in rows[1], false);
  assert.deepEqual(anchorRows({ ...sub, status: 'submitted' }), []);
  const checks = checkRows(sub, { daf: 'ב.' });
  assert.deepEqual(checks.map((c) => [c.key, c.value]), [['blocks', 'issue'], ['headers', 'ok']]);
});

test('reportRow ו-contributorRow: who יציב, שם רק בתורם', () => {
  const r = reportRow({ _id: 'r1', slug: 's', dafKey: '002a', user: 'u9', category: 'layout', text: 't', regions: [{ side: 'scan', x: 0.1, y: 0.2, w: 0.3, h: 0.05, _junk: 1 }], status: 'new', createdAt: at, userName: 'שם' }, { masechet: 'מ', daf: 'ב.' });
  assert.equal(r.who, 'otz-u9');
  assert.equal(JSON.stringify(r).includes('שם'), false);
  assert.deepEqual(r.regions[0], { side: 'scan', x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
  assert.deepEqual(contributorRow({ user: 'u9', name: 'פלוני', decisions: 3 }), { type: 'contributor', who: 'otz-u9', name: 'פלוני', decisions: 3, pages: 0, reports: 0 });
});
