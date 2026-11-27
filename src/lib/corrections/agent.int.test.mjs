/**
 * בדיקות אינטגרציה של מצב המשיכה (CONTRACT §3.7): תפיסה, lease ודופק, מסירת תוצאה וכל מסלולי
 * הניתוב, תשובה מאוחרת/ישנה, מונה פקיעות, מטאטא, דדליין שאינו נספר בשבת, וסגירת "כבר הוחל" מדויק —
 * מול MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import ChangePackage from '../../models/ChangePackage.js';
import CorrectionsAgentState from '../../models/CorrectionsAgentState.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runWorkerBatch, dispatchOutbox, dispatchVerifyOutbox, sweepExpiredVerifyJobs } from './worker.js';
import { claimVerifyJob, heartbeatVerifyJob, submitVerifyResult, releaseVerifyJob, recordAgentSeen } from './agent.js';
import { buildVerifyRequest } from './verify-protocol.js';
import { currentRevisionOf } from './store.js';
import { claimReport, resubmitToService, reassignReport, releaseReport } from './volunteer.js';
import { hashLeaseToken } from '../servicePlugins/workerAuth.js';
import { computeHealth } from './health.js';
import { FakeGitHub } from './testing/fake-github.js';
import { createMockVerifyFetch, buildMockDecision } from './testing/mock-verify.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';
const FILE = `<h1>בראשית</h1>\r\n\r\n${LINE}\r\nסוף\r\n`;
const SEL = 'אֱלֹהִ֑ים';
const START = LINE.indexOf(SEL);

const AGENT = 'verify-1';
const PULL_ENV = {
  CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'pull', CORRECTIONS_AGENT_SECRET: 'N4vQ8r2LxT6mW1zK9pB3sD7fH5jY0cG-aE_uR2iO8tZ', CORRECTIONS_AGENT_ID: AGENT,
};
const FULL_ENV = { DICTA_LIBRARY_GITHUB_TOKEN: 't', CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content' };
const pull = (over = {}, runtime = {}) => getCorrectionsConfig({ ...PULL_ENV, ...over }, runtime);

// שלישי 15.9.2026 13:00 בירושלים — רחוק משבת ומחג, כך שהדדליין במשיכה = 24 שעות שעון.
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);

let gh;
beforeEach(() => { gh = new FakeGitHub({ files: { [PATH]: FILE } }); });

async function ingest(id, config, over = {}) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: 'בראשית א', line_number: 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length }, proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '' },
    ...over,
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return ErrorReport.findOne({ reportId: id }).lean();
}

const load = (id) => ErrorReport.findById(id).lean();
const deps = () => ({ githubFetch: gh.fetch, random: () => 0 });
const claim = (config, now = T0) => claimVerifyJob({ config, agentId: AGENT, deps: deps(), now });
const beat = (config, job, now, token = job.leaseToken) => heartbeatVerifyJob({ config, jobId: job.jobId, token, now });
// הגוף עובר JSON כמו ברשת; raw הוא מה שה-sha256 של השליחה החוזרת מחושב עליו.
function submit(config, job, body, now, token = job.leaseToken) {
  const text = JSON.stringify(body);
  return submitVerifyResult({ config, jobId: job.jobId, token, raw: Buffer.from(text), body: JSON.parse(text), deps: deps(), now });
}
const decide = (job, opts) => buildMockDecision(job.request, opts);
const idle = ({ job, retryAfter }) => ({ job, retryAfter });

test('משיכה: תפיסה מחזירה את בקשת חוזה B בדיוק, עם lease; אין עוד עבודה → 204; האצווה לא פונה ב-HTTP', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-claim', c);
  assert.equal(r.verification.status, 'queued');
  const verify = createMockVerifyFetch(() => { throw new Error('אין קריאות HTTP במשיכה'); });
  const stats = await runWorkerBatch({ config: c, workerId: 'w', deps: { ...deps(), verifyFetch: verify }, now: T0 });
  assert.equal(stats.dispatched, 1);
  assert.deepEqual(stats.verify, []);
  assert.equal(verify.calls.length, 0);
  assert.equal((await CorrectionJob.findOne({ report: r._id }).lean()).status, 'pending', 'האצווה אינה תופסת משימות בדיקה במשיכה');

  const got = await claim(c, at(1));
  assert.ok(got.job);
  assert.match(got.job.jobId, /^[a-f0-9]{24}$/);
  assert.match(got.job.leaseToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(got.job.leaseExpiresAt.getTime(), at(1).getTime() + 600_000);
  // אותה בקשה בדיוק שהדחיפה הייתה שולחת: אותו builder, אותו מקור, diff מאותו blob.
  const job = await CorrectionJob.findById(got.job.jobId).lean();
  const report = await load(r._id);
  assert.deepEqual(got.job.request, buildVerifyRequest({
    report, revision: currentRevisionOf(report), requestId: job.requestId, requestedScope: report.verification.requestedScope, source: report.resolvedSource,
  }));
  assert.equal(got.job.request.request_id, r.verification.requestId);
  assert.equal(got.job.request.source.blob_sha, gh.fileSha('main', PATH));
  assert.deepEqual(got.job.request.diff.hunk.removed, [LINE]);
  assert.deepEqual(got.job.request.diff.hunk.added, [NEW]);
  // האסימון עצמו אינו נשמר — רק hash שלו.
  assert.equal(job.status, 'leased');
  assert.equal(job.leaseOwner, AGENT);
  assert.equal(job.leaseTokenHash, hashLeaseToken(got.job.leaseToken));
  assert.equal(JSON.stringify(job).includes(got.job.leaseToken), false);
  assert.equal(report.verification.status, 'in_progress');
  assert.ok(await CorrectionEvent.exists({ report: r._id, type: 'verify_claimed' }));

  const none = await claim(c, at(2));
  assert.deepEqual(idle(none), { job: null, retryAfter: 60 });
  const paused = await claim(pull({}, { verifyPaused: true }), at(3));
  assert.deepEqual(idle(paused), { job: null, retryAfter: 300 });
});

test('משיכה: התפיסה יוצרת משימות מה-outbox בעצמה (בלי cron) ונותנת את הוותיקה קודם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const a = await ingest('p-old', c);
  const b = await ingest('p-new', c);
  assert.equal(await CorrectionJob.countDocuments({}), 0);
  const first = await claim(c, T0);
  const second = await claim(c, at(1));
  assert.equal(first.job.request.report_id, String(a._id));
  assert.equal(second.job.request.report_id, String(b._id));
  assert.equal((await claim(c, at(2))).job, null);
});

test('משיכה: דופק מאריך lease רק עם האסימון הנכון; אסימון שגוי/פגום → 409; מזהה לא מוכר → 404; פקיעה → 409', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  await ingest('p-beat', c);
  const { job } = await claim(c, T0);
  const ok = await beat(c, job, at(300));
  assert.deepEqual(ok, { ok: true, cancelled: false, leaseExpiresAt: at(900) });
  assert.equal((await CorrectionJob.findById(job.jobId).lean()).leaseExpiresAt.getTime(), at(900).getTime());
  assert.equal((await beat(c, job, at(301), 'x'.repeat(43))).code, 'lease_invalid');
  assert.equal((await beat(c, job, at(301), 'short')).code, 'lease_invalid');
  assert.equal((await beat(c, job, at(301), null)).status, 409);
  assert.equal((await heartbeatVerifyJob({ config: c, jobId: 'f'.repeat(24), token: job.leaseToken, now: at(301) })).status, 404);
  assert.equal((await heartbeatVerifyJob({ config: c, jobId: '../x', token: job.leaseToken, now: at(301) })).status, 404);
  const late = await beat(c, job, at(901));
  assert.deepEqual([late.status, late.code], [409, 'lease_expired']);
});

test('משיכה: מתנדב לוקח באמצע הבדיקה → הדופק מחזיר cancelled, והתוצאה נדחית ב-409 ונשמרת לתיעוד בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
  const r = await ingest('p-vol', c);
  const { job } = await claim(c, T0);
  assert.equal((await claimReport({ user: vol, id: String(r._id), config: c, now: at(10) })).status, 200);
  assert.deepEqual(await beat(c, job, at(20)), { ok: true, cancelled: true, leaseExpiresAt: null });
  const body = decide(job, { scope: 'technical_and_content' });
  const res = await submit(c, job, body, at(30));
  assert.deepEqual([res.status, res.code], [409, 'lease_invalid']);
  const s = await load(r._id);
  assert.equal(s.manual.status, 'claimed');
  assert.equal(s.approval.authority, 'none');
  assert.equal(s.publish.status, 'not_ready');
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].stale, true);
  // שליחה חוזרת של אותה החלטה מאוחרת לא נרשמת פעמיים
  assert.equal((await submit(c, job, body, at(31))).code, 'lease_invalid');
  assert.equal((await load(r._id)).decisions.length, 1);
});

test('משיכה: כל החלטות השירות מנותבות כמו בדחיפה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const cases = [
    { name: 'technical_only', env: {}, opts: { scope: 'technical_only' }, outcome: 'manual', handoff: 'needs_content_review' },
    { name: 'מלא + פרסום אוטומטי', env: FULL_ENV, runtime: { publishMode: 'pr', autoPublish: true }, opts: { scope: 'technical_and_content' }, outcome: 'publish' },
    { name: 'מלא בלי פרסום אוטומטי', env: FULL_ENV, runtime: { publishMode: 'pr' }, opts: { scope: 'technical_and_content' }, outcome: 'manual', handoff: 'auto_publish_not_permitted' },
    { name: 'needs_review', env: {}, opts: { decision: 'needs_review', reasonCode: 'content_doubtful' }, outcome: 'manual', handoff: 'needs_review' },
    { name: 'conflict', env: {}, opts: { decision: 'conflict', reasonCode: 'source_changed' }, outcome: 'manual', handoff: 'service_conflict' },
    { name: 'rejected בלי דחייה אוטומטית', env: {}, opts: { decision: 'rejected', reasonCode: 'content_wrong' }, outcome: 'manual', handoff: 'manual_reject_review' },
    { name: 'rejected עם דחייה אוטומטית', env: { CORRECTIONS_VERIFY_AUTO_REJECT: '1' }, opts: { decision: 'rejected', reasonCode: 'content_wrong' }, outcome: 'close_rejected', state: 'closed_rejected' },
    { name: 'reason_code לא מוכר', env: {}, opts: { decision: 'needs_review', reasonCode: 'weird' }, outcome: 'manual', handoff: 'unknown_reason_code' },
  ];
  for (const [i, k] of cases.entries()) {
    await db.reset();
    const c = pull(k.env, k.runtime);
    const r = await ingest(`p-route-${i}`, c);
    const { job } = await claim(c, T0);
    const res = await submit(c, job, decide(job, k.opts), at(5));
    assert.equal(res.ok, true, k.name);
    assert.equal(res.outcome, k.outcome, k.name);
    assert.equal(res.publish, k.outcome === 'publish', k.name);
    const s = await load(r._id);
    if (k.handoff) assert.equal(s.manual.handoffReason, k.handoff, k.name);
    if (k.state) assert.equal(s.state, k.state, k.name);
    assert.equal(s.verification.status, 'completed', k.name);
    const j = await CorrectionJob.findById(job.jobId).lean();
    assert.equal(j.status, 'done', k.name);
    assert.equal(j.activeKey, undefined, k.name);
  }
});

test('משיכה: אישור מלא → פרסום ב-PR באצווה הבאה; already_fixed מאומת → נסגר; evidence נסבל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const r = await ingest('p-pub', c);
  const { job } = await claim(c, T0);
  const body = { ...decide(job, { scope: 'technical_and_content' }), evidence: [{ kind: 'parallel_text', source: 'x', supports: 'fix', score: 1 }] };
  assert.equal((await submit(c, job, body, at(5))).outcome, 'publish');
  assert.equal((await load(r._id)).publish.status, 'ready');
  await runWorkerBatch({ config: c, workerId: 'w', deps: deps(), now: at(6) });
  const s = await load(r._id);
  assert.equal(s.publish.status, 'pr_opened');
  assert.equal(gh.readFile(s.publish.branch, PATH), FILE.replace(LINE, NEW));

  await db.reset();
  gh = new FakeGitHub({ files: { [PATH]: FILE } });
  const r2 = await ingest('p-fixed', c);
  const claimed = await claim(c, T0);
  gh.pushExternal('main', { [PATH]: FILE.replace(LINE, NEW) });
  const res = await submit(c, claimed.job, decide(claimed.job, { decision: 'already_fixed' }), at(5));
  assert.equal(res.outcome, 'close_already_fixed');
  assert.equal((await load(r2._id)).state, 'closed_already_fixed');
});

test('משיכה: service_capacity → המשימה חוזרת לתור בלי לצרוך ניסיון; unsupported_capability → ידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-cap', c);
  const { job } = await claim(c, T0);
  const failed = (reason) => ({ api_version: '1', request_id: job.request.request_id, processing_status: 'failed', reason_code: reason, retry_after_seconds: 120 });
  const res = await submit(c, job, failed('service_capacity'), at(5));
  assert.deepEqual([res.ok, res.outcome], [true, 'retry']);
  const j = await CorrectionJob.findById(job.jobId).lean();
  assert.equal(j.status, 'pending');
  assert.equal(j.attempts, 0, 'במשיכה אין ספירת ניסיונות ל"אין משאבים"');
  assert.ok(j.nextAttemptAt >= at(125), 'retry_after_seconds מהגוף כובד');
  assert.equal((await load(r._id)).verification.status, 'queued');
  // שליחה חוזרת של אותו גוף: אותה תשובה, בלי ניסיון נוסף
  const again = await submit(c, job, failed('service_capacity'), at(6));
  assert.deepEqual([again.outcome, again.duplicate], ['retry', true]);
  assert.equal((await CorrectionJob.findById(job.jobId).lean()).attempts, 0);

  const second = await claim(c, at(200));
  assert.equal(second.job.jobId, job.jobId, 'אותה משימה נתפסת שוב');
  const res2 = await submit(c, second.job, { ...failed('unsupported_capability'), request_id: second.job.request.request_id }, at(201));
  assert.equal(res2.outcome, 'manual');
  assert.equal((await load(r._id)).manual.handoffReason, 'unsupported_capability');
});

test('משיכה: תשובה פגומה / pending / מזהים לא תואמים → 422 והדיווח לידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const bad = [
    ['digest שגוי', (job) => { const b = decide(job); b.change.change_digest = '0'.repeat(64); return b; }, 'invalid_response', 'invalid_response'],
    ['החלטה לא מוכרת', (job) => ({ ...decide(job), decision: 'maybe' }), 'unknown_decision', 'invalid_response'],
    ['pending', (job) => ({ api_version: '1', request_id: job.request.request_id, processing_status: 'pending', job_id: 'j1' }), 'pending_not_supported', 'invalid_response'],
    ['request_id אחר', (job) => ({ ...decide(job), request_id: 'req_other' }), 'response_mismatch', 'response_mismatch'],
  ];
  for (const [i, [name, make, reason, handoff]] of bad.entries()) {
    await db.reset();
    const r = await ingest(`p-bad-${i}`, c);
    const { job } = await claim(c, T0);
    const res = await submit(c, job, make(job), at(5));
    assert.deepEqual([res.status, res.code, res.reason], [422, 'invalid_result', reason], name);
    const s = await load(r._id);
    assert.equal(s.manual.handoffReason, handoff, name);
    assert.equal(s.approval.authority, 'none', name);
  }
});

test('משיכה: generation ישן בגוף → 409, תיעוד בלבד וידני; lease שפג → 409 ונשמר כמאוחר; גוף אחר אחרי קליטה → result_conflict', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-stale', c);
  let { job } = await claim(c, T0);
  const staleBody = decide(job, { generation: job.request.workflow_generation - 1 });
  const res = await submit(c, job, staleBody, at(5));
  assert.deepEqual([res.status, res.code], [409, 'stale_generation']);
  let s = await load(r._id);
  assert.equal(s.decisions[0].stale, true);
  assert.equal(s.manual.handoffReason, 'response_mismatch');
  // אותו גוף שוב → אותה תשובה, בלי החלטה כפולה
  assert.equal((await submit(c, job, staleBody, at(6))).code, 'stale_generation');
  assert.equal((await load(r._id)).decisions.length, 1);

  await db.reset();
  const r2 = await ingest('p-expired', c);
  ({ job } = await claim(c, T0));
  const body = decide(job);
  const expired = await submit(c, job, body, at(601));
  assert.deepEqual([expired.status, expired.code], [409, 'lease_expired']);
  s = await load(r2._id);
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].stale, true);
  assert.equal(s.approval.authority, 'none');
  assert.equal(s.manual.status, 'none', 'המשימה תיתפס מחדש — לא ידני');

  await db.reset();
  const r3 = await ingest('p-dup', c);
  ({ job } = await claim(c, T0));
  const first = decide(job);
  assert.equal((await submit(c, job, first, at(5))).outcome, 'manual');
  const dup = await submit(c, job, first, at(6));
  assert.deepEqual([dup.ok, dup.outcome, dup.duplicate], [true, 'manual', true]);
  const other = await submit(c, job, decide(job, { decision: 'needs_review', reasonCode: 'content_doubtful' }), at(7));
  assert.deepEqual([other.status, other.code], [409, 'result_conflict']);
  s = await load(r3._id);
  assert.equal(s.decisions.filter((d) => !d.stale).length, 1);
  assert.equal(s.manual.handoffReason, 'needs_content_review');
});

test('משיכה: פקיעות lease נספרות; אחרי 5 → ידני עם lease_expired_repeatedly', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-crash', c);
  let now = T0;
  for (let n = 0; n < 5; n++) {
    const { job } = await claim(c, now);
    assert.ok(job, `תפיסה ${n + 1}`);
    assert.equal((await CorrectionJob.findById(job.jobId).lean()).leaseExpiries, n);
    now = new Date(now.getTime() + 601_000);
  }
  // הפקיעה החמישית: המשימה לא נמסרת שוב, הדיווח עובר לידני בסיבה נפרדת.
  assert.equal((await claim(c, now)).job, null);
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j.status, j.outcome, j.leaseExpiries], ['failed', 'lease_expired_repeatedly', 5]);
  const s = await load(r._id);
  assert.equal(s.manual.handoffReason, 'lease_expired_repeatedly');
  assert.equal(s.manual.status, 'queued');
});

test('משיכה: המטאטא מעביר לידני משימה שעבר מועדה; משימה בעבודה נשארת, והדופק שלה אחרי המועד מבטל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const waiting = await ingest('p-sweep-wait', c);
  const working = await ingest('p-sweep-work', c);
  await dispatchOutbox({ config: c, now: T0 });
  // המשימה של working נתפסת קרוב למועד ומוחזקת בדופק
  await CorrectionJob.updateOne({ report: waiting._id }, { $set: { nextAttemptAt: at(86_000) } });
  const { job } = await claim(c, at(85_900));
  assert.equal(job.request.report_id, String(working._id));
  const day = at(86_400);
  const stats = await runWorkerBatch({ config: c, workerId: 'w', deps: deps(), now: day });
  assert.equal(stats.swept, 1);
  assert.equal((await load(waiting._id)).manual.handoffReason, 'deadline_exhausted');
  assert.equal((await CorrectionJob.findById(job.jobId).lean()).status, 'leased', 'lease בתוקף — לא נלקח');
  assert.deepEqual(await beat(c, job, at(86_401)), { ok: true, cancelled: true, leaseExpiresAt: null });
  assert.equal((await load(working._id)).manual.handoffReason, 'deadline_exhausted');
  // תפיסה לעולם אינה מוסרת משימה שעבר מועדה
  assert.equal((await claim(c, at(86_500))).job, null);
});

test('משיכה: הדדליין אינו נספר בשבת — דיווח מיום שישי בבוקר אינו פג בשבת; בדחיפה ללא שינוי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // שישי 27.11.2026 10:00 בירושלים (UTC+2). חלון המנוחה: שישי 12:00 – מוצאי שבת 22:00.
  const friday = new Date('2026-11-27T08:00:00Z');
  const c = pull();
  const r = await ingest('p-shabbat', c);
  await dispatchOutbox({ config: c, now: friday });
  const job = await CorrectionJob.findOne({ report: r._id }).lean();
  // שעתיים עד 12:00 בשישי, ו-22 השעות הנותרות מ-22:00 במוצאי שבת → ראשון 20:00.
  assert.equal(job.deadlineAt.toISOString(), '2026-11-29T18:00:00.000Z');
  const motzash = new Date('2026-11-28T21:00:00Z'); // מוצאי שבת 23:00
  assert.equal(await runWorkerBatch({ config: c, workerId: 'w', deps: deps(), now: motzash }).then((s) => s.swept), 0);
  assert.equal((await load(r._id)).manual.status, 'none');
  assert.ok((await claim(c, motzash)).job, 'נמסר לבדיקה אחרי שבת');

  await db.reset();
  const push = getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 'sec' });
  const r2 = await ingest('p-shabbat-push', push);
  await dispatchOutbox({ config: push, now: friday });
  assert.equal((await CorrectionJob.findOne({ report: r2._id }).lean()).deadlineAt.getTime(), friday.getTime() + 86_400_000);
});

test('משיכה: "כבר הוחל" מדויק אינו נמסר לשירות — נסגר "כבר תוקן"; לא מדויק — ידני כמו קודם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ files: { [PATH]: FILE.replace(LINE, NEW) } });
  const c = pull();
  const r = await ingest('p-applied', c);
  assert.equal((await claim(c, T0)).job, null, 'לעולם לא נמסר לשירות');
  const s = await load(r._id);
  assert.equal(s.state, 'closed_already_fixed');
  assert.equal(s.closeReason, 'source_already_applied');
  assert.ok(await CorrectionEvent.exists({ report: r._id, type: 'closed_already_fixed' }));
  assert.equal(gh.calls.filter((x) => x.method !== 'GET').length, 0);

  await db.reset();
  gh = new FakeGitHub({ files: { [PATH]: FILE.replace(LINE, `${NEW} נוסף`) } });
  const r2 = await ingest('p-changed', c);
  assert.equal((await claim(c, T0)).job, null);
  const s2 = await load(r2._id);
  assert.equal(s2.state, 'open');
  assert.equal(s2.manual.handoffReason, 'source_changed');

  // ביקורת PR #313 (A): כותרת קצרה שחוזרת, והשגיאה זזה ולא תוקנה — לידני, לעולם לא "כבר תוקן"
  await db.reset();
  const shifted = ['<h1>ספר בדיקה</h1>', 'הקדמה 1', 'הקדמה 2', 'הקדמה 3', 'הקדמה 4', 'הקדמה 5', '<h2>סימן א</h2>', '<h3>סעיף א</h3>',
    'טקסט א-א', '<h3>סעיף ב</h3>', 'טקסט א-ב', '<h2>סימן ב</h2>', '<h3>סעיף א</h3>', 'טקסט ב-א', '<h3>סעיף ג</h3>', 'טקסט ב-ב'];
  gh = new FakeGitHub({ files: { [PATH]: `${shifted.join('\n')}\n` } });
  const r3 = await ingest('p-shifted', c, {
    location: { line_index: 9, library_build_id: '27' },
    correction: { original_line: '<h3>סעיף ג</h3>', original_selection: null, selection_offset: null, proposed_text: '<h3>סעיף ב</h3>', context_before: '', context_after: '' },
  });
  assert.equal((await claim(c, T0)).job, null);
  const s3 = await load(r3._id);
  assert.equal(s3.state, 'open');
  assert.equal(s3.manual.handoffReason, 'already_fixed_unverified');
});

test('משיכה: מקור שלא אותר → ידני ואינו נמסר; התפיסה ממשיכה למשימה הבאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const lost = await ingest('p-lost', c, { book_title: 'ספר שאינו קיים', file_path: 'אוצריא/אין/כזה.txt', source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/אין/כזה.txt' } });
  const good = await ingest('p-good', c);
  const { job } = await claim(c, T0);
  assert.equal(job.request.report_id, String(good._id));
  assert.equal((await load(lost._id)).manual.handoffReason, 'source_not_found');
});

test('בריאות: אופן ההעברה, ספירת משימות הבדיקה, והתראה כשהסוכן לא נראה ויש משימות ממתינות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  await ingest('p-health', c);
  await dispatchOutbox({ config: c, now: T0 });
  let h = await computeHealth({ config: c, now: at(10) });
  assert.equal(h.verifyAgent.transport, 'pull');
  assert.equal(h.verifyAgent.jobs.pending, 1);
  assert.ok(h.problems.includes('agent_not_seen'));
  assert.equal(h.config.verify.transport, 'pull');
  assert.equal(h.config.verify.agentId, AGENT);
  assert.equal(JSON.stringify(h).includes(PULL_ENV.CORRECTIONS_AGENT_SECRET), false, 'הסוד לא נחשף');

  await recordAgentSeen({ agentId: AGENT, route: 'POST /api/worker/v1/corrections/claim', version: '1.2.3', now: at(20) });
  await claim(c, at(20));
  h = await computeHealth({ config: c, now: at(30) });
  assert.equal(h.problems.includes('agent_not_seen'), false);
  assert.deepEqual([h.verifyAgent.agent.agentId, h.verifyAgent.agent.version, h.verifyAgent.agent.ageSeconds], [AGENT, '1.2.3', 10]);
  assert.equal(h.verifyAgent.jobs.leased, 1);
  assert.equal((await CorrectionsAgentState.findOne({ agentId: AGENT }).lean()).lastRoute, 'POST /api/worker/v1/corrections/claim');

  const push = await computeHealth({ config: getCorrectionsConfig({}), now: at(30) });
  assert.equal(push.verifyAgent.transport, 'push');
  assert.equal(push.verifyAgent.agent, null);
  assert.equal(push.problems.includes('agent_not_seen'), false);
});

test('הדחיפה לא השתנתה: אותה בקשה בדיוק נשלחת ב-HTTP, והתשובה מנותבת כרגיל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const push = getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 'sec' });
  const r = await ingest('p-push', push);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body) }));
  await runWorkerBatch({ config: push, workerId: 'w', deps: { ...deps(), verifyFetch: verify }, now: T0 });
  assert.equal(verify.calls.length, 1);
  const sent = verify.calls[0].body;
  assert.equal(sent.request_id, r.verification.requestId);
  assert.equal(sent.change, null);
  assert.equal(sent.source.blob_sha, gh.fileSha('main', PATH));
  assert.equal(sent.source.current_line, LINE);
  assert.deepEqual(sent.diff.hunk.added, [NEW]);
  assert.equal((await load(r._id)).manual.handoffReason, 'needs_content_review');
  // ה-API של הסוכן אינו בשימוש בדחיפה: אין lease ואין hash אסימון על המשימה
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.equal(j.leaseTokenHash, null);
});

// ---------------------------------------------------------------- ביקורת PR #313: חריגות אינן משאירות נעילה

test('משיכה: תוצאה "רעילה" (surrogate בודד ב-new_line) → 422 והדיווח לידני; המשימה אינה נשארת נעולה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-poison', c);
  const { job } = await claim(c, T0);
  const body = decide(job);
  body.change.new_line = `${body.change.new_line}\ud800`;
  const res = await submit(c, job, body, at(5));
  assert.deepEqual([res.status, res.code, res.reason], [422, 'invalid_result', 'invalid_response']);
  assert.equal((await load(r._id)).manual.handoffReason, 'invalid_response');
  const j = await CorrectionJob.findById(job.jobId).lean();
  assert.notEqual(j.status, 'leased');
  // שליחה חוזרת (כמו שהמדריך מורה בתקלה) — אותה תשובה בדיוק, כולל reason; לא 503/500
  const replayed = await submit(c, job, body, at(6));
  assert.deepEqual([replayed.status, replayed.code, replayed.reason], [422, 'invalid_result', 'invalid_response']);
});

test('משיכה: חריגה לא צפויה ביישום התוצאה → 409 apply_failed, הדיווח לידני (result_apply_failed); שליחה חוזרת — אותה תשובה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const r = await ingest('p-apply-crash', c);
  const { job } = await claim(c, T0);
  t.mock.method(ChangePackage, 'create', async () => { throw new Error('boom'); });
  const body = decide(job, { scope: 'technical_and_content' });
  const res = await submit(c, job, body, at(5));
  assert.deepEqual([res.status, res.code], [409, 'apply_failed']);
  const s = await load(r._id);
  assert.equal(s.manual.status, 'queued');
  assert.equal(s.manual.handoffReason, 'result_apply_failed');
  const j = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j.status, j.outcome], ['failed', 'result_apply_failed']);
  assert.deepEqual([(await submit(c, job, body, at(6))).code, (await submit(c, job, body, at(700))).code], ['apply_failed', 'apply_failed']);
});

test('משיכה: דיווח אחד שמפיל את ההכנה אינו מפיל את התפיסה — הוא לידני (prepare_failed), והבא נמסר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull();
  const bad = await ingest('p-prep-bad', c);
  const good = await ingest('p-prep-good', c);
  const orig = ErrorReport.updateOne.bind(ErrorReport);
  t.mock.method(ErrorReport, 'updateOne', (filter, update, ...rest) => {
    if (update?.$set?.resolvedSource && String(filter._id) === String(bad._id)) throw new Error('boom');
    return orig(filter, update, ...rest);
  });
  const { job } = await claim(c, T0);
  assert.equal(job.request.report_id, String(good._id));
  assert.equal((await load(bad._id)).manual.handoffReason, 'prepare_failed');
  const badJob = await CorrectionJob.findOne({ report: bad._id }).lean();
  assert.deepEqual([badJob.status, badJob.outcome], ['failed', 'prepare_failed']);
});

// ---------------------------------------------------------------- המשך #313: כשלי הכנה רגעיים ותקציב התפיסה

test('משיכה: תקלת מסד רגעית בהכנה — ניסיון נספר ו-backoff, לא ידני; מיצוי ניסיונות → ידני (prepare_failed)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull();
  const r = await ingest('p-prep-transient', c);
  const orig = ErrorReport.updateOne.bind(ErrorReport);
  let failing = true;
  t.mock.method(ErrorReport, 'updateOne', (filter, update, ...rest) => {
    if (failing && update?.$set?.resolvedSource) {
      const err = new Error('connection lost');
      err.name = 'MongoNetworkError';
      throw err;
    }
    return orig(filter, update, ...rest);
  });
  const first = await claim(c, T0);
  assert.deepEqual(idle(first), { job: null, retryAfter: 60 });
  const j1 = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j1.status, j1.attempts, j1.leaseExpiries ?? 0, j1.lastErrorClass], ['pending', 1, 0, 'transient']);
  assert.ok(j1.nextAttemptAt > T0, 'backoff');
  assert.equal((await load(r._id)).manual.status, 'none', 'תקלה רגעית אינה שולחת לידני');
  // אחרי ה-backoff וכשהתקלה חלפה — התפיסה מצליחה.
  failing = false;
  const ok = await claim(c, new Date(j1.nextAttemptAt.getTime() + 1000));
  assert.equal(ok.job.request.report_id, String(r._id));
  // מיצוי: הניסיון האחרון שנכשל → ידני.
  await CorrectionJob.updateOne({ _id: ok.job.jobId }, { $set: { status: 'pending', attempts: c.verify.maxAttempts - 1, nextAttemptAt: T0, leaseOwner: null, leaseTokenHash: null, leaseExpiresAt: null } });
  await ErrorReport.updateOne({ _id: r._id }, { $unset: { resolvedSource: 1 } });
  failing = true;
  await claim(c, at(10_000));
  const done = await CorrectionJob.findById(ok.job.jobId).lean();
  assert.deepEqual([done.status, done.outcome], ['failed', 'prepare_failed']);
  assert.equal((await load(r._id)).manual.handoffReason, 'prepare_failed');
});

test('משיכה: תקציב התפיסה נגמר באמצע הכנה — המשימה חוזרת לתור בלי lease, בלי ניסיון ובלי פקיעה; הדיווח לא נוגע', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull();
  const r = await ingest('p-budget-mid', c);
  // השעון עומד עד שההכנה מגיעה ל-GitHub, והקריאה הראשונה שם אורכת 25 שניות (יותר מהתקציב): מכאן ההכנה נעצרת.
  // (התקציב נבדק אחרי כל שלב, ולכן שעון שמתקדם כבר לפני ההכנה עוצר את התפיסה עוד לפני ה-outbox — ראו ביקורת רביעית.)
  let clockNow = 0;
  let calls = 0;
  const slowGitHub = (url, init) => {
    calls += 1;
    clockNow = 25_000;
    return gh.fetch(url, init);
  };
  const res = await claimVerifyJob({ config: c, agentId: AGENT, deps: { ...deps(), githubFetch: slowGitHub, clock: () => clockNow }, now: T0 });
  assert.ok(calls >= 1, 'ההכנה הגיעה ל-GitHub');
  assert.deepEqual(idle(res), { job: null, retryAfter: 5 });
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j.status, j.attempts, j.leaseExpiries ?? 0, j.leaseTokenHash ?? null], ['pending', 0, 0, null]);
  assert.equal((await load(r._id)).manual.status, 'none');
  assert.equal((await load(r._id)).verification.status, 'queued');
  // תפיסה רגילה אחריה מצליחה, והפקיעות עדיין אפס.
  const next = await claim(c, at(1));
  assert.equal(next.job.request.report_id, String(r._id));
  assert.equal((await CorrectionJob.findById(next.job.jobId).lean()).leaseExpiries ?? 0, 0);
});

test('משיכה: יתרת התקציב מועברת ל-GitHub כ-timeout — קריאה שחורגת ממנה נעצרת ונחשבת חריגת תקציב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull();
  const r = await ingest('p-budget-abort', c);
  let t0 = 0;
  let seen = null;
  const hangingFetch = (url, init = {}) => new Promise((_, reject) => {
    seen = init.signal;
    init.signal?.addEventListener('abort', () => reject(init.signal.reason));
  });
  // 15 שניות כבר עברו: נשארו 5 שניות — קטן מה-timeout הרגיל של GitHub, ולכן התקציב הוא שעוצר.
  const pending = claimVerifyJob({ config: { ...c, agent: { ...c.agent, claimBudgetMs: 50 } }, agentId: AGENT, deps: { ...deps(), githubFetch: hangingFetch, clock: () => t0 }, now: T0 });
  const res = await pending;
  assert.ok(seen, 'האות הועבר ל-fetch');
  assert.deepEqual(idle(res), { job: null, retryAfter: 5 });
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j.status, j.attempts, j.leaseExpiries ?? 0], ['pending', 0, 0]);
});

// ---------------------------------------------------------------- ביקורת PR #313: משאבים, שחרור והשהיה

test('משיכה: "אין משאבים" חוזר שוב ושוב אינו שולח לידני — רק מועד המיצוי מגביל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-cap-many', c);
  let now = T0;
  for (let i = 1; i <= 10; i++) {
    const { job } = await claim(c, now);
    assert.ok(job, `תפיסה ${i}`);
    const res = await submit(c, job, { api_version: '1', request_id: job.request.request_id, processing_status: 'failed', reason_code: 'service_capacity', retry_after_seconds: 60 }, now);
    assert.equal(res.outcome, 'retry');
    now = new Date((await CorrectionJob.findById(job.jobId).lean()).nextAttemptAt.getTime() + 1000);
  }
  const s = await load(r._id);
  assert.equal(s.manual.status, 'none', 'עדיין בבדיקה אוטומטית');
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j.status, j.attempts, j.leaseExpiries], ['pending', 0, 0]);
  // אחרי מועד המיצוי (24 שעות, אין שבת בטווח) — המטאטא מעביר לידני
  await claim(c, at(86_400));
  assert.equal((await load(r._id)).manual.handoffReason, 'deadline_exhausted');
});

test('משיכה: release מחזיר את המשימה לתור בלי ניסיון ובלי פקיעה, ולא לפני retry_after_seconds', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-release', c);
  const { job } = await claim(c, T0);
  assert.equal((await releaseVerifyJob({ config: c, jobId: job.jobId, token: 'x'.repeat(43), now: at(5) })).code, 'lease_invalid');
  assert.equal((await releaseVerifyJob({ config: c, jobId: 'f'.repeat(24), token: job.leaseToken, now: at(5) })).status, 404);
  const rel = await releaseVerifyJob({ config: c, jobId: job.jobId, token: job.leaseToken, retryAfterSeconds: 120, now: at(5) });
  assert.deepEqual([rel.ok, rel.released, rel.nextAttemptAt.getTime()], [true, true, at(125).getTime()]);
  let j = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j.status, j.attempts, j.leaseExpiries, j.leaseTokenHash, j.leaseOwner], ['pending', 0, 0, null, null]);
  assert.equal((await load(r._id)).verification.status, 'queued');
  assert.ok(await CorrectionEvent.exists({ report: r._id, type: 'verify_released' }));
  // האסימון הישן אינו מחזיק עוד דבר; שחרור חוזר אינו עושה כלום
  assert.equal((await beat(c, job, at(6))).code, 'lease_invalid');
  assert.equal((await submit(c, job, decide(job), at(7))).code, 'lease_invalid');
  assert.equal((await releaseVerifyJob({ config: c, jobId: job.jobId, token: job.leaseToken, now: at(8) })).code, 'lease_invalid');
  assert.equal((await claim(c, at(60))).job, null, 'לא לפני retry_after_seconds');
  const again = await claim(c, at(126));
  assert.equal(again.job.jobId, job.jobId);
  j = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j.attempts, j.leaseExpiries], [0, 0], 'שחרור אינו נספר כפקיעה');
  // משימה שהאתר כבר ביטל — released:false
  await CorrectionJob.updateOne({ _id: job.jobId }, { $set: { status: 'cancelled' } });
  assert.deepEqual(await releaseVerifyJob({ config: c, jobId: again.job.jobId, token: again.job.leaseToken, now: at(130) }), { ok: true, released: false });
});

test('משיכה: השהיה מהמסך — הדופק מבטל מיד והדיווח לידני; התפיסה בזמן השהיה מרוקנת את השאר; בלי פקיעות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const paused = pull({}, { verifyPaused: true });
  await ingest('p-pause-a', c);
  await ingest('p-pause-b', c);
  const first = await claim(c, T0);
  const second = await claim(c, at(1));
  assert.deepEqual(await beat(paused, first.job, at(60)), { ok: true, cancelled: true, leaseExpiresAt: null });
  const ja = await CorrectionJob.findById(first.job.jobId).lean();
  assert.deepEqual([ja.status, ja.outcome, ja.leaseExpiries], ['cancelled', 'service_disabled', 0]);
  const sa = await load(first.job.request.report_id);
  assert.deepEqual([sa.manual.handoffReason, sa.verification.status], ['service_paused', 'skipped_service_disabled']);
  // הסוכן השני לא שלח דופק; התפיסה בזמן ההשהיה מבטלת גם אותה מיד
  assert.deepEqual(idle(await claim(paused, at(70))), { job: null, retryAfter: 300 });
  assert.equal((await CorrectionJob.findById(second.job.jobId).lean()).status, 'cancelled');
  assert.equal((await load(second.job.request.report_id)).manual.handoffReason, 'service_paused');
  // חידוש: אין מה לתפוס (שני הדיווחים אצל מתנדבים) ושום פקיעה לא נספרה
  assert.equal((await claim(c, at(700))).job, null);
  assert.equal(await CorrectionJob.countDocuments({ leaseExpiries: { $gt: 0 } }), 0);
});

// ---------------------------------------------------------------- ביקורת PR #313: בריאות ואצוות בלי cron

test('בריאות במשיכה בלי cron: סוכן שתפס לפני 10 שניות — אין worker_not_running; סוכן שנעלם — יש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  await ingest('p-nocron-a', c);
  await ingest('p-nocron-b', c);
  await claim(c, at(0));
  let h = await computeHealth({ config: c, now: at(10) });
  assert.equal(await WorkerHeartbeat.countDocuments({}), 0, 'אין דופק אצווה כלל');
  assert.equal(h.verifyAgent.workActive, true);
  assert.deepEqual([h.verifyAgent.jobs.leased, h.verifyAgent.jobs.pending], [1, 1]);
  assert.equal(h.problems.includes('worker_not_running'), false);
  assert.equal(h.verifyAgent.agent.workAgeSeconds, 10);
  // 20 דקות בלי תפיסה או תוצאה: הסוכן אינו מעבד את התור
  h = await computeHealth({ config: c, now: at(1200) });
  assert.equal(h.verifyAgent.workActive, false);
  assert.ok(h.problems.includes('worker_not_running'));
});

test('משיכה: התפיסה מסמנת batchDue כשלא רצה אצווה זמן רב או כשפרסום ממתין ב-outbox', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  assert.equal((await claim(c, T0)).batchDue, true, 'אף אצווה לא רצה');
  await WorkerHeartbeat.create({ workerId: 'w', lastBeatAt: T0, lastBatch: {}, lastError: null });
  assert.equal((await claim(c, at(60))).batchDue, false);
  assert.equal((await claim(c, at(601))).batchDue, true, 'עברו 10 דקות מהאצווה האחרונה');
  const r = await ingest('p-batch-due', c);
  const { job } = await claim(c, at(30));
  assert.equal((await submit(c, job, decide(job, { scope: 'technical_and_content' }), at(31))).outcome, 'publish');
  assert.equal((await load(r._id)).dispatch.publish, true);
  assert.equal((await claim(c, at(40))).batchDue, false, 'פרסום ממתין, אבל האצווה האחרונה רצה לפני פחות מ-45 שניות');
  assert.equal((await claim(c, at(50))).batchDue, true, 'פרסום ממתין ועברו 45 שניות');
});

// ---------------------------------------------------------------- ביקורת PR #313: תקציב זמן לתפיסה

test('משיכה: תקציב הזמן של התפיסה — חוזרת עם Retry-After קצר בלי לתפוס משימה נוספת (אין lease יתום)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const lost = { book_title: 'ספר שאינו קיים', file_path: 'אוצריא/אין/כזה.txt', source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/אין/כזה.txt' } };
  for (const id of ['p-slow-1', 'p-slow-2', 'p-slow-3']) await ingest(id, c, lost);
  const good = await ingest('p-slow-good', c);
  // הזמן מתקדם רק בקריאות GitHub (איטיות), כך שמספר קריאות השעון אינו משפיע.
  let elapsed = 0;
  let fetches = 0;
  const slowFetch = async (...a) => { fetches += 1; return gh.fetch(...a); };
  // הביקורת החמישית: גם העברה לידני היא תופעת לוואי — כל העברה כזו בתפיסה נכתבת כשעוד נשאר תקציב. (כמה דיווחים מגיעים
  // לשם לפני שהתקציב נגמר תלוי במספר קריאות GitHub, כלומר במטמון המקורות המשותף — לכן נבדק הרגע, לא המספר.)
  const handoffs = [];
  const watched = ['updateOne', 'findOneAndUpdate'].map((m) => [m, ErrorReport[m]]);
  for (const [m, orig] of watched) {
    ErrorReport[m] = function watch(f, u, ...rest) {
      if (u?.$set?.['manual.status'] === 'queued') handoffs.push(fetches * 15_000);
      return orig.call(this, f, u, ...rest);
    };
  }
  let slow;
  try {
    slow = await claimVerifyJob({ config: c, agentId: AGENT, deps: { ...deps(), githubFetch: slowFetch, clock: () => { elapsed = fetches * 15_000; return elapsed; } }, now: T0 });
  } finally {
    for (const [m, orig] of watched) ErrorReport[m] = orig;
  }
  assert.deepEqual(idle(slow), { job: null, retryAfter: 5 });
  assert.equal(await CorrectionJob.countDocuments({ status: 'leased' }), 0, 'אין משימה תפוסה שלא נמסרה');
  assert.ok(handoffs.every((ms) => ms < c.agent.claimBudgetMs), `העברה לידני אחרי שהתקציב נגמר: ${handoffs}`);
  assert.equal(await CorrectionJob.countDocuments({ status: 'pending' }), 4 - handoffs.length);
  assert.ok(handoffs.length < 3, 'התקציב נגמר לפני שכל האבודים נבדקו');
  const next = await claim(c, at(10));
  assert.equal(next.job.request.report_id, String(good._id));
  assert.equal(await ErrorReport.countDocuments({ 'manual.status': 'queued' }), 3);
});

test('משיכה: הסריקה דילגה על כל המשימות שבדקה → Retry-After קצר (ייתכן שיש עוד עבודה)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const narrow = { ...c, agent: { ...c.agent, claimScan: 2 } };
  const lost = { book_title: 'ספר שאינו קיים', file_path: 'אוצריא/אין/כזה.txt', source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/אין/כזה.txt' } };
  for (const id of ['p-scan-1', 'p-scan-2', 'p-scan-3']) await ingest(id, c, lost);
  const good = await ingest('p-scan-good', c);
  assert.deepEqual(idle(await claim(narrow, T0)), { job: null, retryAfter: 5 });
  assert.equal((await claim(narrow, at(5))).job.request.report_id, String(good._id));
  assert.deepEqual(idle(await claim(narrow, at(10))), { job: null, retryAfter: 60 }, 'באמת אין עבודה');
});

// ---------------------------------------------------------------- ביקורת PR #313: שבת/יו"ט

test('משיכה: לא מוסרים משימה כשחלון מנוחה מתחיל בתוך משך ה-lease; דופק לפני החלון מחזיר אותה לתור בלי קנס', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  // שישי 27.11.2026: החלון נפתח ב-12:00 (10:00Z) ונסגר במוצאי שבת 22:00 (20:00Z)
  await ingest('p-erev-shabbat-1', c);
  assert.deepEqual(idle(await claim(c, new Date('2026-11-27T09:52:00Z'))), { job: null, retryAfter: 3600 });
  assert.deepEqual(idle(await claim(c, new Date('2026-11-28T10:00:00Z'))), { job: null, retryAfter: 3600 }, 'בתוך השבת');
  assert.ok((await claim(c, new Date('2026-11-28T20:01:00Z'))).job, 'נמסר אחרי מוצאי שבת');

  await db.reset();
  const r = await ingest('p-erev-shabbat-2', c);
  const { job } = await claim(c, new Date('2026-11-27T09:40:00Z'));
  assert.ok(job, 'עשרים דקות לפני החלון — נמסר');
  const extended = await beat(c, job, new Date('2026-11-27T09:49:00Z'));
  assert.deepEqual([extended.cancelled, extended.leaseExpiresAt.toISOString()], [false, '2026-11-27T09:59:00.000Z']);
  assert.deepEqual(await beat(c, job, new Date('2026-11-27T09:55:00Z')), { ok: true, cancelled: true, leaseExpiresAt: null });
  const j = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j.status, j.attempts, j.leaseExpiries, j.nextAttemptAt.toISOString()], ['pending', 0, 0, '2026-11-28T20:00:00.000Z']);
  assert.equal((await load(r._id)).verification.status, 'queued');
  const again = await claim(c, new Date('2026-11-28T20:01:00Z'));
  assert.equal(again.job.jobId, job.jobId, 'נמסר שוב אחרי מוצאי שבת');
});

test('משיכה: "כבר הוחל" שנסגר בתפיסה — מייל למדווח מתוזמן אחרי התשובה (deps.schedule), לא בתוך התפיסה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ files: { [PATH]: FILE.replace(LINE, NEW) } });
  const c = pull();
  const r = await ingest('p-applied-mail', c, { sender_email: 'reporter@example.org' });
  const scheduled = [];
  const mails = [];
  const res = await claimVerifyJob({
    config: c, agentId: AGENT, now: T0,
    deps: { ...deps(), schedule: (work) => scheduled.push(work), sendThanksMail: async (m) => { mails.push(m); return { sent: true }; } },
  });
  assert.equal(res.job, null);
  assert.equal((await load(r._id)).state, 'closed_already_fixed');
  assert.deepEqual([scheduled.length, mails.length], [1, 0], 'עדיין לא נשלח');
  await scheduled[0]();
  assert.deepEqual(mails.map((m) => m.kind), ['already_fixed']);
});

test('משיכה: already_fixed של השירות שהאתר אימת — מייל "כבר תוקן" למדווח פעם אחת, אחרי התשובה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const mails = [];
  const scheduled = [];
  const mailDeps = { ...deps(), schedule: (work) => scheduled.push(work), sendThanksMail: async (m) => { mails.push(m); return { sent: true }; } };
  const send = (job, body, now) => {
    const text = JSON.stringify(body);
    return submitVerifyResult({ config: c, jobId: job.jobId, token: job.leaseToken, raw: Buffer.from(text), body: JSON.parse(text), deps: mailDeps, now });
  };
  const r = await ingest('p-svc-fixed-mail', c, { sender_email: 'reporter@example.org' });
  const { job } = await claim(c, T0);
  gh.pushExternal('main', { [PATH]: FILE.replace(LINE, NEW) });
  const body = decide(job, { decision: 'already_fixed' });
  const res = await send(job, body, at(5));
  assert.equal(res.outcome, 'close_already_fixed');
  assert.equal((await load(r._id)).state, 'closed_already_fixed');
  assert.deepEqual([scheduled.length, mails.length], [1, 0], 'עדיין לא נשלח — מתוזמן אחרי התשובה');
  await scheduled[0]();
  assert.deepEqual(mails.map((m) => m.kind), ['already_fixed']);
  await send(job, body, at(6));
  assert.equal(scheduled.length, 1, 'שליחה חוזרת אינה מתזמנת שוב');
});

// ---------------------------------------------------------------- ביקורת PR #313: מרוצים ומצבי קצה

test('משיכה: תפיסות מקבילות (כולל outbox מקבילי) — בלי חריגה, ואף משימה אינה נמסרת פעמיים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  for (let i = 0; i < 8; i++) await ingest(`p-par-${i}`, c);
  const settled = await Promise.allSettled(Array.from({ length: 6 }, () => claim(c, T0)));
  assert.equal(settled.filter((x) => x.status === 'rejected').length, 0);
  const ids = settled.map((x) => x.value.job?.jobId).filter(Boolean);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.equal(await CorrectionJob.countDocuments({ status: 'leased' }), 6);
  assert.equal(await CorrectionJob.countDocuments({}), 8, 'משימה אחת לכל דיווח');
});

test('משיכה: תוצאה שמגיעה אחרי מועד המיצוי כשה-lease עוד בתוקף — מתקבלת ומוחלת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-after-deadline', c);
  await dispatchOutbox({ config: c, now: T0 });
  const { job } = await claim(c, at(86_000));
  const res = await submit(c, job, decide(job), at(86_450));
  assert.equal(res.outcome, 'manual');
  assert.equal((await load(r._id)).manual.handoffReason, 'needs_content_review');
});

test('משיכה: מטאטא ופקיעות חוזרות על דיווח שכבר אינו של המשימה — המשימה נסגרת, הדיווח לא נגע', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-stale-sweep', c);
  await dispatchOutbox({ config: c, now: T0 });
  // גרסה חדשה שאינה ממתינה לבדיקה (כמו אחרי שמתנדב לקח). גרסה "ממתינה" בלי משימה חוזרת לתור — ר' רשת הביטחון למטה.
  const newerVersion = { $inc: { workflowGeneration: 1 }, $set: { 'verification.status': 'superseded' } };
  await ErrorReport.updateOne({ _id: r._id }, newerVersion);
  await runWorkerBatch({ config: c, workerId: 'w', deps: deps(), now: at(86_400) });
  const j = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.deepEqual([j.status, j.outcome], ['failed', 'deadline_exhausted']);
  assert.equal((await load(r._id)).manual.status, 'none', 'דיווח שהשתנה אינו מועבר בשם משימה ישנה');

  await db.reset();
  const r2 = await ingest('p-stale-expiry', c);
  const { job } = await claim(c, T0);
  await CorrectionJob.updateOne({ _id: job.jobId }, { $set: { leaseExpiries: 4, leaseExpiresAt: at(1) } });
  await ErrorReport.updateOne({ _id: r2._id }, newerVersion);
  assert.equal((await claim(c, at(10))).job, null);
  const j2 = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j2.status, j2.outcome, j2.leaseExpiries], ['failed', 'lease_expired_repeatedly', 5]);
  assert.equal((await load(r2._id)).manual.status, 'none');
});

// ---------------------------------------------------------------- ביקורת חוזרת #313: מעברים מותני-generation, "כבר תוקן" מחמיר

const newVolunteer = () => User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });

// שליחה מחודשת לשירות כמו במסך: מתנדב לוקח ושולח שוב — generation חדש ובקשה חדשה ב-outbox.
async function resend(reportId, c, vol, now) {
  assert.equal((await claimReport({ user: vol, id: String(reportId), config: c, now })).status, 200);
  const { workflowGeneration } = await load(reportId);
  assert.equal((await resubmitToService({ user: vol, id: String(reportId), generation: workflowGeneration, config: c, now })).status, 200);
  return load(reportId);
}

test('ביקורת חוזרת #313: dispatch שקרא גרסה ישנה אינו מבטל את משימת השליחה המחודשת — הדיווח אינו נתקע', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const vol = await newVolunteer();
  const r = await ingest('p-stale-dispatch', c);
  // תהליך א' קרא את ה-outbox בגרסה הראשונה ונעצר לפני שיצר משימה
  const staleRead = await ErrorReport.find({ 'dispatch.verify': true, state: 'open' }).lean();
  assert.deepEqual(staleRead.map((x) => x.workflowGeneration), [r.workflowGeneration]);
  await dispatchVerifyOutbox({ config: c, now: T0 });
  const s = await resend(r._id, c, vol, at(5));
  await dispatchVerifyOutbox({ config: c, now: at(6) });
  const fresh = await CorrectionJob.findOne({ report: r._id, status: 'pending' }).lean();
  assert.equal(fresh.generation, s.workflowGeneration);
  // תהליך א' ממשיך עם מה שקרא: אסור לו לגעת במשימה של הגרסה החדשה
  const find = t.mock.method(ErrorReport, 'find', () => ({ limit: () => ({ lean: async () => staleRead }) }));
  await dispatchVerifyOutbox({ config: c, now: at(7) });
  find.mock.restore();
  const active = await CorrectionJob.find({ report: r._id, status: { $in: ['pending', 'leased'] } }).lean();
  assert.deepEqual(active.map((j) => [String(j._id), j.generation]), [[String(fresh._id), s.workflowGeneration]]);
  const { job } = await claim(c, at(8));
  assert.equal(job?.request.workflow_generation, s.workflowGeneration);
});

test('ביקורת חוזרת #313: המטאטא מחזיר לתור דיווח "ממתין לבדיקה" בלי משימה פעילה — פעם אחת בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('p-stranded', c);
  const busy = await ingest('p-busy', c);
  await dispatchVerifyOutbox({ config: c, now: T0 });
  // מעבר מיושן ביטל את המשימה של הגרסה הנוכחית: "ממתין לבדיקה", בלי outbox ובלי משימה
  await CorrectionJob.updateOne({ report: r._id }, { $set: { status: 'cancelled', outcome: 'superseded' }, $unset: { activeKey: 1 }, $inc: { fence: 1 } });
  for (let i = 1; i <= 3; i++) {
    await sweepExpiredVerifyJobs({ now: at(i) });
    await sweepExpiredVerifyJobs({ now: at(i) });
    await dispatchVerifyOutbox({ config: c, now: at(i) });
  }
  const jobsOf = async (id) => (await CorrectionJob.find({ report: id }).sort({ createdAt: 1 }).lean()).map((j) => [j.status, j.generation]);
  assert.deepEqual(await jobsOf(r._id), [['cancelled', r.workflowGeneration], ['pending', r.workflowGeneration]]);
  assert.deepEqual(await jobsOf(busy._id), [['pending', busy.workflowGeneration]]);
  assert.equal((await load(r._id)).dispatch.verify, false);
  const delivered = [(await claim(c, at(10))).job, (await claim(c, at(11))).job].map((j) => j?.request.report_id).sort();
  assert.deepEqual(delivered, [String(r._id), String(busy._id)].sort());
});

const H_BAD = '<h2>פרק א</h2>';
const H_GOOD = '<h2>פרק ב</h2>';
const H_AT = H_BAD.indexOf('א');
const H_FILE = `<h1>בראשית</h1>\r\n${H_BAD}\r\n${LINE}\r\nסוף\r\n`;
// כותרת שזזה: שורות נוספו לפניה, ובמיקום הישן יש עכשיו כותרת זהה למוצעת — הטעות עדיין בספר.
const H_MOVED = `<h1>בראשית</h1>\r\n${H_GOOD}\r\nפסוק שנוסף\r\n${H_BAD}\r\n${LINE}\r\nסוף\r\n`;
const H_REPORT = {
  line_number: 2, selected_text: 'פרק א', location: { line_index: 1, library_build_id: '27' },
  correction: {
    original_line: H_BAD, original_selection: 'א', selection_offset: { unit: 'utf16_code_units', start: H_AT, end: H_AT + 1 },
    proposed_text: 'ב', context_before: H_BAD.slice(0, H_AT), context_after: H_BAD.slice(H_AT + 1),
  },
};

async function movedHeadingClaim(c, id, over = {}) {
  gh = new FakeGitHub({ files: { [PATH]: H_FILE } });
  const r = await ingest(id, c, { ...H_REPORT, ...over });
  const { job } = await claim(c, T0);
  assert.equal(job?.request.report_id, String(r._id));
  gh.pushExternal('main', { [PATH]: H_MOVED });
  return { r, job };
}

test('ביקורת חוזרת #313: already_fixed של השירות על כותרת שזזה — אינו נסגר (הכלל המחמיר), לידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const { r, job } = await movedHeadingClaim(c, 'p-moved-heading');
  const res = await submit(c, job, decide(job, { decision: 'already_fixed' }), at(5));
  assert.deepEqual([res.ok, res.outcome], [true, 'manual']);
  const s = await load(r._id);
  assert.deepEqual([s.state, s.manual.status, s.manual.handoffReason], ['open', 'queued', 'already_fixed_unverified']);
});

test('ביקורת חוזרת #313: תוצאה שמגיעה בזמן השהיה אינה מוחלת — cancelled כמו בדופק, המשימה משוחררת והדיווח לידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const paused = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true, verifyPaused: true });
  const { r, job } = await movedHeadingClaim(c, 'p-moved-heading-paused');
  const body = decide(job, { decision: 'already_fixed' });
  assert.deepEqual(await submit(paused, job, body, at(5)), { ok: true, outcome: 'cancelled', cancelled: true });
  const j = await CorrectionJob.findById(job.jobId).lean();
  assert.deepEqual([j.status, j.outcome, j.leaseExpiresAt, j.leaseExpiries], ['cancelled', 'service_disabled', null, 0]);
  const s = await load(r._id);
  assert.deepEqual([s.state, s.manual.handoffReason, s.verification.status], ['open', 'service_paused', 'skipped_service_disabled']);
  assert.deepEqual(await submit(paused, job, body, at(6)), { ok: true, outcome: 'cancelled', cancelled: true, duplicate: true });
  assert.deepEqual(await beat(c, job, at(7)), { ok: true, cancelled: true, leaseExpiresAt: null });
});

// ---------------------------------------------------------------- ביקורת חוזרת #314: כשל של משימה ישנה, מייל רק אחרי סגירה מחמירה

test('ביקורת חוזרת #314: כשל הכנה רגעי אחרון של משימה ישנה אינו מעביר לידני את הגרסה החדשה של הדיווח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(console, 'error', () => {});
  const c = pull();
  const r = await ingest('p-old-crash', c);
  await dispatchOutbox({ config: c, now: T0 });
  // הניסיון הבא הוא האחרון: כשל רגעי בו ממצה את המשימה (recordCrash → failed)
  await CorrectionJob.updateOne({ report: r._id }, { $set: { attempts: c.verify.maxAttempts - 1 } });
  const orig = ErrorReport.updateOne.bind(ErrorReport);
  let fired = false;
  t.mock.method(ErrorReport, 'updateOne', (filter, update, ...rest) => {
    if (!fired && update?.$set?.resolvedSource) {
      fired = true;
      // בזמן ההכנה הדיווח נשלח מחדש (גרסה חדשה ובקשה חדשה ב-outbox), ואז המסד נופל רגעית
      const resend = { $inc: { workflowGeneration: 1 }, $set: { 'verification.requestId': 'req_newer', 'verification.status': 'queued', 'dispatch.verify': true } };
      return orig({ _id: r._id }, resend).then(() => {
        const err = new Error('connection lost');
        err.name = 'MongoNetworkError';
        throw err;
      });
    }
    return orig(filter, update, ...rest);
  });
  assert.equal((await claim(c, T0)).job, null);
  const old = await CorrectionJob.findOne({ report: r._id, generation: r.workflowGeneration }).lean();
  assert.deepEqual([old.status, old.outcome], ['failed', 'prepare_failed']);
  const s = await load(r._id);
  assert.deepEqual([s.workflowGeneration, s.manual.status, s.verification.status], [r.workflowGeneration + 1, 'none', 'queued']);
  // הגרסה החדשה נמסרת לשירות כרגיל
  const { job } = await claim(c, at(1));
  assert.equal(job?.request.workflow_generation, r.workflowGeneration + 1);
});

test('ביקורת חוזרת #314: מייל "כבר תוקן" רק אחרי סגירה מחמירה — כותרת שזזה, בבדיקה פעילה ובהשהיה, אינה שולחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const paused = pull({}, { verifyPaused: true });
  const scheduled = [];
  // נבנה בכל שליחה: movedHeadingClaim מחליף את ה-GitHub המדומה.
  const mailDeps = () => ({ ...deps(), schedule: (work) => scheduled.push(work), sendThanksMail: async () => ({ sent: true }) });
  const send = (config, job, now) => {
    const text = JSON.stringify(decide(job, { decision: 'already_fixed' }));
    return submitVerifyResult({ config, jobId: job.jobId, token: job.leaseToken, raw: Buffer.from(text), body: JSON.parse(text), deps: mailDeps(), now });
  };
  const running = await movedHeadingClaim(c, 'p-moved-heading-mail', { sender_email: 'reporter@example.org' });
  assert.equal((await send(c, running.job, at(5))).outcome, 'manual');
  assert.equal((await load(running.r._id)).state, 'open');
  await db.reset();
  const held = await movedHeadingClaim(c, 'p-moved-heading-mail-paused', { sender_email: 'reporter@example.org' });
  assert.equal((await send(paused, held.job, at(5))).outcome, 'cancelled');
  assert.equal((await load(held.r._id)).state, 'open');
  assert.equal(scheduled.length, 0);
});

// ---------------------------------------------------------------- ביקורת שלישית #313

const P_BAD = 'ובגמרא שם אמר רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר בדברי הראשונים';
const P_GOOD = P_BAD.replace('הלכא', 'הלכה');
const P_AT = P_BAD.indexOf('הלכא');
const P_FILE = `<h1>בראשית</h1>\r\n\r\n${P_BAD}\r\nסוף\r\n`;
// הפסקה המדווחת זזה וקיבלה מילה אחת — הטעות נשארה; באינדקס הישן עומדת עכשיו פסקה אחרת שזהה בדיוק להצעה.
const P_MOVED = `<h1>בראשית</h1>\r\n\r\n${P_GOOD}\r\nפסוק שנוסף\r\n${P_BAD.replace('מבואר', 'מבואר היטב')}\r\nסוף\r\n`;
const P_REPORT = {
  line_number: 3, selected_text: 'הלכא', location: { line_index: 2, library_build_id: '27' },
  correction: {
    original_line: P_BAD, original_selection: 'הלכא', selection_offset: { unit: 'utf16_code_units', start: P_AT, end: P_AT + 4 },
    proposed_text: 'הלכה', context_before: P_BAD.slice(0, P_AT), context_after: P_BAD.slice(P_AT + 4),
  },
};

test('ביקורת שלישית #313: "כבר תוקן" — פסקה שזזה וקיבלה מילה, הטעות נשארה ושורה זהה להצעה באינדקס הישן → ידני (שירות ותפיסה)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  // תוצאת השירות
  gh = new FakeGitHub({ files: { [PATH]: P_FILE } });
  const r = await ingest('p3-moved-para', c, P_REPORT);
  const { job } = await claim(c, T0);
  assert.equal(job?.request.report_id, String(r._id));
  gh.pushExternal('main', { [PATH]: P_MOVED });
  const res = await submit(c, job, decide(job, { decision: 'already_fixed' }), at(5));
  assert.deepEqual([res.ok, res.outcome], [true, 'manual']);
  const s = await load(r._id);
  assert.deepEqual([s.state, s.manual.status, s.manual.handoffReason], ['open', 'queued', 'already_fixed_unverified']);
  // אותו קובץ כבר בתפיסה: "כבר הוחל" לפי האינדקס בלבד — אינו נסגר ואינו נמסר
  await db.reset();
  gh = new FakeGitHub({ files: { [PATH]: P_MOVED } });
  const r2 = await ingest('p3-moved-para-claim', c, P_REPORT);
  assert.equal((await claim(c, T0)).job, null);
  const s2 = await load(r2._id);
  assert.deepEqual([s2.state, s2.manual.handoffReason, s2.verification.status], ['open', 'already_fixed_unverified', 'not_requested']);
});

// קריאת GitHub שמתעכבת עד שחרור מפורש (הזרקה דרך deps.githubFetch); reached — הקריאה הראשונה הגיעה לשער.
function gatedGitHub() {
  let release;
  let reach;
  const gate = new Promise((res) => { release = res; });
  const reached = new Promise((res) => { reach = res; });
  return { reached, release, fetch: async (url, init) => { reach(); await gate; return gh.fetch(url, init); } };
}
// מיילי התודה שתוזמנו בתוצאות שנמסרו דרך submitVia (deps.schedule) — לא אמור להיות אף אחד במרוץ.
const raceMails = [];
function submitVia(githubFetch, config, job, body, now) {
  const text = JSON.stringify(body);
  const mailDeps = { schedule: (work) => raceMails.push(work), sendThanksMail: async () => ({ sent: true }) };
  return submitVerifyResult({ config, jobId: job.jobId, token: job.leaseToken, raw: Buffer.from(text), body: JSON.parse(text), deps: { githubFetch, random: () => 0, ...mailDeps }, now });
}
const sideEffects = (id) => CorrectionEvent.countDocuments({ report: id, type: { $in: ['service_decision', 'closed_already_fixed'] } });
const historyOnly = (s) => (s.decisions || []).every((d) => d.stale === true);

test('ביקורת שלישית #313: החלטה שקריאת GitHub שלה התעכבה עד שהמשימה בוטלה (השהיה) או נתפסה מחדש — אינה נכתבת: cancelled, בלי תופעות לוואי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true });
  const paused = pull(FULL_ENV, { publishMode: 'pr', autoPublish: true, verifyPaused: true });
  const FIXED = FILE.replace(LINE, NEW);

  // א. השהיה בזמן שהקריאה מעוכבת: הדופק מבטל את המשימה והדיווח עובר לידני
  const r = await ingest('p3-race-pause', c);
  const { job } = await claim(c, T0);
  gh.pushExternal('main', { [PATH]: FIXED });
  const slow = gatedGitHub();
  const pending = submitVia(slow.fetch, c, job, decide(job, { decision: 'already_fixed' }), at(5));
  await slow.reached;
  assert.deepEqual(await beat(paused, job, at(6)), { ok: true, cancelled: true, leaseExpiresAt: null });
  assert.equal((await CorrectionJob.findById(job.jobId).lean()).status, 'cancelled');
  const before = await load(r._id);
  slow.release();
  assert.deepEqual(await pending, { ok: true, outcome: 'cancelled', cancelled: true });
  const s = await load(r._id);
  assert.deepEqual([s.state, s.manual.handoffReason, s.workflowGeneration], ['open', 'service_paused', before.workflowGeneration]);
  assert.ok(historyOnly(s), 'ההחלטה נשמרה להיסטוריה בלבד');
  assert.equal(await sideEffects(r._id), 0);

  // ב. ה-lease פג בזמן שהקריאה מעוכבת וסוכן אחר תפס את המשימה מחדש: המחזיק הישן אינו כותב
  await db.reset();
  gh = new FakeGitHub({ files: { [PATH]: FILE } });
  const r2 = await ingest('p3-race-reclaim', c);
  const first = (await claim(c, T0)).job;
  gh.pushExternal('main', { [PATH]: FIXED });
  const slow2 = gatedGitHub();
  const pending2 = submitVia(slow2.fetch, c, first, decide(first, { decision: 'already_fixed' }), at(5));
  await slow2.reached;
  const later = new Date(at(5).getTime() + (c.agent.leaseSeconds + 1) * 1000);
  const second = (await claimVerifyJob({ config: c, agentId: 'verify-2', deps: deps(), now: later })).job;
  assert.equal(second?.jobId, first.jobId);
  slow2.release();
  assert.deepEqual(await pending2, { ok: true, outcome: 'cancelled', cancelled: true });
  const s2 = await load(r2._id);
  assert.deepEqual([s2.state, s2.verification.status, s2.manual?.status ?? 'none'], ['open', 'in_progress', 'none']);
  assert.ok(historyOnly(s2));
  assert.equal(await sideEffects(r2._id), 0);
  assert.equal(raceMails.length, 0, 'אין מייל תודה מהחלטה שלא נכתבה');
  // המחזיק הנוכחי עדיין מחיל את ההחלטה שלו
  const third = await submit(c, second, decide(second, { decision: 'already_fixed' }), new Date(later.getTime() + 1000));
  assert.equal(third.outcome, 'close_already_fixed');
  assert.equal((await load(r2._id)).state, 'closed_already_fixed');
});

test('ביקורת שלישית #313: רשת הביטחון מוצאת דיווח תקוע גם אחרי 100 דיווחים שיש להם משימה (בלי מגבלה לפני הבדיקה)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const busy = await ingest('p3-busy', c);
  await dispatchVerifyOutbox({ config: c, now: T0 });
  const doc = await ErrorReport.collection.findOne({ _id: busy._id });
  const job = await CorrectionJob.collection.findOne({ report: busy._id });
  const clone = (i, { dead = false } = {}) => {
    const rid = new mongoose.Types.ObjectId();
    const jid = new mongoose.Types.ObjectId();
    const marker = doc.verification.activeJob ? { activeJob: { ...doc.verification.activeJob, id: jid } } : {};
    return {
      report: { ...doc, _id: rid, reportId: `p3-busy-${i}`, verification: { ...doc.verification, requestId: `req-${i}`, ...marker } },
      job: dead
        ? { ...job, _id: jid, report: rid, requestId: `req-${i}`, status: 'cancelled', outcome: 'superseded', activeKey: undefined }
        : { ...job, _id: jid, report: rid, requestId: `req-${i}`, activeKey: `verify:${rid}` },
    };
  };
  const all = [...Array.from({ length: 100 }, (_, i) => clone(i)), clone('stranded', { dead: true })];
  for (const x of all) if (x.job.activeKey === undefined) delete x.job.activeKey;
  await ErrorReport.collection.insertMany(all.map((x) => x.report));
  await CorrectionJob.collection.insertMany(all.map((x) => x.job));
  const stranded = all.at(-1).report._id;
  for (let i = 1; i <= 3; i++) await sweepExpiredVerifyJobs({ now: at(i) });
  assert.equal((await load(stranded)).dispatch.verify, true, 'הדיווח ה-102 (בלי משימה פעילה) חזר ל-outbox');
  assert.equal(await CorrectionEvent.countDocuments({ type: 'verify_requeued' }), 1, 'ורק הוא');
});

test('ביקורת שלישית #313: מנהל משייך למתנדב והמתנדב משחרר לתור הידני — התפיסה הבאה אינה מוסרת אותו לשירות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin' });
  const vol = await newVolunteer();
  const r = await ingest('p3-released', c);
  await dispatchVerifyOutbox({ config: c, now: T0 });
  const assigned = await reassignReport({ user: admin, id: String(r._id), generation: r.workflowGeneration, targetUserId: String(vol._id), config: c, now: at(1) });
  assert.equal(assigned.status, 200);
  const released = await releaseReport({ user: vol, id: String(r._id), generation: assigned.body.generation, now: at(2) });
  assert.equal(released.status, 200);
  for (let i = 3; i <= 5; i++) assert.equal((await claim(c, at(i))).job, null);
  const s = await load(r._id);
  assert.deepEqual([s.state, s.manual.status, s.dispatch.verify], ['open', 'released', false]);
  assert.equal(await CorrectionJob.countDocuments({ report: r._id, status: { $in: ['pending', 'leased'] } }), 0);
  assert.equal(await CorrectionEvent.countDocuments({ report: r._id, type: 'verify_requeued' }), 0);
});

// ---------------------------------------------------------------- ביקורת שלישית #314: תקציב התפיסה

// עיכוב מוזרק בפעולת מסד: השעון של התפיסה (deps.clock) מתקדם ב-ms בכל קריאה שמתאימה ל-match.
async function withMongoDelay(model, method, match, ms, clock, fn) {
  const original = model[method];
  model[method] = function delayed(...args) {
    if (match(...args)) clock.now += ms;
    return original.apply(this, args);
  };
  try {
    return await fn();
  } finally {
    model[method] = original;
  }
}

test('ביקורת שלישית #314: תקציב התפיסה מכסה כל פעולה — כתיבה איטית למסד או תור איטי: המשימה אינה נמסרת, בלי lease, ניסיון או פקיעה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const tight = { ...c, agent: { ...c.agent, claimBudgetMs: 65 } };
  const r = await ingest('p3-budget', c);
  const clock = { now: 0 };
  const tick = () => clock.now;
  const untouched = async (fence) => {
    const j = await CorrectionJob.findOne({ report: r._id }).lean();
    assert.deepEqual([j.status, j.attempts ?? 0, j.leaseExpiries ?? 0, j.leaseTokenHash ?? null, j.leaseExpiresAt ?? null, j.fence], ['pending', 0, 0, null, null, fence]);
  };
  // א. כתיבת "בבדיקה" למסד אורכת 73 מ"ש (אחרי הכנה מהירה): מעבר לתקציב של 65 — לא נמסרת
  const inProgress = (filter, update) => update?.$set?.['verification.status'] === 'in_progress';
  const slowWrite = await withMongoDelay(ErrorReport, 'updateOne', inProgress, 73, clock, () => claimVerifyJob({ config: tight, agentId: AGENT, deps: { ...deps(), clock: tick }, now: T0 }));
  assert.equal(slowWrite.job, null);
  assert.equal(slowWrite.retryAfter, c.agent.busyRetrySeconds);
  await untouched(1);
  assert.equal((await load(r._id)).verification.status, 'queued');
  // ב. פעולות התור שלפני התפיסה (outbox/מטאטא) אורכות 70 מ"ש: לא נתפסת משימה כלל
  const slowQueue = await withMongoDelay(ErrorReport, 'aggregate', () => true, 70, clock, () => claimVerifyJob({ config: tight, agentId: AGENT, deps: { ...deps(), clock: tick }, now: at(1) }));
  assert.equal(slowQueue.job, null);
  await untouched(1);
  // ג. בלי עיכוב — נמסרת כרגיל באותו תקציב
  const fine = await claimVerifyJob({ config: tight, agentId: AGENT, deps: { ...deps(), clock: tick }, now: at(2) });
  assert.equal(fine.job?.request.report_id, String(r._id));
});

test('ביקורת רביעית #314: תקציב התפיסה נספר מהכניסה לראוט — בקשה שחרגה ממנו עוד לפני התפיסה אינה נוגעת בתור', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  // בקנה מידה מוקטן: תקציב של 200 מ"ש (בייצור 20 שניות), והפעולות שלפני התפיסה בראוט אורכות 210 מ"ש.
  const tight = { ...c, agent: { ...c.agent, claimBudgetMs: 200 } };
  const r = await ingest('p4-budget-entry', c);
  await dispatchVerifyOutbox({ config: c, now: T0 });
  const before = await CorrectionJob.findOne({ report: r._id }).lean();
  const clock = { now: 210 };
  const tick = () => clock.now;
  const late = await claimVerifyJob({ config: tight, agentId: AGENT, startedAt: 0, deps: { ...deps(), clock: tick }, now: T0 });
  assert.deepEqual(idle(late), { job: null, retryAfter: c.agent.busyRetrySeconds });
  assert.equal(late.batchDue, false);
  assert.deepEqual(await CorrectionJob.findOne({ report: r._id }).lean(), before, 'המשימה לא נתפסה ולא השתנתה: בלי lease, ניסיון, פקיעה או fence');
  assert.equal((await load(r._id)).verification.activeJob.fence, before.fence);
  // אותן פעולות ב-190 מ"ש — בתוך התקציב: נמסרת כרגיל
  const fine = await claimVerifyJob({ config: tight, agentId: AGENT, startedAt: 20, deps: { ...deps(), clock: tick }, now: at(1) });
  assert.equal(fine.job?.request.report_id, String(r._id));
});

test('ביקורת רביעית #314: התקציב נבדק אחרי כל שלב — כשהוא נגמר ב"נראה לאחרונה" או במטאטא, ה-204 בלי תופעות לוואי: בלי outbox, משימה או אצווה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  // בקנה מידה מוקטן: תקציב של 200 מ"ש מהכניסה לראוט (startedAt=0); הבקשה מגיעה לתפיסה אחרי 190 מ"ש.
  const tight = { ...c, agent: { ...c.agent, claimBudgetMs: 200 } };
  const r = await ingest('p4-budget-stages', c);
  const pending = async (what) => {
    assert.equal((await load(r._id)).dispatch.verify, true, `${what}: ה-outbox לא רץ`);
    assert.equal(await CorrectionJob.countDocuments({ report: r._id }), 0, `${what}: לא נוצרה משימה`);
  };
  await pending('לפני');
  const clock = { now: 190 };
  const tick = () => clock.now;
  const claimAt = (now) => claimVerifyJob({ config: tight, agentId: AGENT, startedAt: 0, deps: { ...deps(), clock: tick }, now });
  // א. הכתיבה של "נראה לאחרונה" (recordAgentWork) עצמה ממצה את התקציב (20 מ"ש)
  const isWork = (f, u) => Boolean(u?.$max?.lastWorkAt);
  const afterWork = await withMongoDelay(CorrectionsAgentState, 'updateOne', isWork, 20, clock, () => claimAt(T0));
  assert.deepEqual(afterWork, { job: null, retryAfter: c.agent.busyRetrySeconds, batchDue: false });
  await pending('נגמר ב"נראה לאחרונה"');
  // ב. המטאטא (רשת הביטחון שבו) ממצה את התקציב: ה-outbox שאחריו אינו רץ
  clock.now = 190;
  const afterSweep = await withMongoDelay(ErrorReport, 'aggregate', () => true, 20, clock, () => claimAt(at(1)));
  assert.deepEqual(afterSweep, { job: null, retryAfter: c.agent.busyRetrySeconds, batchDue: false });
  await pending('נגמר במטאטא');
  // ג. בלי עיכוב, באותו תקציב — ה-outbox רץ והמשימה נמסרת
  clock.now = 190;
  const fine = await claimAt(at(2));
  assert.equal(fine.job?.request.report_id, String(r._id));
  assert.equal((await load(r._id)).dispatch.verify, false);
});

// הביקורת החמישית: "כבר הוחל" בתפיסה — במקום המדווח עומדת ההצעה, ובשורה שאחריה עותק של הפסקה שבו המילה תוקנה וה-<b>
// שההצעה הסירה נשאר עם <i> בתוכו. כלל 9 (rawPartHeld, absorption.js) חוסם; הדיווח לידני, בלי סגירה ובלי מייל.
test('הביקורת החמישית: "כבר הוחל" — עותק שבו ה-<b> שהוסר נשאר עם <i> בתוכו אינו נסגר אוטומטית', async () => {
  const c = pull();
  const original = 'כתב הרב הגדול כי <b>הרב</b> השגיאה היא עיקר הענין';
  const proposed = 'כתב הרב הגדול כי הרב השגחה היא עיקר הענין';
  const head = ['הקדמת המחבר', 'פתיחה לענין', 'דברי פתיחה נוספים'];
  const tail = ['ועתה ראו חידוש נפלא', 'דברי סיום', 'סיום הספר'];
  const prev = 'ובספר אחר מבואר שיש לחלק בין המקרים השונים ולכן ראוי לעיין בדבר ועוד';
  const partial = 'כי <b><i>הרב</i></b> השגחה היא עיקר הענין';
  const r = await ingest('r5-agent-nested-markup', c, {
    location: { line_index: 4, library_build_id: '27' },
    correction: { original_line: original, original_selection: null, selection_offset: null, proposed_text: proposed, context_before: '', context_after: '' },
  });
  gh.pushExternal('main', { [PATH]: [...head, `${prev} הרב הגדול`, proposed, partial, ...tail].join('\n') });
  const scheduled = [];
  const result = await claimVerifyJob({ config: c, agentId: AGENT, deps: { ...deps(), schedule: (work) => scheduled.push(work) }, now: at(2) });
  const after = await load(r._id);
  assert.deepEqual([result.job, after.state, after.manual.status, scheduled.length], [null, 'open', 'queued', 0]);
});

// הביקורת החמישית #314: לקיחת המשימה עצמה (findOneAndUpdate על התור) מיצתה את התקציב — ההכנה אינה מתחילה: בלי סימון
// "בבדיקה", המשימה חוזרת לתור והדיווח נשאר queued.
test('הביקורת החמישית #314: לקיחת המשימה מיצתה את התקציב — ההכנה אינה מתחילה, בלי סימון "בבדיקה"', async () => {
  const c = pull();
  const tight = { ...c, agent: { ...c.agent, claimBudgetMs: 200 } };
  const r = await ingest('r5-prep-after-budget', c);
  const first = await claim(c);
  assert.ok(first.job);
  await releaseVerifyJob({ config: c, jobId: first.job.jobId, token: first.job.leaseToken, now: at(1) });
  assert.equal((await load(r._id)).resolvedSource.status, 'exact');
  let inProgressWrites = 0;
  const clock = { now: 190 };
  const orig = ErrorReport.updateOne;
  ErrorReport.updateOne = function counted(f, u) {
    if (u?.$set?.['verification.status'] === 'in_progress') inProgressWrites += 1;
    return orig.apply(this, arguments);
  };
  try {
    const result = await withMongoDelay(CorrectionJob, 'findOneAndUpdate', (f) => f.type === 'verify', 20, clock, () =>
      claimVerifyJob({ config: tight, agentId: AGENT, startedAt: 0, deps: { ...deps(), clock: () => clock.now }, now: at(2) }));
    assert.deepEqual(result, { job: null, retryAfter: c.agent.busyRetrySeconds, batchDue: false });
    assert.equal((await load(r._id)).verification.status, 'queued');
    assert.equal(inProgressWrites, 0, 'workflow changed after its budget expired');
  } finally {
    ErrorReport.updateOne = orig;
  }
  // והמשימה נמסרת בתפיסה הבאה (בלי ניסיון ובלי פקיעה שנספרו)
  const next = await claim(c, at(3));
  assert.ok(next.job);
  const job = await CorrectionJob.findById(next.job.jobId).lean();
  assert.equal(job.leaseExpiries, 0);
});

// הביקורת החמישית #314: המקור אותר ("כבר הוחל") אבל כתיבתו מיצתה את התקציב — בלי סגירה ובלי מייל; בתפיסה הבאה המקור
// מאותר מחדש (מקור שמור שאינו שמיש אינו משמש) והדיווח נסגר אז.
test('הביקורת החמישית #314: כתיבת המקור מיצתה את התקציב — "כבר הוחל" אינו נסגר ואין מייל; בתפיסה הבאה נסגר', async () => {
  const c = pull();
  const tight = { ...c, agent: { ...c.agent, claimBudgetMs: 200 } };
  const original = 'כתב הרב הגדול כי הרב השגיאה היא עיקר הענין ובכל אופן';
  const proposed = original.replace('השגיאה', 'השגחה');
  const r = await ingest('r5-close-after-budget', c, {
    correction: { original_line: original, original_selection: null, selection_offset: null, proposed_text: proposed, context_before: '', context_after: '' },
  });
  gh.pushExternal('main', { [PATH]: `<h1>בראשית</h1>\n\n${proposed}\nסוף\n` });
  const scheduled = [];
  const clock = { now: 190 };
  const result = await withMongoDelay(ErrorReport, 'updateOne', (f, u) => Boolean(u?.$set?.resolvedSource), 20, clock, () =>
    claimVerifyJob({ config: tight, agentId: AGENT, startedAt: 0, deps: { ...deps(), schedule: (work) => scheduled.push(work), clock: () => clock.now }, now: at(2) }));
  assert.deepEqual(result, { job: null, retryAfter: c.agent.busyRetrySeconds, batchDue: false });
  const after = await load(r._id);
  assert.deepEqual([after.state, after.closeReason ?? null, scheduled.length], ['open', null, 0]);
  assert.equal(after.resolvedSource.status, 'already_applied');
  // בתפיסה הבאה (בלי עיכוב) — איתור מחדש, ואז הסגירה והמייל
  const again = await claimVerifyJob({ config: c, agentId: AGENT, deps: { ...deps(), schedule: (work) => scheduled.push(work) }, now: at(3) });
  assert.equal(again.job, null);
  const closed = await load(r._id);
  assert.equal(closed.state, 'closed_already_fixed');
  assert.equal(scheduled.length, 1);
});

// מקור שמור שאינו שמיש (נשאר רק כשהטיפול בו נקטע — תקלה אחרי שמירתו) אינו נשלח לשירות כ"מוכן": התפיסה מאתרת מחדש.
test('מקור שמור שאינו שמיש (not_found) — התפיסה מאתרת מחדש, ונמסר המקור הטרי', async () => {
  const c = pull();
  const r = await ingest('r5-stale-unusable-source', c);
  await ErrorReport.updateOne({ _id: r._id }, { $set: { resolvedSource: { status: 'not_found', generation: r.workflowGeneration, resolvedAt: T0 } } });
  const res = await claim(c, at(1));
  assert.ok(res.job, JSON.stringify(res));
  assert.equal(res.job.request.report_id, String(r._id));
  const after = await load(r._id);
  assert.equal(after.resolvedSource.status, 'exact');
  assert.equal(after.manual.status, 'none');
});
