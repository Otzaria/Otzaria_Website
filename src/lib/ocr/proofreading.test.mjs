import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocalRequest, requestFingerprint } from './localJobCreate.pure.js';
import { toEnvelope } from './localEnvelope.js';
import { cleanContextAlternatives } from './proofreadingMarks.js';
import { normalizeCapabilities, proofreadingCapabilitiesView, unsupportedProofreadingOptions, proofreadingResultLabel } from './proofreadingCapabilities.js';
import { resultMetadataView, bookMetadataJson } from './localResultLayout.pure.js';

const base = { requestId: 'pr6-request', existingTextMode: 'overwrite', options: { lm: 'modern', defaultScript: 'square' } };
const snapshot = { schemaVersion: 1, proofreading: { version: 1, lmCheck: true, alternatives: true,
  lexiconAvailable: true, contextAvailable: true, lexicons: [{ name: 'modern', version: 3 }], defaultLexicons: [] } };

test('new options preserve domain, normalize names and distinguish omitted versus empty selection', () => {
  const old = normalizeLocalRequest(base).value;
  assert.deepEqual(old.options, base.options);
  const req = normalizeLocalRequest({ ...base, options: { ...base.options, lmCheck: 'off', alts: 'on', lexicons: [] } });
  assert.equal(req.ok, true);
  assert.deepEqual(req.value.options, { ...base.options, lmCheck: 'off', alts: 'on', lexicons: [] });
  const f = (options) => requestFingerprint({ bookId: 'book', existingTextMode: 'overwrite', options });
  assert.notEqual(f(old.options), f(req.value.options));
  assert.notEqual(f({ ...base.options, lexicons: [] }), f(base.options));
  assert.equal(f({ ...base.options, lexicons: ['b', 'a'] }), f({ ...base.options, lexicons: ['a', 'b'] }));
  for (const bad of [{ lmCheck: false }, { alts: null }, { lexicons: ['../path'] }, { lexicons: ['x', 'x'] }, { lexicons: Array(17).fill('x') }, ...['x\n', 'x\r', 'x\u2028', 'x'.repeat(61)].map((n) => ({ lexicons: [n] }))]) {
    assert.equal(normalizeLocalRequest({ ...base, options: { ...base.options, ...bad } }).ok, false);
  }
  assert.deepEqual(toEnvelope({ _id: 'job', workerId: 'w', createdAt: new Date(0), inputSha256: 'a', options: req.value.options }).options, req.value.options);
});

test('context alternatives are bounded and distinct from old fix suggestions', () => {
  const list = cleanContextAlternatives([
    { text: 'word', p: .9 }, { text: 'old' }, { text: 'split word', p: .8, why: 'two words' },
    { text: 'split word' }, { text: '<b>unsafe</b>' }, { text: 'long'.repeat(60) },
    { text: 'second', p: Infinity }, { text: 'third', p: -1 }, { text: 'fourth' },
  ], 'word', ['old']);
  assert.deepEqual(list, [{ text: 'split word', p: .8, why: 'two words' }, { text: 'second', p: null, why: '' }, { text: 'third', p: null, why: '' }]);
});

test('capability reports expose only bounded catalog fields and expire', () => {
  const clean = normalizeCapabilities({ ...snapshot, path: 'private', proofreading: { ...snapshot.proofreading, localPath: 'private' } });
  assert.deepEqual(clean, snapshot.proofreading);
  const received = new Date('2026-11-16T10:00:00Z');
  const state = { proofreadingCapabilities: clean, capabilitiesReceivedAt: received };
  const caps = proofreadingCapabilitiesView(state, received);
  assert.equal(caps.state, 'available');
  assert.equal(proofreadingCapabilitiesView(state, new Date(received.getTime() + 16 * 60_000)).state, 'stale');
  assert.equal(unsupportedProofreadingOptions(base.options, null), null);
  assert.ok(unsupportedProofreadingOptions({ ...base.options, alts: 'on' }, null));
  assert.equal(unsupportedProofreadingOptions({ ...base.options, lmCheck: 'off', alts: 'on', lexicons: ['modern'] }, caps), null);
  assert.ok(unsupportedProofreadingOptions({ ...base.options, lexicons: ['missing'] }, caps));
  assert.equal(normalizeCapabilities({ ...snapshot, proofreading: { ...snapshot.proofreading, lexicons: [{ name: '../x', version: 1 }] } }), null);
  for (const name of ['x\n', 'x\r', 'x\u2028', 'x'.repeat(61)]) {
    assert.equal(normalizeCapabilities({ ...snapshot, proofreading: { ...snapshot.proofreading, lexicons: [{ name, version: 1 }] } }), null);
  }
});

test('partial proofreading outcome remains visible even when book metadata is trimmed', () => {
  const proofreading = { requested: true, status: 'failed', reason: 'context_timeout', path: 'private' };
  const trimmed = bookMetadataJson({ proofreading, filler: 'x'.repeat(600_000) });
  const view = resultMetadataView(trimmed.json);
  assert.deepEqual(view.proofreading, { requested: true, status: 'failed', reason: 'context_timeout' });
  assert.match(proofreadingResultLabel(view.proofreading), /הזיהוי הושלם;.*לא חושבו/);
  assert.match(proofreadingResultLabel(view.proofreading), /מגבלת הזמן/);
  const fallback = resultMetadataView(JSON.stringify({ proofreading: { requested: true, status: 'unavailable', reason: 'dictionary_unavailable' } }));
  assert.equal(fallback.proofreading.reason, 'dictionary_unavailable');
  assert.match(proofreadingResultLabel(fallback.proofreading), /אחד המילונים הנוספים שנבחרו אינו זמין ולא שימש בהגהה/);
  assert.doesNotMatch(proofreadingResultLabel(fallback.proofreading), /הופעל|הושלם/);
});
