import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResumeResults } from './resumeSummary.js';

test('summarizeResumeResults: רשימה ריקה / בלי ארגומנט', () => {
  const empty = { attempted: 0, succeeded: 0, contention: 0, failed: 0, failedCodes: {} };
  assert.deepEqual(summarizeResumeResults([]), empty);
  assert.deepEqual(summarizeResumeResults(), empty);
});

test('summarizeResumeResults: ok:true (applied/cancelled/already_closed) — הצלחה', () => {
  const s = summarizeResumeResults([
    { jobId: 'a', ok: true, code: 'applied' },
    { jobId: 'b', ok: true, code: 'cancelled' },
    { jobId: 'c', ok: true, code: 'already_closed' },
  ]);
  assert.deepEqual(s, { attempted: 3, succeeded: 3, contention: 0, failed: 0, failedCodes: {} });
});

test('summarizeResumeResults: תחרות/מצב צפוי — לא כשל', () => {
  const s = summarizeResumeResults(
    ['apply_in_progress', 'not_stalled', 'not_found'].map((code) => ({ jobId: code, ok: false, code }))
  );
  assert.deepEqual(s, { attempted: 3, succeeded: 0, contention: 3, failed: 0, failedCodes: {} });
});

test('summarizeResumeResults: כשל קבוע וזמני (כולל חריגה שנזרקה) — failed עם ספירה לפי קוד', () => {
  const codes = ['result_unavailable', 'result_unavailable', 'result_corrupt', 'result_invalid', 'job_closed', 'internal_error', 'MongoNetworkError', 'EACCES'];
  const s = summarizeResumeResults(codes.map((code, i) => ({ jobId: String(i), ok: false, code })));
  assert.equal(s.attempted, 8);
  assert.equal(s.succeeded, 0);
  assert.equal(s.contention, 0);
  assert.equal(s.failed, 8);
  assert.deepEqual(s.failedCodes, {
    result_unavailable: 2,
    result_corrupt: 1,
    result_invalid: 1,
    job_closed: 1,
    internal_error: 1,
    MongoNetworkError: 1,
    EACCES: 1,
  });
});

test('summarizeResumeResults: קוד חסר נספר כ-error; קוד __proto__ לא מזהם את האובייקט', () => {
  const s = summarizeResumeResults([{ ok: false }, { ok: false, code: '__proto__' }]);
  assert.equal(s.failed, 2);
  assert.equal(s.failedCodes.error, 1);
  assert.equal(Object.getOwnPropertyDescriptor(s.failedCodes, '__proto__')?.value, 1);
  assert.equal(Object.getPrototypeOf(s.failedCodes), Object.prototype);
});

test('summarizeResumeResults: תערובת', () => {
  const s = summarizeResumeResults([
    { ok: true, code: 'applied' },
    { ok: false, code: 'apply_in_progress' },
    { ok: false, code: 'result_unavailable' },
  ]);
  assert.deepEqual(s, { attempted: 3, succeeded: 1, contention: 1, failed: 1, failedCodes: { result_unavailable: 1 } });
});
