/**
 * בדיקות אינטגרציה של ממשק המתנדבים (הרשאות, תנאי גרסה, אישור ופרסום) מול MongoDB
 * אמיתי ו-GitHub מדומה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ErrorReport from '../../models/ErrorReport.js';
import ChangePackage from '../../models/ChangePackage.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runWorkerBatch } from './worker.js';
import { runReportAction } from './actions.js';
import { listReports, getReportDetail, externalTransition, exportExternalPackages } from './volunteer.js';
import { handleCorrectionsRequest, checkSameOrigin } from './http.js';
import { deriveLabels } from './labels.js';
import { FakeGitHub } from './testing/fake-github.js';
import { startMongo } from './testing/mongo.js';

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
const CONFIG = getCorrectionsConfig({ CORRECTIONS_GITHUB_TOKEN: 't', CORRECTIONS_GITHUB_REPO: REPO, CORRECTIONS_GITHUB_BRANCH: 'main' });
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);

let gh;
let users;
beforeEach(async () => {
  if (db.skip) return;
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  users = {
    a: await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isCorrectionsVolunteer: true }),
    b: await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isCorrectionsVolunteer: true }),
    admin: await User.create({ name: 'מנהל', email: 'admin@example.org', password: 'x', role: 'admin' }),
    plain: await User.create({ name: 'רגיל', email: 'u@example.org', password: 'x' }),
  };
});

async function ingest(id, over = {}, correction = {}) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: 'בראשית א', line_number: 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length }, proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '', ...correction },
    ...over,
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config: CONFIG, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return String((await ErrorReport.findOne({ reportId: id }).lean())._id);
}

const act = (user, id, body, now = T0, config = CONFIG) => runReportAction({ user, id, body, config, deps: { githubFetch: gh.fetch }, now });
const detail = (user, id, config = CONFIG) => getReportDetail({ user, id, config, deps: { githubFetch: gh.fetch } });
const gen = async (id) => (await ErrorReport.findById(id).lean()).workflowGeneration;
const work = (now, config = CONFIG) => runWorkerBatch({ config, workerId: 'w', deps: { githubFetch: gh.fetch, random: () => 0 }, now });
const writes = () => gh.calls.filter((c) => c.method !== 'GET').length;

async function claimAndApprove(user, id, now = T0) {
  const c = await act(user, id, { action: 'claim' }, now);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const d = await detail(user, id);
  return act(user, id, { action: 'approve', generation: c.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha }, now);
}

test('[T28] ידני מלא מקצה לקצה בלי שירות: רשימה → פרטים → לקיחה → אישור → PR → מיזוג', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t28');
  const list = await listReports({ user: users.a, query: { view: 'queued' } });
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].manual.handoffReason, 'service_disabled');
  const d = await detail(users.a, id);
  assert.equal(d.body.source.status, 'exact');
  assert.equal(d.body.source.currentLine, LINE);
  assert.equal(d.body.report.proposals[0].newLine, NEW);
  const res = await claimAndApprove(users.a, id);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  let r = await ErrorReport.findById(id).lean();
  assert.equal(r.approval.authority, 'volunteer');
  assert.equal(r.publish.status, 'ready');
  assert.ok(deriveLabels(r).some((l) => l.text === 'אושר וממתין לפרסום'));
  assert.equal(r.state, 'open', 'אישור מתנדב אינו "פורסם"');
  await work(at(1));
  r = await ErrorReport.findById(id).lean();
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(gh.readFile(r.publish.branch, PATH), FILE.replace(LINE, NEW));
  gh.mergePull(r.publish.prNumber);
  await work(at(2));
  r = await ErrorReport.findById(id).lean();
  assert.equal(r.state, 'closed_published');
  assert.equal(r.inclusion.status, 'merged_to_main', 'מוזג לענף הראשי — לא "נכלל בגרסה"');
  const types = (await CorrectionEvent.find({ report: id }).lean()).map((e) => e.type);
  for (const tp of ['report_received', 'claimed', 'approved', 'publish_outcome', 'pr_merged']) assert.ok(types.includes(tp), tp);
});

test('[T28] דיווח חופשי: לקיחה וסגירה ידנית; דחייה מחייבת סיבה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('free', { report_kind: 'free_text', correction: null });
  const id2 = await ingest('free2', { report_kind: 'free_text', correction: null });
  const c = await act(users.a, id, { action: 'claim' });
  assert.equal((await act(users.a, id, { action: 'close_manual', generation: c.body.generation, note: 'טופל' })).status, 200);
  assert.equal((await ErrorReport.findById(id).lean()).state, 'closed_manual');
  const c2 = await act(users.a, id2, { action: 'claim' });
  assert.equal((await act(users.a, id2, { action: 'reject', generation: c2.body.generation, reason: '' })).body.error, 'reason_required');
  assert.equal((await act(users.a, id2, { action: 'reject', generation: c2.body.generation, reason: 'אין טעות' })).status, 200);
  const r = await ErrorReport.findById(id2).lean();
  assert.equal(r.state, 'closed_rejected');
  assert.equal(r.status, 'rejected');
  assert.equal(r.decisions.at(-1).message, 'אין טעות');
});

test('[T17] שני מתנדבים: לקיחה אטומית אחת; אישור כפול מקביל → אחד מצליח, בלי חבילה יתומה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t17');
  const [ca, cb] = await Promise.all([act(users.a, id, { action: 'claim' }), act(users.b, id, { action: 'claim' })]);
  assert.deepEqual([ca.status, cb.status].sort(), [200, 409]);
  const winner = ca.status === 200 ? users.a : users.b;
  const loser = ca.status === 200 ? users.b : users.a;
  const g = (ca.status === 200 ? ca : cb).body.generation;
  const d = await detail(winner, id);
  const body = { action: 'approve', generation: g, revision: 1, seenBlobSha: d.body.source.blobSha };
  const [x, y] = await Promise.all([act(winner, id, body), act(winner, id, body)]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  assert.equal(await ChangePackage.countDocuments({}), 1);
  const forbidden = await act(loser, id, { ...body, generation: await gen(id) });
  assert.equal(forbidden.status, 409);
});

test('[T19] שינוי הצעה אחרי אישור: לקיחה מחדש פוסלת את האישור, ורק הגרסה החדשה מתפרסמת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t19');
  assert.equal((await claimAndApprove(users.a, id)).status, 200);
  const first = (await ErrorReport.findById(id).lean()).approval.changeId;
  const c = await act(users.b, id, { action: 'claim' }, at(1));
  assert.equal(c.status, 200);
  let r = await ErrorReport.findById(id).lean();
  assert.equal(r.approval.authority, 'none');
  assert.equal(r.publish.status, 'not_ready');
  await work(at(2));
  assert.equal(gh.pulls.length, 0, 'האישור הישן לא פורסם');
  const edited = `${NEW} — מתוקן`;
  const d = await detail(users.b, id);
  const e = await act(users.b, id, { action: 'edit_approve', generation: c.body.generation, revision: 1, baseLine: d.body.source.currentLine, newLine: edited, seenBlobSha: d.body.source.blobSha }, at(3));
  assert.equal(e.status, 200, JSON.stringify(e.body));
  r = await ErrorReport.findById(id).lean();
  assert.equal(r.currentRevision, 2);
  assert.equal(r.proposals[1].author, 'volunteer');
  assert.notEqual(r.approval.changeId, first);
  await work(at(4));
  assert.equal(gh.pulls.length, 1);
  r = await ErrorReport.findById(id).lean();
  assert.equal(gh.readFile(r.publish.branch, PATH), FILE.replace(LINE, edited));
  assert.equal((await act(users.b, id, { action: 'approve', generation: 1, revision: 1 })).status, 409);
});

test('[T20] שינוי מקור לפני אישור → 409; תצוגה ישנה → 409; שינוי בין אישור לפרסום → האישור נפסל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t20');
  const c = await act(users.a, id, { action: 'claim' });
  const d = await detail(users.a, id);
  gh.pushExternal('main', { [PATH]: FILE.replace('סוף', 'סוף ערוך') });
  const stale = await act(users.a, id, { action: 'approve', generation: c.body.generation, revision: 1, seenBlobSha: d.body.source.blobSha });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale_view');
  gh.pushExternal('main', { [PATH]: FILE.replace(LINE, `${LINE} *`) });
  const changed = await act(users.a, id, { action: 'approve', generation: c.body.generation, revision: 1 });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error, 'source_not_resolved');
  assert.equal(await ChangePackage.countDocuments({}), 0);

  const gh2 = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  gh = gh2;
  const id2 = await ingest('t20b');
  assert.equal((await claimAndApprove(users.a, id2)).status, 200);
  gh.pushExternal('main', { [PATH]: FILE.replace(LINE, `${LINE} [אחר]`) });
  const before = writes();
  await work(at(1));
  const r = await ErrorReport.findById(id2).lean();
  assert.equal(r.approval.authority, 'none');
  assert.equal(r.manual.handoffReason, 'source_changed_after_approval');
  assert.equal(r.publish.conflictReason, 'source_changed');
  assert.ok(deriveLabels(r).some((l) => l.text === 'התנגשות'));
  assert.equal(writes(), before, 'בלי כתיבה ל-GitHub');
});

test('[T21] שינוי לא קשור באותו קובץ בין אישור לפרסום → הפרסום עובר והשינוי הזר נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t21');
  assert.equal((await claimAndApprove(users.a, id)).status, 200);
  gh.pushExternal('main', { [PATH]: FILE.replace('סוף', 'סוף ערוך') });
  await work(at(1));
  const r = await ErrorReport.findById(id).lean();
  assert.equal(r.publish.status, 'pr_opened');
  assert.equal(gh.readFile(r.publish.branch, PATH), FILE.replace(LINE, NEW).replace('סוף', 'סוף ערוך'));
});

test('[T22] טקסט חוזר: רק השורה באינדקס; מקור חסר/ששמו השתנה → בחירה ידנית של מקור ועריכה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: `${LINE}\n\n${LINE}\n` } });
  const id = await ingest('t22');
  assert.equal((await claimAndApprove(users.a, id)).status, 200);
  await work(at(1));
  let r = await ErrorReport.findById(id).lean();
  assert.equal(gh.readFile(r.publish.branch, PATH), `${LINE}\n\n${NEW}\n`);

  const renamed = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית (מהדורה).txt';
  gh = new FakeGitHub({ repo: REPO, files: { [renamed]: FILE } });
  const id2 = await ingest('t22b');
  const d = await detail(users.a, id2);
  assert.equal(d.body.source.status, 'not_found');
  const c = await act(users.a, id2, { action: 'claim' });
  assert.equal((await act(users.a, id2, { action: 'approve', generation: c.body.generation, revision: 1 })).status, 409);
  const p = await act(users.a, id2, { action: 'preview_source', path: renamed, lineIndex: 2 });
  assert.equal(p.status, 200);
  assert.equal(p.body.line, LINE);
  const e = await act(users.a, id2, { action: 'edit_approve', generation: c.body.generation, revision: 1, baseLine: p.body.line, newLine: NEW, targetPath: renamed, targetLineIndex: 2, seenBlobSha: p.body.blobSha });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  await work(at(2));
  r = await ErrorReport.findById(id2).lean();
  assert.equal(gh.readFile(r.publish.branch, renamed), FILE.replace(LINE, NEW));
});

test('[T23] תיקון שכבר הוחל: מתנדב מאשר → נסגר "כבר תוקן" בלי שום כתיבה ל-GitHub', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE.replace(LINE, NEW) } });
  const id = await ingest('t23');
  const d = await detail(users.a, id);
  assert.equal(d.body.source.status, 'already_applied');
  assert.ok(d.body.report.labels.some((l) => l.text === 'נראה שכבר תוקן במקור'));
  const res = await claimAndApprove(users.a, id);
  assert.equal(res.body.result, 'already_fixed');
  await work(at(1));
  const r = await ErrorReport.findById(id).lean();
  assert.equal(r.state, 'closed_already_fixed');
  assert.equal(r.publish.status, 'skipped_already_fixed');
  assert.equal(writes(), 0);
});

test('[T26] בלי הרשאות: משתמש רגיל 403, בלי session 401, Origin זר 403; נתיב לא מורשה 400', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('t26', {}, { proposed_text: '<img src=x onerror=alert(1)>', original_selection: null, selection_offset: null, context_before: '' });
  for (const body of [{ action: 'claim' }, { action: 'approve', generation: 1, revision: 1 }, { action: 'reject', generation: 1, reason: 'xxx' }]) {
    assert.equal((await act(users.plain, id, body)).status, 403);
  }
  assert.equal((await listReports({ user: users.plain })).status, 403);
  assert.equal((await detail(users.plain, id)).status, 403);
  assert.equal((await exportExternalPackages({ user: users.a })).status, 403);

  const fn = async () => ({ status: 200, body: { ok: true } });
  const deps = { getSession: async () => null, connect: async () => {} };
  assert.equal((await handleCorrectionsRequest(new Request('http://site/api/corrections/reports'), fn, deps)).status, 401);
  const evil = new Request('http://site/api/corrections/reports/x/action', { method: 'POST', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
  assert.equal((await handleCorrectionsRequest(evil, fn, { ...deps, mutate: true })).status, 403);
  assert.equal(checkSameOrigin(new Request('http://site/x', { method: 'POST', headers: { origin: 'http://site' } })).ok, true);
  assert.equal(checkSameOrigin(new Request('http://site/x', { method: 'POST' })).ok, false);

  const c = await act(users.a, id, { action: 'claim' });
  assert.equal((await act(users.a, id, { action: 'preview_source', path: 'ToratEmetToOtzaria/ספרים/אוצריא/../../../.github/x.txt', lineIndex: 0 })).status, 400);
  assert.equal((await act(users.a, id, { action: 'edit_approve', generation: c.body.generation, revision: 1, baseLine: LINE, newLine: NEW, targetPath: '.github/workflows/deploy.yml', targetLineIndex: 0 })).status, 400);
  const d = await detail(users.a, id);
  assert.equal(d.body.report.proposals[0].proposedText, '<img src=x onerror=alert(1)>', 'נשמר כטקסט, לא מסונן ולא מבוצע');
  assert.equal(JSON.stringify(d.body).includes('a@example.org') || JSON.stringify(d.body).includes('senderEmail'), false, 'פרטי קשר לא נחשפים');
});

test('[T26] ממשק המתנדבים אינו משתמש ב-dangerouslySetInnerHTML', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const dirs = [path.join(root, 'app/library/corrections'), path.join(root, 'components/corrections')];
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  for (const d of dirs) walk(d);
  assert.ok(files.length > 0);
  for (const f of files) assert.equal(readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'), false, f);
});

test('העברה למטפל אחר, שחרור, ושליחה מחודשת לשירות רק כפעולה מפורשת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('re');
  const c = await act(users.a, id, { action: 'claim' });
  assert.equal((await act(users.a, id, { action: 'reassign', generation: c.body.generation, targetUserId: String(users.plain._id) })).body.error, 'target_not_authorized');
  const ra = await act(users.a, id, { action: 'reassign', generation: c.body.generation, targetUserId: String(users.b._id) });
  assert.equal(ra.status, 200);
  assert.equal(String((await ErrorReport.findById(id).lean()).manual.assignee), String(users.b._id));
  assert.equal((await act(users.b, id, { action: 'resubmit', generation: ra.body.generation })).body.error, 'service_disabled');
  const on = getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 's' });
  const rs = await act(users.b, id, { action: 'resubmit', generation: ra.body.generation }, T0, on);
  assert.equal(rs.status, 200);
  const r = await ErrorReport.findById(id).lean();
  assert.equal(r.verification.status, 'queued');
  assert.equal(r.dispatch.verify, true);
  assert.equal(r.manual.status, 'none');
  const id2 = await ingest('rel');
  const c2 = await act(users.a, id2, { action: 'claim' });
  assert.equal((await act(users.b, id2, { action: 'release', generation: c2.body.generation })).status, 409);
  assert.equal((await act(users.a, id2, { action: 'release', generation: c2.body.generation })).status, 200);
  assert.equal((await ErrorReport.findById(id2).lean()).manual.status, 'released');
});

test('תפוגת שיוך: מתנדב אחר יכול לקחת אחרי שפג; המטפל הקודם לא יכול לאשר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('lease');
  const c = await act(users.a, id, { action: 'claim' }, T0);
  const later = at(CONFIG.manual.claimMinutes * 60 + 1);
  assert.equal((await act(users.b, id, { action: 'claim' }, later)).status, 200);
  assert.equal((await act(users.a, id, { action: 'approve', generation: c.body.generation, revision: 1 }, later)).status, 409);
});

test('דיווח ישן (לפני המערכת) מופיע בתור הידני, משודרג בעצלות וניתן לסגירה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ErrorReport.collection.insertOne({
    reportId: 'legacy-1', senderEmail: 'x@example.org', subject: 's', bookTitle: 'ספר', currentRef: 'א', lineNumber: 1, selectedText: 't',
    errorDetails: 'e', contextText: 'c', filePath: 'f', sourceFolder: 'MoreBooks', libraryVersion: '20', status: 'pending', emailSent: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const list = await listReports({ user: users.a, query: { view: 'queued' } });
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].manual.handoffReason, 'legacy_report');
  const id = list.body.items[0].id;
  const c = await act(users.a, id, { action: 'claim' });
  assert.equal(c.status, 200);
  assert.equal((await act(users.a, id, { action: 'close_manual', generation: c.body.generation })).status, 200);
  const r = await ErrorReport.findById(id).lean();
  assert.equal(r.state, 'closed_manual');
  assert.equal(r.status, 'resolved');
  assert.equal(r.emailSent, true);
});

test('טיפול חיצוני (ספריא): מעברים מותני-גרסה, מנהל בלבד, ייצוא מכיל את המאתר, בלי מפרסם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('sef', { source_folder: 'sefariaToOtzaria', source_hint: { source_folder: 'sefariaToOtzaria', source_name: 'Sefaria', library_relative_path: 'אוצריא/x.txt' } });
  await ingest('regular');
  const ext = await listReports({ user: users.a, query: { view: 'external' } });
  assert.equal(ext.body.items.length, 1);
  assert.equal((await act(users.a, id, { action: 'claim' })).status, 409, 'לא נכנס לתור הידני');
  const exp = await exportExternalPackages({ user: users.admin });
  assert.equal(exp.body.count, 1);
  const item = exp.body.items[0];
  for (const k of ['book_title', 'he_ref', 'he_ref_stable', 'db_line_index', 'library_version', 'original_line', 'original_line_sha256', 'new_line', 'selection_offset', 'report_id']) assert.ok(k in item, k);
  assert.equal(item.new_line, NEW);
  const g = await gen(id);
  assert.equal((await externalTransition({ user: users.a, id, generation: g, action: 'resolve' })).status, 403);
  assert.equal((await externalTransition({ user: users.admin, id, generation: g - 1, action: 'resolve' })).status, 409);
  const back = await externalTransition({ user: users.admin, id, generation: g, action: 'return_to_manual' });
  assert.equal(back.status, 200);
  let r = await ErrorReport.findById(id).lean();
  assert.equal(r.state, 'open');
  assert.equal(r.manual.handoffReason, 'returned_from_external');
  assert.equal((await externalTransition({ user: users.admin, id, generation: back.body.generation, action: 'resolve' })).status, 409);
  await work(at(1));
  assert.equal(gh.calls.length, 0, 'ספריא לעולם לא מגיע ל-GitHub');
  const id3 = await ingest('sef2', { source_folder: 'Sefaria' });
  const g3 = await gen(id3);
  assert.equal((await externalTransition({ user: users.admin, id: id3, generation: g3, action: 'reject', note: '' })).body.error, 'reason_required');
  assert.equal((await externalTransition({ user: users.admin, id: id3, generation: g3, action: 'resolve', note: 'הועבר למחולל' })).status, 200);
  r = await ErrorReport.findById(id3).lean();
  assert.equal(r.state, 'closed_manual');
  assert.equal(r.external.status, 'resolved');
});

test('migration אידמפוטנטית: דיווחים ישנים לא נמחקים ושדותיהם נשמרים; ריצה שנייה לא משנה כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { migrateLegacyReports } = await import('./migrate.js');
  const base = { senderEmail: 'x@example.org', subject: 's', bookTitle: 'ספר', currentRef: 'א', lineNumber: 1, selectedText: 't', errorDetails: 'e', contextText: 'c', filePath: 'f', sourceFolder: 'MoreBooks', emailSent: true, adminNotes: 'הערה', createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01') };
  await ErrorReport.collection.insertMany([
    { ...base, reportId: 'l1', status: 'pending' },
    { ...base, reportId: 'l2', status: 'in_progress' },
    { ...base, reportId: 'l3', status: 'resolved' },
    { ...base, reportId: 'l4', status: 'rejected' },
  ]);
  const newId = await ingest('new-after');
  const dry = await migrateLegacyReports({ apply: false });
  assert.equal(dry.matched, 4);
  assert.equal(dry.modified, 0);
  const first = await migrateLegacyReports({ apply: true });
  assert.equal(first.modified, 4);
  const second = await migrateLegacyReports({ apply: true });
  assert.equal(second.matched, 0);
  const docs = await ErrorReport.find({ reportId: { $in: ['l1', 'l2', 'l3', 'l4'] } }).sort({ reportId: 1 }).lean();
  assert.deepEqual(docs.map((d) => d.state), ['open', 'open', 'closed_manual', 'closed_rejected']);
  assert.deepEqual(docs.map((d) => d.status), ['pending', 'in_progress', 'resolved', 'rejected']);
  assert.ok(docs.every((d) => d.adminNotes === 'הערה' && d.emailSent === true));
  assert.equal(docs[0].manual.handoffReason, 'legacy_report');
  assert.equal(new Date(docs[0].manual.queuedAt).toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal((await ErrorReport.findById(newId).lean()).manual.handoffReason, 'service_disabled', 'דיווח חדש לא נגע');
  assert.equal(await ErrorReport.countDocuments({}), 5);
});
