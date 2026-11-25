/**
 * בדיקות אינטגרציה ל-PR שנסגר בלי מיזוג (מנהל הספרייה מחיל PRs בקומיט מקומי וסוגר אותם): מעקב ה-PR
 * ב-worker וה-migration של דיווחים שהמעקב הישן העביר לידני. MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import ErrorReport from '../../models/ErrorReport.js';
import ChangePackage from '../../models/ChangePackage.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runWorkerBatch } from './worker.js';
import { runReportAction } from './actions.js';
import { listReports, getReportDetail } from './volunteer.js';
import { migrateClosedPullReports, revertClosedPullMigration } from './migrate.js';
import { applyClosedPrAction } from './closed-pr.js';
import { CLOSED_PR_ACTION } from './absorption.js';
import { manualQueueSet } from './store.js';
import { deriveLabels } from './labels.js';
import { computeHealth } from './health.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { FakeGitHub, json } from './testing/fake-github.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const REPO = 'Otzaria/otzaria-library';
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const PATH2 = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/שמות.txt';
const H1 = '<h1>בראשית</h1>';
const LINES = ['(א) בְּרֵאשִׁית בָּרָא אֱלֹהִים', '(ב) וְהָאָרֶץ הָיְתָה תֹהוּ', '(ג) וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר', '(ד) וַיַּרְא אֱלֹהִים אֶת הָאוֹר', '(ה) וַיִּקְרָא אֱלֹהִים לָאוֹר יוֹם'];
const fixed = (line) => `${line} [תוקן]`;
const fileOf = (lines, title = H1) => [title, '', ...lines, 'סוף', ''].join('\r\n');
const FILE = fileOf(LINES);
const EXODUS = ['(א) וְאֵלֶּה שְׁמוֹת בְּנֵי יִשְׂרָאֵל', '(ב) רְאוּבֵן שִׁמְעוֹן לֵוִי'];
const FILE2 = fileOf(EXODUS, '<h1>שמות</h1>');
const CONFIG = getCorrectionsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 't' }, { publishMode: 'pr' });
const DISABLED = getCorrectionsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 't' }, { publishMode: 'disabled' });
const GRACE = CONFIG.publish.absorptionGraceSeconds;
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);
const DAY = 86_400;

let gh;
let users;
beforeEach(async () => {
  if (db.skip) return;
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE, [PATH2]: FILE2 } });
  users = {
    a: await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isCorrectionsVolunteer: true }),
    b: await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isCorrectionsVolunteer: true }),
  };
});

/** דיווח על שורה שלמה (בלי בחירה) בשורה i של הקובץ. */
async function ingest(id, i, { lines = LINES, book = 'בראשית', path = 'תנך/תורה/בראשית.txt' } = {}) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: book, current_ref: `${book} ${i}`, line_number: i + 3,
    selected_text: book, error_details: 'שם', context_text: '', file_path: `אוצריא/${path}`, source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: i + 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: `אוצריא/${path}` },
    correction: { original_line: lines[i], original_selection: null, selection_offset: null, proposed_text: fixed(lines[i]), context_before: '', context_after: '' },
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config: CONFIG, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return String((await ErrorReport.findOne({ reportId: id }).lean())._id);
}

const act = (user, id, body, now = T0) => runReportAction({ user, id, body, config: CONFIG, deps: { githubFetch: gh.fetch }, now });
const work = (now, { config = CONFIG, workerId = 'w', hooks } = {}) => runWorkerBatch({ config, workerId, deps: { githubFetch: gh.fetch, random: () => 0, hooks }, now });
const load = (id) => ErrorReport.findById(id).lean();
const events = async (id) => (await CorrectionEvent.find({ report: id }).sort({ createdAt: 1 }).lean()).map((e) => e.type);
const labels = async (id) => deriveLabels(await load(id)).map((l) => l.text);

/** מתנדב מאשר, וה-worker פותח PR. */
async function approved(id, user = users.a) {
  const c = await act(user, id, { action: 'claim' });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const d = await getReportDetail({ user, id, config: CONFIG, deps: { githubFetch: gh.fetch } });
  const ap = await act(user, id, { action: 'approve', generation: c.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  await work(at(1));
  const r = await load(id);
  assert.equal(r.publish.status, 'pr_opened');
  return r;
}

/** הקומיט המקומי של מנהל הספרייה מגיע ל-main: השורות שתוקנו (ואפשר גם שורות שנוספו לפני, או בסוף). */
const pushFixes = (indexes, { prefix = [], suffix = [], path = PATH, lines = LINES } = {}) => {
  const next = lines.map((l, i) => (indexes.includes(i) ? fixed(l) : l));
  const title = path === PATH ? H1 : '<h1>שמות</h1>';
  gh.pushExternal('main', { [path]: fileOf([...prefix, ...next, ...suffix], title) }, 'batch');
};
// תוכן ייחודי לבדיקה: blob חדש שאינו במטמון מבדיקות קודמות.
const unique = (t) => `הערת שוליים ${t.name.length}-${Date.now()}`;
const gets = (from, re) => gh.calls.slice(from).filter((c) => c.method === 'GET' && re.test(c.path)).length;

test('PR שנסגר בלי מיזוג והתיקון כבר ב-main → נסגר כפורסם (נקלט), לא לתור הידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('abs', 0);
  const before1 = await approved(id);
  gh.closePull(before1.publish.prNumber, { comment: 'התיקון נבדק ונקלט בקומיט מקומי, ייכנס ל-main בקרוב' });
  pushFixes([0]);
  await work(at(2));
  const r = await load(id);
  assert.equal(r.state, 'closed_published');
  assert.equal(r.status, 'resolved', 'הסטטוס הישן מסונכרן');
  assert.equal(r.publish.status, 'committed');
  assert.equal(r.publish.absorbed, true);
  assert.equal(r.closeReason, 'pr_absorbed');
  assert.equal(r.inclusion.status, 'merged_to_main');
  assert.equal(r.manual.status, 'none');
  assert.equal(r.workflowGeneration, before1.workflowGeneration + 1);
  assert.equal(r.publish.absorptionCheck.anchored, true, 'מעוגן להקשר שנשמר באישור');
  assert.ok((await labels(id)).includes('פורסם במקור'));
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_absorbed' }).lean();
  assert.equal(ev.data.prNumber, before1.publish.prNumber);
  assert.equal(ev.data.mainSha, gh.headSha('main'));
  assert.equal(ev.data.relocated, false);
  assert.ok(!(await events(id)).includes('handoff_manual'));
});

test('PR נסגר לפני שהתיקון הגיע ל-main → ממתין (נעול ללקיחה, לא בתור, עם הערת הסגירה); נקלט אחר כך גם כששורות זזו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('pend', 1);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber, { comment: 'נבדק ונקלט בקומיט מקומי, ייכנס ל-main בקרוב — ראו a@example.org' });
  await work(at(2));
  let r = await load(id);
  assert.equal(r.state, 'open');
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(r.publish.prClosedAt.getTime(), at(2).getTime());
  assert.equal(r.publish.absorptionDeadline.getTime(), at(2 + GRACE).getTime());
  assert.equal(r.publish.absorptionCheck.outcome, 'pending');
  assert.match(r.publish.prCloseComment.body, /נקלט בקומיט מקומי/);
  assert.ok(!r.publish.prCloseComment.body.includes('@example.org'), 'בלי כתובות מייל');
  assert.equal(r.manual.status, 'none');
  assert.equal(r.workflowGeneration, r0.workflowGeneration, 'זיהוי הסגירה אינו פוסל פעולה של מתנדב');
  assert.ok((await labels(id)).includes('ה-PR נסגר — ממתין לקליטה ב-main'));
  assert.ok(!(await labels(id)).includes('נפתח PR (טרם מוזג)'));
  assert.equal((await listReports({ user: users.b, query: { view: 'queued' }, now: at(2) })).body.total, 0);
  assert.equal((await listReports({ user: users.b, query: { view: 'publishing' }, now: at(2) })).body.total, 1);
  assert.equal((await act(users.b, id, { action: 'claim' }, at(2))).body.error, 'approved_locked', 'לקיחה הייתה יוצרת PR כפול');
  const d = await getReportDetail({ user: users.b, id, config: CONFIG, deps: { githubFetch: gh.fetch } });
  assert.match(d.body.report.publish.prCloseComment.body, /נקלט בקומיט מקומי/, 'ההערה מוצגת למתנדב');
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_closed_awaiting_absorption' }).lean();
  assert.match(ev.data.comment, /נקלט בקומיט מקומי/);

  await work(at(3));
  assert.equal((await events(id)).filter((e) => e === 'pr_closed_awaiting_absorption').length, 1, 'בדיקה חוזרת אינה אירוע');
  pushFixes([1], { prefix: ['הקדמה'] });
  await work(at(4));
  r = await load(id);
  assert.equal(r.state, 'closed_published');
  assert.equal(r.publish.absorbed, true);
  const absorbed = await CorrectionEvent.findOne({ report: id, type: 'pr_absorbed' }).lean();
  assert.deepEqual([absorbed.data.relocated, absorbed.data.lineIndex, absorbed.data.anchored], [true, 4, true]);
});

test('PR נסגר והתיקון לא נקלט ב-main עד תום ההמתנה → ידני; אישור מחדש פותח PR במעקב רגיל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('grace', 2);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  await work(at(2));
  await work(at(2 + GRACE - 1));
  assert.equal((await load(id)).publish.status, 'pr_opened', 'עדיין בזמן ההמתנה');
  await work(at(2 + GRACE));
  const r = await load(id);
  assert.equal(r.state, 'open');
  assert.equal(r.publish.status, 'failed');
  assert.equal(r.publish.lastError, 'pr_closed_unmerged');
  assert.equal(r.manual.status, 'queued');
  assert.equal(r.manual.handoffReason, 'pr_closed_not_absorbed');
  assert.equal(r.status, 'pending');
  assert.equal(r.workflowGeneration, r0.workflowGeneration + 1);
  assert.ok((await labels(id)).includes('פרסום נכשל'));
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_closed_unmerged' }).lean();
  assert.equal(ev.data.reason, 'pr_closed_not_absorbed');
  const claim = await act(users.b, id, { action: 'claim' }, at(3 + GRACE));
  assert.equal(claim.status, 200, 'מתנדב יכול לטפל בו');
  const d = await getReportDetail({ user: users.b, id, config: CONFIG, deps: { githubFetch: gh.fetch } });
  const ap = await act(users.b, id, { action: 'approve', generation: claim.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha }, at(4 + GRACE));
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  // ה-PR החדש נסגר מיד אחרי פתיחתו, באותה אצווה: ההמתנה מתחילה מחדש (prClosedAt של ה-PR הקודם התאפס)
  const closeAtOnce = { afterPublishWrite: async ({ outcome }) => { if (outcome.prNumber) gh.closePull(outcome.prNumber); } };
  await work(at(5 + GRACE), { hooks: closeAtOnce });
  const again = await load(id);
  assert.notEqual(again.publish.prNumber, r0.publish.prNumber);
  assert.equal(again.publish.status, 'pr_opened', 'לא הועבר לידני מיד לפי זמן ההמתנה של ה-PR הקודם');
  assert.equal(again.publish.prClosedAt.getTime(), at(5 + GRACE).getTime());
});

test('PR נסגר והשורה ב-main שונתה אחרת → ממתין עד תום הזמן (תיקון שכן אולי טרם נדחף), ואז ידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('chg', 3);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  gh.pushExternal('main', { [PATH]: FILE.replace(LINES[3], 'נוסח אחר לגמרי') });
  await work(at(2));
  let r = await load(id);
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(r.publish.absorptionCheck.outcome, 'changed');
  await work(at(2 + GRACE));
  r = await load(id);
  assert.equal(r.publish.status, 'failed');
  assert.equal(r.manual.handoffReason, 'source_changed_after_pr_close');
  assert.equal(r.publish.conflictReason, 'source_changed_after_pr_close');
  assert.ok((await labels(id)).includes('התנגשות'));
});

test('תווית דחייה של מנהל הספרייה → ידני מיד, גם כשהשורה ב-main זהה להצעה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('label', 0);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber, { comment: 'לא נקלט — הנוסח המקורי נכון', labels: ['לא נקלט'] });
  pushFixes([0]);
  await work(at(2));
  const r = await load(id);
  assert.deepEqual([r.state, r.publish.status, r.manual.handoffReason], ['open', 'failed', 'pr_rejected_by_maintainer']);
  assert.match(r.publish.prCloseComment.body, /הנוסח המקורי נכון/);
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_closed_unmerged' }).lean();
  assert.deepEqual([ev.data.reason, ev.data.labels], ['pr_rejected_by_maintainer', ['לא נקלט']]);
});

test('PR שנפתח מחדש חוזר למעקב רגיל; דחייה באתר (שסוגרת את ה-PR) אינה עוברת בדיקת קליטה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('reopen', 0);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  await work(at(2));
  gh.pulls[r0.publish.prNumber - 1].state = 'open';
  await work(at(3));
  assert.equal((await load(id)).publish.prClosedAt, null);
  assert.ok((await labels(id)).includes('נפתח PR (טרם מוזג)'));

  const id2 = await ingest('rejected', 1);
  const r2 = await approved(id2);
  const rej = await act(users.b, id2, { action: 'reject_approved', generation: r2.workflowGeneration, reason: 'נוסח שגוי' });
  assert.equal(rej.status, 200, JSON.stringify(rej.body));
  pushFixes([1]);
  await work(at(4));
  const r = await load(id2);
  assert.equal(r.state, 'closed_rejected');
  assert.equal(r.publish.lastError, 'pr_closed_by_rejection');
  assert.ok(!(await events(id2)).includes('pr_absorbed'));
});

test('תום ההמתנה בלי תלות ב-GitHub: כשהפרסום כבוי, וכשהבדיקה נכשלת שוב ושוב (קובץ ענק, תקלה)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // פרסום כבוי: אין שום פנייה ל-GitHub, אבל דיווח שתמה המתנתו עובר לידני לפי התוצאה האחרונה
  const id = await ingest('disabled', 2);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  await work(at(2));
  const calls = gh.calls.length;
  await work(at(2 + GRACE - 1), { config: DISABLED });
  assert.equal((await load(id)).publish.status, 'pr_opened');
  await work(at(2 + GRACE), { config: DISABLED });
  assert.equal(gh.calls.length, calls, 'בלי GitHub');
  let r = await load(id);
  assert.deepEqual([r.publish.status, r.manual.handoffReason], ['failed', 'pr_closed_not_absorbed']);

  // בדיקה שנכשלת תמיד (blob שחורג מה-timeout): השעון מתחיל בזיהוי הסגירה, ובתומו — ידני "לא נבדק"
  const id2 = await ingest('failing', 4);
  const r2 = await approved(id2);
  gh.closePull(r2.publish.prNumber);
  pushFixes([], { suffix: [unique(t)] });
  gh.hooks.beforeRequest = ({ method, path }) => (method === 'GET' && path.includes('/git/blobs/') ? json(504, { message: 'timeout' }) : null);
  await work(at(10));
  r = await load(id2);
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(r.publish.prClosedAt.getTime(), at(10).getTime(), 'השעון התחיל למרות הכשל');
  assert.match(r.publish.lastError, /pr_track_failed/);
  await work(at(10 + GRACE));
  r = await load(id2);
  assert.deepEqual([r.publish.status, r.manual.handoffReason], ['failed', 'pr_closed_unverified']);
  gh.hooks.beforeRequest = null;
});

test('PR שאינו קיים עוד (404) נבדק כמו PR שנסגר; כל PR נקרא פעם אחת לאצווה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('gone', 0);
  const id2 = await ingest('gone2', 1);
  const r = await approved(id);
  await approved(id2);
  // שני דיווחים על אותו PR (כמו PR מרוכז), וה-PR נמחק
  await ErrorReport.updateOne({ _id: id2 }, { $set: { 'publish.prNumber': r.publish.prNumber } });
  gh.hooks.beforeRequest = ({ method, path }) => (method === 'GET' && path.endsWith(`/pulls/${r.publish.prNumber}`) ? json(404, { message: 'Not Found' }) : null);
  pushFixes([0, 1]);
  const from = gh.calls.length;
  await work(at(2));
  gh.hooks.beforeRequest = null;
  assert.equal(gets(from, new RegExp(`/pulls/${r.publish.prNumber}$`)), 1, 'PR אחד — קריאה אחת');
  assert.equal((await load(id)).state, 'closed_published');
  assert.equal((await load(id2)).state, 'closed_published');
});

test('PR שמחזיר 404 עד תום ההמתנה והתיקון לא הגיע ל-main → ממתין, ובתום ההמתנה עובר לידני (לא נסגר)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('gone-forever', 1);
  const r = await approved(id);
  gh.hooks.beforeRequest = ({ method, path }) => (method === 'GET' && path.endsWith(`/pulls/${r.publish.prNumber}`) ? json(404, { message: 'Not Found' }) : null);
  await work(at(2));
  let x = await load(id);
  assert.equal(x.state, 'open', 'ה-404 מתחיל המתנה, לא סוגר');
  assert.equal(x.publish.absorptionDeadline.getTime(), at(2 + GRACE).getTime());
  await work(at(2 + GRACE - 1));
  assert.equal((await load(id)).state, 'open');
  await work(at(2 + GRACE));
  gh.hooks.beforeRequest = null;
  x = await load(id);
  assert.notEqual(x.state, 'closed_published');
  assert.deepEqual([x.publish.status, x.manual.status, x.manual.handoffReason], ['failed', 'queued', 'pr_closed_not_absorbed']);
});

/** דיווח מאושר על בסיס ייחודי (blob שאינו במטמון המשותף) שה-PR שלו נסגר; ב-main התיקון הוחל במקומו והשכנים שונו (אין עיגון). הבסיס אינו נקרא. */
async function closedWithUnreadableBase(t, reportId, { anchored = false } = {}) {
  gh.pushExternal('main', { [PATH]: `${FILE}${unique(t)}\r\n` }, 'unique-base');
  const id = await ingest(reportId, 1);
  const r = await approved(id);
  gh.closePull(r.publish.prNumber);
  const baseSha = gh.fileSha('main', PATH);
  const other = LINES.map((l, i) => (i === 1 ? fixed(l) : anchored ? l : `שורה אחרת לגמרי ${i} ${l.split('').reverse().join('')}`));
  gh.pushExternal('main', { [PATH]: fileOf(other) }, 'batch');
  gh.hooks.beforeRequest = ({ method, path }) => (method === 'GET' && path.endsWith(`/git/blobs/${baseSha}`) ? json(500, { message: 'boom' }) : null);
  return id;
}

test('הבסיס המלא אינו נקרא: "נקלט" לא מעוגן ממתין (לא נסגר מיד), ונבדק שוב במחזור הבא כשהבסיס חוזר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await closedWithUnreadableBase(t, 'nobase');
  await work(at(2));
  let x = await load(id);
  assert.equal(x.state, 'open', 'בלי הבסיס — לא נסגר');
  assert.equal(x.publish.absorptionCheck.outcome, 'changed');
  assert.equal(x.publish.absorptionCheck.detail, 'base_required');
  assert.equal(x.publish.absorptionCheck.baseError, true);
  await work(at(3));
  assert.equal((await load(id)).state, 'open', 'עדיין בלי בסיס');
  // ביקורת: כשהבסיס נקרא באותו מצב — נקלט
  gh.hooks.beforeRequest = null;
  await work(at(4));
  x = await load(id);
  assert.equal(x.state, 'closed_published');
  assert.equal(x.publish.absorptionCheck.baseError, false);
});

test('הבסיס המלא אינו נקרא: גם "נקלט" מעוגן ממתין (base_required), ונסגר רק כשהבסיס חוזר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await closedWithUnreadableBase(t, 'nobase-anchored', { anchored: true });
  await work(at(2));
  let x = await load(id);
  assert.equal(x.state, 'open', 'בלי הבסיס — גם מעוגן לא נסגר');
  assert.equal(x.publish.absorptionCheck.outcome, 'changed');
  assert.equal(x.publish.absorptionCheck.detail, 'base_required');
  assert.equal(x.publish.absorptionCheck.baseError, true);
  await work(at(3));
  assert.equal((await load(id)).state, 'open', 'עדיין בלי בסיס');
  gh.hooks.beforeRequest = null;
  await work(at(4));
  x = await load(id);
  assert.equal(x.state, 'closed_published');
  assert.equal(x.publish.absorptionCheck.baseError, false);
});

test('הבסיס המלא אינו נקרא עד תום ההמתנה → לידני, לעולם לא נסגר כנקלט', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await closedWithUnreadableBase(t, 'nobase-expiry');
  await work(at(2));
  await work(at(2 + GRACE));
  gh.hooks.beforeRequest = null;
  const x = await load(id);
  assert.notEqual(x.state, 'closed_published');
  assert.deepEqual([x.publish.status, x.manual.status, x.manual.handoffReason], ['failed', 'queued', 'source_changed_after_pr_close']);
});

test('בדיקה חוזרת רק כש-main או הקובץ השתנו: אותו main — בלי בדיקה; קובץ אחר זז — בלי הורדה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('reuse', 1);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  pushFixes([], { suffix: [unique(t)] });
  await work(at(2));
  const first = (await load(id)).publish.absorptionCheck;
  assert.equal(first.outcome, 'pending');
  await work(at(3));
  const same = (await load(id)).publish.absorptionCheck;
  assert.equal(same.at.getTime(), first.at.getTime(), 'main לא זז — התוצאה ממוחזרת');
  gh.pushExternal('main', { [PATH2]: fileOf([...EXODUS, 'שינוי בקובץ אחר'], '<h1>שמות</h1>') });
  const from = gh.calls.length;
  await work(at(4));
  const moved = (await load(id)).publish.absorptionCheck;
  assert.equal(moved.mainSha, gh.headSha('main'));
  assert.equal(moved.at.getTime(), first.at.getTime(), 'הקובץ לא השתנה — בלי בדיקה מחדש');
  assert.equal(gets(from, /\/git\/blobs\//), 0, 'בלי הורדת הקובץ');
  pushFixes([1]);
  await work(at(5));
  assert.equal((await load(id)).state, 'closed_published');
});

test('גדרות: generation ומספר ה-PR בתנאי הכתיבה; לקיחה/דחייה בין הקריאה לכתיבה → raced', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('fence', 0);
  await approved(id);
  const r = await load(id);
  const verdict = { outcome: 'absorbed', detail: 'applied', mainSha: gh.headSha('main'), path: PATH, lineIndex: 2, anchored: true };
  const opts = { now: at(2), closedAt: at(2), graceSeconds: GRACE, actor: { kind: 'worker' } };
  await ErrorReport.updateOne({ _id: id }, { $inc: { workflowGeneration: 1 } });
  assert.equal(await applyClosedPrAction(r, CLOSED_PR_ACTION.CLOSE_ABSORBED, verdict, opts), 'raced', 'generation ישן');
  await ErrorReport.updateOne({ _id: id }, { $inc: { workflowGeneration: -1 }, $set: { 'publish.prNumber': 999 } });
  assert.equal(await applyClosedPrAction(r, CLOSED_PR_ACTION.CLOSE_ABSORBED, verdict, opts), 'raced', 'PR אחר');
  await ErrorReport.updateOne({ _id: id }, { $set: { 'publish.prNumber': r.publish.prNumber } });
  assert.equal(await applyClosedPrAction(r, CLOSED_PR_ACTION.CLOSE_ABSORBED, verdict, opts), 'closed', 'ביקורת: בלי שינוי — נכתב');

  // דחייה באתר בזמן שה-worker בודק: הכתיבה שלו נכשלת והדיווח נשאר דחוי
  const id2 = await ingest('fence2', 1);
  const r2 = await approved(id2);
  gh.closePull(r2.publish.prNumber);
  pushFixes([1]);
  gh.hooks.beforeRequest = async ({ method, path }) => {
    if (method !== 'GET' || !/\/issues\/\d+\/comments$/.test(path)) return null;
    gh.hooks.beforeRequest = null;
    const g = (await load(id2)).workflowGeneration;
    assert.equal((await act(users.b, id2, { action: 'reject_approved', generation: g, reason: 'נוסח שגוי' })).status, 200);
    return null;
  };
  await work(at(3));
  const after2 = await load(id2);
  assert.equal(after2.state, 'closed_rejected');
  assert.ok(!(await events(id2)).includes('pr_absorbed'));
});

test('שתי אצוות במקביל: זיהוי הסגירה נרשם פעם אחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('parallel', 2);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  // שתי האצוות קוראות את הדיווח לפני ששתיהן כותבות
  let arrived = 0;
  let release;
  const both = new Promise((res) => { release = res; });
  gh.hooks.beforeRequest = async ({ method, path }) => {
    if (method !== 'GET' || !/\/issues\/\d+\/comments$/.test(path)) return null;
    arrived += 1;
    if (arrived === 2) release();
    await both;
    return null;
  };
  await Promise.all([work(at(2)), work(at(2), { workerId: 'w2' })]);
  gh.hooks.beforeRequest = null;
  assert.equal((await events(id)).filter((e) => e === 'pr_closed_awaiting_absorption').length, 1);
});

test('בריאות: דיווחים שממתינים לקליטה אינם "עבודה ממתינה" ל-worker', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('health', 2);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  await work(at(2));
  await WorkerHeartbeat.updateMany({}, { $set: { lastBeatAt: at(2) } });
  const h = await computeHealth({ config: CONFIG, now: at(2 + 3 * DAY) });
  assert.equal(h.counts.prClosedAwaiting, 1);
  assert.equal(h.counts.prOpened, 0);
  assert.ok(!h.problems.includes('worker_not_running'), JSON.stringify(h.problems));
});

/** המצב שהמעקב הישן השאיר: נכשל + בתור הידני עם publish_failed, מרגע הזיהוי observedAt. */
async function legacyClosed(id, observedAt) {
  const r = await load(id);
  gh.closePull(r.publish.prNumber, { comment: 'נבדק' });
  await ErrorReport.updateOne({ _id: id }, { $set: { 'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged', 'publish.updatedAt': observedAt, ...manualQueueSet('publish_failed', observedAt) } });
}

test('migration: dry-run לא כותב; --apply מעביר לפי אותו כלל, אידמפוטנטי, קולט תיקונים מאוחרים וניתן לביטול', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const NOW = at(40 * DAY);
  const ids = {};
  for (const [k, i] of [['absorbed', 0], ['waiting', 1], ['expired', 2], ['changed', 3], ['claimed', 4]]) {
    ids[k] = await ingest(`mig-${k}`, i);
    await approved(ids[k]);
  }
  // אושר בכמות מחוץ ל-worker: בלי חבילת שינוי — היעד נגזר מההצעה, והבסיס מהורה הקומיט של ה-PR
  ids.bulk = await ingest('mig-bulk', 1, { lines: EXODUS, book: 'שמות', path: 'תנך/תורה/שמות.txt' });
  await approved(ids.bulk);
  await ChangePackage.deleteMany({ report: ids.bulk });
  await ErrorReport.updateOne({ _id: ids.bulk }, { $set: { 'publish.changeId': null, 'approval.changeId': null } });
  for (const k of Object.keys(ids)) await legacyClosed(ids[k], k === 'expired' ? at(20 * DAY) : at(39 * DAY));
  assert.equal((await act(users.b, ids.claimed, { action: 'claim' }, NOW)).status, 200, 'דיווח שנכשל ניתן ללקיחה');
  // הקומיט המרוכז הגיע ל-main: absorbed ו-claimed תוקנו, changed שונה אחרת, waiting/expired עדיין לא
  gh.pushExternal('main', {
    [PATH]: fileOf(LINES.map((l, i) => (i === 0 || i === 4 ? fixed(l) : i === 3 ? 'נוסח אחר לגמרי' : l))),
    [PATH2]: fileOf(EXODUS.map((l, i) => (i === 1 ? fixed(l) : l)), '<h1>שמות</h1>'),
  });

  const snapshot = async () => JSON.stringify(await ErrorReport.find({}).sort({ _id: 1 }).lean());
  const before1 = await snapshot();
  const eventsBefore = await CorrectionEvent.countDocuments();
  const callsBefore = gh.calls.length;
  // תקלה זמנית של GitHub (502) בקריאת קובץ — ניסיון חוזר, לא שגיאה
  let failed = 0;
  gh.hooks.beforeRequest = ({ method, path }) => (method === 'GET' && path.includes('/git/blobs/') && !failed++ ? json(502, { message: 'Bad Gateway' }) : null);
  const rows = [];
  const dry = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch, retryDelayMs: 0 }, now: NOW, rows });
  gh.hooks.beforeRequest = null;
  assert.equal(failed > 1, true, 'הקריאה שנכשלה נוסתה שוב');
  assert.equal(await snapshot(), before1, 'dry-run אינו כותב');
  assert.equal(await CorrectionEvent.countDocuments(), eventsBefore);
  assert.equal(gh.calls.slice(callsBefore).filter((c) => c.method !== 'GET').length, 0, 'GitHub: קריאה בלבד');
  assert.equal(dry.mainSha, gh.headSha('main'));
  assert.equal(dry.candidates, 6);
  assert.equal(dry.skippedClaimed, 1);
  assert.equal(dry.files, 2);
  assert.deepEqual(dry.outcomes, { absorbed: 2, pending: 2, changed: 1 });
  assert.deepEqual(dry.actions, { close_absorbed: 2, await: 2, handoff_not_absorbed: 1 }, '"השתנה" בתוך זמן ההמתנה ממתין');
  // שורות קצרות סמוכות שכל אחת מהן תוקנה אינן מעגנות (השוואה מדויקת בשורות קצרות) — הבדיקה בלי עיגון, והתוצאה עדיין נכונה
  assert.deepEqual(dry.anchored, { yes: 3, no: 2 });
  assert.equal(rows.find((x) => x.id === ids.bulk).anchored, true, 'גם דיווח בלי חבילה מעוגן (בסיס מהורה הקומיט של ה-PR)');
  assert.equal(dry.errors, 0);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((x) => x.id && x.pr && x.action && !('originalLine' in x)), 'שורת --out בלי תוכן ובלי פרטים אישיים');

  // --apply כשהפרסום כבוי: לא מעבירים להמתנה (מעקב ה-PR לא ירוץ)
  const off = await migrateClosedPullReports({ config: DISABLED, deps: { githubFetch: gh.fetch }, now: NOW });
  assert.equal(off.skipped.awaitPublishDisabled, 2);
  assert.equal(await snapshot(), before1);

  const applied = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: NOW });
  assert.deepEqual(applied.written, { close_absorbed: 2, await: 2, handoff_not_absorbed: 1 });
  const s = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await load(id)])));
  for (const k of ['absorbed', 'bulk']) {
    assert.equal(s[k].state, 'closed_published', k);
    assert.equal(s[k].publish.absorbed, true, k);
    assert.deepEqual([s[k].manual.handoffReason, s[k].manual.queuedAt, s[k].assignedTo], [null, null, null], `${k}: בלי שאריות של התור`);
  }
  assert.equal(s.waiting.publish.status, 'pr_opened');
  assert.equal(s.waiting.publish.prClosedAt.getTime(), at(39 * DAY).getTime(), 'ההמתנה נספרת מזיהוי הסגירה');
  assert.equal(s.waiting.manual.status, 'none');
  assert.equal(s.waiting.publish.prCloseComment.body, 'נבדק', 'הערת הסגירה נשמרת לדיווח שנשאר פתוח');
  assert.deepEqual([s.changed.publish.status, s.changed.manual.status], ['pr_opened', 'none']);
  assert.deepEqual([s.expired.publish.status, s.expired.manual.status, s.expired.manual.handoffReason], ['failed', 'queued', 'pr_closed_not_absorbed']);
  assert.deepEqual([s.claimed.manual.status, s.claimed.manual.handoffReason], ['claimed', 'publish_failed'], 'דיווח בטיפול לא נגעו בו');
  const migEvent = await CorrectionEvent.findOne({ report: ids.waiting, type: 'pr_closed_awaiting_absorption' }).lean();
  assert.deepEqual([migEvent.actorKind, migEvent.data.migration, migEvent.data.before.manual.handoffReason], ['system', true, 'publish_failed']);

  const again = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: NOW });
  assert.deepEqual(again.written, {});
  assert.equal(again.unchanged, 1, 'הרצה חוזרת אינה כותבת');

  // התיקון של expired הגיע ל-main מאוחר: הרצה נוספת סוגרת אותו; waiting נסגר במעקב ה-PR של ה-worker
  pushFixes([0, 1, 2, 4]);
  const late = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: at(41 * DAY) });
  assert.deepEqual(late.written, { close_absorbed: 1 });
  assert.equal((await load(ids.expired)).state, 'closed_published');
  await work(at(41 * DAY));
  assert.equal((await load(ids.waiting)).state, 'closed_published', 'נסגר במעקב ה-PR — לא יבוטל');

  // ביטול: כל מה שה-migration העבירה ולא השתנה מאז חוזר למצב הקודם
  const plan = await revertClosedPullMigration();
  assert.deepEqual([plan.reports, plan.revertible, plan.skippedChanged], [5, 4, 1]);
  const undo = await revertClosedPullMigration({ apply: true });
  assert.equal(undo.reverted, 4);
  for (const k of ['absorbed', 'bulk', 'changed', 'expired']) {
    const x = await load(ids[k]);
    assert.deepEqual([x.state, x.publish.status, x.manual.status, x.manual.handoffReason, x.publish.absorbed, x.publish.prClosedAt], ['open', 'failed', 'queued', 'publish_failed', undefined, undefined], k);
  }
  assert.equal((await load(ids.waiting)).state, 'closed_published');
  assert.equal((await revertClosedPullMigration({ apply: true })).reverted, 0, 'ביטול חוזר אינו כותב');
});

test('migration CLI: --revert (dry-run ואז --apply) מחזיר למצב שלפני ה-migration דרך הסקריפט עצמו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const NOW = at(40 * DAY);
  const id = await ingest('mig-cli', 0);
  await approved(id);
  await legacyClosed(id, at(39 * DAY));
  pushFixes([0]);
  const mig = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: NOW });
  assert.deepEqual(mig.written, { close_absorbed: 1 });
  assert.equal((await load(id)).state, 'closed_published');

  const script = fileURLToPath(new URL('../../../scripts/migrate-corrections-closed-prs.mjs', import.meta.url));
  const cli = (...args) => {
    const res = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, ...args], {
      encoding: 'utf8', cwd: fileURLToPath(new URL('../../../', import.meta.url)), timeout: 60_000,
      env: { ...process.env, MONGODB_URI: `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}` },
    });
    assert.equal(res.status, 0, res.stderr);
    return { out: JSON.parse(res.stdout.slice(0, res.stdout.lastIndexOf('}') + 1)), text: res.stdout };
  };
  const dry = cli('--revert');
  assert.deepEqual([dry.out.apply, dry.out.revertible, dry.out.reverted], [false, 1, 0]);
  assert.match(dry.text, /dry-run/);
  assert.equal((await load(id)).state, 'closed_published', 'dry-run אינו כותב');
  const applied = cli('--revert', '--apply');
  assert.deepEqual([applied.out.apply, applied.out.reverted], [true, 1]);
  const x = await load(id);
  assert.deepEqual([x.state, x.publish.status, x.manual.status, x.manual.handoffReason], ['open', 'failed', 'queued', 'publish_failed']);
  assert.equal(cli('--revert', '--apply').out.reverted, 0, 'ביטול חוזר אינו כותב');
});

test('migration: לקיחה בין הקריאה לכתיבה — הכתיבה נכשלת (גם בלי שינוי generation)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('mig-race', 0);
  const id2 = await ingest('mig-race2', 1);
  for (const x of [id, id2]) {
    await approved(x);
    await legacyClosed(x, at(DAY));
  }
  pushFixes([0, 1]);
  const lease = at(30 * DAY);
  const hooks = {
    beforeWrite: async (r) => {
      // id: לקיחה אמיתית (generation עולה); id2: שיוך בלי generation — נתפס רק בתנאי השיוך בכתיבה
      if (String(r._id) === id) assert.equal((await act(users.b, id, { action: 'claim' }, at(2 * DAY))).status, 200);
      else await ErrorReport.updateOne({ _id: id2 }, { $set: { 'manual.status': 'claimed', 'manual.assignee': users.b._id, 'manual.leaseExpiresAt': lease } });
    },
  };
  const res = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch, hooks }, apply: true, now: at(2 * DAY) });
  assert.equal(res.raced, 2);
  assert.deepEqual(res.written, {});
  for (const x of [id, id2]) assert.deepEqual([(await load(x)).state, (await load(x)).manual.status], ['open', 'claimed']);
});
