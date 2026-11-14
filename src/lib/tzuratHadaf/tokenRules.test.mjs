import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsTokenPath,
  proxyLetsBearerThrough,
  bearerOf,
  isTokenFormat,
  parseCreateInput,
  tokenState,
  missingScope,
  publicToken,
  TOKEN_API_BASE,
} from './tokenRules.js';
import { generateToken, hashToken } from './tokenSecret.js';

test('המפתח: קידומת tht_ ופורמט', () => {
  const t = generateToken();
  assert.ok(t.startsWith('tht_'));
  assert.ok(isTokenFormat(t));
  assert.equal(isTokenFormat(`ppt_${t.slice(4)}`), false);
  assert.equal(hashToken(t).length, 64);
});

test('נתיבים: כל הניהול של צורת הדף חוץ מ-tokens', () => {
  assert.equal(TOKEN_API_BASE, '/api/admin/tzurat-hadaf');
  assert.ok(acceptsTokenPath('/api/admin/tzurat-hadaf/export'));
  assert.ok(acceptsTokenPath('/api/admin/tzurat-hadaf/uploads/abc/chunks/0'));
  assert.equal(acceptsTokenPath('/api/admin/tzurat-hadaf/tokens'), false);
  assert.equal(acceptsTokenPath('/api/admin/tzurat-hadaf/tokens/x'), false);
  assert.equal(acceptsTokenPath('/api/admin/tzurat-hadafX'), false);
  assert.equal(acceptsTokenPath('/api/tzurat-hadaf/fast'), false);
});

test('proxyLetsBearerThrough: רק Bearer tht_ לנתיב שמקבל מפתח', () => {
  const t = generateToken();
  assert.ok(proxyLetsBearerThrough('/api/admin/tzurat-hadaf/stats', `Bearer ${t}`));
  assert.equal(proxyLetsBearerThrough('/api/admin/tzurat-hadaf/stats', 'Bearer ppt_abc'), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/page-proof', `Bearer ${t}`), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/tzurat-hadaf/tokens', `Bearer ${t}`), false);
  assert.equal(bearerOf('Basic x'), null);
  assert.equal(bearerOf('Bearer'), '');
});

test('יצירה, מצב והרשאות', () => {
  const now = new Date('2026-10-25T00:00:00Z');
  assert.ok(parseCreateInput({}, now).error);
  const c = parseCreateInput({ name: 'שרת הבנייה', days: 30, scopes: ['import', 'read'] }, now);
  assert.deepEqual(c.scopes, ['read', 'import']);
  assert.equal(c.expiresAt.toISOString(), '2026-11-24T00:00:00.000Z');
  assert.ok(parseCreateInput({ name: 'x', scopes: ['admin'] }, now).error);
  assert.equal(tokenState({ expiresAt: new Date('2026-12-01') }, now), 'active');
  assert.equal(tokenState({ expiresAt: new Date('2026-10-01') }, now), 'expired');
  assert.equal(tokenState({ revokedAt: now, expiresAt: new Date('2026-12-01') }, now), 'revoked');
  assert.equal(missingScope(['read'], 'import'), 'import');
  assert.equal(missingScope(['read', 'import'], ['read', 'import']), null);
  const p = publicToken({ _id: 'x', name: 'n', prefix: 'tht_abcd', scopes: ['read'], hash: 'secret', expiresAt: new Date('2026-12-01') }, now);
  assert.equal('hash' in p, false);
});
