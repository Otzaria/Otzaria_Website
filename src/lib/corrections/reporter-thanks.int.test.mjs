/**
 * מייל התודה למדווח באישור מתנדב: נשלח פעם אחת, רק לכתובת אמיתית, ונעצר בהסרה מהרשימה.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runReportAction } from './actions.js';
import { getReportDetail } from './volunteer.js';
import { unsubscribeReporterByToken, thanksRecipient, THANKS_UNSUBSCRIBE_PURPOSE } from './reporter-thanks.js';
import { createUnsubscribeToken } from '../app-reports/unsubscribe.js';
import { FakeGitHub } from './testing/fake-github.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const REPO = 'Otzaria/otzaria-library';
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const FILE = `<h1>בראשית</h1>\r\n\r\n${LINE}\r\nסוף\r\n`;
const SEL = 'אֱלֹהִ֑ים';
const START = LINE.indexOf(SEL);
const CONFIG = getCorrectionsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 't' }, { publishMode: 'pr' });
const SECRET = 'test-secret';
const THANKS_CONFIG = { siteUrl: 'https://otzaria.test', unsubscribeSecret: SECRET };
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);

let gh;
let volunteer;
let mails;
let mailResult;
beforeEach(async () => {
  if (db.skip) return;
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE } });
  volunteer = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
  mails = [];
  mailResult = { sent: true };
});

async function ingest(id, senderEmail) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: 'בראשית א', line_number: 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length }, proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '' },
    ...(senderEmail ? { sender_email: senderEmail } : {}),
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config: CONFIG, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return String((await ErrorReport.findOne({ reportId: id }).lean())._id);
}

// מייל התודה מתוזמן אחרון; אצוות ה-worker שלפניו אינה רצה כאן — היא מתחברת ל-DB אמיתי.
async function act(id, body, now = T0) {
  const scheduled = [];
  const deps = {
    githubFetch: gh.fetch,
    schedule: (work) => scheduled.push(work),
    sendThanksMail: async (args) => { mails.push(args); return mailResult; },
    thanksConfig: THANKS_CONFIG,
  };
  const res = await runReportAction({ user: volunteer, id, body, config: CONFIG, deps, now });
  if (scheduled.length) await scheduled.at(-1)();
  return res;
}

async function claimAndApprove(id, now = T0) {
  const c = await act(id, { action: 'claim' }, now);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const d = await getReportDetail({ user: volunteer, id, config: CONFIG, deps: { githubFetch: gh.fetch } });
  return act(id, { action: 'approve', generation: c.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha }, now);
}

test('אישור מתנדב שולח למדווח מייל תודה אחד, גם כשהאישור נפסל ומאושר שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('thx-1', 'reporter@example.org');
  assert.equal((await claimAndApprove(id)).status, 200);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'reporter@example.org');
  assert.equal(mails[0].kind, 'approved');
  assert.equal(mails[0].bookTitle, 'בראשית');
  assert.equal(mails[0].currentRef, 'בראשית א');
  assert.ok(mails[0].unsubscribeUrl.startsWith('https://otzaria.test/api/corrections/unsubscribe?token='));
  assert.ok((await ErrorReport.findById(id).lean()).reporterThanks.sentAt);

  // לקיחה מחדש פוסלת את האישור; האישור השני אינו שולח שוב.
  assert.equal((await claimAndApprove(id, at(1))).status, 200);
  assert.equal(mails.length, 1);
});

test('"כבר תוקן" שולח תודה בנוסח שלו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ repo: REPO, files: { [PATH]: FILE.replace(LINE, '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹקִ֑ים') } });
  const id = await ingest('thx-fixed', 'reporter@example.org');
  const res = await claimAndApprove(id);
  assert.equal(res.body.result, 'already_fixed');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].kind, 'already_fixed');
});

test('דיווח בלי מייל אמיתי, דחייה ולקיחה בלבד — אינם שולחים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const anon = await ingest('thx-anon');
  assert.equal((await claimAndApprove(anon)).status, 200);

  const rejected = await ingest('thx-rej', 'reporter@example.org');
  const c = await act(rejected, { action: 'claim' });
  assert.equal((await act(rejected, { action: 'reject', generation: c.body.generation, reason: 'אין טעות' })).status, 200);
  assert.equal(mails.length, 0);
  assert.equal(thanksRecipient({ senderEmail: 'unknown@otzaria.invalid' }), null);
});

test('כשל שליחה משחרר את הסימון, והאישור הבא שולח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id = await ingest('thx-fail', 'reporter@example.org');
  mailResult = { sent: false, error: 'smtp down' };
  assert.equal((await claimAndApprove(id)).status, 200, 'כשל המייל אינו מכשיל את האישור');
  assert.equal((await ErrorReport.findById(id).lean()).reporterThanks.sentAt, null);
  mailResult = { sent: true };
  assert.equal((await claimAndApprove(id, at(1))).status, 200);
  assert.equal(mails.length, 2);
  assert.ok((await ErrorReport.findById(id).lean()).reporterThanks.sentAt);
});

test('הסרה מהרשימה חלה על כל הדיווחים של הכתובת, גם על דיווח חדש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ingest('thx-old', 'reporter@example.org');
  const appToken = createUnsubscribeToken('thx-old', SECRET);
  assert.equal((await unsubscribeReporterByToken(appToken, SECRET)).ok, false, 'טוקן של דיווחי התוכנה נדחה');
  const token = createUnsubscribeToken('thx-old', SECRET, THANKS_UNSUBSCRIBE_PURPOSE);
  assert.equal((await unsubscribeReporterByToken(token, SECRET)).ok, true);

  const id = await ingest('thx-new', 'reporter@example.org');
  assert.equal((await claimAndApprove(id)).status, 200);
  assert.equal(mails.length, 0);
});
