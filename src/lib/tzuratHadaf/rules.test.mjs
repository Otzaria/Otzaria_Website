// כללים טהורים קטנים: ההעלאה, הדיווחים, ועזרים משותפים
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCreate, chunkIndex, expectedChunkSize, missingChunks, canRetry, CHUNK_SIZE, MAX_UPLOAD } from './uploadRules.js';
import { normalizeReport, normalizeRegions, normalizeChecks } from './reportRules.js';
import { requiredFor, fnv1a, fracBox, cleanText, kindLabel } from './common.js';

test('validateCreate: שם zip, גודל, מספר חלקים', () => {
  const v = validateCreate({ name: 'berakhot.zip', size: CHUNK_SIZE * 2 + 5 });
  assert.equal(v.chunks, 3);
  assert.equal(v.chunkSize, CHUNK_SIZE);
  assert.ok(validateCreate({ name: 'x.tar', size: 10 }).error);
  assert.ok(validateCreate({ name: '../x.zip', size: 10 }).error);
  assert.ok(validateCreate({ name: 'x.zip', size: MAX_UPLOAD + 1 }).error);
  assert.ok(validateCreate({ name: 'x.zip', size: 0 }).error);
  assert.ok(!validateCreate({ name: 'ברכות v32.zip', size: 1 }).error);
});

test('חלקים: אינדקס, גודל צפוי, חסרים', () => {
  assert.equal(chunkIndex('2', 3), 2);
  assert.equal(chunkIndex('3', 3), null);
  assert.equal(chunkIndex('-1', 3), null);
  assert.equal(chunkIndex('1e3', 3), null);
  assert.equal(expectedChunkSize(0, 25, 10, 3), 10);
  assert.equal(expectedChunkSize(2, 25, 10, 3), 5);
  assert.deepEqual(missingChunks([0, 2], 4), [1, 3]);
});

test('canRetry: נכשל/הסתיים, או תקוע בלי דופק', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  assert.ok(canRetry({ status: 'failed' }, now));
  assert.ok(canRetry({ status: 'done' }, now));
  assert.equal(canRetry({ status: 'uploading' }, now), false);
  assert.equal(canRetry({ status: 'processing', heartbeatAt: new Date('2026-10-25T11:59:30Z') }, now), false);
  assert.ok(canRetry({ status: 'processing', heartbeatAt: new Date('2026-10-25T11:50:00Z') }, now));
});

test('דיווח: קטגוריה, אזורים, טקסט', () => {
  assert.ok(normalizeReport({ category: 'bogus', text: 'x' }).error);
  assert.ok(normalizeReport({ category: 'other' }).error);
  const r = normalizeReport({ category: 'missing', text: '  חסר  ', regions: [{ side: 'scan', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] });
  assert.equal(r.report.text, 'חסר');
  assert.ok(normalizeRegions([{ side: 'x', x: 0, y: 0, w: 0.1, h: 0.1 }]).error);
  assert.ok(normalizeRegions([{ side: 'ours', x: 0.95, y: 0, w: 0.1, h: 0.1 }]).error);
});

test('checks: רק המפתחות המוכרים, ok/issue', () => {
  assert.deepEqual(normalizeChecks({ blocks: 'ok', size: 'issue', junk: 'ok', edges: '' }).checks, { blocks: 'ok', size: 'issue' });
  assert.ok(normalizeChecks({ blocks: 'maybe' }).error);
});

test('requiredFor: דטרמיניסטי, כ-10% כפולים', () => {
  assert.equal(requiredFor('berakhot', '002a'), requiredFor('berakhot', '002a'));
  let doubles = 0;
  for (let d = 2; d < 1000; d++) for (const s of ['a', 'b']) doubles += requiredFor('shabbat', `${String(d).padStart(3, '0')}${s}`) === 2 ? 1 : 0;
  const ratio = doubles / (998 * 2);
  assert.ok(ratio > 0.06 && ratio < 0.14, String(ratio));
  assert.equal(typeof fnv1a('x'), 'number');
});

test('עזרים', () => {
  assert.equal(fracBox({ x: 0.5, y: 0.5, w: 0.6, h: 0.1 }), null);
  assert.deepEqual(fracBox({ x: 0, y: 0, w: 1, h: 1 }), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(cleanText('a\nb\t c'), 'a b c');
  assert.equal(kindLabel('t'), 'תוספות');
  assert.equal(kindLabel('zz'), 'שוליים');
});
