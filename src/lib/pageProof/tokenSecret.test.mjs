/**
 * מפתח-גישה — יצירה וגיבוב (tokenSecret.js).
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateToken, hashToken, TOKEN_BYTES } from './tokenSecret.js';
import { isTokenFormat } from './tokenRules.js';

test('generateToken: ppt_ + base64url של 32 בתים; כל פעם אחר', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = generateToken();
    assert.ok(isTokenFormat(t), t);
    assert.equal(Buffer.from(t.slice(4), 'base64url').length, TOKEN_BYTES);
    seen.add(t);
  }
  assert.equal(seen.size, 200);
});

test('hashToken: SHA-256 בהקס (64 תווים), דטרמיניסטי, ושונה מהמפתח', () => {
  const t = generateToken();
  const h = hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashToken(t));
  assert.equal(h, createHash('sha256').update(t, 'utf8').digest('hex'));
  assert.notEqual(h, hashToken(generateToken()));
  // וקטור ידוע
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
