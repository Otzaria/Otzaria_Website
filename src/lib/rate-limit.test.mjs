import assert from 'node:assert/strict';
import { test } from 'node:test';

// שני מופעים נפרדים של המודול — כמו ה-bundle של דף וה-bundle של route handler
// ב-Next, שכל אחד מהם טוען עותק משלו של src/lib/rate-limit.js.
const instanceA = await import('./rate-limit.js?instance=a');
const instanceB = await import('./rate-limit.js?instance=b');

test('checkSharedRateLimit: bucket אחד לשני מופעים של המודול', () => {
  const ip = 'test-shared-ip';
  assert.equal(instanceA.checkSharedRateLimit(ip, 'test-shared', 2, 'minute'), true);
  assert.equal(instanceB.checkSharedRateLimit(ip, 'test-shared', 2, 'minute'), true);
  // שני האסימונים נוצלו — אחד מכל מופע
  assert.equal(instanceA.checkSharedRateLimit(ip, 'test-shared', 2, 'minute'), false);
  assert.equal(instanceB.checkSharedRateLimit(ip, 'test-shared', 2, 'minute'), false);
});

test('checkRateLimit: נשאר נפרד לכל מופע של המודול (ההתנהגות הקיימת)', () => {
  const ip = 'test-local-ip';
  assert.equal(instanceA.checkRateLimit(ip, 'test-local', 1, 'minute'), true);
  assert.equal(instanceA.checkRateLimit(ip, 'test-local', 1, 'minute'), false);
  assert.equal(instanceB.checkRateLimit(ip, 'test-local', 1, 'minute'), true);
});

test('checkSharedRateLimit ו-checkRateLimit לא חולקים bucket', () => {
  const ip = 'test-mixed-ip';
  assert.equal(instanceA.checkRateLimit(ip, 'test-mixed', 1, 'minute'), true);
  assert.equal(instanceA.checkSharedRateLimit(ip, 'test-mixed', 1, 'minute'), true);
});

test('קלט לא תקין נדחה בשתי הפונקציות', () => {
  assert.equal(instanceA.checkRateLimit(undefined, 'x'), false);
  assert.equal(instanceA.checkSharedRateLimit('ip', 42), false);
});
