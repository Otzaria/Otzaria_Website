import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readWorkerConfig, parseBearer, secretsEqual, authenticateWorker, isStrongSecret } from './workerAuth.js';

const HEX = randomBytes(32).toString('hex');
const B64 = randomBytes(32).toString('base64');
const env = (secret, id = 'worker-1') => ({ OCR_WORKER_SECRET: secret, OCR_WORKER_ID: id });
const req = (authorization) => ({ headers: new Headers(authorization ? { authorization } : {}) });
const flip = (s) => (s[0] === 'a' ? 'b' : 'a') + s.slice(1);

test('סוד קצר נדחה', () => {
  assert.equal(readWorkerConfig(env('short')).ok, false);
  assert.equal(readWorkerConfig(env(randomBytes(16).toString('hex'))).ok, false);
  assert.equal(readWorkerConfig(env(randomBytes(24).toString('base64'))).ok, false);
});

test('hex של 64 תווים ו-base64 של 32 בתים (44 תווים) מתקבלים', () => {
  assert.equal(HEX.length, 64);
  assert.equal(B64.length, 44);
  assert.equal(readWorkerConfig(env(HEX)).ok, true);
  assert.equal(readWorkerConfig(env(B64)).ok, true);
  assert.equal(isStrongSecret('x'.repeat(43)), true);
  assert.equal(isStrongSecret('x'.repeat(42)), false);
});

test('תו לא-ASCII או רווח נדחה', () => {
  assert.equal(isStrongSecret('א'.repeat(50)), false);
  assert.equal(isStrongSecret('a'.repeat(30) + ' ' + 'b'.repeat(30)), false);
});

test('workerId לא תקין נדחה', () => {
  assert.equal(readWorkerConfig(env(HEX, 'bad id')).ok, false);
  assert.equal(readWorkerConfig(env(HEX, 'a'.repeat(65))).ok, false);
});

test('parseBearer: רק Bearer ברישיות נכונה ורווח יחיד', () => {
  assert.equal(parseBearer('Bearer abc'), 'abc');
  for (const h of ['bearer abc', 'BEARER abc', 'Bearerabc', 'Bearer  abc', 'Bearer abc def', 'Bearer ', 'Basic abc', null, undefined]) {
    assert.equal(parseBearer(h), null, String(h));
  }
});

test('secretsEqual', () => {
  assert.equal(secretsEqual(HEX, HEX), true);
  assert.equal(secretsEqual(HEX, flip(HEX)), false);
  assert.equal(secretsEqual(HEX, HEX + 'x'), false);
});

test('authenticateWorker: תצורה חסרה/חלשה 403, Bearer חסר/שגוי 401, נכון ok', () => {
  const disabled = { ok: false, status: 403, code: 'worker_api_disabled' };
  assert.deepEqual(authenticateWorker(req(`Bearer ${HEX}`), {}), disabled);
  assert.deepEqual(authenticateWorker(req(`Bearer ${HEX}`), env('short')), disabled);
  const bad = { ok: false, status: 401, code: 'unauthorized' };
  assert.deepEqual(authenticateWorker(req(), env(HEX)), bad);
  assert.deepEqual(authenticateWorker(req(`Bearer ${flip(HEX)}`), env(HEX)), bad);
  assert.deepEqual(authenticateWorker(req(`Bearer ${HEX}x`), env(HEX)), bad);
  assert.deepEqual(authenticateWorker(req(`bearer ${HEX}`), env(HEX)), bad);
  assert.deepEqual(authenticateWorker(req(`Bearer ${HEX}`), env(HEX, 'w.1')), { ok: true, workerId: 'w.1' });
});

test('רווחים/BOM סביב הסוד וה-workerId ב-env מקוצצים — כמו SecretProvider בשירות', () => {
  const cfg = readWorkerConfig({ OCR_WORKER_SECRET: `﻿ ${HEX}\r\n`, OCR_WORKER_ID: ' w1\n' });
  assert.deepEqual(cfg, { ok: true, secret: HEX, workerId: 'w1' });
  assert.deepEqual(authenticateWorker(req(`Bearer ${HEX}`), { OCR_WORKER_SECRET: ` ${HEX} `, OCR_WORKER_ID: 'w1' }), { ok: true, workerId: 'w1' });
  assert.equal(readWorkerConfig({ OCR_WORKER_SECRET: '   ', OCR_WORKER_ID: 'w1' }).reason, 'missing');
});
