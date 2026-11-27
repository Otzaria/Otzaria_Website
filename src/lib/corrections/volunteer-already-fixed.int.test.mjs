/**
 * אישור מתנדב ו"כבר תוקן": הכלל המחמיר של already-applied.js חל גם על מסלול המתנדב (בעבר נסגר לפי המיקום בלבד —
 * כותרת קצרה שזזה סגרה דיווח, השגיאה נשארה בקובץ, והמדווח קיבל מייל). הרצה: npm test (MongoDB אמיתי + GitHub מדומה).
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ErrorReport from '../../models/ErrorReport.js';
import User from '../../models/User.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { runReportAction } from './actions.js';
import { getReportDetail } from './volunteer.js';
import { FakeGitHub } from './testing/fake-github.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });

const CONFIG = getCorrectionsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 't' }, { publishMode: 'pr' });
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/הלכה/ספר בדיקה.txt';
const REL = 'אוצריא/הלכה/ספר בדיקה.txt';
const T0 = new Date('2026-09-15T10:00:00Z');
const H3_A = '<h3>סעיף א</h3>';
const H3_B = '<h3>סעיף ב</h3>';
const H3_C = '<h3>סעיף ג</h3>';
const LONG_BAD = 'וְהָיָה כִּי יְבִיאֲךָ הָאֱלֹהִים אֶל הָאָרֶץ אֲשֶׁר נִשְׁבַּע';
const LONG_GOOD = 'וְהָיָה כִּי יְבִיאֲךָ יְהוָה אֶל הָאָרֶץ אֲשֶׁר נִשְׁבַּע';

let gh;
let vol;
const file = (lines) => `${lines.join('\n')}\n`;

async function ingest(id, { originalLine, proposed, lineIndex }) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'ספר בדיקה', current_ref: 'x', selected_text: 'x', error_details: 'x', context_text: '',
    file_path: REL, source_folder: 'ToratEmetToOtzaria', library_version: '27', location: { line_index: lineIndex },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: REL },
    correction: { original_line: originalLine, original_selection: null, proposed_text: proposed, context_before: '', context_after: '' },
    sender_email: 'reporter@example.org',
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config: CONFIG, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return String((await ErrorReport.findOne({ reportId: id }).lean())._id);
}

// claim + approve, עם תזמון מייל מדומה. מחזיר גם את המיילים שתוזמנו (עוד לא נשלחו) ואת המיילים שנשלחו אחרי הרצתם.
async function claimAndApprove(id) {
  const scheduled = [];
  const mails = [];
  const deps = { githubFetch: gh.fetch, schedule: (work) => scheduled.push(work), sendThanksMail: async (m) => { mails.push(m); return { sent: true }; } };
  const act = (body) => runReportAction({ user: vol, id, body, config: CONFIG, deps, now: T0 });
  const c = await act({ action: 'claim' });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const d = await getReportDetail({ user: vol, id, config: CONFIG, deps });
  const res = await act({ action: 'approve', generation: c.body.generation, revision: d.body.report.currentRevision, seenBlobSha: d.body.source?.blobSha });
  for (const w of scheduled) await w();
  return { res, mails };
}

beforeEach(async () => {
  if (db.skip) return;
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
});

const countLine = (line) => gh.readFile('main', PATH).split('\n').filter((l) => l === line).length;

test('כותרת קצרה שחוזרת והזזת שורות: אישור מתנדב אינו סוגר "כבר תוקן" — 409 source_not_resolved, הדיווח נשאר פתוח ובלי מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // השגיאה: "סעיף ג" במקום "סעיף ב"; הכותרת המוצעת קיימת באינדקס הישן בגלל שורות שנוספו לפניה, והשגיאה עדיין בקובץ.
  const lines = ['<h1>ספר בדיקה</h1>', 'הקדמה 1', 'הקדמה 2', '<h2>סימן א</h2>', H3_A, 'טקסט א-א', H3_B, 'טקסט א-ב', '<h2>סימן ב</h2>', H3_A, 'טקסט ב-א', H3_C, 'טקסט ב-ב'];
  gh = new FakeGitHub({ files: { [PATH]: file(lines) } });
  const id = await ingest('vol-a', { originalLine: H3_C, proposed: H3_B, lineIndex: 6 });
  assert.equal(lines[6], H3_B, 'באינדקס המדווח יש עכשיו בדיוק השורה המוצעת');
  const { res, mails } = await claimAndApprove(id);
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.error ?? res.body.code, 'source_not_resolved');
  const r = await ErrorReport.findById(id).lean();
  assert.equal(r.state, 'open');
  assert.notEqual(r.closeReason, 'volunteer_verified_already_fixed');
  assert.equal(r.publish?.status === 'skipped_already_fixed', false);
  assert.equal(countLine(H3_C), 1, 'השגיאה עדיין בקובץ');
  assert.equal(mails.length, 0, 'המדווח לא מקבל "כבר תוקן"');
});

test('שורה מוצעת ארוכה שהמקורית שלה עדיין בקובץ במקום אחר — לא נסגר; שורה מוצעת שחוזרת פעמיים — לא נסגר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // המקורית עדיין קיימת בשורה אחרת
  gh = new FakeGitHub({ files: { [PATH]: file(['<h1>ספר בדיקה</h1>', LONG_GOOD, 'ביניים', LONG_BAD]) } });
  const id1 = await ingest('vol-orig-elsewhere', { originalLine: LONG_BAD, proposed: LONG_GOOD, lineIndex: 1 });
  const a = await claimAndApprove(id1);
  assert.equal(a.res.status, 409, JSON.stringify(a.res.body));
  assert.equal((await ErrorReport.findById(id1).lean()).state, 'open');
  assert.equal(a.mails.length, 0);
  // המוצעת מופיעה פעמיים (שורה שחוזרת אינה ראיה לתיקון)
  gh = new FakeGitHub({ files: { [PATH]: file(['<h1>ספר בדיקה</h1>', LONG_GOOD, 'ביניים', LONG_GOOD]) } });
  const id2 = await ingest('vol-twice', { originalLine: LONG_BAD, proposed: LONG_GOOD, lineIndex: 1 });
  const b = await claimAndApprove(id2);
  assert.equal(b.res.status, 409, JSON.stringify(b.res.body));
  assert.equal((await ErrorReport.findById(id2).lean()).state, 'open');
  assert.equal(b.mails.length, 0);
});

test('סגירה נכונה: המקורית נעלמה, המוצעת ייחודית (≥15 תווים נראים, לא כותרת) — נסגר "כבר תוקן" פעם אחת, עם מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  gh = new FakeGitHub({ files: { [PATH]: file(['<h1>ספר בדיקה</h1>', 'שורה לפני', LONG_GOOD, 'שורה אחרי']) } });
  const id = await ingest('vol-correct', { originalLine: LONG_BAD, proposed: LONG_GOOD, lineIndex: 2 });
  const { res, mails } = await claimAndApprove(id);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.result, 'already_fixed');
  const r = await ErrorReport.findById(id).lean();
  assert.deepEqual([r.state, r.closeReason, r.publish.status], ['closed_already_fixed', 'volunteer_verified_already_fixed', 'skipped_already_fixed']);
  assert.equal(gh.calls.filter((c) => c.method !== 'GET').length, 0, 'בלי כתיבה ל-GitHub');
  assert.deepEqual(mails.map((m) => m.kind), ['already_fixed']);
});

test('ביקורת שלישית #314: פסקה שזזה וקיבלה מילה (הטעות נשארה), ושורה אחרת זהה להצעה באינדקס הישן — אישור מתנדב: 409 source_not_resolved, פתוח ובלי מייל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const bad = 'ובגמרא שם אמר רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר בדברי הראשונים';
  const good = bad.replace('הלכא', 'הלכה');
  gh = new FakeGitHub({ files: { [PATH]: file(['<h1>ספר בדיקה</h1>', '', good, 'פסוק שנוסף', bad.replace('מבואר', 'מבואר היטב'), 'סוף']) } });
  const id = await ingest('v3-moved-para', { originalLine: bad, proposed: good, lineIndex: 2 });
  const { res, mails } = await claimAndApprove(id);
  assert.deepEqual([res.status, res.body.error, res.body.source?.status], [409, 'source_not_resolved', 'already_applied']);
  const r = await ErrorReport.findById(id).lean();
  assert.deepEqual([r.state, r.manual.status], ['open', 'claimed']);
  assert.equal(mails.length, 0);
  // אותו קובץ אחרי שגם הפסקה שזזה תוקנה, בלי השורה הזרה — נסגר ונשלח מייל (ביקורת חיובית)
  await db.reset();
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true });
  gh = new FakeGitHub({ files: { [PATH]: file(['<h1>ספר בדיקה</h1>', '', good, 'סוף']) } });
  const id2 = await ingest('v3-fixed-para', { originalLine: bad, proposed: good, lineIndex: 2 });
  const ok = await claimAndApprove(id2);
  assert.deepEqual([ok.res.status, ok.res.body.result, ok.mails.map((m) => m.kind)], [200, 'already_fixed', ['already_fixed']]);
});
