/**
 * מירוצי lease של משימת בדיקה (ביקורת #313, P1): כתיבת החלטה נוחתת רק כשהכותב מחזיק ברגע הכתיבה האטומית את ה-lease
 * החדש ביותר שהוקצה לדיווח, וה-lease הזה בתוקף — בכל סדר של הקצאה, קישור לסימון, הארכה (דופק/תוצאה) וכתיבת ההחלטה.
 * כל צעד במסד נעצר דטרמיניסטית לפני ביצועו (gate), והזמן של הכותב מוזרק (deps.leaseNow) — בלי sleep ובלי תלות
 * בתזמון. מול MongoDB אמיתי (standalone, כמו בייצור). הרצה: npm test
 */
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import { handleReportingErrorsPost } from './reporting-handler.js';
import { getCorrectionsConfig } from './config.js';
import { claimVerifyJob, heartbeatVerifyJob, submitVerifyResult } from './agent.js';
import { runWorkerBatch, heldBy } from './worker.js';
import { FakeGitHub } from './testing/fake-github.js';
import { createMockVerifyFetch, buildMockDecision } from './testing/mock-verify.js';
import { startMongo } from './testing/mongo.js';

const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt';
const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
const FILE = `<h1>בראשית</h1>\r\n\r\n${LINE}\r\nסוף\r\n`;
const SEL = 'אֱלֹהִ֑ים';
const START = LINE.indexOf(SEL);
const AGENT = 'verify-1';
const PULL_ENV = {
  CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'pull', CORRECTIONS_AGENT_SECRET: 'N4vQ8r2LxT6mW1zK9pB3sD7fH5jY0cG-aE_uR2iO8tZ', CORRECTIONS_AGENT_ID: AGENT,
};
const PUSH_ENV = { CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_URL: 'http://verify.test', CORRECTIONS_VERIFY_SECRET: 'sec' };
const pull = (over = {}) => getCorrectionsConfig({ ...PULL_ENV, ...over });
const push = () => getCorrectionsConfig(PUSH_ENV);

// שלישי 15.9.2026 13:00 בירושלים — רחוק משבת ומחג. lease של הסוכן: 600 שניות.
const T0 = new Date('2026-09-15T10:00:00Z');
const at = (sec) => new Date(T0.getTime() + sec * 1000);

// ---------------------------------------------------------------- עצירת צעדים במסד

// כתיבה שתואמת gate נעצרת לפני ביצועה, עד release(). ההתקנה ברמת האוסף (גם findOneAndUpdate(...).lean() עובר בה),
// פעם אחת לקובץ, כדי שלא יישאר mock מקונן אחרי בדיקה.
const gates = [];
const restores = [];
function interceptWrites() {
  for (const Model of [ErrorReport, CorrectionJob]) {
    const col = Model.collection;
    for (const method of ['updateOne', 'findOneAndUpdate']) {
      const own = Object.getOwnPropertyDescriptor(col, method);
      const orig = col[method];
      col[method] = async function gated(filter, update, ...rest) {
        const g = gates.find((x) => !x.fired && x.model === Model && x.methods.includes(method) && x.match(filter ?? {}, update ?? {}));
        if (g) {
          g.fired = true;
          g.reached.resolve();
          await g.released.promise;
        }
        return orig.call(this, filter, update, ...rest);
      };
      restores.push(() => (own ? Object.defineProperty(col, method, own) : delete col[method]));
    }
  }
}
const within = (promise, what) => Promise.race([
  promise,
  new Promise((_, reject) => { setTimeout(() => reject(new assert.AssertionError({ message: `הצעד לא הושג: ${what}` })), 5000).unref(); }),
]);
function gate(Model, methods, match, what) {
  const g = { model: Model, methods, match, fired: false, reached: Promise.withResolvers(), released: Promise.withResolvers() };
  gates.push(g);
  return { reached: () => within(g.reached.promise, what), release: () => g.released.resolve() };
}
const ANY = ['updateOne', 'findOneAndUpdate'];
const ms = (d) => (d instanceof Date ? d.getTime() : null);
// הצעדים, לפי צורת הכתיבה. שמירת fence (בלי תוקף) לפני ההקצאה; קישור (עם תוקף) אחריה.
const reserveOf = (fence) => (f, u) => u.$set?.['verification.activeJob.fence'] === fence && u.$set['verification.activeJob.leaseExpiresAt'] === null;
const bindOf = (fence) => (f, u) => u.$set?.['verification.activeJob.fence'] === fence && u.$set['verification.activeJob.leaseExpiresAt'] !== null;
const markerExtensionOf = (fence, until = null) => (f, u) => u.$max?.['verification.activeJob.leaseExpiresAt'] !== undefined
  && f['verification.activeJob.fence'] === fence && (until === null || ms(u.$max['verification.activeJob.leaseExpiresAt']) === until.getTime());
const isAllocation = (f, u) => Array.isArray(u);
const isDecision = (f, u) => u.$set?.['verification.status'] === 'completed';
const inProgressOf = (fence) => (f, u) => u.$set?.['verification.status'] === 'in_progress' && f['verification.activeJob.fence'] === fence;
const isJobExtension = (f, u) => f.leaseTokenHash !== undefined && Boolean(u.$max?.leaseExpiresAt ?? u.$set?.leaseExpiresAt) && u.$set?.resultSha256 === undefined;
const isResultLock = (f, u) => typeof u.$set?.resultSha256 === 'string';

// שעון הקיר של כותב (deps.leaseNow): מתקדם כשהבדיקה מדמה עיכוב.
function wallClock(start) {
  let cur = start.getTime();
  return { now: () => new Date(cur), set: (d) => { cur = d.getTime(); }, advance: (sec) => { cur += sec * 1000; } };
}

// ---------------------------------------------------------------- סביבה

let db;
let gh;
before(async () => {
  db = await startMongo();
  if (!db.skip) interceptWrites();
});
after(async () => {
  for (const restore of restores) restore();
  if (!db.skip) await db.stop();
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
  gh = new FakeGitHub({ files: { [PATH]: FILE } });
});
afterEach(() => {
  for (const g of gates) g.released.resolve();
  gates.length = 0;
});

async function ingest(id, config) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: 'בראשית א', line_number: 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length }, proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '' },
  };
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config, rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  });
  assert.equal(res.status, 200);
  return ErrorReport.findOne({ reportId: id }).lean();
}

const load = (id) => ErrorReport.findById(id).lean();
const jobDoc = (jobId) => CorrectionJob.findById(jobId).lean();
const deps = (extra = {}) => ({ githubFetch: gh.fetch, random: () => 0, ...extra });
const claim = (config, now, extra) => claimVerifyJob({ config, agentId: AGENT, deps: deps(extra), now });
const beat = (config, job, now, extra) => heartbeatVerifyJob({ config, jobId: job.jobId, token: job.leaseToken, deps: deps(extra), now });
function submit(config, job, body, now, extra) {
  const text = JSON.stringify(body);
  return submitVerifyResult({ config, jobId: job.jobId, token: job.leaseToken, raw: Buffer.from(text), body: JSON.parse(text), deps: deps(extra), now });
}
const review = (job) => buildMockDecision(job.request, { decision: 'needs_review' });

// התוקף בסימון לעולם אינו מאוחר מזה שבמשימה (כל עוד שניהם קיימים).
async function assertMarkerNotAfterJob(reportId, jobId, what) {
  const [report, job] = await Promise.all([load(reportId), jobDoc(jobId)]);
  const m = report.verification.activeJob;
  assert.ok(m?.leaseExpiresAt && job.leaseExpiresAt && m.leaseExpiresAt <= job.leaseExpiresAt, `${what}: ${JSON.stringify({ marker: m, job: job.leaseExpiresAt })}`);
}

// המחזיק החדש עדיין מכריע אחרי המירוץ.
async function assertHolderDecides(config, job, now, reportId) {
  const res = await submit(config, job, review(job), now);
  assert.equal(res.outcome, 'manual', JSON.stringify(res));
  const report = await load(reportId);
  assert.equal(report.verification.status, 'completed');
  assert.equal(report.manual.status, 'queued');
}

// ---------------------------------------------------------------- תוצאה מול תפיסה חדשה

test('ביקורת #313 (א): דחייה ישנה שהתעכבה אינה סוגרת דיווח אחרי שהוקצה lease חלופי — גם לפני שנקשר לסימון', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull({ CORRECTIONS_VERIFY_AUTO_REJECT: '1' });
  const r = await ingest('race-a', c);
  const { job } = await claim(c, T0);
  const decision = gate(ErrorReport, ANY, isDecision, 'כתיבת ההחלטה הישנה');
  const bind2 = gate(ErrorReport, ['updateOne'], bindOf(2), 'הקישור של התפיסה החלופית');
  const oldResult = submit(c, job, buildMockDecision(job.request, { decision: 'rejected' }), at(1));
  await decision.reached();
  // הכתיבה הישנה תקועה בדרך למסד; ה-lease שהתוצאה האריכה (עד at(601)) פג, ותפיסה חדשה מקצה fence 2.
  const newClaim = claim(c, at(602));
  await bind2.reached();
  assert.equal((await jobDoc(job.jobId)).fence, 2, 'הוקצה lease חדש שעדיין לא נקשר לסימון');
  decision.release();
  const result = await oldResult;
  bind2.release();
  const replacement = await newClaim;
  const report = await load(r._id);
  assert.notEqual(report.state, 'closed_rejected', JSON.stringify({ result, state: report.state, replacementReturned: !!replacement.job }));
  assert.equal(result.outcome, 'cancelled');
  assert.ok(replacement.job, 'התפיסה החלופית נקשרת ונמסרת');
  const fresh = await submit(c, replacement.job, buildMockDecision(replacement.job.request, { decision: 'rejected' }), at(603));
  assert.equal(fresh.outcome, 'close_rejected');
  assert.equal((await load(r._id)).state, 'closed_rejected');
});

test('מירוץ lease: החלטה ישנה שמגיעה למסד אחרי ששמרה תפיסה חדשה fence (לפני ההקצאה) — נדחית; ובסדר ההפוך — נוחתת והתפיסה ריקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-reserve-a', c);
  const { job } = await claim(c, T0);
  const decision = gate(ErrorReport, ANY, isDecision, 'כתיבת ההחלטה הישנה');
  const allocation = gate(CorrectionJob, ['findOneAndUpdate'], isAllocation, 'הקצאת המשימה');
  const oldResult = submit(c, job, review(job), at(1));
  await decision.reached();
  const late = claim(c, at(602));
  await allocation.reached();
  assert.deepEqual((await load(r._id)).verification.activeJob.fence, 2, 'ה-fence הבא נשמר לפני ההקצאה');
  decision.release();
  assert.equal((await oldResult).outcome, 'cancelled');
  allocation.release();
  const replacement = await late;
  assert.ok(replacement.job);
  await assertHolderDecides(c, replacement.job, at(603), r._id);

  // הסדר ההפוך: השמירה של התפיסה החדשה מתעכבת, וההחלטה של המחזיק (שה-lease שלו עוד בתוקף) נוחתת קודם
  await db.reset();
  const r2 = await ingest('race-reserve-b', c);
  const first = (await claim(c, T0)).job;
  const reserve = gate(ErrorReport, ['updateOne'], reserveOf(2), 'שמירת ה-fence של התפיסה החדשה');
  const pending = claim(c, at(601));
  await reserve.reached();
  assert.equal((await submit(c, first, review(first), at(599))).outcome, 'manual');
  reserve.release();
  assert.equal((await pending).job, null, 'הדיווח הוכרע — אין מה למסור');
  const report = await load(r2._id);
  assert.equal(report.decisions.filter((d) => !d.stale).length, 1);
  assert.equal(report.verification.activeJob, null);
});

test('מירוץ lease: תוצאה ישנה שהתעכבה עד אחרי שהתפיסה החלופית נקשרה — נדחית לפי fence, והחלופית מכריעה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-result-late', c);
  const { job } = await claim(c, T0);
  const decision = gate(ErrorReport, ANY, isDecision, 'כתיבת ההחלטה הישנה');
  const oldResult = submit(c, job, review(job), at(1));
  await decision.reached();
  const replacement = await claim(c, at(602));
  assert.ok(replacement.job);
  decision.release();
  assert.equal((await oldResult).outcome, 'cancelled');
  assert.equal((await load(r._id)).verification.status, 'in_progress');
  await assertHolderDecides(c, replacement.job, at(603), r._id);
});

test('מירוץ lease: הארכת הסימון של תוצאה ישנה מתבצעת אחרי הקצאה חדשה (לפני הקישור) — לא מחייה את ה-lease הישן', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-result-ext-a', c);
  const { job } = await claim(c, T0);
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בתוצאה');
  const bind2 = gate(ErrorReport, ['updateOne'], bindOf(2), 'הקישור של התפיסה החלופית');
  const oldResult = submit(c, job, review(job), at(1));
  await extension.reached();
  const late = claim(c, at(602));
  await bind2.reached();
  extension.release();
  assert.equal((await oldResult).outcome, 'cancelled');
  const marker = (await load(r._id)).verification.activeJob;
  assert.equal(marker.fence, 2, 'ה-fence השמור לא חזר לאחור');
  assert.equal(marker.leaseExpiresAt, null, 'ההארכה הישנה לא נתנה תוקף ל-fence השמור');
  bind2.release();
  const replacement = await late;
  assert.ok(replacement.job);
  await assertHolderDecides(c, replacement.job, at(603), r._id);
});

test('מירוץ lease: הארכת הסימון של תוצאה ישנה מתבצעת אחרי שהתפיסה החלופית נקשרה — אינה נוגעת בסימון החדש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-result-ext-b', c);
  const { job } = await claim(c, T0);
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בתוצאה');
  const oldResult = submit(c, job, review(job), at(1));
  await extension.reached();
  const replacement = await claim(c, at(602));
  assert.ok(replacement.job);
  const bound = (await load(r._id)).verification.activeJob;
  extension.release();
  assert.equal((await oldResult).outcome, 'cancelled');
  assert.deepEqual((await load(r._id)).verification.activeJob, bound);
  await assertHolderDecides(c, replacement.job, at(603), r._id);
});

test('מירוץ lease: נעילת התוצאה במשימה אחרי הקצאה חדשה → 409 ותיעוד בלבד; ולפני ההקצאה — התפיסה החדשה אינה מקבלת משימה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  // התוצאה ננעלת אחרי שה-lease פג והוקצה מחדש
  const r = await ingest('race-result-lock-a', c);
  const { job } = await claim(c, T0);
  const lock = gate(CorrectionJob, ['findOneAndUpdate'], isResultLock, 'נעילת התוצאה במשימה');
  const oldResult = submit(c, job, review(job), at(599));
  await lock.reached();
  const replacement = await claim(c, at(601));
  assert.ok(replacement.job);
  lock.release();
  const res = await oldResult;
  assert.equal(res.code, 'lease_invalid');
  const report = await load(r._id);
  assert.equal(report.verification.status, 'in_progress');
  assert.ok(report.decisions.some((d) => d.stale), 'ההחלטה נשמרה לתיעוד בלבד');
  await assertHolderDecides(c, replacement.job, at(602), r._id);

  // הסדר ההפוך: התוצאה נעלה והאריכה לפני התפיסה; ההחלטה עצמה עדיין בדרך — אין הקצאה חדשה
  await db.reset();
  const r2 = await ingest('race-result-lock-b', c);
  const first = (await claim(c, T0)).job;
  const decision = gate(ErrorReport, ANY, isDecision, 'כתיבת ההחלטה');
  const pending = submit(c, first, review(first), at(599));
  await decision.reached();
  assert.equal((await claim(c, at(601))).job, null, 'ה-lease הוארך בנעילת התוצאה');
  decision.release();
  assert.equal((await pending).outcome, 'manual');
  assert.equal((await load(r2._id)).verification.status, 'completed');
});

test('מירוץ lease: מחזיק שה-lease שלו פג בזמן עיבוד התוצאה אינו מכריע גם בלי תפיסה מתחרה, והדיווח חוזר לבדיקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-expired', c);
  const { job } = await claim(c, T0);
  const wall = wallClock(at(1));
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בתוצאה');
  const result = submit(c, job, review(job), at(1), { leaseNow: wall.now });
  await extension.reached();
  // העיבוד נתקע (מסד/תהליך) מעבר ל-lease שהתוצאה האריכה (עד at(601)) — לפני שההחלטה נכתבה.
  wall.set(at(700));
  extension.release();
  assert.equal((await result).outcome, 'cancelled');
  const report = await load(r._id);
  assert.equal(report.verification.status, 'in_progress');
  assert.ok(report.decisions.every((d) => d.stale));
  // רשת הביטחון בתפיסה הבאה מחזירה אותו לתור, והמחזיק החדש מכריע
  const next = await claim(c, at(701));
  assert.ok(next.job);
  await assertHolderDecides(c, next.job, at(702), r._id);
});

// ---------------------------------------------------------------- תפיסה ישנה מול תפיסה חדשה

test('ביקורת #313 (ב): תפיסה ישנה שהתעכבה לפני הקישור אינה מחזירה לאחור את הסימון של התפיסה החדשה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-b', c);
  const bind1 = gate(ErrorReport, ['updateOne'], bindOf(1), 'הקישור של התפיסה הראשונה');
  const early = claim(c, T0);
  await bind1.reached();
  const latest = await claim(c, at(601));
  assert.ok(latest.job);
  assert.equal((await load(r._id)).verification.activeJob.fence, 2);
  bind1.release();
  const earlyClaim = await early;
  const marker = (await load(r._id)).verification.activeJob;
  const result = await submit(c, latest.job, review(latest.job), at(602));
  assert.equal(result.outcome, 'manual', JSON.stringify({ oldClaimReturned: !!earlyClaim.job, reportFence: marker.fence, jobFence: (await jobDoc(latest.job.jobId)).fence, result }));
  assert.equal(marker.fence, 2, 'הסימון לא חזר לאחור');
  assert.equal(earlyClaim.job, null, 'התפיסה הישנה אינה נמסרת');
});

test('מירוץ lease: קישור ישן שמתבצע אחרי הקצאה חדשה (לפני הקישור שלה) — הישנה אינה נמסרת, החדשה נקשרת ומכריעה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-bind-order', c);
  const bind1 = gate(ErrorReport, ['updateOne'], bindOf(1), 'הקישור של התפיסה הראשונה');
  const bind2 = gate(ErrorReport, ['updateOne'], bindOf(2), 'הקישור של התפיסה השנייה');
  const early = claim(c, T0);
  await bind1.reached();
  const late = claim(c, at(601));
  await bind2.reached();
  bind1.release();
  assert.equal((await early).job, null, 'הקישור הישן אינו דורס את ה-fence השמור');
  bind2.release();
  const replacement = await late;
  assert.ok(replacement.job);
  assert.equal((await load(r._id)).verification.activeJob.fence, 2);
  await assertHolderDecides(c, replacement.job, at(602), r._id);
});

test('מירוץ lease: סימון "בבדיקה" של תפיסה ישנה שהתעכב עד אחרי תפיסה חדשה מלאה — הישנה אינה נמסרת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-in-progress', c);
  const inProgress = gate(ErrorReport, ['updateOne'], inProgressOf(1), 'סימון בבדיקה של התפיסה הראשונה');
  const early = claim(c, T0);
  await inProgress.reached();
  const replacement = await claim(c, at(601));
  assert.ok(replacement.job);
  inProgress.release();
  assert.equal((await early).job, null);
  assert.equal((await load(r._id)).verification.activeJob.fence, 2);
  await assertHolderDecides(c, replacement.job, at(602), r._id);
});

// ---------------------------------------------------------------- דופק מול תפיסה חדשה

test('מירוץ lease: הארכת הסימון בדופק אחרי הקצאה חדשה (לפני הקישור) — הדופק מחזיר cancelled והמחזיק הישן אינו מכריע', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-beat-ext-a', c);
  const { job } = await claim(c, T0);
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בדופק');
  const bind2 = gate(ErrorReport, ['updateOne'], bindOf(2), 'הקישור של התפיסה החלופית');
  const beating = beat(c, job, at(599)); // המשימה מוארכת עד at(1199), הסימון ממתין
  await extension.reached();
  const late = claim(c, at(1200));
  await bind2.reached();
  extension.release();
  assert.equal((await beating).cancelled, true);
  const marker = (await load(r._id)).verification.activeJob;
  assert.equal(marker.fence, 2);
  assert.equal(marker.leaseExpiresAt, null);
  const oldHolder = { _id: new mongoose.Types.ObjectId(job.jobId), fence: 1 };
  assert.equal(await ErrorReport.countDocuments({ _id: r._id, ...heldBy(oldHolder, at(1200)) }), 0, 'כתיבה מטעם ה-lease הישן אינה מתאימה');
  assert.equal((await submit(c, job, review(job), at(1200))).code, 'lease_invalid');
  bind2.release();
  const replacement = await late;
  assert.ok(replacement.job);
  assert.equal((await load(r._id)).verification.activeJob.fence, 2);
  await assertHolderDecides(c, replacement.job, at(1201), r._id);
});

test('מירוץ lease: הארכת הסימון בדופק אחרי שהתפיסה החלופית נקשרה — הדופק מחזיר cancelled והסימון החדש לא משתנה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-beat-ext-b', c);
  const { job } = await claim(c, T0);
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בדופק');
  const beating = beat(c, job, at(599));
  await extension.reached();
  const replacement = await claim(c, at(1200));
  assert.ok(replacement.job);
  const bound = (await load(r._id)).verification.activeJob;
  extension.release();
  assert.equal((await beating).cancelled, true);
  assert.deepEqual((await load(r._id)).verification.activeJob, bound);
  assert.equal((await jobDoc(replacement.job.jobId)).status, 'leased', 'המשימה של המחזיק החדש לא שוחררה ולא בוטלה');
  await assertHolderDecides(c, replacement.job, at(1201), r._id);
});

test('מירוץ lease: הארכת המשימה בדופק אחרי הקצאה חדשה → 409; ולפני ההקצאה — אין הקצאה והמחזיק מכריע', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-beat-job-a', c);
  const { job } = await claim(c, T0);
  const extension = gate(CorrectionJob, ['updateOne'], isJobExtension, 'הארכת המשימה בדופק');
  const beating = beat(c, job, at(599));
  await extension.reached();
  const replacement = await claim(c, at(601));
  assert.ok(replacement.job);
  extension.release();
  assert.equal((await beating).code, 'lease_invalid');
  await assertHolderDecides(c, replacement.job, at(602), r._id);

  await db.reset();
  const r2 = await ingest('race-beat-job-b', c);
  const first = (await claim(c, T0)).job;
  assert.equal((await beat(c, first, at(599))).cancelled, false);
  await assertMarkerNotAfterJob(r2._id, first.jobId, 'אחרי הדופק');
  assert.equal((await claim(c, at(601))).job, null, 'הדופק האריך את ה-lease לפני התפיסה');
  await assertHolderDecides(c, first, at(700), r2._id);
});

test('מירוץ lease: דופק שהסימון שלו כבר אינו של התפיסה מחזיר את המשימה לתור, והתפיסה הבאה ממשיכה את ה-fence השמור', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  const r = await ingest('race-beat-reserved', c);
  const { job } = await claim(c, T0);
  // תפיסה שקראה את המשימה כפגה שמרה את ה-fence הבא, אבל הדופק הספיק להאריך את המשימה — ההקצאה שלה נכשלת.
  const extension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1), 'הארכת הסימון בדופק');
  const beating = beat(c, job, at(590));
  await extension.reached();
  await ErrorReport.updateOne({ _id: r._id }, { $set: { 'verification.activeJob.fence': 2, 'verification.activeJob.leaseExpiresAt': null } });
  extension.release();
  assert.equal((await beating).cancelled, true);
  const returned = await jobDoc(job.jobId);
  assert.equal(returned.status, 'pending', 'חזרה לתור מיד, בלי לחכות לפקיעה');
  assert.equal(returned.leaseExpiries ?? 0, 0, 'בלי פקיעה');
  const next = await claim(c, at(591));
  assert.ok(next.job);
  assert.equal((await load(r._id)).verification.activeJob.fence, 2);
  await assertHolderDecides(c, next.job, at(592), r._id);
});

// ---------------------------------------------------------------- דופק ותוצאה של אותו מחזיק

test('מירוץ lease: דופק ותוצאה של אותו מחזיק בסדר מתחלף — התוקף בסימון אינו מאוחר משל המשימה, וההחלטה נוחתת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  // תוצאה (at(200), עד at(800)) ננעלת במשימה; דופק שנשלח קודם (at(100), עד at(700)) מתבצע כולו; ואז הסימון של התוצאה
  const r = await ingest('race-same-holder-a', c);
  const { job } = await claim(c, T0);
  const resultExtension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1, at(800)), 'הארכת הסימון בתוצאה');
  const decision = gate(ErrorReport, ANY, isDecision, 'כתיבת ההחלטה');
  const result = submit(c, job, review(job), at(200));
  await resultExtension.reached();
  await assertMarkerNotAfterJob(r._id, job.jobId, 'אחרי נעילת התוצאה');
  assert.equal((await beat(c, job, at(100))).cancelled, false);
  await assertMarkerNotAfterJob(r._id, job.jobId, 'אחרי הדופק המאוחר');
  assert.equal((await jobDoc(job.jobId)).leaseExpiresAt.getTime(), at(800).getTime(), 'הדופק המאוחר לא קיצר את ה-lease');
  resultExtension.release();
  await decision.reached();
  await assertMarkerNotAfterJob(r._id, job.jobId, 'לפני ההחלטה');
  decision.release();
  assert.equal((await result).outcome, 'manual');

  // דופק מאריך את המשימה והסימון שלו ממתין; תוצאה מלאה נוחתת בינתיים; הדופק מסתיים אחריה בלי לגעת בכלום
  await db.reset();
  const r2 = await ingest('race-same-holder-b', c);
  const second = (await claim(c, T0)).job;
  const beatExtension = gate(ErrorReport, ['updateOne'], markerExtensionOf(1, at(700)), 'הארכת הסימון בדופק');
  const beating = beat(c, second, at(100));
  await beatExtension.reached();
  await assertMarkerNotAfterJob(r2._id, second.jobId, 'אחרי הארכת המשימה בדופק');
  assert.equal((await submit(c, second, review(second), at(200))).outcome, 'manual');
  beatExtension.release();
  assert.equal((await beating).cancelled, true);
  const report = await load(r2._id);
  assert.equal(report.verification.status, 'completed');
  assert.equal(report.verification.activeJob, null);
  assert.equal((await jobDoc(second.jobId)).status, 'done');
});

// ---------------------------------------------------------------- סימון מלפני השינוי

test('מירוץ lease: סימון בלי תוקף (מלפני השינוי) נכשל-סגור, והמחזיק המאומת משדרג אותו בדופק או בתוצאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull();
  for (const via of ['heartbeat', 'result']) {
    await db.reset();
    const r = await ingest(`race-legacy-${via}`, c);
    const { job } = await claim(c, T0);
    await ErrorReport.collection.updateOne({ _id: r._id }, { $unset: { 'verification.activeJob.leaseExpiresAt': 1 } });
    const holder = { _id: new mongoose.Types.ObjectId(job.jobId), fence: 1 };
    assert.equal(await ErrorReport.countDocuments({ _id: r._id, ...heldBy(holder, at(1)) }), 0, `${via}: סימון בלי תוקף אינו מתאים לכתיבת החלטה`);
    if (via === 'heartbeat') {
      assert.equal((await beat(c, job, at(10))).cancelled, false);
      assert.equal((await load(r._id)).verification.activeJob.leaseExpiresAt.getTime(), at(610).getTime());
      await assertMarkerNotAfterJob(r._id, job.jobId, 'אחרי השדרוג בדופק');
    }
    await assertHolderDecides(c, job, at(20), r._id);
  }
});

// ---------------------------------------------------------------- דחיפה

test('דחיפה: אצווה איטית — ה-lease מוארך לפני ההכנה ולפני הקריאה לשירות, וגם ההחלטה של המשימה האחרונה נוחתת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const base = push();
  const c = { ...base, worker: { ...base.worker, concurrency: 1 } };
  const reports = [];
  for (const id of ['push-slow-1', 'push-slow-2', 'push-slow-3']) reports.push(await ingest(id, c));
  // כל קריאה לשירות לוקחת 60 שניות; ה-lease בדחיפה 120 שניות מתחילת האצווה — בלי הארכה, השנייה והשלישית היו מאבדות אותו.
  const wall = wallClock(T0);
  const verify = createMockVerifyFetch((call) => {
    wall.advance(60);
    return { status: 200, body: buildMockDecision(call.body, { decision: 'needs_review' }) };
  });
  await runWorkerBatch({ config: c, workerId: 'w1', deps: deps({ verifyFetch: verify, leaseNow: wall.now }), now: T0 });
  for (const r of reports) {
    const report = await load(r._id);
    assert.equal(report.verification.status, 'completed', `${r.reportId}: ${report.verification.status}`);
    assert.equal(report.manual.status, 'queued');
  }
});

test('דחיפה: אצווה שה-lease שלה פג ומשימתה נתפסה באצווה אחרת אינה מכריעה — גם לפני שהאחרת נקשרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = push();
  const r = await ingest('push-race', c);
  const inCall = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const verifyA = createMockVerifyFetch(async (call) => {
    inCall.resolve();
    await resume.promise;
    return { status: 200, body: buildMockDecision(call.body, { decision: 'needs_review' }) };
  });
  const batchA = runWorkerBatch({ config: c, workerId: 'A', deps: deps({ verifyFetch: verifyA }), now: T0 });
  await within(inCall.promise, 'הקריאה של אצווה A');
  // הקריאה של A נמשכת; ה-lease שלה (120 שניות) פג ואצווה B תופסת את המשימה (fence 2) — הקישור שלה נעצר.
  const bindB = gate(ErrorReport, ['updateOne'], bindOf(2), 'הקישור של אצווה B');
  const verifyB = createMockVerifyFetch((call) => ({ status: 200, body: buildMockDecision(call.body, { decision: 'needs_review' }) }));
  const batchB = runWorkerBatch({ config: c, workerId: 'B', deps: deps({ verifyFetch: verifyB }), now: at(200) });
  await bindB.reached();
  resume.resolve();
  await batchA;
  const mid = await load(r._id);
  assert.equal(mid.verification.status, 'in_progress', `ההחלטה של A לא נכתבה: ${JSON.stringify({ status: mid.verification.status, manual: mid.manual.status })}`);
  bindB.release();
  await batchB;
  const report = await load(r._id);
  assert.equal(report.verification.status, 'completed');
  assert.equal(report.manual.status, 'queued');
  assert.equal(report.decisions.filter((d) => !d.stale).length, 1, 'החלטה אחת בלבד נחתה — של B');
});

// ---------------------------------------------------------------- ביקורת רביעית: תוקף ברגע הכתיבה, ומקור של התפיסה ששלחה

test('ביקורת רביעית #313: lease שפג בזמן יצירת חבילת השינוי — האישור אינו נכתב, אין חבילה ואין פרסום, והתפיסה הבאה מכריעה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = getCorrectionsConfig({
    ...PULL_ENV, DICTA_LIBRARY_GITHUB_TOKEN: 't', CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content',
  }, { publishMode: 'pr', autoPublish: true });
  const approve = (job) => buildMockDecision(job.request, { scope: 'technical_and_content' });
  const r = await ingest('race-expired-package', c);
  const { job } = await claim(c, T0);
  const wall = wallClock(at(1));
  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const create = ChangePackage.create;
  ChangePackage.create = async function slowCreate(...args) {
    started.resolve();
    await resume.promise;
    return create.apply(this, args);
  };
  let result;
  try {
    result = submit(c, job, approve(job), at(1), { leaseNow: wall.now });
    await within(started.promise, 'יצירת חבילת השינוי');
    // התוצאה האריכה את ה-lease עד at(601); היצירה נתקעת עד אחרי שפג — אחרי שתנאי ההחזקה כבר היה נבנה בעבר.
    assert.equal((await jobDoc(job.jobId)).leaseExpiresAt.getTime(), at(601).getTime());
    wall.set(at(602));
  } finally {
    resume.resolve();
    ChangePackage.create = create;
  }
  assert.equal((await result).outcome, 'cancelled');
  const report = await load(r._id);
  assert.equal(report.dispatch.publish, false, 'אין פרסום שממתין');
  assert.notEqual(report.publish.status, 'ready');
  assert.notEqual(report.approval?.authority, 'service', 'אין אישור של השירות');
  assert.equal(report.verification.status, 'in_progress');
  assert.ok(report.decisions.every((d) => d.stale));
  assert.equal(await ChangePackage.countDocuments({ report: r._id }), 0, 'החבילה של ההחלטה שהפסידה הוסרה');
  // התפיסה הבאה מקבלת את המשימה, ואותו אישור — בלי עיכוב — נכתב ומגיע לפרסום (הבדיקה מבחינה בין שני המצבים).
  const next = await claim(c, at(603));
  assert.ok(next.job);
  const res = await submit(c, next.job, approve(next.job), at(604));
  assert.equal(res.outcome, 'publish', JSON.stringify(res));
  const approved = await load(r._id);
  assert.equal(approved.dispatch.publish, true);
  assert.equal(await ChangePackage.countDocuments({ report: r._id, changeId: approved.publish.changeId }), 1);
});

test('ביקורת רביעית #313: הכנה של תפיסה שפגה אינה דורסת את המקור שנשלח בתפיסה הבאה, והתוצאה התקפה נבדקת מולו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const c = pull({ CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content' });
  const r = await ingest('race-expired-source', c);
  const firstBlob = gh.fileSha('main', PATH);
  const save = gate(ErrorReport, ['updateOne'], (f, u) => u.$set?.resolvedSource?.blobSha === firstBlob, 'שמירת המקור של התפיסה הישנה');
  const wall = wallClock(T0);
  const old = claim(c, T0, { leaseNow: wall.now });
  await save.reached();
  // המקור משתנה וה-lease של התפיסה הישנה (600 שניות) פג: התפיסה הבאה מאתרת מחדש ושולחת את המקור החדש.
  gh.pushExternal('main', { [PATH]: `${FILE}סוף נוסף\r\n` });
  const next = await claim(c, at(601));
  const freshBlob = gh.fileSha('main', PATH);
  assert.notEqual(freshBlob, firstBlob);
  assert.ok(next.job);
  assert.equal(next.job.request.source.blob_sha, freshBlob);
  wall.set(at(601));
  save.release();
  assert.equal((await old).job, null, 'התפיסה הישנה אינה נמסרת');
  assert.equal((await load(r._id)).resolvedSource.blobSha, freshBlob, 'המקור השמור הוא זה שהתפיסה המחזיקה שלחה');
  const res = await submit(c, next.job, buildMockDecision(next.job.request, { scope: 'technical_and_content' }), at(602));
  assert.equal(res.outcome, 'manual', JSON.stringify(res));
  const report = await load(r._id);
  assert.equal(report.manual.handoffReason, 'auto_publish_not_permitted', 'האישור התקף אינו מסווג כהצעה שהשירות שינה');
  assert.equal(report.resolvedSource.blobSha, freshBlob);
});

// הביקורת החמישית #313: המחזיק הישן והחדש שלחו בדיוק אותו גוף (אותה טביעה). התשובה השמורה לשליחה חוזרת שייכת לתפיסה
// ששמרה אותה — הביטול המאוחר של הישן אינו דורס את manual של החדש.
test('הביקורת החמישית #313: מחזיק ישן עם אותו גוף בדיוק אינו דורס את התשובה השמורה של המחזיק החדש', async () => {
  const c = pull();
  const r = await ingest('r5-same-sha', c);
  const { job: first } = await claim(c, T0);
  const body = review(first);
  const decision = gate(ErrorReport, ANY, isDecision, 'old decision update');
  const a = submit(c, first, body, at(1));
  await decision.reached();
  const { job: second } = await claim(c, at(602));
  assert.equal(second.jobId, first.jobId);
  assert.equal(second.request.request_id, first.request.request_id);
  const b = await submit(c, second, body, at(603));
  assert.equal(b.outcome, 'manual');
  decision.release();
  assert.equal((await a).outcome, 'cancelled');
  const replay = await submit(c, second, body, at(604));
  assert.deepEqual([replay.outcome, replay.duplicate, (await load(r._id)).verification.status], ['manual', true, 'completed']);
});

// הביקורת החמישית #313: כתיבת החלטה שהתעכבה בדרך למסד (כאן — עיכוב אמיתי של 4 שניות) עד אחרי פקיעת ה-lease, בלי תפיסה
// מתחרה. התנאי נבדק גם בשעון המסד ($$NOW) ברגע הביצוע. lease של 34 שניות: מרווח הכתיבה (30) ועוד 3 שניות מ-at(1).
// (שעון מדומה שמוזז בזמן שהכתיבה עצורה אינו נראה למסד — רק עיכוב אמיתי.)
test('הביקורת החמישית #313: כתיבת החלטה שהתעכבה בדרך למסד עד אחרי פקיעת ה-lease — שעון המסד דוחה אותה, גם בלי תפיסה מתחרה', async () => {
  const base = pull();
  const c = { ...base, agent: { ...base.agent, leaseSeconds: 34 } };
  // ביקורת: בלי עיכוב ההחלטה נוחתת
  const ok = await ingest('r5-db-clock-ok', c);
  const { job: j1 } = await claim(c, T0);
  assert.equal((await submit(c, j1, review(j1), at(1))).outcome, 'manual');
  assert.equal((await load(ok._id)).verification.status, 'completed');
  // עם עיכוב אמיתי בדרך למסד — אינה נוחתת
  const r = await ingest('r5-db-clock', c);
  const { job } = await claim(c, T0);
  assert.equal(ms((await jobDoc(job.jobId)).leaseExpiresAt), ms(at(34)));
  const decision = gate(ErrorReport, ANY, isDecision, 'delayed decision update');
  const result = submit(c, job, review(job), at(1));
  await decision.reached();
  await new Promise((res) => { setTimeout(res, 4000); });
  decision.release();
  assert.equal((await result).outcome, 'cancelled');
  assert.equal((await load(r._id)).verification.status, 'in_progress');
});
