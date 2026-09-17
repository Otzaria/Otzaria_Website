/**
 * בדיקות אינטגרציה של דיווחי התוכנה מול MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { FakeIssuesGitHub } from './testing/fake-github.js';
import { handleAppReportPost } from './handler.js';
import { runAppReportsSync, contactReporter, listReports, getReportDetail, loadReportFile, unsubscribeByToken } from './service.js';
import { getAppReportsConfig } from './config.js';
import { handleGithubWebhook } from './webhook.js';
import { createUnsubscribeToken } from './unsubscribe.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });

let gh;
let files;
let mails;
const config = getAppReportsConfig({ APP_REPORTS_GITHUB_TOKEN: 'test-token', NEXTAUTH_SECRET: 'unsub-secret', NEXTAUTH_URL: 'https://otzaria.org' });

beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  gh = new FakeIssuesGitHub();
  files = new Map();
  mails = [];
});

const saveFile = async (buf, filename, contentType) => {
  const gridfsId = new mongoose.Types.ObjectId();
  files.set(String(gridfsId), { buf, filename, contentType });
  return { gridfsId };
};
const readFile = async (id) => files.get(String(id)).buf;
const sendClosedMail = async (m) => { mails.push(m); return { sent: true }; };

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const manual = (over = {}) => ({
  schema: 1, reportId: newId(), type: 'bug', trigger: 'manual', title: 'החיפוש לא עובד', description: 'לחצתי ולא קרה כלום',
  reporterEmail: 'reporter@example.com', appVersion: '0.9.98', platform: 'windows', osVersion: '10.0.26200', arch: 'x64',
  createdAt: '2026-09-17T10:00:00.000Z',
  attachments: { diagnostics: { settings: { theme: 'dark' } }, errorLog: 'Exception: boom\n#0 main' },
  ...over,
});
const crash = (over = {}) => manual({
  type: 'crash', trigger: 'auto_crash', title: 'קריסה: StateError', description: '', reporterEmail: '',
  signature: { exceptionType: 'StateError', frames: ['package:otzaria/a.dart in foo'] }, ...over,
});

async function post(body, { raw = false, deps = {} } = {}) {
  const req = new Request('http://localhost/api/app-reports', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: raw ? body : JSON.stringify(body),
  });
  const res = await handleAppReportPost(req, { saveFile, config, fetchImpl: gh.fetch, connectDB: async () => {}, rateLimit: () => true, ...deps });
  return { status: res.status, body: await res.json() };
}

const syncDeps = () => ({ config, fetchImpl: gh.fetch, sendClosedMail });

test('דיווח ידני: issue נוצר עם תוויות ומרקרים, בלי מייל/אבחון/לוג; קבצים נשמרו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = manual();
  const res = await post(body);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    success: true, reportId: body.reportId, issueNumber: 100, issueUrl: 'https://github.com/Otzaria/otzaria/issues/100',
    duplicate: false, merged: false, issuePending: false,
  });

  const call = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'));
  assert.deepEqual(call.body.labels, ['from-app', 'bug', 'platform:windows']);
  assert.equal(call.headers.Authorization, 'Bearer test-token');
  assert.equal(call.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(call.body.title, '[דיווח מהתוכנה] החיפוש לא עובד');
  assert.match(call.body.body, /<!-- app-labels: from-app, bug, platform:windows -->/);
  assert.match(call.body.body, new RegExp(`<!-- app-report: ${body.reportId} -->`));
  assert.doesNotMatch(call.body.body, /reporter@example\.com|theme|boom/);

  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.reporterEmail, 'reporter@example.com');
  assert.equal(doc.issueState, 'open');
  assert.equal(doc.issuePending, false);
  const diag = await loadReportFile(body.reportId, 'diagnostics', readFile);
  assert.deepEqual(JSON.parse(diag.buffer.toString('utf8')), { settings: { theme: 'dark' } });
  assert.equal(diag.filename, 'diagnostics.json');
  const log = await loadReportFile(body.reportId, 'errors', readFile);
  assert.equal(log.buffer.toString('utf8'), 'Exception: boom\n#0 main');
  assert.equal(await loadReportFile(body.reportId, 'other', readFile), null);
});

test('idempotency: אותו reportId ותוכן זהה → duplicate בלי קריאות GitHub; תוכן שונה → 409', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = manual();
  const first = await post(body);
  const calls = gh.calls.length;
  const again = await post(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.issueNumber, first.body.issueNumber);
  assert.equal(gh.calls.length, calls);
  assert.equal(files.size, 2);

  const conflict = await post({ ...body, description: 'משהו אחר' });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, { error: 'reportId conflict' });
  assert.equal(await AppReport.countDocuments(), 1);
});

test('קריסה עם אותה חתימה על issue פתוח → תגובה (merged); אחרי סגירה → issue חדש עם "קודם"', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(crash());
  assert.equal(a.body.merged, false);
  assert.match(gh.calls.at(-1).body.body, /<!-- app-signature: [0-9a-f]{64} -->/);
  assert.equal(gh.calls.at(-1).body.title, '[קריסה] קריסה: StateError');

  const b = await post(crash({ trigger: 'crash_prompt', description: 'קרס כשפתחתי ספר', reporterEmail: 'b@example.com' }));
  assert.equal(b.status, 200);
  assert.equal(b.body.merged, true);
  assert.equal(b.body.issueNumber, a.body.issueNumber);
  assert.equal(gh.issues.size, 1);
  assert.equal(gh.comments.length, 1);
  assert.match(gh.comments[0].body, /קרס כשפתחתי ספר/);
  assert.doesNotMatch(gh.comments[0].body, /b@example\.com/);

  const other = await post(crash({ signature: { exceptionType: 'RangeError', frames: [] } }));
  assert.notEqual(other.body.issueNumber, a.body.issueNumber);

  gh.setState(a.body.issueNumber, 'closed', 'completed');
  await runAppReportsSync(syncDeps());
  const c = await post(crash());
  assert.equal(c.body.merged, false);
  assert.notEqual(c.body.issueNumber, a.body.issueNumber);
  assert.match(gh.issues.get(c.body.issueNumber).body, new RegExp(`קודם: #${a.body.issueNumber}`));
});

test('שני דיווחים במקביל עם אותה חתימה → issue אחד ותגובה אחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const [a, b] = await Promise.all([post(crash()), post(crash({ description: 'גם אצלי' }))]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.ok(gh.issues.size <= 1);
  await runAppReportsSync(syncDeps());
  assert.equal(gh.issues.size, 1);
  assert.equal(gh.comments.length, 1);
  assert.equal(await AppReport.countDocuments({ issuePending: true }), 0);
});

test('issue שנמחק → הדיווח הבא פותח issue חדש במקום להיתקע בתגובה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(crash());
  gh.issues.delete(a.body.issueNumber);
  const b = await post(crash({ description: 'שוב' }));
  assert.equal(b.body.issuePending, true);
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'closed');

  await runAppReportsSync(syncDeps());
  const doc = await AppReport.findOne({ reportId: b.body.reportId }).lean();
  assert.equal(doc.issuePending, false);
  assert.notEqual(doc.issueNumber, a.body.issueNumber);
  assert.match(gh.issues.get(doc.issueNumber).body, new RegExp(`קודם: #${a.body.issueNumber}`));
});

test('GitHub נכשל → issuePending, והסנכרון יוצר את ה-issue; בלי טוקן נשאר ממתין', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh.failNext = 1;
  const res = await post(manual());
  assert.equal(res.status, 200);
  assert.equal(res.body.issuePending, true);
  assert.equal(res.body.issueNumber, null);
  const pendingDoc = await AppReport.findOne({ reportId: res.body.reportId }).lean();
  assert.match(pendingDoc.issueError, /502/);

  const summary = await runAppReportsSync(syncDeps());
  assert.equal(summary.pending.published, 1);
  const doc = await AppReport.findOne({ reportId: res.body.reportId }).lean();
  assert.equal(doc.issuePending, false);
  assert.equal(doc.issueNumber, 100);

  const noToken = getAppReportsConfig({});
  const r2 = await post(manual(), { deps: { config: noToken } });
  assert.equal(r2.body.issuePending, true);
  assert.equal((await runAppReportsSync({ config: noToken, sendClosedMail })).githubConfigured, false);
});

test('תור הממתינים לפי מועד הניסיון האחרון — דיווח שנכשל שוב ושוב אינו חוסם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh.failNext = 2;
  const stuck = await post(manual({ title: 'ותיק ותקוע' }));
  const fresh = await post(manual({ title: 'חדש' }));
  assert.equal(stuck.body.issuePending, true);
  assert.equal(fresh.body.issuePending, true);
  // הוותיק ננסה זה עתה; החדש ממתין מאז אתמול ולכן קודם בתור
  await AppReport.updateOne({ reportId: stuck.body.reportId }, { $set: { issueAttemptAt: new Date() } });
  await AppReport.updateOne({ reportId: fresh.body.reportId }, { $set: { issueAttemptAt: new Date(Date.now() - 86400000) } });

  await runAppReportsSync(syncDeps());
  const freshDoc = await AppReport.findOne({ reportId: fresh.body.reportId }).lean();
  const stuckDoc = await AppReport.findOne({ reportId: stuck.body.reportId }).lean();
  assert.ok(freshDoc.issueNumber < stuckDoc.issueNumber);
});

test('סגירה: מייל פעם אחת לכל מדווח עם מייל שלא הוסר; פתיחה מחדש מאפסת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(crash({ trigger: 'crash_prompt', reporterEmail: 'one@example.com' }));
  await post(crash({ trigger: 'crash_prompt', reporterEmail: 'ONE@example.com', description: 'שוב' }));
  await post(crash());
  const d = await post(crash({ trigger: 'crash_prompt', reporterEmail: 'gone@example.com', description: 'שלישי' }));
  const unsub = await unsubscribeByToken(createUnsubscribeToken(d.body.reportId, config.unsubscribeSecret), config);
  assert.equal(unsub.ok, true);
  assert.equal((await unsubscribeByToken('bad.token', config)).ok, false);

  await runAppReportsSync(syncDeps());
  assert.equal(mails.length, 0);

  gh.setState(a.body.issueNumber, 'closed', 'not_planned');
  const s1 = await runAppReportsSync(syncDeps());
  assert.equal(s1.states.notified, 1);
  assert.deepEqual(mails.map((m) => m.to), ['one@example.com']);
  assert.equal(mails[0].reasonKind, 'not_planned');
  assert.equal(mails[0].issueUrl, `https://github.com/Otzaria/otzaria/issues/${a.body.issueNumber}`);
  assert.match(mails[0].unsubscribeUrl, /^https:\/\/otzaria\.org\/api\/app-reports\/unsubscribe\?token=/);
  const closedDoc = await AppReport.findOne({ reportId: a.body.reportId }).lean();
  assert.equal(closedDoc.issueState, 'closed');
  assert.equal(closedDoc.issueStateReason, 'not_planned');

  await runAppReportsSync(syncDeps());
  assert.equal(mails.length, 1);

  gh.setState(a.body.issueNumber, 'open', 'reopened');
  await runAppReportsSync(syncDeps());
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).notifiedClosedAt, null);
  gh.setState(a.body.issueNumber, 'closed', 'completed');
  await runAppReportsSync(syncDeps());
  assert.equal(mails.length, 2);
  assert.equal(mails[1].reasonKind, 'completed');
});

test('מייל סגירה שנכשל ינוסה שוב בריצה הבאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(manual());
  gh.setState(a.body.issueNumber, 'closed', 'duplicate');
  let fail = true;
  const flaky = async (m) => { if (fail) return { sent: false }; mails.push(m); return { sent: true }; };
  const s1 = await runAppReportsSync({ config, fetchImpl: gh.fetch, sendClosedMail: flaky });
  assert.equal(s1.states.failed, 1);
  fail = false;
  await runAppReportsSync({ config, fetchImpl: gh.fetch, sendClosedMail: flaky });
  assert.equal(mails.length, 1);
});

test('ולידציה ברמת HTTP: 400, 413, 422', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal((await post('{not json', { raw: true })).status, 400);
  const big = manual({ attachments: { errorLog: 'x'.repeat(710 * 1024) } });
  assert.equal((await post(big)).status, 413);
  const bad = await post(manual({ reporterEmail: '' }));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.field, 'reporterEmail');
  const limited = await post(manual(), { deps: { rateLimit: () => false } });
  assert.equal(limited.status, 429);
  assert.equal(await AppReport.countDocuments(), 0);
});

test('כשל בשמירת קבצים → 500 והדיווח לא נשמר (הלקוח ישלח שוב)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await post(manual(), { deps: { saveFile: async () => { throw new Error('gridfs down'); } } });
  assert.equal(res.status, 500);
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(gh.issues.size, 0);
});

test('ניהול: המייל חוזר רק למנהל כללי; רשימה עם סינון; דיווחים קשורים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(crash({ trigger: 'crash_prompt', reporterEmail: 'secret@example.com' }));
  await post(crash({ description: 'עוד' }));
  await post(manual({ type: 'suggestion' }));

  const dev = await getReportDetail(a.body.reportId, 'developer');
  assert.equal('reporterEmail' in dev.report, false);
  assert.equal(dev.report.hasEmail, true);
  assert.equal(JSON.stringify(dev).includes('secret@example.com'), false);
  assert.equal(dev.related.length, 1);
  const admin = await getReportDetail(a.body.reportId, 'admin');
  assert.equal(admin.report.reporterEmail, 'secret@example.com');

  const devList = await listReports({ type: 'crash' }, 'developer');
  assert.equal(devList.total, 2);
  assert.equal(JSON.stringify(devList).includes('secret@example.com'), false);
  assert.equal((await listReports({ trigger: 'manual' }, 'admin')).total, 1);
  assert.equal((await listReports({ issueState: 'open' }, 'admin')).total, 3);
  assert.equal((await listReports({ issueState: 'pending' }, 'admin')).total, 0);
  assert.equal(await getReportDetail('missing', 'admin'), null);
});

test('יצירת קשר: 404 לדיווח חסר, 422 בלי מייל, שליחה ושמירה בהיסטוריה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const sent = [];
  const deps = { sendContactMail: async (m) => { sent.push(m); return { sent: true }; } };
  const user = { id: String(new mongoose.Types.ObjectId()), name: 'מפתח' };
  const noMail = await post(crash());
  const withMail = await post(manual());

  assert.equal((await contactReporter({ reportId: 'missing', subject: 'ש', message: 'ה', user }, deps)).status, 404);
  assert.equal((await contactReporter({ reportId: noMail.body.reportId, subject: 'ש', message: 'ה', user }, deps)).status, 422);
  assert.equal((await contactReporter({ reportId: withMail.body.reportId, subject: '', message: 'ה', user }, deps)).body.field, 'subject');

  const ok = await contactReporter({ reportId: withMail.body.reportId, subject: 'שאלה', message: 'אפשר פרטים?', user }, deps);
  assert.equal(ok.status, 200);
  assert.equal(JSON.stringify(ok.body).includes('reporter@example.com'), false);
  assert.deepEqual(sent.map((m) => m.to), ['reporter@example.com']);
  const doc = await AppReport.findOne({ reportId: withMail.body.reportId }).lean();
  assert.equal(doc.contactLog.length, 1);
  assert.equal(doc.contactLog[0].byName, 'מפתח');
  assert.equal(doc.contactLog[0].subject, 'שאלה');

  const failing = await contactReporter({ reportId: withMail.body.reportId, subject: 'ש', message: 'ה', user }, { sendContactMail: async () => ({ sent: false }) });
  assert.equal(failing.status, 502);
});

const hookSecret = 'hook-secret';
const hookConfig = { ...config, webhookSecret: hookSecret };

async function hook(payload, { event = 'issues', secret = hookSecret, cfg = hookConfig } = {}) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const req = new Request('http://localhost/api/app-reports/github-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-hub-signature-256': signature },
    body,
  });
  const res = await handleGithubWebhook(req, { config: cfg, fetchImpl: gh.fetch, sendClosedMail, connectDB: async () => {} });
  return res.status;
}

const closedEvent = (number, over = {}) => ({
  action: 'closed',
  issue: { number, state: 'closed', state_reason: 'completed' },
  repository: { full_name: 'Otzaria/otzaria' },
  ...over,
});

test('webhook: סגירה אמיתית שולחת מייל אחרי קריאה מחדש מ-GitHub, וה-cron לא שולח שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(manual());
  gh.setState(a.body.issueNumber, 'closed', 'completed');

  assert.equal(await hook(closedEvent(a.body.issueNumber)), 202);
  assert.ok(gh.calls.some((c) => c.method === 'GET' && c.path.endsWith(`/issues/${a.body.issueNumber}`)));
  assert.deepEqual(mails.map((m) => m.to), ['reporter@example.com']);

  await runAppReportsSync(syncDeps());
  assert.equal(mails.length, 1);
});

test('webhook: חתימה שגויה או חסרה → 401; בלי סוד מוגדר → 503; בשום מקרה אין מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(manual());
  gh.setState(a.body.issueNumber, 'closed', 'completed');

  assert.equal(await hook(closedEvent(a.body.issueNumber), { secret: 'attacker-guess' }), 401);
  const unsigned = new Request('http://localhost/api/app-reports/github-webhook', {
    method: 'POST', headers: { 'x-github-event': 'issues' }, body: JSON.stringify(closedEvent(a.body.issueNumber)),
  });
  assert.equal((await handleGithubWebhook(unsigned, { config: hookConfig, fetchImpl: gh.fetch, sendClosedMail, connectDB: async () => {} })).status, 401);
  assert.equal(await hook(closedEvent(a.body.issueNumber), { cfg: config }), 503);
  assert.equal(mails.length, 0);
});

test('webhook: תוכן חתום שטוען "נסגר" על issue שפתוח ב-GitHub אינו שולח מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(manual());
  assert.equal(await hook(closedEvent(a.body.issueNumber)), 202);
  assert.equal(mails.length, 0);
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'open');
});

test('webhook: ping, אירוע אחר, ריפו אחר ו-issue שאינו שלנו → 204/202 בלי קריאות GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(manual());
  const before = gh.calls.length;
  assert.equal(await hook({ zen: 'hi' }, { event: 'ping' }), 204);
  assert.equal(await hook(closedEvent(a.body.issueNumber), { event: 'issue_comment' }), 204);
  assert.equal(await hook(closedEvent(a.body.issueNumber, { action: 'labeled' })), 204);
  assert.equal(await hook(closedEvent(a.body.issueNumber, { repository: { full_name: 'evil/repo' } })), 204);
  assert.equal(await hook(closedEvent(99999)), 202);
  assert.equal(gh.calls.length, before);
  assert.equal(mails.length, 0);
});
