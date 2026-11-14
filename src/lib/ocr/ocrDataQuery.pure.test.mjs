import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBookPathParam, INVALID_BOOK_PATH_HE } from './ocrDataQuery.pure.js';

test('decodeBookPathParam: פענוח נוסף כמו ב-page-content', () => {
  assert.equal(decodeBookPathParam('ספר-א'), 'ספר-א');
  assert.equal(decodeBookPathParam(encodeURIComponent('ספר א')), 'ספר א');
  assert.equal(decodeBookPathParam('a%2Fb'), 'a/b');
  assert.equal(decodeBookPathParam(''), '');
});

test('decodeBookPathParam: רצף % פגום → null (לא זורק)', () => {
  for (const bad of ['%', '100%', '%E0%A4', '%zz', 'abc%D7', '%D7%9']) {
    assert.equal(decodeBookPathParam(bad), null, bad);
  }
  assert.equal(decodeBookPathParam(null), null);
  assert.equal(decodeBookPathParam(undefined), null);
  assert.equal(INVALID_BOOK_PATH_HE, 'נתיב ספר לא תקין');
});
