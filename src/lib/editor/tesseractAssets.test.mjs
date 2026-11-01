import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEB_LANG, TESSERACT_PUBLIC_DIR, tesseractAssetUrls } from './tesseractAssets.js';

test('נתיבים מגורסים תחת public/vendor/tesseract, מפתח מטמון נפרד מ-/tessdata', () => {
  assert.deepEqual(tesseractAssetUrls('7.0.0', 'https://x.org'), {
    workerPath: 'https://x.org/vendor/tesseract/v7.0.0/worker.min.js',
    corePath: 'https://x.org/vendor/tesseract/v7.0.0/core',
    langPath: 'https://x.org/vendor/tesseract/lang/heb-4.0.0_best_int',
    cachePath: 'otzaria-heb-4.0.0_best_int',
  });
  assert.equal(tesseractAssetUrls('7.1.0').workerPath, '/vendor/tesseract/v7.1.0/worker.min.js');
  assert.equal(TESSERACT_PUBLIC_DIR, 'vendor/tesseract');
  assert.match(HEB_LANG.sha256, /^[0-9a-f]{64}$/);
  assert.match(HEB_LANG.url, /@tesseract\.js-data\/heb@\d+\.\d+\.\d+\//); // גרסה נעולה
});
