import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentRecord, ocrPageDataState, serializeOcrPageData } from './ocrPageDataView.js';

const SHA = 'a'.repeat(64);
const IMG = 'b'.repeat(64);
const TXT = 'c'.repeat(64);
const record = (over = {}) => ({
  job: 'j1', page: 'p1', resultSha256: SHA, pipelineVersion: 'v1', imageSha256: IMG, textSha256: TXT,
  receivedAt: new Date('2026-10-21T09:00:00Z'), layoutStatus: 'ok', layoutVersion: 1,
  layoutJson: JSON.stringify({ layoutVersion: 1, image: { width: 10, height: 20, imageSha256: IMG } }),
  metadataJson: JSON.stringify({ lines: 2 }),
  warnings: [{ code: 'layout_alts_trimmed', message: 'm', source: 'worker' }, { code: 'zzz_new', message: '', source: 'worker' }],
  ...over,
});
const PAGE = { _id: 'p1', pageNumber: 7, isTwoColumns: false, lastOcrJobId: 'j1', lastOcrResultSha256: SHA };

test('state: current לפי job+sha של העמוד; אחרת לפי ההתנגשות; אחרת history', () => {
  assert.equal(isCurrentRecord(record(), PAGE), true);
  assert.equal(ocrPageDataState(record(), PAGE, null), 'current');
  const other = { ...PAGE, lastOcrResultSha256: 'd'.repeat(64) };
  assert.equal(isCurrentRecord(record(), other), false);
  assert.equal(ocrPageDataState(record(), other, { status: 'open', reason: 'page_changed' }), 'pending_conflict');
  assert.equal(ocrPageDataState(record(), other, { status: 'applying' }), 'pending_conflict');
  assert.equal(ocrPageDataState(record(), other, { status: 'open', reason: 'job_cancelled' }), 'pending_cancelled');
  assert.equal(ocrPageDataState(record(), other, { status: 'dismissed', reason: 'job_cancelled' }), 'history');
  assert.equal(ocrPageDataState(record(), other, null), 'history');
  assert.equal(ocrPageDataState(record(), { ...PAGE, lastOcrJobId: null }, null), 'history');
});

test('serializeOcrPageData: התמונה, התוכן, layout/metadata ואזהרות עם תווית', () => {
  const d = serializeOcrPageData({
    page: PAGE, record: record(), state: 'current', contentSha256: TXT,
    image: { sha256: IMG, width: 10, height: 20, orientation: 1 },
  });
  assert.deepEqual(d, {
    pageId: 'p1', pageNumber: 7, state: 'current', jobId: 'j1', resultSha256: SHA, pipelineVersion: 'v1',
    receivedAt: '2026-10-21T09:00:00.000Z', contentMatchesOcr: true,
    image: { expectedSha256: IMG, matches: true, width: 10, height: 20, exifOrientation: 1, sizeMatches: true },
    layoutStatus: 'ok', layoutVersion: 1, layout: { layoutVersion: 1, image: { width: 10, height: 20, imageSha256: IMG } },
    metadata: { lines: 2 },
    warnings: [
      { code: 'layout_alts_trimmed', message: 'm', source: 'worker', labelHe: 'הצעות החלופות של העמוד הושמטו כדי לעמוד במגבלת הגודל' },
      { code: 'zzz_new', message: '', source: 'worker', labelHe: 'אזהרה שאינה מוכרת לאתר (zzz_new)' },
    ],
  });
  // תמונה אחרת / לא נקראה; עמוד בשני טורים; layout שנפסל — לא מוחזר
  const other = serializeOcrPageData({
    page: { ...PAGE, isTwoColumns: true }, record: record({ layoutStatus: 'invalid', layoutJson: null }), state: 'history',
    contentSha256: TXT, image: { sha256: 'e'.repeat(64), width: 11, height: 20, orientation: 6 },
  });
  assert.equal(other.contentMatchesOcr, false);
  assert.deepEqual(other.image, { expectedSha256: IMG, matches: false, width: 11, height: 20, exifOrientation: 6, sizeMatches: null });
  assert.equal(other.layout, null);
  const unread = serializeOcrPageData({ page: PAGE, record: record({ textSha256: null }), state: 'current', contentSha256: TXT, image: null });
  assert.deepEqual(unread.image, { expectedSha256: IMG, matches: null, width: null, height: null, exifOrientation: null, sizeMatches: null });
  assert.equal(unread.contentMatchesOcr, false);
  assert.equal(serializeOcrPageData({ page: PAGE, record: record({ metadataJson: '{' }), state: 'current', contentSha256: null, image: null }).metadata, null);
});
