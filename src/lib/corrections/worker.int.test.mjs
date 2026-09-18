/**
 * בדיקות אינטגרציה של ה-worker (תור עמיד, retries, ניתוב, פרסום) מול MongoDB אמיתי,
 * שירות בדיקה מדומה ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runWorkerBatch, claimJob, dispatchOutbox, processPublishJob } from './worker.js';
import { claimReport } from './volunteer.js';
import { deriveLabels } from './labels.js';
import { FakeGitHub } from './testing/fake-github.js';
import { createMockVerifyFetch, buildMockDecision } from './testing/mock-verify.js';
import { startMongo } from './testing/mongo.js';
import { computeChangeDigest } from './ocj1.js';
import { computeHealth } from './health.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const REPO = 'Otzaria/otzaria-library';
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const NEW = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים';
const FILE = `<h1>בראשית</h1>\r\n\r\n${LINE}\r\nסוף\r\n`;
const SEL = 'אֱלֹהִ֑ים';
const START = LINE.indexOf(SEL);

const BASE_ENV = {
  CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 'sec',
};
const PUBLISH_ENV = { DICTA_LIBRARY_GITHUB_TOKEN: 't' };
const FULL_AUTO_ENV = { ...BASE_ENV, ...PUBLISH_ENV, CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content' };
const PR_RUNTIME = { publishMode: 'pr' };
const AUTO_RUNTIME = { publishMode: 'pr', autoPublish: true };
// הכוונון קבוע בקוד; הבדיקות מקצרות אותו ישירות על אובייקט ההגדרות.
const tuneVerify = (c, over) => ({ ...c, verify: { ...c.verify, ...over } });
const cfg = (over = {}, runtime = {}) => tuneVerify(getCorrectionsConfig({ ...BASE_ENV, ...over }, runtime), { backoffBaseSeconds: 10, timeoutMs: 1000 });

const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);

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
const run = (config, deps, now, workerId = 'w1') => runWorkerBatch({ config, workerId, deps: { random: () => 0, ...deps }, now });

test('[T30] כיבוי השירות כשיש משימות ממתינות → הכל עובר לידני; הפעלה מחדש לא מושכת אותן חזרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const on = cfg();
  const r = await ingest('t30', on);
  await dispatchOutbox({ config: on, now: T0 });
  assert.equal(await CorrectionJob.countDocuments({ status: 'pending' }), 1);
  const off = cfg({ CORRECTIONS_VERIFY_ENABLED: '0' });
  const verify = createMockVerifyFetch(() => ({ status: 500 }));
  const stats = await run(off, { verifyFetch: verify }, at(1));
  assert.equal(stats.drained, 1);
  const after1 = await load(r._id);
  assert.equal(after1.manual.status, 'queued');
  assert.equal(after1.manual.handoffReason, 'service_disabled');
  assert.equal(after1.verification.status, 'skipped_service_disabled');
  assert.equal(await CorrectionJob.countDocuments({ status: { $in: ['pending', 'leased'] } }), 0);
  await run(on, { verifyFetch: verify }, at(2));
  assert.equal(verify.calls.length, 0);
  assert.equal((await load(r._id)).manual.status, 'queued');
});

test('[T8] שירות לא מוגדר → ידני מיד, בלי קריאות רשת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const r = await ingest('t8', getCorrectionsConfig({}));
  const verify = createMockVerifyFetch(() => ({ status: 200 }));
  await run(getCorrectionsConfig({}), { verifyFetch: verify }, T0);
  assert.equal((await load(r._id)).manual.handoffReason, 'service_disabled');
  assert.equal(verify.calls.length, 0);
  assert.ok(deriveLabels(await load(r._id)).some((l) => l.text === 'השירות אינו מוגדר'));
});

test('[T9] כשל הרשאה (401) / חוזה (api_version) → ידני מיד בלי retry', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const r1 = await ingest('t9a', cfg());
  const r2 = await ingest('t9b', cfg());
  const verify = createMockVerifyFetch((call) => (call.body.report_id === String(r1._id)
    ? { status: 401, body: { error: 'unauthorized' } }
    : { status: 200, body: { ...buildMockDecision(call.body), api_version: '9' } }));
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(10_000));
  assert.equal(verify.calls.length, 2);
  const a = await load(r1._id);
  const b = await load(r2._id);
  assert.equal(a.manual.handoffReason, 'http_401');
  assert.equal(b.manual.handoffReason, 'invalid_response');
  assert.equal(await CorrectionJob.countDocuments({ status: 'failed' }), 2);
});

test('[T10] 503/timeout → תור עמיד עם backoff; request_id זהה בניסיון חוזר; הצלחה בהמשך', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const r = await ingest('t10', cfg());
  let n = 0;
  const verify = createMockVerifyFetch(async (call, { signal }) => {
    n += 1;
    if (n === 1) return { status: 503, headers: { 'retry-after': '40' } };
    if (n === 2) return new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason)));
    return { status: 200, body: buildMockDecision(call.body, { decision: 'approved', scope: 'technical_only' }) };
  });
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  let job = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 1);
  assert.equal(job.lastErrorClass, 'transient');
  assert.ok(job.nextAttemptAt >= at(40), 'Retry-After כובד');
  const waiting = await load(r._id);
  assert.equal(waiting.verification.status, 'queued');
  assert.ok(deriveLabels(waiting).some((l) => l.text === 'ממתין לניסיון חוזר'));

  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(20));
  assert.equal(verify.calls.length, 1, 'לא ניסה לפני המועד');
  // "הפעלה מחדש": worker חדש, בלי זיכרון משותף — המצב כולו ב-DB.
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(41), 'w2');
  job = await CorrectionJob.findOne({ report: r._id }).lean();
  assert.equal(job.attempts, 2);
  assert.equal(job.lastError, 'timeout');
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(10_000), 'w3');
  const ids = verify.calls.map((c) => c.headers['x-request-id']);
  assert.equal(new Set(ids).size, 1);
  assert.equal(verify.calls[0].headers.authorization, 'Bearer sec');
  assert.equal(verify.calls[0].redirect, 'error');
  const done = await load(r._id);
  assert.equal(done.manual.handoffReason, 'needs_content_review');
});

test('[T11] מיצוי ניסיונות ומיצוי זמן כולל → ידני עם סיבה מפורשת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const verify = createMockVerifyFetch(() => ({ status: 429 }));
  const c1 = tuneVerify(cfg(), { maxAttempts: 2 });
  const r1 = await ingest('t11a', c1);
  await run(c1, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  await run(c1, { verifyFetch: verify, githubFetch: gh.fetch }, at(10_000));
  const a = await load(r1._id);
  assert.equal(a.manual.handoffReason, 'retries_exhausted');
  assert.ok(deriveLabels(a).some((l) => l.text === 'מוצו הניסיונות'));

  await db.reset();
  const c2 = tuneVerify(cfg(), { maxTotalSeconds: 60, backoffBaseSeconds: 200 });
  const r2 = await ingest('t11b', c2);
  await run(c2, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  assert.equal((await load(r2._id)).manual.handoffReason, 'deadline_exhausted');
});

test('[T12] approved + technical_only → מתנדב; אין חבילה, אין משימת פרסום, אין כתיבה ל-GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const c = cfg(PUBLISH_ENV, AUTO_RUNTIME);
  const r = await ingest('t12', c);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_only' }) }));
  await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, at(60));
  const after1 = await load(r._id);
  assert.equal(after1.approval.scope, 'technical_only');
  assert.equal(after1.approval.authority, 'service');
  assert.equal(after1.manual.handoffReason, 'needs_content_review');
  assert.equal(after1.publish.status, 'not_ready');
  assert.equal(await ChangePackage.countDocuments({}), 0);
  assert.equal(await CorrectionJob.countDocuments({ type: 'publish' }), 0);
  assert.equal(gh.calls.filter((x) => x.method !== 'GET').length, 0);
  assert.ok(deriveLabels(after1).some((l) => l.text === 'אושר טכנית בלבד'));
});

test('[T13] approved מלא → פרסום (PR) רק כשהמדיניות מתירה; בלי פרסום אוטומטי → ידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
  const auto = cfg(FULL_AUTO_ENV, AUTO_RUNTIME);
  const r = await ingest('t13a', auto);
  assert.equal(r.verification.requestedScope, 'technical_and_content');
  await run(auto, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  let s = await load(r._id);
  assert.equal(s.approval.authority, 'service');
  assert.equal(s.publish.status, 'ready');
  await run(auto, { verifyFetch: verify, githubFetch: gh.fetch }, at(5));
  s = await load(r._id);
  assert.equal(s.publish.status, 'pr_opened');
  assert.equal(s.state, 'open', 'PR פתוח אינו "פורסם"');
  assert.equal(gh.pulls.length, 1);
  assert.equal(gh.readFile(s.publish.branch, PATH), FILE.replace(LINE, NEW));
  gh.mergePull(1);
  await run(auto, { verifyFetch: verify, githubFetch: gh.fetch }, at(10));
  s = await load(r._id);
  assert.equal(s.publish.status, 'committed');
  assert.equal(s.state, 'closed_published');
  assert.equal(s.inclusion.status, 'merged_to_main');

  await db.reset();
  const noAuto = cfg(FULL_AUTO_ENV, PR_RUNTIME);
  const r2 = await ingest('t13b', noAuto);
  const gh2 = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  await run(noAuto, { verifyFetch: verify, githubFetch: gh2.fetch }, T0);
  assert.equal((await load(r2._id)).manual.handoffReason, 'auto_publish_not_permitted');
});

test('חוזה B: בקשת ה-worker נושאת diff עם הקשר מאותו blob; החבילה וה-digest אינם תלויים בו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const c = { ...cfg(FULL_AUTO_ENV, AUTO_RUNTIME), diffContextLines: 2 };
  const r = await ingest('tdiff', c);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
  await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  const req = verify.calls[0].body;
  assert.deepEqual(req.diff.hunk, { start_line: 1, line_number: 3, before: ['<h1>בראשית</h1>', ''], removed: [LINE], added: [NEW], after: ['סוף'], line_ending: 'crlf' });
  assert.equal(req.diff.context_lines, 2);
  assert.equal(req.diff.unified, `--- a/${PATH}\n+++ b/${PATH}\n@@ -1,4 +1,4 @@\n <h1>בראשית</h1>\n \n-${LINE}\n+${NEW}\n סוף\n`);
  const pkg = await ChangePackage.findOne({}).lean();
  assert.equal(pkg.baseBlobSha, req.source.blob_sha);
  assert.equal(pkg.changeDigest, computeChangeDigest({ path: PATH, base_blob_sha: req.source.blob_sha, line_index: 2, original_line: LINE, new_line: NEW }));
  const s = await load(r._id);
  assert.equal(s.publish.status, 'ready');
});

test('[T14] שירות שטוען לסמכות מלאה כשהאתר מתיר technical_only → ידני + authority_exceeded', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const c = cfg(PUBLISH_ENV, AUTO_RUNTIME);
  const r = await ingest('t14', c);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
  await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  const s = await load(r._id);
  assert.equal(s.verification.authorityExceeded, true);
  assert.equal(s.approval.scope, 'technical_only');
  assert.equal(s.manual.status, 'queued');
  assert.equal(await CorrectionJob.countDocuments({ type: 'publish' }), 0);
});

test('[T15] מזהים לא תואמים / generation ישן / תשובה אסינכרונית (202) מטופלים בבטחה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const r1 = await ingest('t15a', cfg());
  const r2 = await ingest('t15b', cfg());
  const r3 = await ingest('t15c', cfg());
  const verify = createMockVerifyFetch((call) => {
    if (call.method === 'GET') {
      assert.equal(call.path, '/v1/verify/job_1');
      return { status: 200, body: buildMockDecision(pollReq, { decision: 'needs_review', reasonCode: 'content_doubtful' }) };
    }
    const rid = call.body.report_id;
    if (rid === String(r1._id)) return { status: 200, body: { ...buildMockDecision(call.body), request_id: 'req_other' } };
    if (rid === String(r2._id)) return { status: 200, body: buildMockDecision(call.body, { generation: call.body.workflow_generation - 1 }) };
    pollReq = call.body;
    return { status: 202, body: { api_version: '1', request_id: call.body.request_id, processing_status: 'pending', job_id: 'job_1', poll_after_seconds: 30 } };
  });
  let pollReq = null;
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  assert.equal((await load(r1._id)).manual.handoffReason, 'response_mismatch');
  const s2 = await load(r2._id);
  assert.equal(s2.decisions.length, 1);
  assert.equal(s2.decisions[0].stale, true);
  assert.equal(s2.approval.authority, 'none');
  const s3 = await load(r3._id);
  assert.equal(s3.manual.status, 'none', '202 אינו אישור ואינו כשל');
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(31));
  const s3b = await load(r3._id);
  assert.equal(s3b.manual.handoffReason, 'needs_review');
  assert.equal(s3b.verification.decision, 'needs_review');
});

test('[T16] מתנדב לקח את הדיווח לפני תשובת השירות → התשובה נשמרת להיסטוריה בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const auto = cfg(FULL_AUTO_ENV, AUTO_RUNTIME);
  const vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
  const r = await ingest('t16', auto);
  const verify = createMockVerifyFetch(async (call) => {
    const claim = await claimReport({ user: vol, id: String(r._id), config: auto, now: T0 });
    assert.equal(claim.status, 200);
    return { status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) };
  });
  await run(auto, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  const s = await load(r._id);
  assert.equal(s.manual.status, 'claimed');
  assert.equal(s.approval.authority, 'none');
  assert.equal(s.publish.status, 'not_ready');
  assert.equal(s.decisions[0].stale, true);
  assert.equal(await ChangePackage.countDocuments({}), 0);
  assert.equal(await CorrectionJob.countDocuments({ type: 'publish' }), 0);
});

test('[T16] לקיחה בזמן המתנה ל-retry מבטלת את המשימה; השירות לא נקרא שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const vol = await User.create({ name: 'מתנדב2', email: 'v2@example.org', password: 'x', isCorrectionsVolunteer: true });
  const r = await ingest('t16b', cfg());
  const verify = createMockVerifyFetch(() => ({ status: 503 }));
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  assert.equal((await claimReport({ user: vol, id: String(r._id), config: cfg(), now: at(1) })).status, 200);
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, at(100_000));
  assert.equal(verify.calls.length, 1);
  assert.equal((await CorrectionJob.findOne({ report: r._id }).lean()).status, 'cancelled');
  assert.equal((await load(r._id)).verification.status, 'superseded');
});

test('[T18] שני workers: תפיסה אטומית אחת; lease שפג נלקח ע"י אחר וה-fence הישן נכשל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = cfg();
  await ingest('t18', c);
  await dispatchOutbox({ config: c, now: T0 });
  const [a, b] = await Promise.all([
    claimJob('verify', { workerId: 'A', now: T0, leaseSeconds: 60 }),
    claimJob('verify', { workerId: 'B', now: T0, leaseSeconds: 60 }),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const first = a || b;
  assert.equal(await claimJob('verify', { workerId: 'C', now: at(30), leaseSeconds: 60 }), null);
  const taken = await claimJob('verify', { workerId: 'C', now: at(61), leaseSeconds: 60 });
  assert.equal(taken.leaseOwner, 'C');
  assert.equal(taken.fence, first.fence + 1);
  const stale = await CorrectionJob.updateOne({ _id: first._id, fence: first.fence, status: 'leased' }, { $set: { status: 'done' } });
  assert.equal(stale.modifiedCount, 0);
  // האינדקס הייחודי מונע משימה פעילה כפולה לאותה פעולה
  await assert.rejects(CorrectionJob.create({ type: 'verify', report: first.report, activeKey: first.activeKey, generation: 1, maxAttempts: 1, deadlineAt: T0 }));
});

test('[T24] נפילה אחרי הצלחת GitHub → reconciliation לפי מזהה הניסיון, בלי קומיט/PR כפול', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const mode of ['pr', 'direct']) {
    await db.reset();
    const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
    const c = cfg(FULL_AUTO_ENV, { publishMode: mode, autoPublish: true });
    const r = await ingest(`t24-${mode}`, c);
    const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
    await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
    const crash = { afterPublishWrite: async () => { throw Object.assign(new Error('boom'), { simulatedCrash: true }); } };
    await assert.rejects(run(c, { verifyFetch: verify, githubFetch: gh.fetch, hooks: crash }, at(1)));
    const attempt = await PublishAttempt.findOne({ report: r._id }).lean();
    assert.equal(attempt.status, 'started');
    const writesAfterCrash = gh.calls.filter((x) => x.method !== 'GET').length;
    await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, at(1 + 10 * 60));
    const s = await load(r._id);
    const expectStatus = mode === 'pr' ? 'pr_opened' : 'committed';
    assert.equal(s.publish.status, expectStatus, mode);
    assert.equal(gh.calls.filter((x) => x.method !== 'GET').length, writesAfterCrash, 'אין כתיבה נוספת');
    assert.equal(gh.pulls.length, mode === 'pr' ? 1 : 0);
    assert.equal((await PublishAttempt.findOne({ attemptId: attempt.attemptId }).lean()).status, expectStatus);
    if (mode === 'direct') assert.equal(s.state, 'closed_published');
  }
});

test('worker רושם heartbeat גם כשאין עבודה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await run(getCorrectionsConfig({}), {}, T0, 'hb');
  const hb = await WorkerHeartbeat.findOne({ workerId: 'hb' }).lean();
  assert.ok(hb.lastBeatAt);
  assert.equal(hb.lastError, null);
});

test('[T23] already_fixed מהשירות במיקום אחר מהשורה המדווחת → ידני, לא סגירה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // התיקון המוצע מופיע בשורה 3, אבל השורה המדווחת (2) עדיין שגויה.
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE.replace('סוף', NEW) } });
  const r = await ingest('t23-elsewhere', cfg());
  const verify = createMockVerifyFetch((call) => {
    const body = buildMockDecision(call.body, { decision: 'already_fixed', reasonCode: 'ok' });
    const c = body.change;
    c.target.line_index = 3;
    c.change_digest = computeChangeDigest({ path: c.target.path, base_blob_sha: c.base.blob_sha, line_index: 3, original_line: c.original_line, new_line: c.new_line });
    return { status: 200, body };
  });
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  const s = await load(r._id);
  assert.equal(s.state, 'open');
  assert.equal(s.manual.handoffReason, 'already_fixed_unverified');
});

test('[T23] already_fixed מהשירות כשהשורה המדווחת כבר מכילה את התיקון → נסגר בלי קומיט', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const r = await ingest('t23-here', cfg());
  const verify = createMockVerifyFetch((call) => {
    gh.pushExternal('main', { [PATH]: FILE.replace(LINE, NEW) });
    return { status: 200, body: buildMockDecision(call.body, { decision: 'already_fixed', reasonCode: 'ok' }) };
  });
  await run(cfg(), { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  const s = await load(r._id);
  assert.equal(s.state, 'closed_already_fixed');
  assert.equal(gh.calls.filter((x) => x.method !== 'GET').length, 0);
});

test('[T18] worker שה-lease שלו על משימת פרסום נלקח ע"י אחר אינו כותב ל-GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const c = cfg(FULL_AUTO_ENV, AUTO_RUNTIME);
  const r = await ingest('t18-pub', c);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
  await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, T0);
  assert.equal((await load(r._id)).publish.status, 'ready');
  await dispatchOutbox({ config: c, now: at(1) });
  const jobA = await claimJob('publish', { workerId: 'A', now: at(1), leaseSeconds: 60 });
  const jobB = await claimJob('publish', { workerId: 'B', now: at(100), leaseSeconds: 60 });
  assert.equal(jobB.fence, jobA.fence + 1);
  const deps = { githubFetch: gh.fetch, random: () => 0 };
  assert.equal(await processPublishJob(jobA, { config: c, deps, now: at(101) }), 'lease_lost');
  assert.equal(gh.calls.filter((x) => x.method !== 'GET').length, 0);
  assert.equal(await processPublishJob(jobB, { config: c, deps, now: at(102) }), 'pr_opened');
  assert.equal(gh.pulls.length, 1);
});

test('משימה שזורקת חריגה לא צפויה נספרת כניסיון ובמיצוי עוברת לידני (לא נתפסת לנצח)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  const c = cfg(FULL_AUTO_ENV, AUTO_RUNTIME);
  const r = await ingest('poison', c);
  const verify = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { scope: 'technical_and_content' }) }));
  t.mock.method(ChangePackage, 'create', async () => { throw new Error('boom'); });
  t.mock.method(console, 'error', () => {});
  for (let i = 0; i < 12; i++) await run(c, { verifyFetch: verify, githubFetch: gh.fetch }, at(i * 5000));
  const job = await CorrectionJob.findOne({ report: r._id, type: 'verify' }).lean();
  assert.equal(job.status, 'failed');
  assert.equal(job.attempts, c.verify.maxAttempts);
  const s = await load(r._id);
  assert.equal(s.manual.status, 'queued');
  assert.equal(s.manual.handoffReason, 'worker_error');
  assert.equal(verify.calls.length, c.verify.maxAttempts);
});

test('health: worker מושהה (שבת) כשיש עבודה ממתינה אינו מוצג כתקין', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ingest('paused', cfg());
  await WorkerHeartbeat.create({ workerId: 'w', lastBeatAt: T0, lastBatch: { paused: 'shabbat' }, lastError: null });
  const h = await computeHealth({ config: cfg(), now: at(10) });
  assert.equal(h.healthy, false);
  assert.ok(h.problems.includes('worker_paused'));
});
