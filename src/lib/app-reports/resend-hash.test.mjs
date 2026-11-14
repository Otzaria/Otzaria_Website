import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAppReport } from './validation.js';
import { computeContentHash, computeResendHash } from './hashes.js';

async function normalized(schema, diagnostics, reportId = 'hash-probe') {
  const result = await validateAppReport({
    schema, reportId, type: 'bug', trigger: 'manual', title: 'Same report',
    description: 'Keep diagnostics', reporterEmail: 'reporter@example.com',
    appVersion: '1.0.0', platform: 'linux', attachments: { errorLog: 'same log', diagnostics },
  });
  assert.equal(result.ok, true);
  return result.value;
}
const fingerprint = (report) => computeResendHash(computeContentHash(report), report);

test('schema1 resend fingerprint remains byte-compatible and ignores diagnostics', async () => {
  const original = await normalized(1, { memoryMiB: 12.5 });
  // Recorded from the existing schema1 implementation, before the schema2 fix.
  assert.equal(fingerprint(original), '5e41392b4a5a71c8d449d74cc80a5e47264fb7e320d0ba3e129677f7f4460307');
  assert.equal(fingerprint(await normalized(1, undefined)), fingerprint(original));
  assert.equal(fingerprint(await normalized(1, { other: 'new diagnostics' })), fingerprint(original));
});

test('schema2 distinguishes omitted, empty and changed diagnostics', async () => {
  const omitted = await normalized(2, undefined);
  const empty = await normalized(2, {});
  const first = await normalized(2, { details: 'first attachment' });
  const changed = await normalized(2, { details: 'second attachment' });
  assert.equal(computeContentHash(first), computeContentHash(changed));
  assert.equal(new Set([omitted, empty, first, changed].map(fingerprint)).size, 4);
});

test('schema2 fingerprints valid diagnostic JSON including decimals, Unicode and collection time', async () => {
  const diagnostics = { memoryMiB: 12.5, message: 'אבחון 📝', collectedAt: '2026-11-05T12:00:00Z' };
  const original = await normalized(2, diagnostics);
  assert.match(fingerprint(original), /^[0-9a-f]{64}$/);
  for (const update of [{ memoryMiB: 25.25 }, { message: 'אבחון אחר' }, { collectedAt: '2026-11-05T12:01:00Z' }]) {
    assert.notEqual(fingerprint(await normalized(2, { ...diagnostics, ...update })), fingerprint(original));
  }
});

test('schema2 unchanged retries and resends keep the same fingerprint without changing contentHash', async () => {
  const diagnostics = { nested: { memoryMiB: 12.5 }, text: 'same exact attachment' };
  const original = await normalized(2, diagnostics);
  const resend = await normalized(2, JSON.parse(JSON.stringify(diagnostics)), 'new-report-id');
  assert.equal(fingerprint(resend), fingerprint(original));
  assert.equal(computeContentHash(original), computeContentHash(await normalized(1, diagnostics)));
  assert.notEqual(fingerprint(original), fingerprint(await normalized(1, diagnostics)));
});
