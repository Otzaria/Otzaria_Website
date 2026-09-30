/**
 * האטת ניסיונות שגויים של מפתח-גישה לפי כתובת (tokenThrottle.js).
 * הרצה: npm run test:node
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFailThrottle, FAIL_LIMIT, FAIL_WINDOW_MS, bearerFailures } from './tokenThrottle.js';

test('נחסם אחרי limit ניסיונות שגויים בחלון, עד סוף החלון', () => {
  const t = createFailThrottle({ limit: 3, windowMs: 60_000 });
  const t0 = 1_000_000;
  assert.equal(t.blockedFor('1.1.1.1', t0), 0);
  t.fail('1.1.1.1', t0);
  t.fail('1.1.1.1', t0 + 1000);
  assert.equal(t.blockedFor('1.1.1.1', t0 + 2000), 0);
  t.fail('1.1.1.1', t0 + 2000);
  // שניות עד סוף החלון (שמתחיל בניסיון הראשון)
  assert.equal(t.blockedFor('1.1.1.1', t0 + 2000), 58);
  assert.equal(t.blockedFor('1.1.1.1', t0 + 59_500), 1);
  assert.equal(t.blockedFor('1.1.1.1', t0 + 60_000), 0);
  // חלון חדש — המונה מתחיל מאפס
  t.fail('1.1.1.1', t0 + 60_000);
  assert.equal(t.blockedFor('1.1.1.1', t0 + 60_001), 0);
});

test('כל כתובת לחוד; reset מנקה', () => {
  const t = createFailThrottle({ limit: 2, windowMs: 60_000 });
  t.fail('a', 0);
  t.fail('a', 1);
  assert.ok(t.blockedFor('a', 2) > 0);
  assert.equal(t.blockedFor('b', 2), 0);
  t.reset();
  assert.equal(t.blockedFor('a', 2), 0);
  assert.equal(t.size, 0);
});

test('הצפה מכתובות רבות: הזיכרון חסום (ישנים/פגים יוצאים ראשונים)', () => {
  const t = createFailThrottle({ limit: 2, windowMs: 1000, maxKeys: 5 });
  for (let i = 0; i < 5; i++) t.fail(`ip${i}`, 0);
  t.fail('late', 2000); // כולם פגו — מתנקים
  assert.equal(t.size, 1);
  for (let i = 0; i < 10; i++) t.fail(`x${i}`, 2500);
  assert.ok(t.size <= 5);
});

test('ברירות-המחדל של הראוטים: 10 ניסיונות ל-10 דקות', () => {
  assert.equal(FAIL_LIMIT, 10);
  assert.equal(FAIL_WINDOW_MS, 10 * 60 * 1000);
  assert.equal(typeof bearerFailures.fail, 'function');
});
