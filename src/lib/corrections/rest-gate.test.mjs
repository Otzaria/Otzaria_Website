/**
 * שער שבת/יו"ט של ה-API של שירות הבדיקה (rest-gate.js): אופליין, לפי חלונות המנוחה של pageProof/lease.js,
 * ונכשל-סגור.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restGate, restWindowAhead } from './rest-gate.js';

// נובמבר 2026: שעון חורף, UTC+2. חלון השבת: שישי 27.11 12:00 (10:00Z) – מוצאי שבת 28.11 22:00 (20:00Z).
test('בתוך חלון המנוחה — סגור, Retry-After עד סופו (לכל היותר שעה, לפחות דקה); מחוץ לו — פתוח', () => {
  assert.deepEqual(restGate(new Date('2026-11-28T10:00:00Z')), { closed: true, retryAfter: 3600 });
  assert.deepEqual(restGate(new Date('2026-11-28T19:30:00Z')), { closed: true, retryAfter: 1800 });
  assert.deepEqual(restGate(new Date('2026-11-28T19:59:50Z')), { closed: true, retryAfter: 60 });
  assert.deepEqual(restGate(new Date('2026-11-27T10:00:00Z')), { closed: true, retryAfter: 3600 }, 'תחילת החלון — בפנים');
  assert.deepEqual(restGate(new Date('2026-11-28T20:00:00Z')), { closed: false }, 'סוף החלון — בחוץ');
  assert.deepEqual(restGate(new Date('2026-11-27T09:59:00Z')), { closed: false });
  assert.deepEqual(restGate(new Date('2026-09-15T10:00:00Z')), { closed: false }, 'יום שלישי');
  // יום הכיפורים תשפ"ז (שני 21.9.2026, שעון קיץ UTC+3)
  assert.equal(restGate(new Date('2026-09-21T09:00:00Z')).closed, true);
});

test('חלון שמתחיל בתוך משך ה-lease הקרוב — מזוהה; חלון רחוק או נוכחי — לא', () => {
  const ahead = restWindowAhead(new Date('2026-11-27T09:55:00Z'), 600_000);
  assert.deepEqual([ahead.start.toISOString(), ahead.end.toISOString(), ahead.retryAfter], ['2026-11-27T10:00:00.000Z', '2026-11-28T20:00:00.000Z', 3600]);
  assert.equal(restWindowAhead(new Date('2026-11-27T09:45:00Z'), 600_000), null);
  assert.equal(restWindowAhead(new Date('2026-09-15T10:00:00Z'), 600_000), null);
  assert.equal(restWindowAhead(new Date('2026-11-28T10:00:00Z'), 600_000), null, 'כבר בתוך החלון — זה תפקיד restGate');
});

test('נכשל-סגור: לוח שנה שזורק → סגור שעה', () => {
  const broken = () => { throw new Error('calendar changed'); };
  assert.deepEqual(restGate(new Date('2026-09-15T10:00:00Z'), { windows: broken }), { closed: true, retryAfter: 3600 });
  assert.equal(restWindowAhead(new Date('2026-09-15T10:00:00Z'), 600_000, { windows: broken }).retryAfter, 3600);
});
