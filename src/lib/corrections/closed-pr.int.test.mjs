/**
 * בדיקות אינטגרציה ל-PR שנסגר בלי מיזוג (מנהל הספרייה מחיל PRs בקומיט מקומי וסוגר אותם): מעקב ה-PR
 * ב-worker וה-migration של דיווחים שהמעקב הישן העביר לידני. MongoDB אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import ChangePackage from '../../models/ChangePackage.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runWorkerBatch } from './worker.js';
import { runReportAction } from './actions.js';
import { listReports, getReportDetail } from './volunteer.js';
import { migrateClosedPullReports } from './migrate.js';
import { manualQueueSet } from './store.js';
import { deriveLabels } from './labels.js';
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
const work = (now) => runWorkerBatch({ config: CONFIG, workerId: 'w', deps: { githubFetch: gh.fetch, random: () => 0 }, now });
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

/** הקומיט המקומי של מנהל הספרייה מגיע ל-main: השורות שתוקנו (ואפשר גם שורות שנוספו לפני). */
const pushFixes = (indexes, { prefix = [], path = PATH, lines = LINES } = {}) => {
  const next = lines.map((l, i) => (indexes.includes(i) ? fixed(l) : l));
  gh.pushExternal('main', { [path]: path === PATH ? fileOf([...prefix, ...next]) : fileOf([...prefix, ...next], '<h1>שמות</h1>') }, 'batch');
};

test('PR שנסגר בלי מיזוג והתיקון כבר ב-main → נסגר כפורסם (נקלט), לא לתור הידני', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('abs', 0);
  const before1 = await approved(id);
  gh.closePull(before1.publish.prNumber);
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
  assert.ok((await labels(id)).includes('פורסם במקור'));
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_absorbed' }).lean();
  assert.equal(ev.data.prNumber, before1.publish.prNumber);
  assert.equal(ev.data.mainSha, gh.headSha('main'));
  assert.equal(ev.data.relocated, false);
  assert.ok(!(await events(id)).includes('handoff_manual'));
});

test('PR נסגר לפני שהתיקון הגיע ל-main → ממתין (נעול ללקיחה, לא בתור); נקלט אחר כך גם כששורות זזו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('pend', 1);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  await work(at(2));
  let r = await load(id);
  assert.equal(r.state, 'open');
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(r.publish.prClosedAt.getTime(), at(2).getTime());
  assert.equal(r.manual.status, 'none');
  assert.equal(r.workflowGeneration, r0.workflowGeneration, 'זיהוי הסגירה אינו פוסל פעולה של מתנדב');
  assert.ok((await labels(id)).includes('ה-PR נסגר — ממתין לקליטה ב-main'));
  assert.ok(!(await labels(id)).includes('נפתח PR (טרם מוזג)'));
  assert.equal((await listReports({ user: users.b, query: { view: 'queued' }, now: at(2) })).body.total, 0);
  assert.equal((await listReports({ user: users.b, query: { view: 'publishing' }, now: at(2) })).body.total, 1);
  assert.equal((await act(users.b, id, { action: 'claim' }, at(2))).body.error, 'approved_locked', 'לקיחה הייתה יוצרת PR כפול');

  await work(at(3));
  assert.equal((await events(id)).filter((e) => e === 'pr_closed_awaiting_absorption').length, 1, 'בדיקה חוזרת אינה אירוע');
  pushFixes([1], { prefix: ['הקדמה'] });
  await work(at(4));
  r = await load(id);
  assert.equal(r.state, 'closed_published');
  assert.equal(r.publish.absorbed, true);
  const ev = await CorrectionEvent.findOne({ report: id, type: 'pr_absorbed' }).lean();
  assert.equal(ev.data.relocated, true);
  assert.equal(ev.data.lineIndex, 4);
});

test('PR נסגר והתיקון לא נקלט ב-main עד תום ההמתנה → ידני עם סיבה נפרדת', async (t) => {
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
  // אישור מחדש פותח PR חדש — במעקב רגיל, בלי זמן ההמתנה של ה-PR הקודם
  const d = await getReportDetail({ user: users.b, id, config: CONFIG, deps: { githubFetch: gh.fetch } });
  const ap = await act(users.b, id, { action: 'approve', generation: claim.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha }, at(4 + GRACE));
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  await work(at(5 + GRACE));
  const again = await load(id);
  assert.equal(again.publish.status, 'pr_opened');
  assert.notEqual(again.publish.prNumber, r0.publish.prNumber);
  assert.equal(again.publish.prClosedAt, null);
  assert.ok((await labels(id)).includes('נפתח PR (טרם מוזג)'));
});

test('PR נסגר והשורה ב-main שונתה אחרת → ידני מיד (המקור השתנה אחרי סגירת ה-PR)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('chg', 3);
  const r0 = await approved(id);
  gh.closePull(r0.publish.prNumber);
  gh.pushExternal('main', { [PATH]: FILE.replace(LINES[3], 'נוסח אחר לגמרי') });
  await work(at(2));
  const r = await load(id);
  assert.equal(r.publish.status, 'failed');
  assert.equal(r.manual.handoffReason, 'source_changed_after_pr_close');
  assert.equal(r.publish.conflictReason, 'source_changed_after_pr_close');
  assert.ok((await labels(id)).includes('התנגשות'));
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

/** המצב שהמעקב הישן השאיר: נכשל + בתור הידני עם publish_failed, מרגע הזיהוי observedAt. */
async function legacyClosed(id, observedAt) {
  const r = await load(id);
  gh.closePull(r.publish.prNumber);
  await ErrorReport.updateOne({ _id: id }, { $set: { 'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged', 'publish.updatedAt': observedAt, ...manualQueueSet('publish_failed', observedAt) } });
}

test('migration: dry-run לא כותב; --apply מעביר לפי אותו כלל, אידמפוטנטי וקולט תיקונים מאוחרים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const NOW = at(40 * DAY);
  const ids = {};
  for (const [k, i] of [['absorbed', 0], ['waiting', 1], ['expired', 2], ['changed', 3], ['claimed', 4]]) {
    ids[k] = await ingest(`mig-${k}`, i);
    await approved(ids[k]);
  }
  // אושר בכמות מחוץ ל-worker: בלי חבילת שינוי — היעד נגזר מההצעה
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
  const dry = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch, retryDelayMs: 0 }, now: NOW });
  gh.hooks.beforeRequest = null;
  assert.equal(failed > 1, true, 'הקריאה שנכשלה נוסתה שוב');
  assert.equal(await snapshot(), before1, 'dry-run אינו כותב');
  assert.equal(await CorrectionEvent.countDocuments(), eventsBefore);
  assert.equal(gh.calls.slice(callsBefore).filter((c) => c.method !== 'GET').length, 0, 'GitHub: קריאה בלבד');
  const blobReads = gh.calls.slice(callsBefore).filter((c) => c.path.includes('/git/blobs/')).map((c) => c.path);
  assert.equal(blobReads.length, new Set(blobReads).size + 1, 'כל קובץ נקרא פעם אחת (ועוד הניסיון החוזר)');
  assert.equal(dry.mainSha, gh.headSha('main'));
  assert.equal(dry.candidates, 6);
  assert.equal(dry.skippedClaimed, 1);
  assert.equal(dry.files, 2);
  assert.deepEqual(dry.outcomes, { absorbed: 2, pending: 2, changed: 1 });
  assert.deepEqual(dry.actions, { close_absorbed: 2, await: 1, handoff_not_absorbed: 1, handoff_changed: 1 });
  assert.equal(dry.errors, 0);

  const applied = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: NOW });
  assert.deepEqual(applied.written, { close_absorbed: 2, await: 1, handoff_not_absorbed: 1, handoff_changed: 1 });
  const s = Object.fromEntries(await Promise.all(Object.entries(ids).map(async ([k, id]) => [k, await load(id)])));
  for (const k of ['absorbed', 'bulk']) {
    assert.equal(s[k].state, 'closed_published', k);
    assert.equal(s[k].publish.absorbed, true, k);
    assert.equal(s[k].manual.handoffReason, null, `${k}: לא "הפרסום נכשל" על דיווח שפורסם`);
  }
  assert.equal(s.waiting.publish.status, 'pr_opened');
  assert.equal(s.waiting.publish.prClosedAt.getTime(), at(39 * DAY).getTime(), 'ההמתנה נספרת מזיהוי הסגירה');
  assert.equal(s.waiting.manual.status, 'none');
  assert.deepEqual([s.expired.publish.status, s.expired.manual.status, s.expired.manual.handoffReason], ['failed', 'queued', 'pr_closed_not_absorbed']);
  assert.deepEqual([s.changed.publish.status, s.changed.manual.handoffReason], ['failed', 'source_changed_after_pr_close']);
  assert.deepEqual([s.claimed.manual.status, s.claimed.manual.handoffReason], ['claimed', 'publish_failed'], 'דיווח בטיפול לא נגעו בו');
  const migEvent = await CorrectionEvent.findOne({ report: ids.waiting, type: 'pr_closed_awaiting_absorption' }).lean();
  assert.deepEqual([migEvent.actorKind, migEvent.data.migration], ['system', true]);

  const again = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: NOW });
  assert.deepEqual(again.written, {});
  assert.equal(again.unchanged, 2, 'הרצה חוזרת אינה כותבת');

  // התיקון של expired הגיע ל-main מאוחר: הרצה נוספת סוגרת אותו; waiting נסגר במעקב ה-PR של ה-worker
  gh.pushExternal('main', { [PATH]: fileOf(LINES.map((l, i) => (i === 3 ? 'נוסח אחר לגמרי' : fixed(l)))) });
  const late = await migrateClosedPullReports({ config: CONFIG, deps: { githubFetch: gh.fetch }, apply: true, now: at(41 * DAY) });
  assert.deepEqual(late.written, { close_absorbed: 1 });
  assert.equal(late.unchanged, 1);
  assert.equal((await load(ids.expired)).state, 'closed_published');
  await work(at(41 * DAY));
  assert.equal((await load(ids.waiting)).state, 'closed_published');
});
