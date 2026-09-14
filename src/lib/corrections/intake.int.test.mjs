/**
 * בדיקות אינטגרציה של נתיב הקליטה מול MongoDB אמיתי. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const noSmtp = () => { for (const k of SMTP_KEYS) delete process.env[k]; };

const offConfig = getCorrectionsConfig({});
const onConfig = getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://127.0.0.1:9', CORRECTIONS_VERIFY_SECRET: 's' });

async function post(body, { config = offConfig, connectDB = async () => {}, raw = false } = {}) {
  const req = new Request('http://localhost/api/reportingerrors', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body),
  });
  const res = await handleReportingErrorsPost(req, { connectDB, config, rateLimit: () => true });
  return { status: res.status, body: await res.json() };
}

// בדיוק השדות של DirectErrorReport.toApiPayload() בלקוח הישן
const oldClient = (id = 'old-1') => ({
  report_id: id, sender_email: 'user@example.com', subject: 'דיווח על טעות: בראשית', book_title: 'בראשית', current_ref: 'בראשית א',
  line_number: 3, selected_text: 'בראשית ברא', error_details: 'חסר ניקוד', context_text: '(א) בראשית ברא', file_path: 'אוצריא/תנך/תורה/בראשית.txt',
  source_folder: 'ToratEmetToOtzaria', library_version: '27', created_at: '2026-09-15T10:00:00.000Z',
});

const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const SEL = 'אֱלֹהִ֑ים';
const START = LINE.indexOf(SEL);
const newClient = (id = 'new-1', correction = {}, over = {}) => ({
  ...oldClient(id), schema_version: 2, report_kind: 'text_correction',
  location: { line_index: 2, book_id: 1, library_build_id: '27', he_ref: 'בראשית א' },
  source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt', repo_path: null },
  client: { app_version: '0.9.98', platform: 'windows' },
  correction: {
    original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length },
    proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '', ...correction,
  },
  ...over,
});

test('[T1] דיווח חופשי מלקוח ישן: 200, נשמר, בתור הידני, תאימות שדות התשובה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  const res = await post(oldClient());
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.savedToDatabase, true);
  assert.equal(res.body.reportId, 'old-1');
  assert.equal(res.body.correction_supported, true);
  assert.equal(res.body.email_sent, false);
  assert.equal(res.body.duplicate, false);
  assert.match(res.body.message, /נקלט/);
  const r = await ErrorReport.findOne({ reportId: 'old-1' }).lean();
  assert.equal(r.reportKind, 'free_text');
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.state, 'open');
  assert.equal(r.manual.status, 'queued');
  assert.equal(r.manual.handoffReason, 'free_text');
  assert.equal(r.location, null);
  assert.equal(r.proposals, undefined);
  assert.equal(r.lineNumber, 3);
  assert.equal(await CorrectionEvent.countDocuments({ report: r._id, type: 'report_received' }), 1);
});

test('[T2][T4] הצעת תיקון מלקוח חדש: ההצעה נשמרת בייט-לבייט (עברית, ניקוד, HTML)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  const res = await post(newClient());
  assert.equal(res.status, 200);
  const r = await ErrorReport.findOne({ reportId: 'new-1' }).lean();
  assert.equal(r.reportKind, 'text_correction');
  assert.equal(r.currentRevision, 1);
  assert.equal(r.proposals[0].originalLine, LINE);
  assert.equal(r.proposals[0].originalSelection, SEL);
  assert.equal(r.proposals[0].contextBefore, LINE.slice(0, START));
  assert.equal(r.proposals[0].proposedText, 'אֱלֹקִ֑ים');
  assert.equal(r.location.lineIndex, 2);
  assert.equal(r.manual.handoffReason, 'service_disabled');
  assert.equal(r.verification.status, 'skipped_service_disabled');
});

test('[T3] null (ללא הצעה) מול "" (מחיקה) נשמרים ומנותבים אחרת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  await post(newClient('n-null', { proposed_text: null }), { config: onConfig });
  await post(newClient('n-del', { proposed_text: '' }), { config: onConfig });
  const a = await ErrorReport.findOne({ reportId: 'n-null' }).lean();
  const b = await ErrorReport.findOne({ reportId: 'n-del' }).lean();
  assert.equal(a.proposals[0].proposedText, null);
  assert.equal(b.proposals[0].proposedText, '');
  assert.equal(a.manual.handoffReason, 'no_proposal');
  assert.equal(b.verification.status, 'queued');
  assert.equal(b.dispatch.verify, true);
});

test('[T6] שליחה חוזרת של אותו דיווח: אותו רישום, idempotent_replay, בלי כפילות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  const first = await post(newClient('dup-1'));
  const second = await post(newClient('dup-1'));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.idempotent_replay, true);
  assert.equal(await ErrorReport.countDocuments({ reportId: 'dup-1' }), 1);
  // שני מדווחים שונים על אותה בעיה = שני דיווחים נפרדים (לא מתבלבל עם retry)
  await post(newClient('dup-2'));
  assert.equal(await ErrorReport.countDocuments({ reportId: { $in: ['dup-1', 'dup-2'] } }), 2);
});

test('[T7] אותו report_id עם תוכן שונה → 409 בלי דריסה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  await post(newClient('c-1'));
  const res = await post(newClient('c-1', { proposed_text: 'אֱלֹהַ֑ים' }));
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { success: false, error: 'report_id_conflict', reportId: 'c-1' });
  const r = await ErrorReport.findOne({ reportId: 'c-1' }).lean();
  assert.equal(r.proposals[0].proposedText, 'אֱלֹקִ֑ים');
  const old = await post({ ...oldClient('c-1'), error_details: 'אחר' });
  assert.equal(old.status, 409);
});

test('[T6] שתי בקשות מקבילות זהות → רישום אחד, שתיהן 200', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  const [a, b] = await Promise.all([post(newClient('par-1')), post(newClient('par-1'))]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(await ErrorReport.countDocuments({ reportId: 'par-1' }), 1);
});

test('[T8] שירות מוגדר → outbox לבדיקה באותו מסמך; לא מוגדר → ידני מיד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  await post(newClient('s-on'), { config: onConfig });
  await post(newClient('s-off'), { config: getCorrectionsConfig({ CORRECTIONS_VERIFY_ENABLED: '1' }) });
  const on = await ErrorReport.findOne({ reportId: 's-on' }).lean();
  const off = await ErrorReport.findOne({ reportId: 's-off' }).lean();
  assert.equal(on.dispatch.verify, true);
  assert.match(on.verification.requestId, /^req_/);
  assert.equal(on.manual.status, 'none');
  assert.equal(off.manual.status, 'queued');
  assert.equal(off.manual.handoffReason, 'service_not_configured');
});

test('[T25] כשל SMTP אחרי שמירה → 200 עם email_sent:false, הדיווח נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'x@example.org' });
  try {
    const res = await post(oldClient('smtp-1'));
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.email_sent, false);
    assert.equal(res.body.savedToDatabase, true);
    const r = await ErrorReport.findOne({ reportId: 'smtp-1' }).lean();
    assert.equal(r.emailSent, false);
    assert.match(r.adminNotes, /שגיאה בשליחת מייל/);
    assert.equal(r.manual.status, 'queued');
  } finally {
    noSmtp();
  }
});

test('כשל DB → 500 savedToDatabase:false (לא מוצג כהצלחה); גוף גדול → 413; JSON פגום → 400', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const dbFail = await post(oldClient('dbfail'), { connectDB: async () => { throw new Error('down'); } });
  assert.equal(dbFail.status, 500);
  assert.equal(dbFail.body.success, false);
  assert.equal(dbFail.body.savedToDatabase, false);
  const big = await post({ ...oldClient('big'), error_details: 'א'.repeat(300_000) });
  assert.equal(big.status, 413);
  assert.equal(big.body.error, 'body_too_large');
  const bad = await post('{nope', { raw: true });
  assert.equal(bad.status, 400);
  const invalid = await post(newClient('inv', { context_after: 'שגוי' }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'context_mismatch');
  assert.equal(await ErrorReport.countDocuments({}), 0);
});

test('ספר מספריא → awaiting_external עם חבילת איתור, לא לתור הידני ולא לבדיקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  noSmtp();
  await post(newClient('sef-1', {}, { source_folder: 'sefariaToOtzaria', source_hint: { source_folder: 'sefariaToOtzaria', source_name: 'Sefaria', library_relative_path: 'אוצריא/x.txt' } }), { config: onConfig });
  const r = await ErrorReport.findOne({ reportId: 'sef-1' }).lean();
  assert.equal(r.state, 'awaiting_external');
  assert.equal(r.manual.status, 'none');
  assert.equal(r.dispatch.verify, false);
  assert.equal(r.external.target, 'sefaria_generator');
  assert.equal(r.external.package.original_line, LINE);
  assert.equal(r.external.package.db_line_index, 2);
  const legacySefaria = await post({ ...oldClient('sef-old'), source_folder: 'sefariaToOtzaria' });
  assert.equal(legacySefaria.status, 200);
  assert.equal((await ErrorReport.findOne({ reportId: 'sef-old' }).lean()).state, 'awaiting_external');
});
