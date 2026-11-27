/**
 * בדיקות אינטגרציה לשליחת התור הידני הישן לשירות הבדיקה (scripts/resubmit-corrections-backlog.mjs, resubmit-backlog.js):
 * הבחירה, אותו מעבר כמו "שליחה מחודשת לשירות" של מתנדב, מה שאסור לגעת בו (לקוח, מאושר, PR שנסגר / ממתין לקליטה, בלי
 * הצעה, email_only), dry-run, מרוץ בין הקריאה לכתיבה, שבת/יו"ט, הגדרות השירות, --limit/--reason/--log.
 * MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { setRuntimeFlags } from './runtime.js';
import { claimVerifyJob, submitVerifyResult } from './agent.js';
import { claimReport, releaseReport, approveReport, resubmitToService } from './volunteer.js';
import { migrateLegacyReports } from './migrate.js';
import { applyClosedPrAction } from './closed-pr.js';
import { CLOSED_PR_ACTION } from './absorption.js';
import { resubmitToServiceUpdate, WORKER_ACTOR } from './store.js';
import {
  BACKLOG_SCRIPT, EXIT, backlogFilter, parseBacklogArgs, proposalStatus, resubmitBacklog, restClosed, runResubmitBacklogCli,
} from './resubmit-backlog.js';
import { buildMockDecision } from './testing/mock-verify.js';
import { FakeGitHub } from './testing/fake-github.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const LINES = ['(א) בְּרֵאשִׁית בָּרָא אֱלֹהִים', '(ב) וְהָאָרֶץ הָיְתָה תֹהוּ', '(ג) וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', '(ד) וַיַּרְא אֱלֹהִים אֶת הָאוֹר', '(ה) וַיִּקְרָא אֱלֹהִים לָאוֹר יוֹם'];
const FILE = ['<h1>בראשית</h1>', '', ...LINES, 'סוף', ''].join('\r\n');
const fixed = (line) => `${line} [תוקן]`;

const AGENT = 'verify-1';
const PULL_ENV = {
  CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'pull', CORRECTIONS_AGENT_SECRET: 'N4vQ8r2LxT6mW1zK9pB3sD7fH5jY0cG-aE_uR2iO8tZ', CORRECTIONS_AGENT_ID: AGENT,
};
// השירות כבוי — כך נכנסו הדיווחים לתור הידני לפני שהופעל (service_disabled)
const OFF = getCorrectionsConfig({});
const PULL = getCorrectionsConfig(PULL_ENV);
const PUSH_ENV = { CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 's' };
// שלישי 15.9.2026 13:00 בירושלים — רחוק משבת ומחג (תפיסת השירות בודקת את חלונות המנוחה לפי now)
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);
const DAY = 86_400;

let gh;
let vol;
beforeEach(async () => {
  gh = new FakeGitHub({ files: { [PATH]: FILE } });
  if (!db.skip) vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
});

/** דיווח הצעת-תיקון על שורה שלמה i בקובץ. ברירת המחדל: השירות כבוי → התור הידני. */
async function ingest(id, i = 0, { config = OFF, proposed = fixed(LINES[i]), sourceFolder = 'ToratEmetToOtzaria' } = {}) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: `בראשית ${i}`, line_number: i + 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: sourceFolder,
    library_version: '27', location: { line_index: i + 2, library_build_id: '27' },
    source_hint: { source_folder: sourceFolder, library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINES[i], original_selection: null, selection_offset: null, proposed_text: proposed, context_before: '', context_after: '' },
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return String((await ErrorReport.findOne({ reportId: id }).lean())._id);
}

const load = (id) => ErrorReport.findById(id).lean();
const snap = async (id) => JSON.stringify(await load(id));
const snapAll = async () => JSON.stringify(await ErrorReport.find({}).sort({ _id: 1 }).lean());
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const agentDeps = () => ({ githubFetch: gh.fetch, random: () => 0 });
const agentClaim = (now) => claimVerifyJob({ config: PULL, agentId: AGENT, deps: agentDeps(), now });
function agentSubmit(job, body, now) {
  const text = JSON.stringify(body);
  return submitVerifyResult({ config: PULL, agentId: AGENT, jobId: job.jobId, token: job.leaseToken, raw: Buffer.from(text), body: JSON.parse(text), deps: agentDeps(), now });
}
/** הדיווח הבא בתור של השירות נבדק ומוחזר עם החלטה (התפיסה עצמה יוצרת את המשימה מה-outbox). */
async function serviceDecides(now, opts) {
  const { job } = await agentClaim(now);
  assert.ok(job, 'השירות קיבל משימה');
  const res = await agentSubmit(job, buildMockDecision(job.request, opts), new Date(now.getTime() + 5000));
  assert.equal(res.ok, true, JSON.stringify(res));
  return job;
}

async function claimedBy(id, now = T0) {
  const c = await claimReport({ user: vol, id, config: PULL, now });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body.generation;
}

/** מתנדב מאשר (הפרסום כבוי → publish.status=ready). */
async function approvedBy(id, now = T0) {
  const generation = await claimedBy(id, now);
  const ap = await approveReport({ user: vol, id, generation, config: PULL, deps: { githubFetch: gh.fetch }, now });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  return load(id);
}

/** כמו המפרסם: PR נפתח למה שאושר. */
async function withOpenPr(id, prNumber) {
  await approvedBy(id);
  await ErrorReport.updateOne({ _id: id }, { $set: { 'publish.status': 'pr_opened', 'publish.prNumber': prNumber, 'publish.prUrl': `https://github.com/Otzaria/otzaria-library/pull/${prNumber}` } });
  return load(id);
}

/** הסקריפט בתוך התהליך: שער השבת, ההגדרות והפלט מוזרקים. */
async function cli(args, { env = PULL_ENV, closed = () => false, ...deps } = {}) {
  const out = [];
  const err = [];
  let connects = 0;
  const code = await runResubmitBacklogCli(args, {
    env, isRestClosed: closed, out: (s) => out.push(String(s)), err: (s) => err.push(String(s)),
    connect: async () => { connects += 1; }, disconnect: async () => {}, ...deps,
  });
  const json = out.find((s) => s.startsWith('{'));
  return { code, out: out.join('\n'), err: err.join('\n'), summary: json ? JSON.parse(json) : null, connects };
}

// ---------------------------------------------------------------- המעבר עצמו

test('תור ישן: דיווח פנוי נשלח לשירות באותו מעבר כמו שליחה מחודשת של מתנדב, generation+1, ביומן; התפיסה הבאה של השירות מקבלת אותו בלי אצווה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const viaVolunteer = await ingest('vol', 0);
  const viaScript = await ingest('script', 1);
  const before1 = await load(viaScript);
  assert.deepEqual([before1.manual.status, before1.manual.handoffReason, before1.verification.status], ['queued', 'service_disabled', 'skipped_service_disabled']);

  // המסלול הקיים: מתנדב לוקח ושולח מחדש
  const g = await claimedBy(viaVolunteer);
  assert.equal((await resubmitToService({ user: vol, id: viaVolunteer, generation: g, config: PULL, now: T0 })).status, 200);

  const res = await resubmitBacklog({ config: PULL, apply: true });
  assert.deepEqual([res.candidates, res.eligible, res.selected, res.requeued, res.raced, res.errors], [1, 1, 1, 1, 0, 0], 'הדיווח שהמתנדב כבר שלח אינו בתור');
  const a = await load(viaVolunteer);
  const b = await load(viaScript);
  assert.equal(b.workflowGeneration, before1.workflowGeneration + 1);
  // כל שדה שהמעבר כותב — זהה לשני המסלולים (request_id חדש בכל אחד)
  for (const key of Object.keys(resubmitToServiceUpdate(PULL).$set)) {
    if (key === 'verification.requestId') continue;
    assert.deepEqual(get(b, key), get(a, key), key);
  }
  assert.deepEqual(
    [b.verification.status, b.verification.requestedScope, b.verification.attempts, b.dispatch.verify, b.manual.status, b.manual.handoffReason, b.approval.authority, b.publish.status, b.status],
    ['queued', PULL.verify.requestedScope, 0, true, 'none', null, 'none', 'not_ready', 'pending'],
  );
  assert.match(b.verification.requestId, /^req_[0-9a-f]{32}$/);
  assert.notEqual(b.verification.requestId, a.verification.requestId);
  const ev = await CorrectionEvent.findOne({ report: viaScript, type: 'resubmitted_to_service' }).lean();
  assert.deepEqual([ev.actorKind, ev.actorId, ev.actorName, ev.generation], ['system', null, null, b.workflowGeneration]);
  assert.deepEqual(ev.data, {
    requestId: b.verification.requestId, script: BACKLOG_SCRIPT, fromGeneration: before1.workflowGeneration, handoffReason: 'service_disabled',
    manualStatus: 'queued', verificationStatus: 'skipped_service_disabled',
  });
  assert.equal((await CorrectionEvent.findOne({ report: viaVolunteer, type: 'resubmitted_to_service' }).lean()).actorKind, 'user');

  // אין אצווה: תפיסת השירות יוצרת את המשימות מה-outbox ומוסרת את הבקשה החדשה
  assert.equal(await CorrectionJob.countDocuments(), 0);
  const first = await agentClaim(at(1));
  const second = await agentClaim(at(2));
  const byReport = new Map([first.job, second.job].map((j) => [j.request.report_id, j.request]));
  assert.equal(byReport.get(viaScript)?.request_id, b.verification.requestId, 'השירות קיבל את הבקשה של הסקריפט');
  assert.equal(byReport.get(viaVolunteer)?.request_id, a.verification.requestId);
  const job = await CorrectionJob.findOne({ report: viaScript }).lean();
  assert.deepEqual([job.generation, job.requestId, job.status], [b.workflowGeneration, b.verification.requestId, 'leased']);
  assert.equal((await load(viaScript)).verification.status, 'in_progress');

  // הרצה חוזרת: הדיווח כבר בדרך לשירות — לא נבחר שוב
  const again = await resubmitBacklog({ config: PULL, apply: true });
  assert.deepEqual([again.candidates, again.requeued], [0, 0]);
});

test('תור ישן: לא נוגעים במה שאינו פנוי ולא-מאושר — לקוח, אושר (מתנדב או השירות), PR ממתין לקליטה או שנסגר, בלי הצעה, שינוי מבני, email_only, כבר בשירות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const ids = {};
  // אישור טכני של השירות חוזר לתור הידני עם approval.authority=service (needs_content_review)
  ids.serviceApproved = await ingest('svc-approved', 0, { config: PULL });
  await serviceDecides(at(1), { decision: 'approved', scope: 'technical_only' });
  // בבדיקה כעת: נתפס ע"י השירות ועוד לא ענה; וממתין בתור של השירות
  ids.inService = await ingest('in-service', 1, { config: PULL });
  assert.ok((await agentClaim(at(2))).job);
  ids.queuedForService = await ingest('queued-for-service', 2, { config: PULL });

  ids.claimed = await ingest('claimed', 0);
  await claimedBy(ids.claimed);
  ids.claimExpired = await ingest('claim-expired', 1);
  await claimedBy(ids.claimExpired, new Date(T0.getTime() - 30 * DAY * 1000));
  ids.approved = await ingest('approved', 2);
  await approvedBy(ids.approved);
  // PR שנסגר בלי מיזוג: ממתין לקליטה ב-main, או הועבר לידני (נכשל, עם האישור)
  ids.awaiting = await ingest('awaiting', 3);
  const r1 = await withOpenPr(ids.awaiting, 41);
  assert.equal(await applyClosedPrAction(r1, CLOSED_PR_ACTION.AWAIT, null, { now: T0, closedAt: T0, graceSeconds: PULL.publish.absorptionGraceSeconds, actor: WORKER_ACTOR }), 'awaiting');
  ids.prClosed = await ingest('pr-closed', 4);
  const r2 = await withOpenPr(ids.prClosed, 42);
  assert.equal(await applyClosedPrAction(r2, CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED, null, { now: T0, closedAt: T0, graceSeconds: PULL.publish.absorptionGraceSeconds, actor: WORKER_ACTOR }), 'handoff');
  // נתון חריג: PR שנסגר בלי אישור — כשל הפרסום לבדו מספיק כדי שלא ייגע
  ids.prClosedNoApproval = await ingest('pr-closed-no-approval', 0);
  const r3 = await withOpenPr(ids.prClosedNoApproval, 43);
  assert.equal(await applyClosedPrAction(r3, CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED, null, { now: T0, closedAt: T0, graceSeconds: PULL.publish.absorptionGraceSeconds, actor: WORKER_ACTOR }), 'handoff');
  await ErrorReport.updateOne({ _id: ids.prClosedNoApproval }, { $set: { 'approval.authority': 'none', 'approval.scope': 'none' } });

  // בלי הצעה: דיווח ישן (migration), והצעה בלי טקסט מוצע
  await ErrorReport.collection.insertOne({
    reportId: 'legacy-1', senderEmail: 'r@example.org', subject: 'ש', bookTitle: 'בראשית', currentRef: 'בראשית א', lineNumber: 1, selectedText: 'ב',
    errorDetails: 'ש', contextText: '', filePath: 'אוצריא/תנך/תורה/בראשית.txt', sourceFolder: 'ToratEmetToOtzaria', status: 'pending', createdAt: T0, updatedAt: T0,
  });
  await migrateLegacyReports({ apply: true });
  ids.legacy = String((await ErrorReport.findOne({ reportId: 'legacy-1' }).lean())._id);
  ids.noProposedText = await ingest('no-proposed-text', 1);
  await ErrorReport.updateOne({ _id: ids.noProposedText }, { $set: { 'proposals.0.proposedText': null } });
  // שינוי מבני: גם בקליטה אינו נשלח לשירות
  ids.structural = await ingest('structural', 2, { proposed: `${LINES[2]}\nשורה חדשה` });
  // email_only — גם כשנשאר עליו (בטעות) סימון של תור ידני
  ids.emailOnly = await ingest('email-only', 3, { sourceFolder: 'Sefaria' });
  await ErrorReport.updateOne({ _id: ids.emailOnly }, { $set: { 'manual.status': 'queued', 'manual.handoffReason': 'service_disabled' } });
  // נתונים חריגים: בתור הידני וגם "בבדיקה" / עם outbox פתוח — כבר בדרך לשירות
  ids.verifyingInQueue = await ingest('verifying-in-queue', 4);
  await ErrorReport.updateOne({ _id: ids.verifyingInQueue }, { $set: { 'verification.status': 'in_progress' } });
  ids.outboxInQueue = await ingest('outbox-in-queue', 4);
  await ErrorReport.updateOne({ _id: ids.outboxInQueue }, { $set: { 'dispatch.verify': true } });

  const control = await ingest('control', 4);
  const s = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await snap(id)])));
  assert.equal((await load(ids.legacy)).state, 'open');
  assert.equal((await load(ids.structural)).manual.handoffReason, 'structural_change');
  assert.equal((await load(ids.emailOnly)).state, 'email_only');
  assert.deepEqual([(await load(ids.serviceApproved)).manual.status, (await load(ids.serviceApproved)).approval.authority], ['queued', 'service']);
  assert.deepEqual([(await load(ids.awaiting)).publish.status, Boolean((await load(ids.awaiting)).publish.prClosedAt)], ['pr_opened', true]);
  assert.deepEqual([(await load(ids.prClosed)).publish.status, (await load(ids.prClosed)).manual.status, (await load(ids.prClosed)).manual.handoffReason], ['failed', 'queued', 'pr_closed_not_absorbed']);

  const res = await resubmitBacklog({ config: PULL, apply: true });
  assert.deepEqual([res.candidates, res.skipped, res.eligible, res.requeued], [4, { noProposal: 2, structuralChange: 1 }, 1, 1]);
  assert.equal((await load(control)).verification.status, 'queued');
  for (const [k, id] of Object.entries(ids)) assert.equal(await snap(id), s[k], `${k}: לא נגעו בו`);
  assert.equal(await CorrectionEvent.countDocuments({ type: 'resubmitted_to_service' }), 1);
});

test('תור ישן: dry-run אינו כותב — ספירות לפי סיבה ומצב בדיקה, ומזהים לדוגמה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await ingest('a', 0);
  const b = await ingest('b', 1);
  const c = await ingest('c', 2);
  await releaseReport({ user: vol, id: c, generation: await claimedBy(c), now: T0 });
  const n = await ingest('n', 3, { config: PULL });
  await serviceDecides(at(1), { decision: 'needs_review', reasonCode: 'content_doubtful' });
  assert.deepEqual([(await load(n)).manual.handoffReason, (await load(n)).approval.authority], ['needs_review', 'none']);

  const before1 = await snapAll();
  const events = await CorrectionEvent.countDocuments();
  const jobs = await CorrectionJob.countDocuments();
  const dry = await resubmitBacklog({ config: PULL });
  assert.equal(await snapAll(), before1, 'dry-run אינו כותב');
  assert.equal(await CorrectionEvent.countDocuments(), events);
  assert.equal(await CorrectionJob.countDocuments(), jobs);
  assert.deepEqual([dry.apply, dry.candidates, dry.eligible, dry.selected, dry.requeued], [false, 4, 4, 4, 0]);
  assert.deepEqual(dry.byHandoffReason, { service_disabled: 2, volunteer_released: 1, needs_review: 1 });
  assert.deepEqual(dry.byVerificationStatus, { skipped_service_disabled: 3, completed: 1 });
  assert.deepEqual(dry.sampleIds, [a, b, c, n], 'הוותיקים קודם');

  // וגם דרך הסקריפט: הפלט, בלי כתיבה, וקוד 0
  const run = await cli(['--log', '/nonexistent-dir/x.jsonl']);
  assert.equal(run.code, EXIT.OK, run.err);
  assert.equal(run.summary.apply, false);
  assert.equal(run.summary.applyAllowed, true);
  assert.deepEqual(run.summary.byHandoffReason, dry.byHandoffReason);
  assert.match(run.out, /dry-run/);
  assert.match(run.out, /--log נכתב רק עם --apply/);
  assert.equal(await snapAll(), before1);
});

test('תור ישן: דיווח שהשתנה בין הקריאה לכתיבה — לקיחה, שיוך בלי generation, generation חדש, או הצעה אחרת — אינו נכתב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const claimedMeanwhile = await ingest('race-claim', 0);
  const assignedNoGen = await ingest('race-assign', 1);
  const bumped = await ingest('race-gen', 2);
  const newRevision = await ingest('race-revision', 4);
  const untouched = await ingest('race-none', 3);
  const after1 = {};
  const hooks = {
    beforeWrite: async (r) => {
      const id = String(r._id);
      if (id === claimedMeanwhile) await claimedBy(id);
      else if (id === assignedNoGen) await ErrorReport.updateOne({ _id: id }, { $set: { 'manual.assignee': vol._id, 'manual.assigneeName': vol.name } });
      else if (id === bumped) await ErrorReport.updateOne({ _id: id }, { $inc: { workflowGeneration: 1 } });
      // הגרסה הנוכחית התחלפה (בלי generation) לגרסה בלי טקסט מוצע: מה שנבדק בקריאה כבר אינו מה שיישלח
      else if (id === newRevision) {
        await ErrorReport.updateOne({ _id: id }, {
          $push: { proposals: { revision: 2, author: 'volunteer', originalLine: LINES[4], proposedText: null } }, $set: { currentRevision: 2 },
        });
      }
      if (id !== untouched) after1[id] = await snap(id);
    },
  };
  const res = await resubmitBacklog({ config: PULL, apply: true, hooks });
  assert.deepEqual([res.selected, res.raced, res.requeued], [5, 4, 1]);
  for (const [id, s] of Object.entries(after1)) assert.equal(await snap(id), s, 'המצב שאחרי השינוי נשאר');
  assert.equal((await load(claimedMeanwhile)).manual.status, 'claimed');
  assert.equal((await load(untouched)).verification.status, 'queued');
  assert.deepEqual((await CorrectionEvent.find({ type: 'resubmitted_to_service' }).lean()).map((e) => String(e.report)), [untouched]);
});

// ---------------------------------------------------------------- הסקריפט: סירובים ואפשרויות

test('תור ישן: שבת/יו"ט — סירוב לפני כל גישה למסד (גם dry-run); חלון שמתחיל באמצע ההרצה עוצר אותה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = await ingest('sh-a', 0);
  const b = await ingest('sh-b', 1);
  const before1 = await snapAll();
  let loads = 0;
  for (const args of [[], ['--apply']]) {
    const run = await cli(args, { closed: () => true, loadConfig: async () => { loads += 1; return PULL; } });
    assert.equal(run.code, EXIT.REFUSED);
    assert.match(run.err, /שבת\/יום טוב/);
    assert.equal(run.connects, 0, 'אין חיבור למסד');
    assert.equal(run.summary, null);
  }
  assert.equal(loads, 0);
  // שער שזורק — סגור
  assert.equal((await cli(['--apply'], { closed: () => { throw new Error('boom'); } })).code, EXIT.REFUSED);
  assert.equal(await snapAll(), before1);

  // פתוח בהתחלה, נסגר אחרי הכתיבה הראשונה
  let checks = 0;
  const run = await cli(['--apply'], { closed: () => ++checks > 2 });
  assert.equal(run.code, EXIT.REFUSED);
  assert.equal(run.summary.requeued, 1);
  assert.equal(run.summary.stoppedForShabbat, true);
  assert.match(run.err, /ההרצה נעצרה/);
  assert.equal((await load(a)).verification.status, 'queued');
  assert.equal((await load(b)).manual.status, 'queued', 'השני לא נשלח');
});

test('שער השבת של הסקריפט: חלונות המנוחה (אופליין, נכשלים-סגור) או Hebcal של האתר — כל אחד מהם סוגר', async () => {
  let hebcalCalls = 0;
  const hebcal = (value) => ({ isAssurBemlacha: async () => { hebcalCalls += 1; if (value instanceof Error) throw value; return value; } });
  // שבת 28.11.2026 12:00 בירושלים — בתוך החלון; ההחלטה בלי Hebcal
  assert.equal(await restClosed({ now: new Date('2026-11-28T10:00:00Z'), hebcal: hebcal(false) }), true);
  assert.equal(hebcalCalls, 0);
  assert.equal(await restClosed({ now: T0, hebcal: hebcal(false) }), false, 'יום שלישי');
  assert.equal(await restClosed({ now: T0, hebcal: hebcal(true) }), true, 'Hebcal: אסור במלאכה');
  assert.equal(await restClosed({ now: T0, hebcal: hebcal(new Error('down')) }), true);
  assert.equal(await restClosed({ now: T0, gate: () => ({ closed: true, retryAfter: 60 }), hebcal: hebcal(false) }), true);
});

test('תור ישן: --apply מסרב כששירות הבדיקה כבוי, מושהה או במצב דחיפה; dry-run רץ ומזהיר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ingest('cfg', 0);
  const before1 = await snapAll();
  const disabled = await cli(['--apply'], { env: {} });
  assert.equal(disabled.code, EXIT.REFUSED);
  assert.match(disabled.err, /--apply סורב: שירות הבדיקה אינו פעיל \(service_disabled/);
  const push = await cli(['--apply'], { env: PUSH_ENV });
  assert.equal(push.code, EXIT.REFUSED);
  assert.match(push.err, /אינו במצב משיכה \(CORRECTIONS_VERIFY_TRANSPORT=push\)/);
  // ההשהיה ממסך הניהול נקראת דרך טוען ההגדרות של האתר (SystemConfig)
  await setRuntimeFlags({ verifyPaused: true });
  const paused = await cli(['--apply'], { env: PULL_ENV });
  assert.equal(paused.code, EXIT.REFUSED);
  assert.match(paused.err, /service_paused/);
  for (const r of [disabled, push, paused]) assert.equal(r.summary, null);
  assert.equal(await snapAll(), before1, 'סירוב אינו כותב');

  const dry = await cli([], { env: PULL_ENV });
  assert.equal(dry.code, EXIT.OK);
  assert.deepEqual([dry.summary.applyAllowed, dry.summary.verify.enabled, dry.summary.verify.disabledReason, dry.summary.selected], [false, false, 'service_paused', 1]);
  assert.match(dry.err, /אזהרה: --apply יסורב כעת/);
  await setRuntimeFlags({ verifyPaused: false });
  const ok = await cli(['--apply'], { env: PULL_ENV });
  assert.equal(ok.code, EXIT.OK, ok.err);
  assert.equal(ok.summary.requeued, 1);
  assert.match(ok.out, /אין צורך להריץ אצווה/);
});

test('תור ישן: --reason (אפשר כמה פעמים), --limit (הוותיקים קודם) ו---log (שורה לכל דיווח שנשלח)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const old1 = await ingest('l-1', 0);
  const old2 = await ingest('l-2', 1);
  const released = await ingest('l-rel', 2);
  await releaseReport({ user: vol, id: released, generation: await claimedBy(released), now: T0 });
  const review = await ingest('l-review', 3, { config: PULL });
  await serviceDecides(at(1), { decision: 'needs_review', reasonCode: 'content_doubtful' });
  const dir = mkdtempSync(path.join(tmpdir(), 'resubmit-backlog-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'applied.jsonl');

  const rel = await cli(['--apply', '--reason', 'volunteer_released', '--log', log]);
  assert.equal(rel.code, EXIT.OK, rel.err);
  assert.deepEqual([rel.summary.selected, rel.summary.requeued, rel.summary.filters], [1, 1, { reasons: ['volunteer_released'], limit: null }]);
  const r = await load(released);
  assert.equal(r.verification.status, 'queued');
  const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  const { at: when, ...line } = lines[0];
  assert.deepEqual(line, { id: released, fromGeneration: r.workflowGeneration - 1, toGeneration: r.workflowGeneration, handoffReason: 'volunteer_released', requestId: r.verification.requestId });
  assert.ok(!Number.isNaN(Date.parse(when)));
  assert.match(rel.out, /יומן: .*\(1 שורות\)/);

  const one = await cli(['--apply', '--limit=1', '--reason=service_disabled', '--log', log]);
  assert.equal(one.code, EXIT.OK, one.err);
  assert.deepEqual([one.summary.eligible, one.summary.selected, one.summary.requeued], [2, 1, 1]);
  assert.deepEqual([(await load(old1)).verification.status, (await load(old2)).verification.status], ['queued', 'skipped_service_disabled'], 'הוותיק קודם');
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 2, 'היומן נפתח להוספה');

  const rest = await cli(['--apply', '--reason', 'service_disabled', '--reason', 'needs_review', '--reason', 'service_disabled']);
  assert.deepEqual([rest.summary.filters.reasons, rest.summary.requeued], [['service_disabled', 'needs_review'], 2]);
  assert.equal((await load(review)).verification.status, 'queued');
  assert.equal((await cli(['--apply'])).summary.selected, 0, 'הכל כבר נשלח');

  // סיבה לא מוכרת — אזהרה בלבד; יומן שלא נפתח — סירוב לפני כל כתיבה
  const other = await ingest('l-3', 4);
  const unknown = await cli(['--reason', 'no_such_reason']);
  assert.match(unknown.err, /אינה סיבת העברה מוכרת/);
  assert.equal(unknown.summary.selected, 0);
  const badLog = await cli(['--apply', '--log', path.join(dir, 'missing', 'x.jsonl')]);
  assert.equal(badLog.code, EXIT.USAGE);
  assert.equal((await load(other)).verification.status, 'skipped_service_disabled');
});

test('ארגומנטים: ערכים חוקיים ושגויים; הסקריפט עצמו יוצא ב-2 לפני כל גישה למסד', () => {
  assert.deepEqual(parseBacklogArgs([]), { apply: false, limit: null, reasons: [], logPath: null, help: false });
  assert.deepEqual(parseBacklogArgs(['--apply', '--limit', '20', '--reason', 'service_disabled', '--reason=agent_not_configured', '--log=/tmp/x.jsonl']), {
    apply: true, limit: 20, reasons: ['service_disabled', 'agent_not_configured'], logPath: '/tmp/x.jsonl', help: false,
  });
  for (const bad of [['--limit', '0'], ['--limit', 'abc'], ['--limit'], ['--limit', '-3'], ['--reason'], ['--reason', '--apply'], ['--reason', 'Bad!'], ['--log'], ['--log', '--apply'], ['--apply=1'], ['--bogus'], ['extra']]) {
    assert.ok(parseBacklogArgs(bad).error, JSON.stringify(bad));
  }
  assert.equal(parseBacklogArgs(['-h']).help, true);

  const script = fileURLToPath(new URL('../../../scripts/resubmit-corrections-backlog.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, ...args], {
    encoding: 'utf8', cwd: fileURLToPath(new URL('../../../', import.meta.url)), timeout: 60_000,
    // כתובת שאינה קיימת: ארגומנט שגוי נדחה לפני חיבור
    env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:9/never' },
  });
  const bad = run('--limit', '0');
  assert.equal(bad.status, EXIT.USAGE, bad.stderr);
  assert.match(bad.stderr, /--limit/);
  assert.match(bad.stderr, /שימוש:/);
  const help = run('--help');
  assert.equal(help.status, EXIT.OK, help.stderr);
  assert.match(help.stdout, /--reason/);
});

test('תנאי הבחירה: מסנן המסד והבדיקה של ההצעה', () => {
  const f = backlogFilter();
  assert.deepEqual(f['manual.status'], { $in: ['queued', 'released'] });
  assert.equal(f['manual.assignee'], null);
  assert.equal(f['approval.authority'], 'none');
  assert.deepEqual(f['publish.status'].$nin.sort(), ['failed', 'in_progress', 'pr_opened', 'ready', 'unknown_needs_reconcile']);
  assert.equal('manual.handoffReason' in f, false);
  assert.deepEqual(backlogFilter({ reasons: ['a'] })['manual.handoffReason'], { $in: ['a'] });
  const rev = (p) => ({ currentRevision: 1, proposals: [{ revision: 1, originalSelection: null, contextBefore: '', contextAfter: '', ...p }] });
  assert.equal(proposalStatus(rev({ proposedText: 'שורה' })), 'ok');
  assert.equal(proposalStatus(rev({ proposedText: null })), 'no_proposal');
  assert.equal(proposalStatus(rev({ proposedText: 'א\nב' })), 'structural_change');
  assert.equal(proposalStatus(rev({ proposedText: 'ב', originalSelection: 'א', contextBefore: 'x\r', contextAfter: '' })), 'structural_change');
  assert.equal(proposalStatus({ currentRevision: 0 }), 'no_proposal');
  assert.equal(proposalStatus({ currentRevision: 2, proposals: [{ revision: 1, proposedText: 'x' }] }), 'no_proposal', 'הגרסה הנוכחית חסרה');
});
