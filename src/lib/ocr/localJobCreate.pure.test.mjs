import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLocalRequest,
  requestFingerprint,
  httpStatusForPrepError,
  replayExistingJob,
  duplicateKeyTarget,
  isAbandonedPreparation,
  prepLeaseExpired,
  noPagesMessage,
  DEFAULT_LOCAL_OPTIONS,
  PREP_ABANDONED_AFTER_MS,
} from './localJobCreate.pure.js';

const RID = '3f2b8c1e-9d4a-4b6f-8e2a-1c5d7f9a0b3e';

test('normalizeLocalRequest: requestId — חובה, תבנית ואורך', () => {
  assert.equal(normalizeLocalRequest({ existingTextMode: 'skip' }).code, 'missing_request_id');
  assert.equal(normalizeLocalRequest(null).code, 'missing_request_id');
  for (const bad of ['short', 'x'.repeat(65), 'has space1', 'a/b/c/d/e', 12345678, '../../../x']) {
    const r = normalizeLocalRequest({ requestId: bad, existingTextMode: 'skip' });
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.code, 'invalid_request_id');
    assert.match(r.error, /[א-ת]/);
  }
  assert.equal(normalizeLocalRequest({ requestId: 'abcdefgh', existingTextMode: 'skip' }).ok, true);
  assert.equal(normalizeLocalRequest({ requestId: RID, existingTextMode: 'overwrite' }).ok, true);
});

test('normalizeLocalRequest: ברירות מחדל ל-options ו-whitelist', () => {
  const r = normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip' });
  assert.deepEqual(r.value, { requestId: RID, existingTextMode: 'skip', options: { ...DEFAULT_LOCAL_OPTIONS } });
  assert.deepEqual(DEFAULT_LOCAL_OPTIONS, { lm: 'rabbinic', defaultScript: 'square' });

  const custom = normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', options: { lm: 'off', defaultScript: 'rashi' } });
  assert.deepEqual(custom.value.options, { lm: 'off', defaultScript: 'rashi' });
  // null בשדה = ברירת מחדל
  assert.deepEqual(normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', options: { lm: null } }).value.options, DEFAULT_LOCAL_OPTIONS);

  for (const options of [{ lm: 'gpt' }, { defaultScript: 'ashkenazi' }, { unknown: 1 }, { lm: 'off', cmd: 'rm -rf' }, 'x', ['lm']]) {
    const bad = normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', options });
    assert.equal(bad.ok, false, JSON.stringify(options));
    assert.equal(bad.code, 'invalid_options');
  }
});

test('normalizeLocalRequest: splitColumns נדחה, mode חובה', () => {
  const split = normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', splitColumns: true });
  assert.equal(split.code, 'split_columns_unsupported');
  assert.equal(normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', splitColumns: false }).ok, true);
  assert.equal(normalizeLocalRequest({ requestId: RID, existingTextMode: 'skip', splitColumns: 'yes' }).code, 'invalid_split_columns');
  assert.equal(normalizeLocalRequest({ requestId: RID, existingTextMode: 'all' }).code, 'invalid_mode');
});

test('requestFingerprint: קנוני ויציב, רגיש לכל פרמטר', () => {
  const base = { bookId: '507f1f77bcf86cd799439011', existingTextMode: 'skip', options: { lm: 'rabbinic', defaultScript: 'square' } };
  const fp = requestFingerprint(base);
  assert.match(fp, /^[0-9a-f]{64}$/);
  // סדר המפתחות לא משנה; ObjectId ומחרוזת זהים
  assert.equal(requestFingerprint({ options: { defaultScript: 'square', lm: 'rabbinic' }, existingTextMode: 'skip', bookId: { toString: () => base.bookId } }), fp);
  assert.notEqual(requestFingerprint({ ...base, existingTextMode: 'overwrite' }), fp);
  assert.notEqual(requestFingerprint({ ...base, bookId: '507f1f77bcf86cd799439012' }), fp);
  assert.notEqual(requestFingerprint({ ...base, options: { lm: 'off', defaultScript: 'square' } }), fp);
  assert.notEqual(requestFingerprint({ ...base, options: { lm: 'rabbinic', defaultScript: 'rashi' } }), fp);
});

test('httpStatusForPrepError: קודי שגיאת קלט קבועה', () => {
  assert.equal(httpStatusForPrepError('no_pages'), 400);
  assert.equal(httpStatusForPrepError('too_many_pages'), 413);
  assert.equal(httpStatusForPrepError('input_too_large'), 413);
  assert.equal(httpStatusForPrepError('missing_image'), 422);
  assert.equal(httpStatusForPrepError('unsupported_image'), 422);
  assert.equal(httpStatusForPrepError('prep_abandoned'), 409);
  assert.match(noPagesMessage('skip'), /לא-ערוכים/);
  assert.match(noPagesMessage('overwrite'), /עם תמונה/);
});

test('replayExistingJob: 202 רק לעבודה שהקלט שלה הוכן', () => {
  const at = new Date();
  assert.deepEqual(replayExistingJob({ _id: 'j1', status: 'queued', preparedAt: at, totalPages: 7 }), {
    status: 202,
    body: { success: true, jobId: 'j1', status: 'queued', totalPages: 7 },
  });
  // עבודה שהוכנה ואחר כך בוטלה/הסתיימה — עדיין אותה עבודה (202 עם הסטטוס הנוכחי)
  assert.equal(replayExistingJob({ _id: 'j1', status: 'cancelled', preparedAt: at }).status, 202);
  assert.equal(replayExistingJob({ _id: 'j1', status: 'completed', preparedAt: at }).body.status, 'completed');

  // כשל קבוע בהכנה — אותה שגיאה שוב, בלי 202
  const failed = replayExistingJob({ _id: 'j2', status: 'failed', error: 'חסרות תמונות', errorCode: 'missing_image' });
  assert.equal(failed.status, 422);
  assert.deepEqual(failed.body, { error: 'חסרות תמונות', code: 'missing_image', jobId: 'j2' });
  assert.equal(replayExistingJob({ _id: 'j3', status: 'failed', errorCode: 'too_many_pages', error: 'x' }).status, 413);
  assert.equal(replayExistingJob({ _id: 'j4', status: 'failed', errorCode: 'prep_abandoned', error: 'x' }).status, 409);
  const cancelled = replayExistingJob({ _id: 'j5', status: 'cancelled' });
  assert.equal(cancelled.status, 409);
  assert.equal(cancelled.body.code, 'cancelled');
  const noCode = replayExistingJob({ _id: 'j6', status: 'failed' });
  assert.equal(noCode.status, 422);
  assert.match(noCode.body.error, /[א-ת]/);
});

test('duplicateKeyTarget: הבחנה לפי keyPattern (ובגיבוי לפי שם האינדקס)', () => {
  assert.equal(duplicateKeyTarget({ code: 11000, keyPattern: { requestId: 1 } }), 'requestId');
  assert.equal(duplicateKeyTarget({ code: 11000, keyPattern: { book: 1 } }), 'book');
  assert.equal(duplicateKeyTarget({ code: 11000, message: 'E11000 dup key: index: book_active_unique' }), 'book');
  assert.equal(duplicateKeyTarget({ code: 11000, message: 'index: requestId_unique dup key' }), 'requestId');
  assert.equal(duplicateKeyTarget({ code: 11000, keyPattern: { other: 1 } }), null);
  assert.equal(duplicateKeyTarget({ code: 121 }), null);
  assert.equal(duplicateKeyTarget(null), null);
});

test('lease: פקיעה ונטישה (15 דקות אחרי פקיעה)', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const ago = (ms) => new Date(now.getTime() - ms);
  assert.equal(prepLeaseExpired({ prepLeaseUntil: new Date(now.getTime() + 1) }, now), false);
  assert.equal(prepLeaseExpired({ prepLeaseUntil: now }, now), true);
  assert.equal(prepLeaseExpired({ prepLeaseUntil: null }, now), true);

  const job = (until) => ({ method: 'local', status: 'preparing', prepLeaseUntil: until });
  assert.equal(isAbandonedPreparation(job(ago(PREP_ABANDONED_AFTER_MS - 1000)), now), false);
  assert.equal(isAbandonedPreparation(job(ago(PREP_ABANDONED_AFTER_MS + 1000)), now), true);
  assert.equal(isAbandonedPreparation({ ...job(ago(PREP_ABANDONED_AFTER_MS * 2)), status: 'queued' }, now), false);
  assert.equal(isAbandonedPreparation({ ...job(ago(PREP_ABANDONED_AFTER_MS * 2)), method: 'ocrwin' }, now), false);
});
