import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupCandidateFilter,
  DAY_MS,
  fileDecision,
  HOUR_MS,
  jobFilesEligibility,
  parseJobFileName,
} from './localCleanup.pure.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const NOW = new Date('2026-10-20T12:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms);
const ack = (outcome = 'success') => ({ ack: 'accepted', jobId: 'j', resultSha256: A, outcome });

const acked = (over = {}) => ({
  method: 'local',
  active: false,
  status: 'completed',
  resultSha256: A,
  ack: ack(),
  ackAt: ago(25 * HOUR_MS),
  ...over,
});

test('parseJobFileName: רק <kind>-<sha256>.<ext> עם הסיומת הנכונה', () => {
  assert.deepEqual(parseJobFileName(`input-${A}.pdf`), { kind: 'input', sha: A });
  assert.deepEqual(parseJobFileName(`result-${A}.json`), { kind: 'result', sha: A });
  assert.deepEqual(parseJobFileName(`rejected-${B}.json`), { kind: 'rejected', sha: B });
  for (const bad of [
    `input-${A}.json`,
    `result-${A}.pdf`,
    `result-${A.toUpperCase()}.json`,
    `result-${A}.json.tmp-0123456789abcdef`,
    `../result-${A}.json`,
    `result-${A.slice(1)}.json`,
    'notes.txt',
    '',
  ]) {
    assert.equal(parseJobFileName(bad), null, bad);
  }
});

test('jobFilesEligibility: 24 שעות מ-ackAt; בלי ack — רק failed/cancelled בלי תוצאה נעולה', () => {
  assert.equal(jobFilesEligibility(acked(), NOW), 'acked');
  assert.equal(jobFilesEligibility(acked({ ackAt: ago(23 * HOUR_MS) }), NOW), null);
  assert.equal(jobFilesEligibility(acked({ active: true }), NOW), null);
  assert.equal(jobFilesEligibility(acked({ method: 'gemini' }), NOW), null);
  // ack=cancelled (תוצאה שהגיעה אחרי ביטול) — גם היא אישור מסירה
  assert.equal(
    jobFilesEligibility(acked({ status: 'cancelled', ack: { ...ack('cancelled'), ack: 'cancelled' } }), NOW),
    'acked'
  );
  // בלי ack: תוצאה נעולה (תקועה) — לעולם לא
  const noAck = { method: 'local', active: false, ack: null, ackAt: null };
  assert.equal(jobFilesEligibility({ ...noAck, status: 'cancelled', resultSha256: A, finishedAt: ago(40 * DAY_MS) }, NOW), null);
  assert.equal(jobFilesEligibility({ ...noAck, status: 'cancelled', finishedAt: ago(25 * HOUR_MS) }, NOW), 'closed_unacked');
  assert.equal(jobFilesEligibility({ ...noAck, status: 'cancelled', finishedAt: ago(23 * HOUR_MS) }, NOW), null);
  assert.equal(jobFilesEligibility({ ...noAck, status: 'failed', updatedAt: ago(25 * HOUR_MS) }, NOW), 'closed_unacked');
  assert.equal(jobFilesEligibility({ ...noAck, status: 'completed', finishedAt: ago(40 * DAY_MS) }, NOW), null);
  assert.equal(jobFilesEligibility({ ...noAck, active: true, status: 'delivery_pending', updatedAt: ago(40 * DAY_MS) }, NOW), null);
  assert.equal(jobFilesEligibility({ ...noAck, status: 'failed' }, NOW), null, 'בלי שום זמן — לא');
});

test('fileDecision: קלט ותוצאה מאושרת נמחקים; תוצאה מתנגשת עד שנבדקה; דחייה — 30 יום; לא רשום — לעולם לא', () => {
  const job = acked({
    resultConflicts: [{ sha256: B, receivedAt: ago(40 * DAY_MS) }],
    resultRejections: [
      { sha256: C, receivedAt: ago(10 * DAY_MS) },
      { sha256: 'd'.repeat(64), receivedAt: ago(31 * DAY_MS) },
    ],
  });
  const d = (name) => fileDecision({ name }, job, NOW);
  assert.equal(d(`input-${C}.pdf`).action, 'delete');
  assert.deepEqual(d(`result-${A}.json`), { action: 'delete', kind: 'result', reason: 'acknowledged_result' });
  assert.equal(d(`rejected-${B}.json`).reason, 'unreviewed_conflict');
  assert.equal(d(`rejected-${B}.json`).action, 'keep');
  assert.equal(
    fileDecision({ name: `rejected-${B}.json` }, { ...job, resultConflicts: [{ sha256: B, reviewedAt: NOW }] }, NOW).action,
    'delete'
  );
  assert.equal(d(`rejected-${C}.json`).reason, 'recent_rejection');
  assert.equal(d(`rejected-${'d'.repeat(64)}.json`).action, 'delete');
  // לא רשום (קריסה לפני הרישום) — לא מסיקים שאינו דורש בדיקה, גם אם הקובץ ישן מאוד (סקירה W01)
  assert.deepEqual(d(`rejected-${'e'.repeat(64)}.json`), { action: 'keep', kind: 'rejected', reason: 'unlisted_rejected' });
  assert.equal(fileDecision({ name: `rejected-${'e'.repeat(64)}.json`, mtimeMs: 0 }, job, NOW).action, 'keep');
  assert.deepEqual(d(`result-${'f'.repeat(64)}.json`), { action: 'keep', kind: 'result', reason: 'stray_result' });
  // result-<sha> רשום (קריסה בין הרישום להעברה ל-rejected) — לפי הרשומה
  assert.equal(d(`result-${B}.json`).reason, 'unreviewed_conflict');
  assert.equal(d(`result-${'d'.repeat(64)}.json`).reason, 'old_rejection');
  assert.equal(
    fileDecision({ name: `result-${B}.json` }, { ...job, resultConflicts: [{ sha256: B, reviewedAt: NOW }] }, NOW).reason,
    'reviewed_conflict'
  );
  assert.equal(d('notes.txt').action, 'keep');
});

test('fileDecision: קובץ בשם ה-hash הנעול בלי ack — לא נמחק לעולם (גם rejected-…)', () => {
  const job = { method: 'local', active: false, status: 'cancelled', resultSha256: A, ack: null };
  const old = ago(400 * DAY_MS).getTime();
  assert.equal(fileDecision({ name: `result-${A}.json`, mtimeMs: old }, job, NOW).action, 'keep');
  assert.equal(fileDecision({ name: `rejected-${A}.json`, mtimeMs: old }, job, NOW).action, 'keep');
});

test('cleanupCandidateFilter: local, סגורה, חיתוך 24 שעות', () => {
  const f = cleanupCandidateFilter(NOW);
  assert.equal(f.method, 'local');
  assert.equal(f.active, false);
  const [eligible] = f.$and;
  assert.equal(eligible.$or[0].ackAt.$lte.getTime(), NOW.getTime() - DAY_MS);
  assert.deepEqual(eligible.$or[1].status, { $in: ['failed', 'cancelled'] });
  assert.equal(eligible.$or[1].resultSha256, null);
});
