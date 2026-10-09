/**
 * בדיקות אינטגרציה של דיווחי התוכנה מול MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { GIF87A, ANIMATED_GIF } from './testing/gif-fixtures.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { FakeIssuesGitHub, FakeGitHubRepos } from './testing/fake-github.js';
import { handleAppReportPost } from './handler.js';
import { MAX_BODY_BYTES, MAX_MINIDUMP_BYTES } from './validation.js';
import { runAppReportsSync, contactReporter, listReports, getReportDetail, loadReportFile, loadReportImage, loadPublicImage, unsubscribeByToken, ingestInboundReply } from './service.js';
import { handleInboundEmailPost } from './inbound-handler.js';
import { parseReplyAddress } from './inbound.js';
import { getAppReportsConfig } from './config.js';
import { handleGithubWebhook } from './webhook.js';
import { createUnsubscribeToken } from './unsubscribe.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });

let gh;
let files;
let mails;
const config = getAppReportsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 'test-token', NEXTAUTH_SECRET: 'unsub-secret', NEXTAUTH_URL: 'https://otzaria.org' });

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
const deleteFile = async (id) => { files.delete(String(id)); };
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
  const res = await handleAppReportPost(req, { saveFile, deleteFile, config, fetchImpl: gh.fetch, connectDB: async () => {}, rateLimit: () => true, ...deps });
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
  const big = manual({ attachments: { errorLog: 'x'.repeat(MAX_BODY_BYTES) } });
  assert.equal((await post(big)).status, 413);
  const longLog = await post(manual({ attachments: { errorLog: 'x'.repeat(710 * 1024) } }));
  assert.equal(longLog.status, 422);
  assert.equal(longLog.body.field, 'attachments.errorLog');
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

const replyConfig = { ...config, replyDomain: 'reply.otzaria.org', inboundSecret: 'inbound-secret' };
const user = () => ({ id: String(new mongoose.Types.ObjectId()), name: 'מפתח' });

/** פנייה למדווח עם כתובת reply+; מחזיר את הכתובת שנשלחה במייל */
async function contactWithReply(reportId) {
  const sent = [];
  const r = await contactReporter(
    { reportId, subject: 'שאלה', message: 'אפשר פרטים?', user: user() },
    { config: replyConfig, sendContactMail: async (m) => { sent.push(m); return { sent: true }; } },
  );
  assert.equal(r.status, 200);
  return sent[0].replyTo;
}

const inbound = (to, over = {}) => ({
  to, from: 'Reporter@Example.com', subject: 'Re: שאלה', messageId: '<m1@mail.example.com>',
  text: 'זה קורה רק בפתיחה הראשונה.\n\nOn Mon, Oct 5, 2026 at 10:00 AM צוות אוצריא <no-reply@otzaria.org> wrote:\n> אפשר פרטים?',
  headers: {}, attachments: 0, ...over,
});
const inboundDeps = (over = {}) => ({ config: replyConfig, fetchImpl: gh.fetch, ...over });

test('כתובת מענה: נוצרת פעם אחת לדיווח, יציבה בין פניות, ולא נחשפת בממשק', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rep = await post(manual());
  const first = await contactWithReply(rep.body.reportId);
  const second = await contactWithReply(rep.body.reportId);
  assert.match(first, /^reply\+[0-9a-f]{40}@reply\.otzaria\.org$/);
  assert.equal(second, first);

  const detail = await getReportDetail(rep.body.reportId, 'admin');
  assert.equal(JSON.stringify(detail).includes(parseReplyAddress(first)), false);
  assert.equal(detail.report.contactLog[0].direction, 'out');

  // בלי דומיין מוגדר — אין כתובת ייעודית (המייל חוזר למענה הרגיל)
  const sent = [];
  await contactReporter({ reportId: rep.body.reportId, subject: 'ש', message: 'ה', user: user() },
    { config, sendContactMail: async (m) => { sent.push(m); return { sent: true }; } });
  assert.equal(sent[0].replyTo, null);
});

test('תשובה במייל: נשמרת בלי הציטוט, מתפרסמת ב-issue, וכפילות לפי Message-ID מתעלמת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rep = await post(manual());
  const to = await contactWithReply(rep.body.reportId);

  const r = await ingestInboundReply(inbound(to), inboundDeps());
  assert.deepEqual(r, { status: 200, body: { ok: true, status: 'stored', reportId: rep.body.reportId } });
  const doc = await AppReport.findOne({ reportId: rep.body.reportId }).lean();
  const entry = doc.contactLog.at(-1);
  assert.equal(entry.direction, 'in');
  assert.equal(entry.message, 'זה קורה רק בפתיחה הראשונה.');
  assert.equal(entry.issueComment, 'posted');
  assert.ok(doc.lastInboundAt);

  const comment = gh.comments.at(-1);
  assert.equal(comment.issue, rep.body.issueNumber);
  assert.ok(comment.body.includes('> זה קורה רק בפתיחה הראשונה.'));
  assert.equal(comment.body.includes('example.com'), false);
  assert.equal(entry.issueCommentUrl, comment.html_url);

  const again = await ingestInboundReply(inbound(to), inboundDeps());
  assert.equal(again.body.status, 'duplicate');
  assert.equal((await AppReport.findOne({ reportId: rep.body.reportId }).lean()).contactLog.length, 2);
  assert.equal(gh.comments.length, 1);

  // הכתובת של השולח גלויה למנהל כללי בלבד
  const devView = await getReportDetail(rep.body.reportId, 'developer');
  assert.equal(JSON.stringify(devView).includes('reporter@example.com'), false);
  assert.equal((await getReportDetail(rep.body.reportId, 'admin')).report.contactLog.at(-1).fromEmail, 'reporter@example.com');
});

test('תשובה במייל: טוקן לא מוכר 404, מענה אוטומטי מתעלם, כתובת זרה לא מתפרסמת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rep = await post(manual());
  const to = await contactWithReply(rep.body.reportId);

  assert.equal((await ingestInboundReply(inbound(`reply+${'0'.repeat(40)}@reply.otzaria.org`), inboundDeps())).status, 404);
  assert.equal((await ingestInboundReply(inbound('someone@reply.otzaria.org'), inboundDeps())).status, 422);
  const auto = await ingestInboundReply(inbound(to, { headers: { 'auto-submitted': 'auto-replied' } }), inboundDeps());
  assert.equal(auto.body.status, 'ignored_auto');

  const other = await ingestInboundReply(inbound(to, { from: 'stranger@example.org', messageId: '<m2@x>' }), inboundDeps());
  assert.equal(other.body.status, 'stored');
  const doc = await AppReport.findOne({ reportId: rep.body.reportId }).lean();
  assert.equal(doc.contactLog.filter((c) => c.direction === 'in').length, 1);
  assert.equal(doc.contactLog.at(-1).issueComment, 'held');
  assert.equal(gh.comments.length, 0);
});

test('תשובה במייל: GitHub נכשל → נשמרת כממתינה, וה-cron מפרסם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rep = await post(manual());
  const to = await contactWithReply(rep.body.reportId);
  gh.failNext = 1;
  const r = await ingestInboundReply(inbound(to), inboundDeps());
  assert.equal(r.body.status, 'stored');
  let doc = await AppReport.findOne({ reportId: rep.body.reportId }).lean();
  assert.equal(doc.contactLog.at(-1).issueComment, 'pending');

  const summary = await runAppReportsSync({ ...syncDeps(), config: replyConfig });
  assert.deepEqual(summary.inbound, { reports: 1, posted: 1, errors: 0 });
  doc = await AppReport.findOne({ reportId: rep.body.reportId }).lean();
  assert.equal(doc.contactLog.at(-1).issueComment, 'posted');
  assert.equal(gh.comments.length, 1);
});

test('נתיב inbound-email: סוד חסר/שגוי, גוף שבור, וקליטה תקינה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rep = await post(manual());
  const to = await contactWithReply(rep.body.reportId);
  const call = async (body, { auth = 'Bearer inbound-secret', cfg = replyConfig } = {}) => {
    const req = new Request('http://localhost/api/app-reports/inbound-email', {
      method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const res = await handleInboundEmailPost(req, { config: cfg, fetchImpl: gh.fetch, connectDB: async () => {} });
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await call(inbound(to), { cfg: config })).status, 503);
  assert.equal((await call(inbound(to), { auth: null })).status, 401);
  assert.equal((await call(inbound(to), { auth: 'Bearer wrong' })).status, 401);
  assert.equal((await call('{not json')).status, 400);
  const ok = await call(inbound(to));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'stored');
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

test('צילומי מסך: נשמרים ב-GridFS, נשלפים לפי מיקום, והמספר מופיע ב-issue', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1]);
  const body = manual({
    attachments: {
      images: [
        { fileName: 'screenshot-1.png', mimeType: 'image/png', data: png.toString('base64') },
        { fileName: 'b.jpg', mimeType: 'image/jpeg', data: jpeg.toString('base64') },
      ],
    },
  });
  const res = await post(body);
  assert.equal(res.status, 200);

  const first = await loadReportImage(body.reportId, '0', readFile);
  assert.deepEqual(first.buffer, png);
  assert.equal(first.contentType, 'image/png');
  assert.equal(first.filename, 'image-1.png');
  assert.equal((await loadReportImage(body.reportId, 1, readFile)).contentType, 'image/jpeg');
  for (const bad of ['2', '-1', 'x', '0.5']) assert.equal(await loadReportImage(body.reportId, bad, readFile), null);

  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  const tokens = doc.fileIds.images.map((img) => img.publicToken);
  assert.equal(new Set(tokens).size, 2);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  const issue = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'));
  for (const token of tokens) assert.ok(issue.body.body.includes(`/api/app-reports/images/${token})`));

  const pub = await loadPublicImage(tokens[0], readFile);
  assert.deepEqual(pub.buffer, png);
  assert.equal(pub.contentType, 'image/png');
  for (const bad of ['x'.repeat(32), 'short', `${tokens[0]}/..`, null]) assert.equal(await loadPublicImage(bad, readFile), null);

  const { report } = await getReportDetail(body.reportId, 'admin');
  assert.deepEqual(report.files.images, [
    { size: png.length, mimeType: 'image/png', fileName: 'screenshot-1.png' },
    { size: jpeg.length, mimeType: 'image/jpeg', fileName: 'b.jpg' },
  ]);
  assert.equal(report.fileIds, undefined);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(tokens[0]));
});

test('צילום מסך שאינו תמונה → 422 ושום דבר לא נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = manual({ attachments: { images: [{ fileName: 'a.png', mimeType: 'image/png', data: Buffer.from('<svg/>').toString('base64') }] } });
  const res = await post(body);
  assert.equal(res.status, 422);
  assert.equal(res.body.field, 'attachments.images[0]');
  assert.equal(await AppReport.countDocuments({ reportId: body.reportId }), 0);
  assert.equal(files.size, 0);
});

test('GIF: original bytes, MIME and extension survive ingest and public/admin reads', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const images = [GIF87A, ANIMATED_GIF];
  const body = manual({ attachments: { images: images.map((buffer) => ({
    data: buffer.toString('base64'), mimeType: 'image/png', fileName: '',
  })) } });
  const res = await post(body);
  assert.equal(res.status, 200);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  const issue = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'));
  for (const [i, buffer] of images.entries()) {
    const ref = doc.fileIds.images[i];
    const saved = files.get(String(ref.gridfsId));
    assert.deepEqual(saved.buf, buffer);
    assert.equal(saved.contentType, 'image/gif');
    assert.equal(saved.filename, `app-report-${body.reportId}-image-${i + 1}.gif`);
    assert.equal(ref.fileName, `image-${i + 1}.gif`);
    const admin = await loadReportImage(body.reportId, i, readFile);
    assert.deepEqual(admin.buffer, buffer);
    assert.equal(admin.contentType, 'image/gif');
    assert.equal(admin.filename, `image-${i + 1}.gif`);
    const pub = await loadPublicImage(ref.publicToken, readFile);
    assert.deepEqual(pub.buffer, buffer);
    assert.equal(pub.contentType, 'image/gif');
    assert.ok(issue.body.body.includes(`/api/app-reports/images/${ref.publicToken})`));
  }
});

test('minidump: נשמר פתוח ב-GridFS, מוגש רק דרך ניהול, ולא מוזכר ב-issue', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const dump = Buffer.concat([Buffer.from('MDMP', 'latin1'), Buffer.alloc(200, 3)]);
  const body = crash({ attachments: { minidump: { fileName: 'e1f2.dmp', data: zlib.gzipSync(dump).toString('base64') } } });
  const res = await post(body);
  assert.equal(res.status, 200);

  const file = await loadReportFile(body.reportId, 'minidump', readFile);
  assert.deepEqual(file.buffer, dump);
  assert.equal(file.contentType, 'application/octet-stream');
  assert.equal(file.filename, 'crash.dmp');

  const { report } = await getReportDetail(body.reportId, 'developer');
  assert.deepEqual(report.files.minidump, { size: dump.length, fileName: 'e1f2.dmp' });
  const issue = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/issues'));
  assert.doesNotMatch(issue.body.body, /minidump|\.dmp/i);
});

test('minidump שאינו dump → 422 ושום דבר לא נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = crash({ attachments: { minidump: { data: Buffer.from('hello').toString('base64') } } });
  const res = await post(body);
  assert.equal(res.status, 422);
  assert.equal(res.body.field, 'attachments.minidump');
  assert.equal(await AppReport.countDocuments({ reportId: body.reportId }), 0);
  assert.equal(files.size, 0);
});

const rollbackReport = (dumpBytes = 72) => {
  const dump = Buffer.alloc(dumpBytes);
  dump.write('MDMP');
  return crash({ attachments: {
    diagnostics: { settings: { theme: 'dark' } },
    errorLog: 'native crash',
    minidump: { data: zlib.gzipSync(dump).toString('base64') },
    images: [{ data: GIF87A.toString('base64') }],
  } });
};

test('כשל אחרי שמירת dump מנקה את כל הקבצים; ניסיון חוזר לא משאיר עותקים יתומים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = rollbackReport(MAX_MINIDUMP_BYTES);
  let calls = 0;
  const failImage = async (...args) => {
    calls += 1;
    if (calls === 4) throw new Error('image storage failed');
    return saveFile(...args);
  };
  const failed = await post(body, { deps: { saveFile: failImage } });
  assert.equal(failed.status, 500);
  assert.equal(calls, 4);
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(files.size, 0);
  assert.equal(gh.issues.size, 0);

  const retry = await post(body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, false);
  assert.equal(files.size, 4);
  assert.equal(await AppReport.countDocuments(), 1);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  const refs = [doc.fileIds.diagnostics, doc.fileIds.errors, doc.fileIds.minidump, ...doc.fileIds.images];
  assert.deepEqual([...files.keys()].sort(), refs.map((ref) => String(ref.gridfsId)).sort());
  assert.equal((await loadReportFile(body.reportId, 'minidump', readFile)).buffer.length, MAX_MINIDUMP_BYTES);
});

test('כשל בעדכון הפניות הקבצים ב-Mongo מנקה גם שמירה מלאה של הקבצים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  let saved = 0;
  t.mock.method(AppReport, 'updateOne', async () => { throw new Error('file references update failed'); });
  const res = await post(rollbackReport(), { deps: { saveFile: async (...args) => {
    saved += 1;
    return saveFile(...args);
  } } });
  assert.equal(res.status, 500);
  assert.equal(saved, 4);
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(files.size, 0);
  assert.equal(gh.issues.size, 0);
});

test('כשל במחיקת קובץ אחד אינו מונע ניקוי של שאר הקבצים או מחליף את תגובת ה-500', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const attempted = [];
  const res = await post(rollbackReport(), { deps: {
    saveFile: async (...args) => {
      if (args[1].endsWith('.gif')) throw new Error('image storage failed');
      return saveFile(...args);
    },
    deleteFile: async (id) => {
      attempted.push(id);
      if (attempted.length === 1) throw new Error('cleanup unavailable');
      await deleteFile(id);
    },
  } });
  assert.equal(res.status, 500);
  assert.equal(attempted.length, 3);
  assert.equal(files.size, 1);
  assert.equal(files.has(attempted[0]), true);
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(gh.issues.size, 0);
});

test('עדכון שהצליח אך תשובתו אבדה: קבצים של דיווח שכבר פורסם אינם נמחקים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const body = rollbackReport();
  const updateOne = AppReport.updateOne.bind(AppReport);
  t.mock.method(AppReport, 'updateOne', async (filter, update) => {
    await updateOne(filter, { $set: { ...update.$set, issueNumber: 123, issuePending: false } });
    throw new Error('update response lost after concurrent publication');
  });
  const res = await post(body);
  assert.equal(res.status, 500);
  assert.equal(await AppReport.countDocuments(), 1);
  assert.equal(files.size, 4);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.issueNumber, 123);
  assert.deepEqual((await loadReportFile(body.reportId, 'minidump', readFile)).buffer, files.get(String(doc.fileIds.minidump.gridfsId)).buf);
});

// ---------------------------------------------------------------- מוצרים: אוצריא ועדכוני אוצריא

const OTZ_REPO = 'Otzaria/otzaria';
const UPD_REPO = 'Otzaria/Otzaria_Offline_update';
const updater = (make, over = {}) => make({ product: 'offline-update', ...over });

/** שני ריפו מדומים; שניהם ממספרים מ-100, כך ש-#100 קיים בשניהם */
function twoRepos() {
  const hub = new FakeGitHubRepos([OTZ_REPO, UPD_REPO]);
  return { hub, otz: hub.repo(OTZ_REPO), upd: hub.repo(UPD_REPO) };
}
const postVia = (hub, body) => post(body, { deps: { fetchImpl: hub.fetch } });
const syncVia = (hub, over = {}) => runAppReportsSync({ config, fetchImpl: hub.fetch, sendClosedMail, ...over });

async function hookVia(hub, payload) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', hookSecret).update(body).digest('hex')}`;
  const req = new Request('http://localhost/api/app-reports/github-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-github-event': 'issues', 'x-hub-signature-256': signature },
    body,
  });
  const res = await handleGithubWebhook(req, { config: hookConfig, fetchImpl: hub.fetch, sendClosedMail, connectDB: async () => {} });
  return res.status;
}

/** דיווח "ישן": נקלט כרגיל, ואז השדה product נמחק ישירות ב-Mongo (כמו מסמך מלפני השינוי) */
async function makeLegacy(reportId) {
  await AppReport.collection.updateOne({ reportId }, { $unset: { product: '' } });
  const raw = await AppReport.collection.findOne({ reportId });
  assert.equal('product' in raw, false);
}

test('מוצרים: כל דיווח נפתח בריפו של המוצר שלו; תשובת ה-API זהה במבנה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  const a = await postVia(hub, manual());
  const b = await postVia(hub, updater(manual));
  assert.deepEqual(Object.keys(b.body).sort(), Object.keys(a.body).sort());
  assert.equal(a.body.issueUrl, `https://github.com/${OTZ_REPO}/issues/100`);
  assert.equal(b.body.issueUrl, `https://github.com/${UPD_REPO}/issues/100`);
  assert.equal(otz.issues.size, 1);
  assert.equal(upd.issues.size, 1);
  assert.deepEqual(upd.calls.find((c) => c.method === 'POST').body.labels, ['from-app', 'bug', 'platform:windows']);
  assert.equal(upd.issues.get(100).title, '[דיווח מהתוכנה] החיפוש לא עובד');
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).product, 'otzaria');
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).product, 'offline-update');
});

test('מוצרים: product לא מוכר → 422 ושום דבר לא נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub } = twoRepos();
  for (const product of ['other', '', 7, 'Otzaria']) {
    const res = await postVia(hub, manual({ product }));
    assert.equal(res.status, 422);
    assert.deepEqual(res.body, { error: 'product: unknown', field: 'product' });
  }
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(hub.calls.length, 0);
  assert.equal(files.size, 0);
});

test('מוצרים: אותו reportId ותוכן תחת מוצר אחר → 409 ולא duplicate', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub } = twoRepos();
  const body = manual();
  await postVia(hub, body);
  const dup = await postVia(hub, { ...body, product: 'otzaria' });
  assert.equal(dup.body.duplicate, true);
  const conflict = await postVia(hub, { ...body, product: 'offline-update' });
  assert.equal(conflict.status, 409);
  const upd = updater(manual);
  await postVia(hub, upd);
  assert.equal((await postVia(hub, upd)).body.duplicate, true);
  assert.equal((await postVia(hub, { ...upd, product: undefined })).status, 409);
});

test('מוצרים: אותה חתימה בשני מוצרים → issue נפרד לכל אחד, איחוד רק בתוך המוצר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  const a = await postVia(hub, crash());
  const b = await postVia(hub, updater(crash));
  assert.equal(b.body.merged, false);
  assert.equal(b.body.issueUrl, `https://github.com/${UPD_REPO}/issues/100`);
  assert.equal(otz.comments.length + upd.comments.length, 0);

  const c = await postVia(hub, updater(crash, { description: 'שוב אצלי' }));
  assert.equal(c.body.merged, true);
  assert.equal(c.body.issueUrl, `https://github.com/${UPD_REPO}/issues/100`);
  assert.equal(upd.comments.length, 1);
  assert.equal(otz.comments.length, 0);

  const d = await postVia(hub, crash({ description: 'ואצלי' }));
  assert.equal(d.body.merged, true);
  assert.equal(d.body.issueUrl, a.body.issueUrl);
  assert.equal(otz.comments.length, 1);
  assert.equal(upd.comments.length, 1);

  // רק ה-issue של אוצריא נסגר → דיווח חדש באוצריא פותח issue חדש, בעדכונים ממשיך להתאחד
  otz.setState(100, 'closed', 'completed');
  await syncVia(hub);
  const e = await postVia(hub, crash({ description: 'אחרי הסגירה' }));
  assert.equal(e.body.merged, false);
  assert.equal(e.body.issueUrl, `https://github.com/${OTZ_REPO}/issues/101`);
  assert.match(otz.issues.get(101).body, /קודם: #100/);
  const f = await postVia(hub, updater(crash, { description: 'עדיין פתוח' }));
  assert.equal(f.body.merged, true);
  assert.equal(upd.issues.size, 1);
});

test('מוצרים: אותו מספר issue בשני הריפו — ה-cron סוגר ושולח מייל רק למוצר הנכון', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  const a = await postVia(hub, manual({ reporterEmail: 'otz@example.com' }));
  const b = await postVia(hub, updater(manual, { reporterEmail: 'upd@example.com' }));
  assert.equal(a.body.issueNumber, 100);
  assert.equal(b.body.issueNumber, 100);

  upd.setState(100, 'closed', 'completed');
  const s1 = await syncVia(hub);
  assert.equal(s1.states.checked, 2);
  assert.equal(s1.states.closed, 1);
  assert.deepEqual(mails.map((m) => [m.to, m.product, m.issueUrl]), [['upd@example.com', 'offline-update', `https://github.com/${UPD_REPO}/issues/100`]]);
  assert.match(mails[0].reasonText, /עדכוני אוצריא/);
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'open');
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).issueState, 'closed');

  otz.setState(100, 'closed', 'completed');
  await syncVia(hub);
  assert.deepEqual(mails.map((m) => m.to), ['upd@example.com', 'otz@example.com']);
  assert.equal(mails[1].product, 'otzaria');
  assert.equal(mails[1].reasonText, 'הבעיה שדיווחת עליה טופלה. התיקון ייכלל בגרסה הבאה של אוצריא (אם עוד לא נכלל).');

  // פתיחה מחדש בריפו אחד מאפסת רק את הדיווחים שלו
  upd.setState(100, 'open', 'reopened');
  await syncVia(hub);
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).issueState, 'open');
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'closed');
});

test('מוצרים: webhook מריפו העדכונים (רישיות שונה) מטפל רק בדיווחי העדכונים; ריפו לא מוכר מתעלם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  const a = await postVia(hub, manual({ reporterEmail: 'otz@example.com' }));
  const b = await postVia(hub, updater(manual, { reporterEmail: 'upd@example.com' }));
  otz.setState(100, 'closed', 'completed');
  upd.setState(100, 'closed', 'not_planned');

  const before = hub.calls.length;
  assert.equal(await hookVia(hub, closedEvent(100, { repository: { full_name: 'evil/Otzaria_Offline_update' } })), 204);
  assert.equal(hub.calls.length, before);

  assert.equal(await hookVia(hub, closedEvent(100, { repository: { full_name: 'otzaria/otzaria_offline_update' } })), 202);
  assert.deepEqual(upd.calls.filter((c) => c.method === 'GET').map((c) => c.path), [`/repos/${UPD_REPO}/issues/100`]);
  assert.equal(otz.calls.filter((c) => c.method === 'GET').length, 0);
  assert.deepEqual(mails.map((m) => [m.to, m.reasonKind, m.product]), [['upd@example.com', 'not_planned', 'offline-update']]);
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'open');
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).issueState, 'closed');

  // issue של העדכונים שאין לו דיווח אצלנו — בלי קריאה ל-GitHub
  assert.equal(await hookVia(hub, closedEvent(555, { repository: { full_name: UPD_REPO } })), 202);
  assert.equal(upd.calls.filter((c) => c.method === 'GET').length, 1);

  assert.equal(await hookVia(hub, closedEvent(100)), 202);
  assert.deepEqual(mails.map((m) => m.to), ['upd@example.com', 'otz@example.com']);
});

test('מוצרים: מסמך ישן בלי product מתנהג כאוצריא (איחוד, cron, webhook, רשימה, idempotency)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  const legacyBody = crash({ trigger: 'crash_prompt', reporterEmail: 'old@example.com' });
  const legacy = await postVia(hub, legacyBody);
  await makeLegacy(legacy.body.reportId);

  // שליחה חוזרת של הדיווח הישן — duplicate (הטביעה לא השתנתה), בלי קריאות GitHub
  const calls = hub.calls.length;
  const again = await postVia(hub, legacyBody);
  assert.equal(again.body.duplicate, true);
  assert.equal(hub.calls.length, calls);

  const upd1 = await postVia(hub, updater(crash, { reporterEmail: 'upd@example.com', trigger: 'crash_prompt' }));
  assert.equal(upd1.body.merged, false);
  const otz2 = await postVia(hub, crash({ description: 'חדש' }));
  assert.equal(otz2.body.merged, true);
  assert.equal(otz2.body.issueNumber, legacy.body.issueNumber);
  assert.equal(otz.comments.length, 1);

  const list = await listReports({ product: 'otzaria' }, 'admin');
  assert.deepEqual(list.reports.map((r) => r.reportId).sort(), [legacy.body.reportId, otz2.body.reportId].sort());
  assert.ok(list.reports.every((r) => r.product === 'otzaria'));
  assert.deepEqual((await listReports({ product: 'offline-update' }, 'admin')).reports.map((r) => r.reportId), [upd1.body.reportId]);
  assert.equal((await listReports({}, 'admin')).total, 3);
  assert.equal((await listReports({ product: 'bogus' }, 'admin')).total, 3);

  const detail = await getReportDetail(legacy.body.reportId, 'admin');
  assert.equal(detail.report.product, 'otzaria');
  assert.deepEqual(detail.related.map((r) => r.reportId), [otz2.body.reportId]);
  assert.deepEqual((await getReportDetail(upd1.body.reportId, 'admin')).related, []);

  otz.setState(100, 'closed', 'completed');
  await syncVia(hub);
  assert.deepEqual(mails.map((m) => [m.to, m.product]), [['old@example.com', 'otzaria']]);
  assert.equal((await AppReport.findOne({ reportId: legacy.body.reportId }).lean()).issueState, 'closed');
  assert.equal((await AppReport.findOne({ reportId: upd1.body.reportId }).lean()).issueState, 'open');
  assert.equal(upd.issues.get(100).state, 'open');

  // webhook על issue של אוצריא מוצא גם מסמך ישן
  await AppReport.collection.updateOne({ reportId: legacy.body.reportId }, { $set: { notifiedClosedAt: null } });
  otz.setState(100, 'closed', 'duplicate');
  assert.equal(await hookVia(hub, closedEvent(100)), 202);
  assert.equal(mails.at(-1).to, 'old@example.com');
  assert.equal(mails.at(-1).reasonKind, 'duplicate');
  assert.equal('product' in await AppReport.collection.findOne({ reportId: legacy.body.reportId }), false);
});

test('מוצרים: issue שנמחק מסומן סגור רק במוצר שלו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, upd } = twoRepos();
  const a = await postVia(hub, crash());
  const b = await postVia(hub, updater(crash));
  upd.issues.delete(100);
  const c = await postVia(hub, updater(crash, { description: 'שוב' }));
  assert.equal(c.body.issuePending, true);
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).issueState, 'closed');
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueState, 'open');

  await syncVia(hub);
  const doc = await AppReport.findOne({ reportId: c.body.reportId }).lean();
  assert.equal(doc.issuePending, false);
  assert.equal(doc.issueUrl, `https://github.com/${UPD_REPO}/issues/101`);
});

test('מוצרים: הסנכרון מפרסם ממתינים של כל מוצר בריפו שלו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  otz.failNext = 1;
  upd.failNext = 1;
  const a = await postVia(hub, manual());
  const b = await postVia(hub, updater(manual));
  assert.equal(a.body.issuePending, true);
  assert.equal(b.body.issuePending, true);
  const s = await syncVia(hub);
  assert.deepEqual(s.pending, { attempted: 2, published: 2 });
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).issueUrl, `https://github.com/${OTZ_REPO}/issues/100`);
  assert.equal((await AppReport.findOne({ reportId: b.body.reportId }).lean()).issueUrl, `https://github.com/${UPD_REPO}/issues/100`);
});

test('מוצרים: פנייה ותשובה במייל — המוצר עובר למייל, והתגובה מתפרסמת בריפו של המוצר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  await postVia(hub, manual());
  const rep = await postVia(hub, updater(manual));
  const sent = [];
  const r = await contactReporter(
    { reportId: rep.body.reportId, subject: 'שאלה', message: 'אפשר פרטים?', user: user() },
    { config: replyConfig, sendContactMail: async (m) => { sent.push(m); return { sent: true }; } },
  );
  assert.equal(r.status, 200);
  assert.equal(sent[0].product, 'offline-update');

  upd.failNext = 1;
  const stored = await ingestInboundReply(inbound(sent[0].replyTo), { config: replyConfig, fetchImpl: hub.fetch });
  assert.equal(stored.body.status, 'stored');
  assert.equal(upd.comments.length, 0);
  const s = await syncVia(hub, { config: replyConfig });
  assert.deepEqual(s.inbound, { reports: 1, posted: 1, errors: 0 });
  assert.equal(upd.comments.length, 1);
  assert.equal(upd.comments[0].issue, 100);
  assert.equal(otz.comments.length, 0);
});

test('מוצרים: נעילת פרסום של מוצר אחר עם אותה חתימה אינה מעכבת (racing מצומצם למוצר)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub, otz, upd } = twoRepos();
  upd.failNext = 1;
  const b = await postVia(hub, updater(crash));
  assert.equal(b.body.issuePending, true);
  await AppReport.updateOne({ reportId: b.body.reportId }, { $set: { issueLeaseUntil: new Date(Date.now() + 60_000) } });

  const a = await postVia(hub, crash());
  assert.equal(a.body.issuePending, false);
  assert.equal(a.body.issueUrl, `https://github.com/${OTZ_REPO}/issues/100`);
  assert.equal(otz.issues.size, 1);
  assert.equal(upd.issues.size, 0);

  // בתוך אותו מוצר הנעילה כן מעכבת (אחרת ייווצר issue כפול)
  const c = await postVia(hub, updater(crash, { description: 'עוד אחד' }));
  assert.equal(c.body.issuePending, true);
  assert.equal(upd.issues.size, 0);
});

test('מוצרים: הסרה ממייל חלה על כל הדיווחים של הכתובת, בשני המוצרים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { hub } = twoRepos();
  const a = await postVia(hub, manual({ reporterEmail: 'same@example.com' }));
  const b = await postVia(hub, updater(manual, { reporterEmail: 'Same@Example.com' }));
  const other = await postVia(hub, updater(manual, { reporterEmail: 'other@example.com' }));
  const r = await unsubscribeByToken(createUnsubscribeToken(a.body.reportId, config.unsubscribeSecret), config);
  assert.equal(r.ok, true);
  const flags = async (id) => (await AppReport.findOne({ reportId: id }).lean()).unsubscribed;
  assert.equal(await flags(a.body.reportId), true);
  assert.equal(await flags(b.body.reportId), true);
  assert.equal(await flags(other.body.reportId), false);
});
