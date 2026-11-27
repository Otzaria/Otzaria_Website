/**
 * מצב המשיכה — בדיקות טהורות: הגדרות (CORRECTIONS_VERIFY_TRANSPORT ו-CORRECTIONS_AGENT_*), אימות
 * הסוכן, ודדליין שאינו נספר בשבת/יו"ט. ("כבר הוחל": already-applied.test.mjs.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCorrectionsConfig, describeConfig } from './config.js';
import {
  readAgentEnv, authenticateAgent, agentVersionOf, createRejectLogger, isStrongAgentSecret, secretEntropyBits, OTHER_SECRET_ENVS,
} from './agent-auth.js';
import { verifyDeadline } from './worker.js';

const SECRET = 'N4vQ8r2LxT6mW1zK9pB3sD7fH5jY0cG-aE_uR2iO8tZ';
const PULL = { CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'pull', CORRECTIONS_AGENT_SECRET: SECRET, CORRECTIONS_AGENT_ID: 'verify-1' };
const PUSH = { CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://127.0.0.1:4555', CORRECTIONS_VERIFY_SECRET: 's3cret' };

const req = (headers = {}) => new Request('http://x/api/worker/v1/corrections/claim', { method: 'POST', headers });
const authed = (over = {}) => req({ authorization: `Bearer ${SECRET}`, 'x-agent-id': 'verify-1', ...over });

test('משיכה: מופעל בלי כתובת שירות; דורש סוד ומזהה לסוכן; ברירת המחדל נשארת דחיפה', () => {
  const c = getCorrectionsConfig(PULL);
  assert.equal(c.verify.transport, 'pull');
  assert.equal(c.verify.enabled, true);
  assert.equal(c.verify.disabledReason, null);
  assert.equal(c.verify.url, null);
  assert.deepEqual(c.errors, []);
  assert.equal(getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_SECRET: '' }).verify.disabledReason, 'agent_not_configured');
  assert.equal(getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_ID: '' }).verify.disabledReason, 'agent_not_configured');
  assert.equal(getCorrectionsConfig(PULL, { verifyPaused: true }).verify.disabledReason, 'service_paused');
  assert.equal(getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_ENABLED: '0' }).verify.disabledReason, 'service_disabled');
  // דחיפה: בדיוק כמו קודם — כולל כשהוגדרו גם משתני הסוכן
  const push = getCorrectionsConfig({ ...PUSH, CORRECTIONS_AGENT_SECRET: SECRET, CORRECTIONS_AGENT_ID: 'verify-1' });
  assert.equal(push.verify.transport, 'push');
  assert.equal(push.verify.enabled, true);
  assert.equal(getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1' }).verify.disabledReason, 'service_not_configured');
  assert.equal(getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'push' }).verify.disabledReason, 'service_not_configured');
});

test('משיכה: סוד חלש, סוד זהה לזה של עובד ה-OCR, מזהה לא תקין, transport לא מוכר → כבוי עם שגיאה', () => {
  const weak = getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_SECRET: 'short' });
  assert.equal(weak.verify.disabledReason, 'agent_misconfigured');
  assert.ok(weak.errors.includes('CORRECTIONS_AGENT_SECRET too weak'));
  const reused = getCorrectionsConfig({ ...PULL, OCR_WORKER_SECRET: ` ${SECRET} ` });
  assert.equal(reused.verify.disabledReason, 'agent_misconfigured');
  assert.ok(reused.errors.some((e) => e.includes('OCR_WORKER_SECRET')));
  const badId = getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_ID: 'a b' });
  assert.equal(badId.verify.disabledReason, 'agent_misconfigured');
  const typo = getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_TRANSPORT: 'pul' });
  assert.equal(typo.verify.enabled, false);
  assert.equal(typo.verify.disabledReason, 'service_misconfigured');
  assert.ok(typo.errors.includes('CORRECTIONS_VERIFY_TRANSPORT invalid'));
  // שגיאות הסוכן אינן רלוונטיות בדחיפה
  assert.deepEqual(getCorrectionsConfig({ ...PUSH, CORRECTIONS_AGENT_SECRET: 'short', CORRECTIONS_AGENT_ID: 'x' }).errors, []);
  assert.deepEqual(readAgentEnv({ CORRECTIONS_AGENT_SECRET: `﻿${SECRET}\n`, CORRECTIONS_AGENT_ID: ' verify-1 ' }), { secret: SECRET, agentId: 'verify-1', problem: null, errors: [] });
});

test('משיכה: mock בייצור עדיין חסום; הסמכות והתיאור למסך — בלי סודות', () => {
  const prodMock = getCorrectionsConfig({ ...PULL, NODE_ENV: 'production', CORRECTIONS_VERIFY_MOCK: '1', CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content' });
  assert.equal(prodMock.verify.disabledReason, 'mock_forbidden_in_production');
  assert.equal(prodMock.verify.authority, 'none');
  const prod = getCorrectionsConfig({ ...PULL, NODE_ENV: 'production', CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content' });
  assert.equal(prod.verify.enabled, true);
  assert.equal(prod.verify.authority, 'technical_and_content');
  const d = describeConfig(prod);
  assert.equal(d.verify.transport, 'pull');
  assert.equal(d.verify.agentId, 'verify-1');
  assert.equal(d.verify.agentSecretConfigured, true);
  assert.equal(d.verify.urlHost, null);
  assert.equal(JSON.stringify(d).includes(SECRET), false);
  assert.equal(describeConfig(getCorrectionsConfig(PUSH)).verify.agentId, null);
});

test('אימות הסוכן: דחיפה/תצורה חסרה → 403; Bearer חסר/שגוי → 401; X-Agent-Id אחר → 403; תקין → מזהה', () => {
  const pull = getCorrectionsConfig(PULL).verify;
  assert.deepEqual(authenticateAgent(authed(), pull), { ok: true, agentId: 'verify-1' });
  assert.deepEqual(authenticateAgent(authed(), getCorrectionsConfig({ ...PUSH, CORRECTIONS_AGENT_SECRET: SECRET, CORRECTIONS_AGENT_ID: 'verify-1' }).verify),
    { ok: false, status: 403, code: 'agent_api_disabled' });
  assert.equal(authenticateAgent(authed(), getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_SECRET: 'short' }).verify).code, 'agent_api_disabled');
  // מושהה/כבוי אינו בעיית זהות: הסוכן מאומת ומקבל 204 בתפיסה
  assert.equal(authenticateAgent(authed(), getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_ENABLED: '0' }).verify).ok, true);
  for (const auth of [undefined, `Bearer ${'X'.repeat(48)}`, `bearer ${SECRET}`, `Bearer  ${SECRET}`, SECRET]) {
    const r = authenticateAgent(req({ ...(auth ? { authorization: auth } : {}), 'x-agent-id': 'verify-1' }), pull);
    assert.deepEqual(r, { ok: false, status: 401, code: 'unauthorized' }, String(auth));
  }
  assert.equal(authenticateAgent(authed({ 'x-agent-id': 'verify-2' }), pull).code, 'wrong_agent');
  assert.equal(authenticateAgent(req({ authorization: `Bearer ${SECRET}` }), pull).code, 'wrong_agent');
  assert.equal(agentVersionOf(authed({ 'x-agent-version': '1.0.5+abc' })), '1.0.5+abc');
  assert.equal(agentVersionOf(authed({ 'x-agent-version': '1.0 beta' })), null);
  assert.equal(agentVersionOf(authed({ 'x-agent-version': 'v'.repeat(65) })), null);
  assert.equal(agentVersionOf(authed()), null);
});

test('דדליין: במשיכה שבת ויו"ט אינם נספרים; בדחיפה — זמן שעון כמו קודם', () => {
  const pull = getCorrectionsConfig(PULL);
  const push = getCorrectionsConfig(PUSH);
  // שלישי 13:00 בירושלים, רחוק משבת: אותו דבר בשני האופנים.
  const tuesday = new Date('2026-09-15T10:00:00Z');
  assert.equal(verifyDeadline(pull, tuesday).getTime(), tuesday.getTime() + 86_400_000);
  // שישי 10:00 (UTC+2): שעתיים עד 12:00, ושאר 22 השעות ממוצאי שבת 22:00 → ראשון 20:00.
  const friday = new Date('2026-11-27T08:00:00Z');
  assert.equal(verifyDeadline(pull, friday).toISOString(), '2026-11-29T18:00:00.000Z');
  assert.equal(verifyDeadline(push, friday).getTime(), friday.getTime() + 86_400_000);
  // ערב יום הכיפורים תשפ"ז (ראשון 20.9.2026, UTC+3) 10:00: החלון 12:00 → שני 22:00.
  const erevYk = new Date('2026-09-20T07:00:00Z');
  assert.equal(verifyDeadline(pull, erevYk).toISOString(), '2026-09-22T17:00:00.000Z');
});

test('מועד המיצוי במשיכה ניתן להגדרה (CORRECTIONS_VERIFY_DEADLINE_HOURS): ברירת מחדל 24, טווח 1–168, שגיאה מוצגת', () => {
  assert.equal(getCorrectionsConfig(PULL).verify.deadlineHours, 24);
  const two = getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_DEADLINE_HOURS: '48' });
  assert.equal(two.verify.deadlineHours, 48);
  assert.deepEqual(two.errors, []);
  assert.equal(describeConfig(two).verify.deadlineHours, 48);
  for (const [raw, want] of [['0.5', 1], ['500', 168]]) {
    const c = getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_DEADLINE_HOURS: raw });
    assert.equal(c.verify.deadlineHours, want, raw);
    assert.ok(c.errors.some((e) => e.includes('CORRECTIONS_VERIFY_DEADLINE_HOURS out of range')), raw);
  }
  const junk = getCorrectionsConfig({ ...PULL, CORRECTIONS_VERIFY_DEADLINE_HOURS: 'יום' });
  assert.equal(junk.verify.deadlineHours, 24);
  assert.ok(junk.errors.includes('CORRECTIONS_VERIFY_DEADLINE_HOURS invalid'));
  // בדחיפה אין לו משמעות — לא שגיאה, ולא מוצג
  const push = getCorrectionsConfig({ ...PUSH, CORRECTIONS_VERIFY_DEADLINE_HOURS: 'יום' });
  assert.deepEqual(push.errors, []);
  assert.equal(describeConfig(push).verify.deadlineHours, null);
  // 48 שעות משישי 10:00: שעתיים עד 12:00, ו-46 ממוצאי שבת 22:00 → שני 20:00 (UTC+2)
  assert.equal(verifyDeadline(two, new Date('2026-11-27T08:00:00Z')).toISOString(), '2026-11-30T18:00:00.000Z');
  assert.equal(verifyDeadline(getCorrectionsConfig({ ...PUSH, CORRECTIONS_VERIFY_DEADLINE_HOURS: '48' }), new Date('2026-11-27T08:00:00Z')).toISOString(), '2026-11-28T08:00:00.000Z');
});

test('יומן הדחיות: שורה אחת לכל קוד בדקה, והשורה הבאה מונה את מה שנבלע', () => {
  const lines = [];
  let now = 0;
  const reject = createRejectLogger({ log: (l) => lines.push(l), clock: () => now });
  reject('unauthorized');
  reject('unauthorized');
  reject('unauthorized');
  reject('wrong_agent');
  now = 59_999;
  reject('unauthorized');
  assert.deepEqual(lines, ['[corrections-agent] auth rejected: unauthorized', '[corrections-agent] auth rejected: wrong_agent']);
  now = 60_000;
  reject('unauthorized');
  assert.equal(lines.at(-1), '[corrections-agent] auth rejected: unauthorized (+3 more in the last minute)');
  now = 200_000;
  reject('unauthorized');
  assert.equal(lines.at(-1), '[corrections-agent] auth rejected: unauthorized');
});

test('סוד הסוכן: נדחה סוד דל אנטרופיה או חוזר; חייב להיות שונה מכל סוד אחר בשרת', () => {
  for (const weak of ['S'.repeat(48), '0123456789'.repeat(5), 'ab'.repeat(30), `${'a'.repeat(42)}bcdefghij`]) {
    assert.equal(isStrongAgentSecret(weak), false, weak.slice(0, 10));
    assert.equal(getCorrectionsConfig({ ...PULL, CORRECTIONS_AGENT_SECRET: weak }).verify.disabledReason, 'agent_misconfigured');
  }
  // סוד אקראי ב-base64url (32 בתים) או ב-hex (64 תווים) — תקין
  assert.equal(isStrongAgentSecret(SECRET), true);
  assert.equal(isStrongAgentSecret('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'), true);
  assert.ok(secretEntropyBits(SECRET) >= 128);
  for (const name of OTHER_SECRET_ENVS) {
    const c = getCorrectionsConfig({ ...PULL, [name]: SECRET });
    assert.equal(c.verify.disabledReason, 'agent_misconfigured', name);
    assert.ok(c.errors.includes(`CORRECTIONS_AGENT_SECRET must differ from ${name}`), name);
  }
  assert.ok(OTHER_SECRET_ENVS.includes('CRON_SECRET') && OTHER_SECRET_ENVS.includes('DICTA_LIBRARY_GITHUB_TOKEN') && OTHER_SECRET_ENVS.includes('CORRECTIONS_VERIFY_SECRET'));
});
