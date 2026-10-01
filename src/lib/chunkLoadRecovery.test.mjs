import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldReloadAfterChunkError, CHUNK_RELOAD_WINDOW_MS, reloadOnChunkError } from './chunkLoadRecovery.js';

test('shouldReloadAfterChunkError: בלי רענון קודם — מרעננים', () => {
  assert.equal(shouldReloadAfterChunkError(null, 1_000_000), true);
  assert.equal(shouldReloadAfterChunkError(Number.NaN, 1_000_000), true);
});

test('shouldReloadAfterChunkError: רענון קודם בתוך החלון — לא מרעננים שוב (מניעת לופ)', () => {
  const now = 1_000_000;
  assert.equal(shouldReloadAfterChunkError(now - 1, now), false);
  assert.equal(shouldReloadAfterChunkError(now - CHUNK_RELOAD_WINDOW_MS + 1, now), false);
});

test('shouldReloadAfterChunkError: רענון קודם מחוץ לחלון — מרעננים', () => {
  const now = 1_000_000;
  assert.equal(shouldReloadAfterChunkError(now - CHUNK_RELOAD_WINDOW_MS, now), true);
  assert.equal(shouldReloadAfterChunkError(now - 60_000, now), true);
});

test('shouldReloadAfterChunkError: חותמת זמן מהעתיד (שעון שזז) — מרעננים', () => {
  assert.equal(shouldReloadAfterChunkError(2_000_000, 1_000_000), true);
});

test('reloadOnChunkError: בשרת (בלי window) זורק את השגיאה המקורית', () => {
  const error = new Error('ChunkLoadError');
  assert.throws(() => reloadOnChunkError(error), error);
});
