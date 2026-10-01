/**
 * מפתחות-גישה לתוכנת-הספר — הכללים הטהורים (tokenRules.js): הכותרת והנתיב (גם מה ה-proxy
 * מעביר), קלט-היצירה, מצב המפתח, הרשאות, עדכון "שימוש אחרון", והצורה שנשלחת לדפדפן.
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCOPES,
  SCOPE_LABELS,
  SCOPE_SHORT,
  TOKEN_PREFIX,
  TOKEN_RE,
  MAX_DAYS,
  DEFAULT_DAYS,
  MAX_NAME,
  TOUCH_MS,
  acceptsTokenPath,
  bearerOf,
  proxyLetsBearerThrough,
  isTokenFormat,
  tokenPrefixOf,
  normalizeScopes,
  validDays,
  parseCreateInput,
  tokenState,
  activeFilter,
  missingScope,
  shouldTouch,
  publicToken,
} from './tokenRules.js';

const GOOD = `ppt_${'A'.repeat(20)}-_${'z'.repeat(21)}`;
const DAY = 24 * 60 * 60 * 1000;

test('צורת המפתח: ppt_ + 43 תווי base64url בדיוק', () => {
  assert.equal(TOKEN_PREFIX, 'ppt_');
  assert.ok(isTokenFormat(GOOD));
  assert.ok(TOKEN_RE.test(GOOD));
  for (const bad of ['', 'ppt_', `${GOOD}x`, GOOD.slice(0, -1), `PPT_${GOOD.slice(4)}`, `ppt_${'a'.repeat(42)}=`, `ppt_${'a'.repeat(42)}.`, null, undefined, 42]) {
    assert.equal(isTokenFormat(bad), false, String(bad));
  }
  assert.equal(tokenPrefixOf(GOOD), 'ppt_AAAA');
});

test('bearerOf: המפתח / מחרוזת ריקה (Bearer פגום) / null (אין Bearer — ה-session קובע)', () => {
  assert.equal(bearerOf(`Bearer ${GOOD}`), GOOD);
  assert.equal(bearerOf(`bearer   ${GOOD}  `), GOOD);
  assert.equal(bearerOf('Bearer'), '');
  assert.equal(bearerOf('Bearer '), '');
  assert.equal(bearerOf('Bearer a b'), '');
  assert.equal(bearerOf(null), null);
  assert.equal(bearerOf(undefined), null);
  assert.equal(bearerOf(''), null);
  assert.equal(bearerOf('Basic dXNlcjpwYXNz'), null);
  assert.equal(bearerOf('Bearerx abc'), null);
});

test('acceptsTokenPath: נתיבי הניהול של הגהת-העמודים — חוץ מניהול המפתחות, ושום נתיב אחר', () => {
  for (const p of [
    '/api/admin/page-proof',
    '/api/admin/page-proof/submissions',
    '/api/admin/page-proof/submissions/64b7f0c2a1b2c3d4e5f60001',
    '/api/admin/page-proof/books/abcdefgh12/fixes',
    '/api/admin/page-proof/books/abcdefgh12/pages',
    // PATCH (השהיה) מקבל מפתח; DELETE באותו נתיב — לא: הראוט מחליט לכל שיטה
    '/api/admin/page-proof/books/abcdefgh12',
    '/api/admin/page-proof/import',
  ]) {
    assert.ok(acceptsTokenPath(p), p);
  }
  for (const p of [
    '/api/admin/page-proof/tokens',
    '/api/admin/page-proof/tokens/64b7f0c2a1b2c3d4e5f60001',
    '/api/admin/page-proofx',
    '/api/admin/users',
    '/api/admin',
    '/api/page-proof/pages/1/submit',
    '/library/admin/page-proof',
    '',
    null,
  ]) {
    assert.equal(acceptsTokenPath(p), false, String(p));
  }
});

test('proxyLetsBearerThrough: רק Bearer ppt_… ורק לנתיב שמקבל מפתח', () => {
  assert.ok(proxyLetsBearerThrough('/api/admin/page-proof', `Bearer ${GOOD}`));
  // גם מפתח פגום שמתחיל ב-ppt_ עובר — הראוט דוחה אותו (401) וסופר את הניסיון
  assert.ok(proxyLetsBearerThrough('/api/admin/page-proof/import', 'Bearer ppt_short'));
  assert.equal(proxyLetsBearerThrough('/api/admin/page-proof/tokens', `Bearer ${GOOD}`), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/users', `Bearer ${GOOD}`), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/page-proof', 'Bearer eyJhbGciOi.jwt'), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/page-proof', null), false);
  assert.equal(proxyLetsBearerThrough('/api/admin/page-proof', 'Bearer '), false);
});

test('SCOPE_LABELS: לכל הרשאה תיאור שפותח בשם הקצר שלה — הטופס והרשימה באותן מילים', () => {
  for (const s of SCOPES) {
    assert.ok(SCOPE_SHORT[s], s);
    assert.ok(SCOPE_LABELS[s].startsWith(`${SCOPE_SHORT[s]} — `), s);
  }
  // "ייבוא" = פרסום להגהה: גם פתיחה/סגירה של עמודים למתנדבים והשהיית ספר
  assert.match(SCOPE_LABELS.import, /פתיחה וסגירה של עמודים למתנדבים/);
  assert.match(SCOPE_LABELS.import, /השהיית ספר/);
});

test('normalizeScopes: תת-קבוצה בסדר קבוע, בלי כפילויות; ריקה/לא-מוכרת/לא-מערך — שגיאה', () => {
  assert.deepEqual(normalizeScopes(['import', 'read', 'read']), { scopes: ['read', 'import'] });
  assert.deepEqual(normalizeScopes([...SCOPES]), { scopes: ['read', 'review', 'import'] });
  assert.ok(normalizeScopes([]).error);
  assert.ok(normalizeScopes(['read', 'admin']).error);
  assert.ok(normalizeScopes('read').error);
  assert.ok(normalizeScopes(null).error);
});

test('validDays: שלם בין 1 ל-365 (גם כמחרוזת)', () => {
  assert.equal(validDays(1), 1);
  assert.equal(validDays(MAX_DAYS), MAX_DAYS);
  assert.equal(validDays('30'), 30);
  for (const bad of [0, -1, MAX_DAYS + 1, 1.5, '1.5', '', ' ', 'abc', null, undefined, NaN]) assert.equal(validDays(bad), null, String(bad));
});

test('parseCreateInput: ברירות-מחדל (180 יום, כל ההרשאות), תפוגה מחושבת, שגיאות בעברית', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  const r = parseCreateInput({ name: '  תוכנת-הספר  ' }, now);
  assert.equal(r.name, 'תוכנת-הספר');
  assert.equal(r.days, DEFAULT_DAYS);
  assert.deepEqual(r.scopes, ['read', 'review', 'import']);
  assert.equal(r.expiresAt.getTime(), now.getTime() + DEFAULT_DAYS * DAY);

  const r2 = parseCreateInput({ name: 'בית', days: 7, scopes: ['read'] }, now);
  assert.deepEqual([r2.days, r2.scopes, r2.expiresAt.getTime()], [7, ['read'], now.getTime() + 7 * DAY]);
  // תווי-בקרה בשם ← רווח
  assert.equal(parseCreateInput({ name: 'א\nב\tג' }, now).name, 'א ב ג');

  for (const bad of [null, [], {}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(MAX_NAME + 1) }, { name: 'a', days: 0 }, { name: 'a', days: 400 }, { name: 'a', days: 2.5 }, { name: 'a', scopes: [] }, { name: 'a', scopes: ['all'] }]) {
    const out = parseCreateInput(bad, now);
    assert.ok(out.error && /[א-ת]/.test(out.error), JSON.stringify(bad));
  }
  assert.equal(parseCreateInput({ name: 'x'.repeat(MAX_NAME) }, now).name.length, MAX_NAME);
});

test('tokenState: בוטל קודם לפג; בלי תפוגה — פג', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  const later = new Date(now.getTime() + 1000);
  const earlier = new Date(now.getTime() - 1000);
  assert.equal(tokenState({ expiresAt: later }, now), 'active');
  assert.equal(tokenState({ expiresAt: now }, now), 'expired');
  assert.equal(tokenState({ expiresAt: earlier }, now), 'expired');
  assert.equal(tokenState({ expiresAt: later, revokedAt: earlier }, now), 'revoked');
  assert.equal(tokenState({ expiresAt: earlier, revokedAt: earlier }, now), 'revoked');
  assert.equal(tokenState({}, now), 'expired');
  assert.deepEqual(activeFilter('u1', now), { user: 'u1', revokedAt: null, expiresAt: { $gt: now } });
});

test('missingScope: כל ההרשאות הנדרשות', () => {
  assert.equal(missingScope(['read', 'review'], 'read'), null);
  assert.equal(missingScope(['read'], 'review'), 'review');
  assert.equal(missingScope(['read'], ['read', 'review']), 'review');
  assert.equal(missingScope(['read', 'review', 'import'], ['read', 'review']), null);
  assert.equal(missingScope(null, 'read'), 'read');
});

test('shouldTouch: לכל היותר פעם בדקה', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  assert.equal(shouldTouch(null, now), true);
  assert.equal(shouldTouch(new Date(now.getTime() - TOUCH_MS + 1), now), false);
  assert.equal(shouldTouch(new Date(now.getTime() - TOUCH_MS), now), true);
  assert.equal(shouldTouch('garbage', now), true);
});

test('publicToken: רשימה סגורה — בלי hash ובלי המפתח, גם כשהם במסמך', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  const doc = {
    _id: { toString: () => 'abc' },
    user: 'u1',
    name: 'בית',
    hash: 'f'.repeat(64),
    token: GOOD,
    prefix: 'ppt_AAAA',
    scopes: ['import', 'read'],
    createdAt: now,
    expiresAt: new Date(now.getTime() + DAY),
    lastUsedAt: null,
    revokedAt: null,
    __v: 0,
  };
  const out = publicToken(doc, now);
  assert.deepEqual(Object.keys(out).sort(), ['createdAt', 'expiresAt', 'id', 'lastUsedAt', 'name', 'prefix', 'revokedAt', 'scopes', 'state']);
  assert.deepEqual(out.scopes, ['read', 'import']);
  assert.equal(out.state, 'active');
  assert.equal(out.id, 'abc');
  const text = JSON.stringify(out);
  assert.ok(!text.includes(doc.hash));
  assert.ok(!text.includes(GOOD));
});
