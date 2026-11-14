/**
 * הבדיקה האוטומטית לפני פתיחת issue, מול MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { FakeIssuesGitHub } from './testing/fake-github.js';
import { handleAppReportPost } from './handler.js';
import { runAppReportsSync, ingestInboundReply, listReports } from './service.js';
import { applyTriageDecision, forcePublishReport, getTriageStatus, listTriageQueue } from './triage-decision.js';
import { handleTriageDecisionPost, handleTriageFileGet, handleTriageMaterialGet, handleTriageQueueGet } from './triage-handler.js';
import { requestRetriage } from './triage.js';
import { getAppReportsConfig } from './config.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });

const config = getAppReportsConfig({
  DICTA_LIBRARY_GITHUB_TOKEN: 'test-token', NEXTAUTH_SECRET: 'unsub-secret', NEXTAUTH_URL: 'https://otzaria.org',
  APP_REPORTS_TRIAGE_SECRET: 'triage-secret', APP_REPORTS_TRIAGE_DISPATCH_TOKEN: 'dispatch-token',
  APP_REPORTS_REPLY_DOMAIN: 'reply.otzaria.org', APP_REPORTS_INBOUND_SECRET: 'inbound-secret',
});

let gh;
let dispatches;
let mails;
let contactMails;
let files;
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  gh = new FakeIssuesGitHub();
  dispatches = [];
  mails = [];
  contactMails = [];
  files = new Map();
});

// GitHub של הדיווחים, ועוד ה-dispatch למאגר השירות
const fetchImpl = async (url, init = {}) => {
  if (String(url).endsWith('/repos/Otzaria/app-report-triage/dispatches')) {
    dispatches.push({ body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(null, { status: 204 });
  }
  return gh.fetch(url, init);
};
const saveFile = async (buf) => {
  const gridfsId = new mongoose.Types.ObjectId();
  files.set(String(gridfsId), buf);
  return { gridfsId };
};
const deleteFile = async (id) => { files.delete(String(id)); };
const sendContactMail = async (m) => { contactMails.push(m); return { sent: true }; };
const sendClosedMail = async (m) => { mails.push(m); return { sent: true }; };
const deps = (over = {}) => ({ config, fetchImpl, sendContactMail, sendClosedMail, ...over });

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const report = (over = {}) => ({
  schema: 1, reportId: newId(), type: 'performance', trigger: 'auto_crash', title: 'התוכנה לא הגיבה', description: '',
  reporterEmail: 'reporter@example.com', appVersion: '0.9.99+99900', platform: 'windows', osVersion: '10.0.26200', arch: 'x64',
  createdAt: '2026-11-14T10:00:00.000Z', signature: { exceptionType: 'AppHang', frames: ['app.so+0x10'] },
  attachments: { diagnostics: { settings: {} }, errorLog: '=== App hang' },
  ...over,
});

async function post(body, over = {}) {
  const serialized = JSON.stringify(body);
  const req = new Request('http://localhost/api/app-reports', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(serialized)) }, body: serialized,
  });
  const res = await handleAppReportPost(req, {
    saveFile, deleteFile, config, fetchImpl, connectDB: async () => {}, rateLimit: () => true, ...over,
  });
  return { status: res.status, body: await res.json() };
}

const decision = (over = {}) => ({ action: 'hold', verdict: 'external', confidence: 'high', summary: '**מה קרה:** לחץ זיכרון.', ...over });
const sync = (now) => runAppReportsSync({ config, fetchImpl, sendClosedMail, sendContactMail, now });
const later = (ms) => new Date(Date.now() + ms);

test('תקיעה ממתינה לבדיקה: בלי issue, התוכנה מקבלת "נקלט", השירות מתעורר; דיווח רגיל נפתח מיד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const hang = await post(report());
  assert.equal(hang.status, 200);
  assert.equal(hang.body.issueNumber, null);
  assert.equal(hang.body.issuePending, true);
  assert.equal(gh.issues.size, 0);
  assert.deepEqual(dispatches, [{ body: { event_type: 'app-report', client_payload: { report: hang.body.reportId } }, auth: 'Bearer dispatch-token' }]);
  assert.deepEqual((await listTriageQueue()).items.map((i) => i.reportId), [hang.body.reportId]);

  // ה-cron לא פותח לפני ה-deadline
  await sync(new Date());
  assert.equal(gh.issues.size, 0);
  assert.equal((await listReports({ issueState: 'triage' }, 'admin')).total, 1);
  assert.equal((await listReports({ issueState: 'pending' }, 'admin')).total, 0);

  const bug = await post(report({ type: 'bug', trigger: 'manual', description: 'החיפוש לא עובד', signature: null }));
  assert.ok(bug.body.issueNumber, JSON.stringify(bug));
  assert.equal(dispatches.length, 1);

  // בלי סוד הבדיקה — כמו קודם
  const plain = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x20'] } }), {
    config: { ...config, triageSecret: null },
  });
  assert.ok(plain.body.issueNumber);
});

test('open: האתר פותח את ה-issue ומחזיר את מספרו; החלטה שנייה → 409', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const r = await applyTriageDecision(body.reportId, decision({ action: 'open', verdict: 'needs_human', confidence: 'medium' }), deps());
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'opened');
  assert.equal(r.body.issueNumber, 100);
  assert.equal(gh.issues.get(100).title, '[תקיעה] התוכנה לא הגיבה');
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.issuePending, false);
  assert.equal(doc.triage.verdict, 'needs_human');
  assert.ok(doc.triage.summary.includes('לחץ זיכרון'));
  // האתר כותב את הפענוח ומשייך — השירות לא צריך הרשאת כתיבה ב-GitHub
  const decode = gh.comments.filter((c) => c.issue === 100 && c.body.includes('<!-- app-report-triage -->'));
  assert.equal(decode.length, 1);
  assert.match(decode[0].body, /לחץ זיכרון/);
  assert.match(decode[0].body, /בדיקה אוטומטית · דורש בדיקה · ודאות בינונית/);
  assert.deepEqual(gh.issues.get(100).assignees, ['palmoni5']);
  assert.equal(doc.triage.followUp.status, 'done');

  const again = await applyTriageDecision(body.reportId, decision(), deps());
  assert.equal(again.status, 409);
  assert.equal(again.body.issueNumber, 100);
});

test('hold: לא נפתח ולא נפתח גם אחרי ה-deadline; "פתח בכל זאת" פותח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const r = await applyTriageDecision(body.reportId, decision(), deps());
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.state, r.body.issueNumber, r.body.issuePending], ['held', null, false]);

  await sync(later(3 * 60 * 60 * 1000));
  assert.equal(gh.issues.size, 0);
  assert.equal((await listReports({ issueState: 'held' }, 'admin')).total, 1);
  assert.deepEqual((await listTriageQueue()).items, []);

  const forced = await forcePublishReport(body.reportId, deps());
  assert.equal(forced.status, 200);
  assert.equal(forced.body.state, 'forced');
  assert.equal(forced.body.issueNumber, 100);
  assert.equal((await forcePublishReport(body.reportId, deps())).status, 409);
});

test('hold עם קישור לכפילות שנסגרה כמתוקנת: מייל סגירה למדווח, בלי תגובה ב-GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const first = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x99'] } }), { config: { ...config, triageSecret: null } });
  gh.setState(first.body.issueNumber, 'closed', 'completed');

  const { body } = await post(report());
  const r = await applyTriageDecision(body.reportId, decision({ verdict: 'fixed', linkIssue: first.body.issueNumber }), deps());
  assert.equal(r.body.state, 'held');
  assert.equal(r.body.issueNumber, null);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.issueNumber, first.body.issueNumber);

  await sync(new Date());
  assert.equal(gh.comments.length, 0);
  assert.equal(mails.filter((m) => m.issueNumber === first.body.issueNumber).length, 1);
  // ברשימה הוא "לא נפתח", לא חלק מהכרטיס הסגור
  assert.equal((await listReports({ issueState: 'closed' }, 'admin')).total, 1);
});

test('השירות לא ענה עד ה-deadline: ה-cron פותח (timeout); החלטה מאוחרת מפענחת וסוגרת, פעם אחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  // הנעילה בפרסום נמדדת בשעון אמיתי, ולכן מקדימים את ה-deadline עצמו
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  assert.equal(gh.issues.size, 1);
  const status = await getTriageStatus(body.reportId);
  assert.equal(status.state, 'timeout');
  const late = await applyTriageDecision(body.reportId, decision(), deps());
  assert.equal(late.status, 200);
  assert.equal(late.body.late, true);
  const issue = gh.issues.get(status.issueNumber);
  assert.deepEqual([issue.state, issue.state_reason], ['closed', 'not_planned']);
  assert.equal(gh.comments.filter((c) => c.body.includes('<!-- app-report-triage -->')).length, 1);
  assert.equal((await applyTriageDecision(body.reportId, decision(), deps())).status, 409);
});

test('החלטה מאוחרת: כפול נסגר ככפול; issue שנפתח ידנית — פענוח בלבד, בלי סגירה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const orig = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x60'] } }), { config: { ...config, triageSecret: null } });
  const a = await post(report());
  await AppReport.updateOne({ reportId: a.body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  const aIssue = (await getTriageStatus(a.body.reportId)).issueNumber;
  await applyTriageDecision(a.body.reportId, decision({ verdict: 'duplicate', linkIssue: orig.body.issueNumber }), deps());
  assert.deepEqual([gh.issues.get(aIssue).state_reason, gh.issues.get(aIssue).duplicate_of], ['duplicate', orig.body.issueNumber]);

  const b = await post(report({ description: 'אחר', signature: { exceptionType: 'AppHang', frames: ['app.so+0x70'] } }));
  await forcePublishReport(b.body.reportId, deps());
  const bIssue = (await getTriageStatus(b.body.reportId)).issueNumber;
  const r = await applyTriageDecision(b.body.reportId, decision(), deps());
  assert.equal(r.status, 200);
  assert.equal(gh.issues.get(bIssue).state, 'open');
  assert.deepEqual(gh.issues.get(bIssue).assignees, []);
  assert.ok(gh.comments.some((c) => c.issue === bIssue && c.body.includes('<!-- app-report-triage -->')));
});

test('GitHub נכשל בפענוח אחרי הפתיחה: ה-cron משלים, בלי תגובה כפולה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const failing = async (url, init = {}) => (String(url).includes('/assignees') ? new Response('{}', { status: 502 }) : fetchImpl(url, init));
  const r = await applyTriageDecision(body.reportId, decision({ action: 'open', verdict: 'needs_human', confidence: 'medium' }), deps({ fetchImpl: failing }));
  assert.equal(r.body.issueNumber, 100);
  assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).triage.followUp.status, 'pending');
  await sync(new Date());
  assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).triage.followUp.status, 'done');
  assert.deepEqual(gh.issues.get(100).assignees, ['palmoni5']);
  assert.equal(gh.comments.filter((c) => c.body.includes('<!-- app-report-triage -->')).length, 1);
});

test('שאלות למדווח: מייל עם כתובת מענה; התשובה מפעילה בדיקה חוזרת ומתפרסמת רק כשנפתח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const r = await applyTriageDecision(body.reportId, decision({
    verdict: 'ask_reporter', confidence: 'medium', questions: ['מה עשית כשהתוכנה נתקעה?'], awaitingReply: true,
  }), deps());
  assert.equal(r.body.questionsSent, true);
  assert.equal(contactMails.length, 1);
  assert.match(contactMails[0].message, /מה עשית כשהתוכנה נתקעה\?/);
  assert.match(contactMails[0].replyTo, /^reply\+[0-9a-f]{40}@reply\.otzaria\.org$/);
  assert.equal(contactMails[0].to, 'reporter@example.com');

  const reply = await ingestInboundReply({
    to: contactMails[0].replyTo, from: 'reporter@example.com', subject: 'Re', messageId: '<a@x>', text: 'פתחתי ספר גדול.', headers: {}, attachments: 0,
  }, { ...deps(), saveFile, deleteFile });
  assert.equal(reply.body.status, 'stored');
  let doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.contactLog.at(-1).issueComment, 'triage');
  assert.equal(doc.triage.state, 'pending');
  assert.equal(doc.triage.runs, 2);
  assert.equal(doc.issuePending, true);
  assert.equal(dispatches.length, 2);
  assert.equal(gh.comments.length, 0);

  const open = await applyTriageDecision(body.reportId, decision({ action: 'open', verdict: 'needs_human', confidence: 'medium', runs: 2 }), deps());
  assert.equal(open.body.issueNumber, 100);
  await sync(new Date());
  doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.contactLog.at(-1).issueComment, 'posted');
  assert.ok(gh.comments.some((c) => c.body.includes('פתחתי ספר גדול.')));
});

test('תשובה שהגיעה בזמן הבדיקה: hold מבקש בדיקה חוזרת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await applyTriageDecision(body.reportId, decision({ verdict: 'ask_reporter', confidence: 'medium', questions: ['מתי?'], awaitingReply: true }), deps());
  const to = contactMails[0].replyTo;
  await ingestInboundReply({ to, from: 'reporter@example.com', subject: 'Re', messageId: '<1@x>', text: 'אתמול', headers: {}, attachments: 0 },
    { ...deps(), saveFile, deleteFile });
  // תשובה נוספת בזמן הבדיקה החוזרת
  await new Promise((r) => setTimeout(r, 5));
  await ingestInboundReply({ to, from: 'reporter@example.com', subject: 'Re', messageId: '<2@x>', text: 'ושוב היום', headers: {}, attachments: 0 },
    { ...deps(), saveFile, deleteFile });
  const r = await applyTriageDecision(body.reportId, decision({ verdict: 'no_info', runs: 2 }), deps());
  assert.equal(r.body.retriage, true);
  assert.equal((await getTriageStatus(body.reportId)).state, 'pending');
});

test('ולידציה, ונתיבי השירות: סוד חסר/שגוי, החלטה שגויה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  assert.equal((await applyTriageDecision(body.reportId, decision({ verdict: 'maybe' }), deps())).status, 422);
  assert.equal((await applyTriageDecision(body.reportId, decision({ action: 'open', linkIssue: 3 }), deps())).status, 422);
  assert.equal((await applyTriageDecision(body.reportId, decision({ awaitingReply: true }), deps())).status, 422);
  assert.equal((await applyTriageDecision('missing', decision(), deps())).status, 404);

  const req = (auth, payload) => new Request('http://localhost/api/app-reports/triage/x', {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const handlerDeps = { config, connectDB: async () => {}, fetchImpl, sendContactMail };
  assert.equal((await handleTriageDecisionPost(req('Bearer nope', decision()), body.reportId, handlerDeps)).status, 401);
  assert.equal((await handleTriageDecisionPost(req('Bearer triage-secret', decision()), body.reportId, { ...handlerDeps, config: { ...config, triageSecret: null } })).status, 503);
  const ok = await handleTriageDecisionPost(req('Bearer triage-secret', decision()), body.reportId, handlerDeps);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).state, 'held');
  const queue = await handleTriageQueueGet(new Request('http://localhost/api/app-reports/triage', { headers: { authorization: 'Bearer triage-secret' } }), handlerDeps);
  assert.deepEqual(await queue.json(), { items: [], late: [] });
});

test('תשובה בזמן ההמתנה ופתיחה ב-timeout: התשובה מתפרסמת, והדיווח מופיע לשירות כמאוחר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await applyTriageDecision(body.reportId, decision({ verdict: 'ask_reporter', confidence: 'medium', questions: ['מתי?'], awaitingReply: true }), deps());
  await ingestInboundReply({ to: contactMails[0].replyTo, from: 'reporter@example.com', subject: 'Re', messageId: '<t@x>', text: 'בבוקר', headers: {}, attachments: 0 },
    { ...deps(), saveFile, deleteFile });
  // השירות לא עונה על הבדיקה החוזרת
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.triage.state, 'timeout');
  assert.equal(doc.contactLog.at(-1).issueComment, 'posted');
  assert.ok(gh.comments.some((c) => c.body.includes('בבוקר')));
  assert.deepEqual((await listTriageQueue()).late, [{ reportId: body.reportId, issueNumber: doc.issueNumber, merged: false }]);
});

test('ממתינים לתשובה רק כשאפשר לשאול: בלי כתובת מענה, או כשהמייל נכשל — נפתח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const ask = decision({ verdict: 'ask_reporter', confidence: 'medium', questions: ['מתי?'], awaitingReply: true });
  const a = await post(report());
  const r1 = await applyTriageDecision(a.body.reportId, ask, deps({ config: { ...config, replyDomain: null } }));
  assert.equal(r1.body.state, 'opened');
  assert.ok(r1.body.issueNumber);

  const b = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x30'] } }));
  const r2 = await applyTriageDecision(b.body.reportId, ask, deps({ sendContactMail: async () => ({ sent: false, reason: 'smtp' }) }));
  assert.equal(r2.body.state, 'opened');
  assert.ok(r2.body.issueNumber);
  assert.equal(r2.body.questionsSent, false);
});

test('דיווח שלא נפתח ומקושר לכפילות אינו בסיס לאיחוד: דיווח שהוחלט לפתוח נפתח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const first = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x40'] } }), { config: { ...config, triageSecret: null } });
  gh.setState(first.body.issueNumber, 'closed', 'completed');
  // דיווח אחר עם חתימה חדשה, שהשירות קישר בטעות ל-issue הסגור
  const held = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0x50'] } }));
  await applyTriageDecision(held.body.reportId, decision({ verdict: 'fixed', linkIssue: first.body.issueNumber }), deps());
  const next = await post(report({ description: 'שוב', signature: { exceptionType: 'AppHang', frames: ['app.so+0x50'] } }));
  const r = await applyTriageDecision(next.body.reportId, decision({ action: 'open', verdict: 'needs_human', confidence: 'medium' }), deps());
  assert.equal(r.body.merged, false, JSON.stringify(r));
  assert.notEqual(r.body.issueNumber, first.body.issueNumber);
});

test('מפתח ההערה: ברירת מחדל מפתח הספרייה; מפתח משלו גובר; off מכבה', () => {
  const base = { DICTA_LIBRARY_GITHUB_TOKEN: 'library', APP_REPORTS_TRIAGE_SECRET: 's' };
  assert.equal(getAppReportsConfig(base).triageDispatchToken, 'library');
  assert.equal(getAppReportsConfig({ ...base, APP_REPORTS_TRIAGE_DISPATCH_TOKEN: 'own' }).triageDispatchToken, 'own');
  assert.equal(getAppReportsConfig({ ...base, APP_REPORTS_TRIAGE_DISPATCH_TOKEN: 'off' }).triageDispatchToken, null);
});

test('חומר הבדיקה: שדות, התכתבות וקבצים דרך הנתיב — בלי מייל ובלי dump', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report({ description: 'נתקע בגלילה' }));
  const auth = (url) => new Request(url, { headers: { authorization: 'Bearer triage-secret' } });
  const hdeps = { config, connectDB: async () => {}, readFile: async (id) => files.get(String(id)) };
  const res = await handleTriageMaterialGet(auth('http://localhost/x'), body.reportId, hdeps);
  assert.equal(res.status, 200);
  const m = await res.json();
  assert.equal(m.description, 'נתקע בגלילה');
  assert.equal(m.canContact, true);
  assert.deepEqual(m.triage, { state: 'pending', runs: 1, lateDecidedAt: null });
  assert.deepEqual(m.files, { errors: true, diagnostics: true, images: 0 });
  assert.equal(JSON.stringify(m).includes('reporter@example.com'), false);

  const errors = await handleTriageFileGet(auth('http://localhost/x'), body.reportId, 'errors', hdeps);
  assert.equal(errors.status, 200);
  assert.equal(await errors.text(), '=== App hang');
  assert.equal((await handleTriageFileGet(auth('http://localhost/x'), body.reportId, 'minidump', hdeps)).status, 404);
  assert.equal((await handleTriageFileGet(new Request('http://localhost/x'), body.reportId, 'errors', hdeps)).status, 401);
  assert.equal((await handleTriageMaterialGet(auth('http://localhost/x'), 'missing', hdeps)).status, 404);
});

test('החלטה מאוחרת על יוצר הכרטיס אינה סוגרת כרטיס שדיווח נוסף צורף אליו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(report());
  await AppReport.updateOne({ reportId: a.body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  const issue = (await getTriageStatus(a.body.reportId)).issueNumber;
  const b = await post(report({ description: 'דיווח נוסף עם מידע מועיל' }));
  await applyTriageDecision(b.body.reportId, decision({ action: 'open', verdict: 'needs_human' }), deps());
  assert.equal((await getTriageStatus(b.body.reportId)).issueNumber, issue);
  await applyTriageDecision(a.body.reportId, decision(), deps());
  assert.equal(gh.issues.get(issue).state, 'open');
});

test('סגירה שנכשלה נבדקת שוב מול דיווחים שהצטרפו לפני ניסיון ה-cron', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await post(report());
  await AppReport.updateOne({ reportId: a.body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  const issue = (await getTriageStatus(a.body.reportId)).issueNumber;
  const failClose = (url, init = {}) => init.method === 'PATCH'
    ? Promise.resolve(new Response('{}', { status: 502 })) : fetchImpl(url, init);
  await applyTriageDecision(a.body.reportId, decision(), deps({ fetchImpl: failClose }));
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).triage.followUp.status, 'pending');
  const b = await post(report({ description: 'הצטרף אחרי ההחלטה' }));
  await applyTriageDecision(b.body.reportId, decision({ action: 'open', verdict: 'needs_human' }), deps());
  await sync(new Date());
  assert.equal(gh.issues.get(issue).state, 'open');
  assert.equal((await AppReport.findOne({ reportId: a.body.reportId }).lean()).triage.followUp.status, 'done');
});

test('סבב החלטה: ניסיון חוזר מהסבב הקודם נדחה; החלטה עם runs עדכני מתקבלת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const old = decision({ questions: ['מתי?'], awaitingReply: true });
  await applyTriageDecision(body.reportId, old, deps());
  await ingestInboundReply({ to: contactMails[0].replyTo, from: 'reporter@example.com', subject: 'Re', messageId: '<round@x>', text: 'מידע חדש', headers: {}, attachments: 0 }, { ...deps(), saveFile, deleteFile });
  for (const stale of [old, { ...old, runs: 1 }]) {
    const r = await applyTriageDecision(body.reportId, stale, deps());
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'stale_run');
  }
  assert.equal(contactMails.length, 1);
  assert.equal((await getTriageStatus(body.reportId)).state, 'pending');
  const current = await applyTriageDecision(body.reportId, decision({ action: 'open', runs: 2, verdict: 'needs_human' }), deps());
  assert.equal(current.status, 200);
  assert.ok(current.body.issueNumber);
  assert.equal((await applyTriageDecision(body.reportId, decision({ runs: 0 }), deps())).status, 422);
});

test('תנאי העדכון מונע מהחלטה שכבר קראה סבב ישן לדרוס סבב חדש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const original = AppReport.updateOne;
  let resume;
  let claimed;
  const paused = new Promise((resolve) => { claimed = resolve; });
  const release = new Promise((resolve) => { resume = resolve; });
  let intercepted = false;
  AppReport.updateOne = function (filter, ...args) {
    if (!intercepted && filter.reportId === body.reportId && filter['triage.state'] === 'pending') {
      intercepted = true;
      claimed();
      return release.then(() => original.call(this, filter, ...args));
    }
    return original.call(this, filter, ...args);
  };
  let slow;
  try {
    slow = applyTriageDecision(body.reportId, decision({ runs: 1 }), deps());
    await paused;
    await applyTriageDecision(body.reportId, decision({ runs: 1 }), deps());
    await requestRetriage(body.reportId, deps());
    resume();
    assert.equal((await slow).status, 409);
    assert.equal((await getTriageStatus(body.reportId)).state, 'pending');
    assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).triage.runs, 2);
  } finally {
    resume();
    if (slow) await slow;
    AppReport.updateOne = original;
  }
});

test('כשל זמני ביצירת טוקן המענה פותח במקום להשאיר held בלי מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  const original = AppReport.findOneAndUpdate;
  AppReport.findOneAndUpdate = function (filter, ...args) {
    if (filter.replyToken) throw new Error('כשל DB זמני ביצירת טוקן');
    return original.call(this, filter, ...args);
  };
  try {
    const r = await applyTriageDecision(body.reportId, decision({ questions: ['מתי?'], awaitingReply: true }), deps());
    assert.equal(r.status, 200);
    assert.equal(r.body.state, 'opened');
    assert.ok(r.body.issueNumber);
    assert.equal(r.body.questionsSent, false);
  } finally { AppReport.findOneAndUpdate = original; }
  assert.equal(contactMails.length, 0);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.triage.questionsPending, false);
  assert.equal(doc.triage.awaitingReply, false);
});

test('משלוח שנקטע אחרי שמירת ההחלטה מתחדש ב-cron אחרי תפוגת הנעילה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await AppReport.updateOne({ reportId: body.reportId }, { $set: {
    issuePending: false, 'triage.state': 'held', 'triage.decidedAt': new Date(),
    'triage.questions': ['מתי?'], 'triage.awaitingReply': true, 'triage.questionsPending': true,
    'triage.questionsLeaseUntil': later(10 * 60 * 1000),
  } });
  await sync(new Date());
  assert.equal(contactMails.length, 0);
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.questionsLeaseUntil': new Date(Date.now() - 1000) } });
  await sync(new Date());
  assert.equal(contactMails.length, 1);
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.triage.state, 'held');
  assert.equal(doc.triage.questionsPending, false);
  assert.ok(doc.triage.questionsSentAt);
  await sync(new Date());
  assert.equal(contactMails.length, 1);
});

test('אחרי חמש בדיקות הדיווח יוצא מהתור ונפתח; hold נוסף אינו מתקבל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await applyTriageDecision(body.reportId, decision(), deps());
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.runs': 5 } });
  await requestRetriage(body.reportId, deps());
  assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).triage.state, 'opened');
  assert.equal((await listTriageQueue()).items.length, 0);
  assert.equal((await applyTriageDecision(body.reportId, decision({ runs: 6 }), deps())).status, 409);
  await sync(new Date());
  assert.equal(gh.issues.size, 1);
});

test('החלטת open ופתיחה ידנית גוברות על צירוף שקט לכרטיס סגור', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const manual of [false, true]) {
    const signature = { exceptionType: 'AppHang', frames: [manual ? 'app.so+0x91' : 'app.so+0x90'] };
    const first = await post(report({ signature }), { config: { ...config, triageSecret: null } });
    gh.setState(first.body.issueNumber, 'closed', 'completed');
    await sync(new Date());
    const next = await post(report({ signature, description: 'מידע שמחייב פתיחה' }));
    const opened = manual ? await forcePublishReport(next.body.reportId, deps())
      : await applyTriageDecision(next.body.reportId, decision({ action: 'open', verdict: 'needs_human' }), deps());
    assert.notEqual(opened.body.issueNumber, first.body.issueNumber);
    assert.equal(gh.issues.get(opened.body.issueNumber).state, 'open');
    assert.equal((await AppReport.findOne({ reportId: next.body.reportId }).lean()).suppressedAfterClose, false);
  }
});

test('פענוח בתגובה ה-101 אינו מוכפל בניסיון חוזר אחרי כשל שיוך', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.deadline': new Date(Date.now() - 1000) } });
  await sync(new Date());
  const issue = (await getTriageStatus(body.reportId)).issueNumber;
  for (let i = 0; i < 100; i++) gh.comments.push({ id: i + 1, issue, body: `תגובה ${i}`, created_at: new Date().toISOString() });
  const failAssign = (url, init = {}) => String(url).includes('/assignees')
    ? Promise.resolve(new Response('{}', { status: 502 })) : fetchImpl(url, init);
  await applyTriageDecision(body.reportId, decision({ action: 'open', verdict: 'needs_human' }), deps({ fetchImpl: failAssign }));
  assert.equal(gh.comments.length, 101);
  await sync(new Date());
  assert.equal(gh.comments.length, 101);
  assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).triage.followUp.status, 'done');
});

test('חידוש משלוח שכבר נרשם בהיסטוריה אינו שולח את המייל שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { body } = await post(report());
  await applyTriageDecision(body.reportId, decision({ questions: ['מתי?'], awaitingReply: true }), deps());
  await AppReport.updateOne({ reportId: body.reportId }, { $set: { 'triage.questionsPending': true } });
  await sync(new Date());
  assert.equal(contactMails.length, 1);
  assert.equal((await AppReport.findOne({ reportId: body.reportId }).lean()).contactLog.length, 1);
  await requestRetriage(body.reportId, deps());
  const doc = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.equal(doc.triage.questionsPending, false);
  assert.equal(doc.triage.questionsSentAt, null);
  assert.equal(doc.triage.questionsLeaseUntil, null);
});

test('פתיחה מפורשת מצטרפת לכרטיס שנפתח מחדש ב-GitHub גם אם המטמון עדיין סגור', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const first = await post(report(), { config: { ...config, triageSecret: null } });
  gh.setState(first.body.issueNumber, 'closed', 'completed');
  await sync(new Date());
  gh.setState(first.body.issueNumber, 'open');
  const next = await post(report({ description: 'אחרי פתיחה מחדש' }));
  const r = await applyTriageDecision(next.body.reportId, decision({ action: 'open', verdict: 'needs_human' }), deps());
  assert.equal(r.body.issueNumber, first.body.issueNumber);
  assert.equal(gh.issues.size, 1);
  assert.equal(gh.issues.get(r.body.issueNumber).state, 'open');
});

test('משלוח שאלות שחודש ב-cron לדיווח שלא נפתח ומקושר לכפילות: בלי תגובה בכרטיס של הכפילות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const orig = await post(report({ signature: { exceptionType: 'AppHang', frames: ['app.so+0xa0'] } }), { config: { ...config, triageSecret: null } });
  const { body } = await post(report());
  // ההחלטה נשמרה, אבל המשלוח נקטע לפני שהתחיל
  await applyTriageDecision(body.reportId, decision({ verdict: 'duplicate', linkIssue: orig.body.issueNumber }), deps({ sendContactMail: undefined }));
  await AppReport.updateOne({ reportId: body.reportId }, { $set: {
    'triage.questions': ['מתי?'], 'triage.questionsPending': true, 'triage.questionsLeaseUntil': null, 'triage.questionsSentAt': null,
  } });
  await sync(new Date());
  assert.equal(contactMails.length, 1);
  assert.equal(gh.comments.filter((c) => c.issue === orig.body.issueNumber).length, 0);
});
