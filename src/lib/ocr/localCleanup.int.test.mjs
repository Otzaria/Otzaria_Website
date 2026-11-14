/**
 * בדיקות אינטגרציה לניקוי קבצי עבודות OCR מקומי (localCleanup.js) מול MongoDB אמיתי ותיקיית
 * אחסון זמנית: 24 שעות מ-ackAt, בלי ack — לא נמחק, תוצאה מתנגשת שטרם נבדקה נשמרת, דחיות 30 יום,
 * ביטול/הכנה נטושה (קלט יתום), הרצה חוזרת לא עושה כלום, תיקייה שנוצרה מחדש, שורש חסר, גבולות,
 * רשומה וה-ack לא משתנים, ו-resumeStalledApplies מתוך ה-cron.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import OcrJob from '../../models/OcrJob.js';
import { purgeLocalJobFiles, runLocalOcrCleanup } from './localCleanup.js';
import { intakeResult } from './localResultIntake.js';
import { cancelLocalJob } from './localCancel.js';
import { startMongo } from '../corrections/testing/mongo.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);

let db;
let tmp;
let root;
let env;
before(async () => {
  db = await startMongo();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-cleanup-'));
});
after(async () => {
  if (!db.skip) await db.stop();
  await fs.rm(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
  root = await fs.mkdtemp(path.join(tmp, 'root-'));
  env = { OCR_LOCAL_STORAGE_DIR: root };
});

const oid = () => new mongoose.Types.ObjectId();
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const load = (id) => OcrJob.findById(id).lean();
const dirOf = (job) => path.join(root, String(job._id));
const filesOf = async (job) => (await fs.readdir(dirOf(job)).catch(() => null))?.sort() ?? null;
const ago = (now, ms) => new Date(now.getTime() - ms);
const ackOf = (job, sha, ack = 'accepted', outcome = 'success') => ({ ack, jobId: String(job._id), resultSha256: sha, outcome });

async function writeFiles(job, names, { mtime } = {}) {
  await fs.mkdir(dirOf(job), { recursive: true });
  for (const name of names) {
    const p = path.join(dirOf(job), name);
    await fs.writeFile(p, name);
    if (mtime) await fs.utimes(p, mtime, mtime);
  }
}

// עבודה שנסגרה עם ack לפני ackAgoMs, עם קלט ותוצאה מאושרת בדיסק
async function makeAcked(now, ackAgoMs, over = {}) {
  const _id = oid();
  const job = await OcrJob.create({
    _id,
    book: oid(),
    method: 'local',
    status: 'completed',
    active: false,
    workerId: 'worker-1',
    inputPath: `${_id}/input-${A}.pdf`,
    inputSha256: A,
    inputBytes: 10,
    resultSha256: B,
    resultOutcome: 'success',
    resultPath: `${_id}/result-${B}.json`,
    decision: 'apply',
    ack: { ack: 'accepted', jobId: String(_id), resultSha256: B, outcome: 'success' },
    ackAt: ago(now, ackAgoMs),
    finishedAt: ago(now, ackAgoMs),
    ...over,
  });
  await writeFiles(job, [`input-${A}.pdf`, `result-${B}.json`]);
  return job.toObject();
}

const run = (now, opts = {}) => purgeLocalJobFiles({ now, env, ...opts });

test('ack לפני 23 שעות — נשמר; לפני 25 שעות — קלט ותוצאה נמחקים, התיקייה נמחקת, הרשומה וה-ack לא משתנים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const fresh = await makeAcked(now, 23 * HOUR);
  const old = await makeAcked(now, 25 * HOUR);
  const before = await load(old._id);

  const s = await run(now);
  assert.equal(s.scanned, 1);
  assert.equal(s.inputsDeleted, 1);
  assert.equal(s.resultsDeleted, 1);
  assert.equal(s.jobsPurged, 1);
  assert.equal(s.errors, 0);

  assert.deepEqual(await filesOf(fresh), [`input-${A}.pdf`, `result-${B}.json`]);
  const fj = await load(fresh._id);
  assert.equal(fj.filesCheckedAt, undefined);

  assert.equal(await filesOf(old), null, 'התיקייה נמחקה');
  const after = await load(old._id);
  assert.equal(after.filesPurgedAt.getTime(), now.getTime());
  assert.equal(after.filesCheckedAt.getTime(), now.getTime());
  assert.equal(after.inputPurgedAt.getTime(), now.getTime());
  assert.equal(after.resultPurgedAt.getTime(), now.getTime());
  // כל שאר השדות (כולל ack, נתיבים, hashes ו-updatedAt) — בדיוק כמו קודם
  const strip = ({ filesPurgedAt, filesCheckedAt, inputPurgedAt, resultPurgedAt, ...rest }) => rest;
  assert.deepEqual(strip(after), strip(before));

  // 24 שעות אחרי ה-ack של הטרייה — גם היא נמחקת
  const later = new Date(now.getTime() + 2 * HOUR);
  const s2 = await run(later);
  assert.equal(s2.scanned, 1);
  assert.equal(await filesOf(fresh), null);
});

test('הרצה חוזרת לא עושה כלום (לא סורקת שוב עבודה שנוקתה)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  await makeAcked(now, 25 * HOUR);
  assert.equal((await run(now)).scanned, 1);
  const again = await run(new Date(now.getTime() + HOUR));
  assert.deepEqual(
    [again.scanned, again.inputsDeleted, again.resultsDeleted, again.rejectedDeleted, again.jobsPurged, again.errors],
    [0, 0, 0, 0, 0, 0]
  );
});

test('בלי ack — לא נמחק: עבודה פעילה (delivery_pending) ותוצאה נעולה בלי ack, גם אחרי שבועות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const pending = await OcrJob.create({
    book: oid(),
    method: 'local',
    status: 'delivery_pending',
    active: true,
    workerId: 'worker-1',
    inputSha256: A,
    updatedAt: ago(now, 40 * DAY),
  });
  await writeFiles(pending, [`input-${A}.pdf`]);
  // בוטלה, ותוצאה ננעלה אבל ה-ack לא נשמר (קריסה) — resumeStalledApplies יטפל, הניקוי לא
  const stalled = await OcrJob.create({
    book: oid(),
    method: 'local',
    status: 'cancelled',
    decision: 'cancel',
    active: false,
    workerId: 'worker-1',
    inputSha256: A,
    resultSha256: B,
    resultPath: 'x',
    finishedAt: ago(now, 40 * DAY),
    cancelledAt: ago(now, 40 * DAY),
  });
  await writeFiles(stalled, [`input-${A}.pdf`, `result-${B}.json`]);

  const s = await run(now);
  assert.equal(s.scanned, 0);
  assert.deepEqual(await filesOf(pending), [`input-${A}.pdf`]);
  assert.deepEqual(await filesOf(stalled), [`input-${A}.pdf`, `result-${B}.json`]);
});

test('rejected של תוצאה מתנגשת שטרם נבדקה נשמר; אחרי reviewedAt — נמחק בהרצה הבאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 40 * DAY, {
    resultConflicts: [{ sha256: C, receivedAt: ago(now, 39 * DAY), bytes: 5, path: 'x' }],
  });
  await writeFiles(job, [`rejected-${C}.json`]);

  const s = await run(now);
  assert.equal(s.kept, 1);
  assert.equal(s.jobsPurged, 0);
  assert.deepEqual(await filesOf(job), [`rejected-${C}.json`]);
  let j = await load(job._id);
  assert.equal(j.filesPurgedAt, null);
  assert.equal(j.inputPurgedAt.getTime(), now.getTime());
  assert.equal(j.resultPurgedAt.getTime(), now.getTime());

  // שעה אחר כך, בלי שינוי — לא נבדקת שוב
  const t1 = new Date(now.getTime() + HOUR);
  assert.equal((await run(t1)).scanned, 0);

  // סומנה כנבדקה (שלב 10) — נבדקת מיד ונמחקת
  await OcrJob.updateOne({ _id: job._id }, { $set: { 'resultConflicts.0.reviewedAt': t1 } });
  const t2 = new Date(now.getTime() + 2 * HOUR);
  const s2 = await run(t2);
  assert.equal(s2.scanned, 1);
  assert.equal(s2.rejectedDeleted, 1);
  assert.equal(await filesOf(job), null);
  j = await load(job._id);
  assert.equal(j.filesPurgedAt.getTime(), t2.getTime());
});

test('rejected של דחייה בקליטה: 10 ימים — נשמר, 31 יום — נמחק; לא רשום/תועה — לא נמחק לעולם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 25 * HOUR, {
    resultRejections: [
      { sha256: C, receivedAt: ago(now, 10 * DAY), reason: 'validation_failed' },
      { sha256: D, receivedAt: ago(now, 31 * DAY), reason: 'invalid_result' },
    ],
  });
  await writeFiles(job, [`rejected-${C}.json`, `rejected-${D}.json`]);
  await writeFiles(job, [`rejected-${E}.json`], { mtime: ago(now, 31 * DAY) });
  await writeFiles(job, [`result-${E}.json`], { mtime: ago(now, 2 * DAY) });

  const s = await run(now);
  assert.equal(s.rejectedDeleted, 1);
  assert.equal(s.kept, 3);
  assert.deepEqual(await filesOf(job), [`rejected-${C}.json`, `rejected-${E}.json`, `result-${E}.json`]);
  assert.equal((await load(job._id)).filesPurgedAt, null);

  // 21 יום אחר כך הדחייה בת 31 יום — נמחקת; הלא-רשומים (בני 52 ו-23 יום) — נשמרים
  const s2 = await run(new Date(now.getTime() + 21 * DAY));
  assert.equal(s2.scanned, 1);
  assert.deepEqual(await filesOf(job), [`rejected-${E}.json`, `result-${E}.json`]);
});

test('ביטול לפני 25 שעות בלי ack: הקלט (וגם יתום) נמחק; לפני 23 — נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const mk = async (agoMs) => {
    const _id = oid();
    const job = await OcrJob.create({
      _id,
      book: oid(),
      method: 'local',
      status: 'cancelled',
      decision: 'cancel',
      cancelRequested: true,
      active: false,
      workerId: 'worker-1',
      inputPath: `${_id}/input-${A}.pdf`,
      inputSha256: A,
      cancelledAt: ago(now, agoMs),
      finishedAt: ago(now, agoMs),
    });
    await writeFiles(job, [`input-${A}.pdf`, `input-${C}.pdf`]);
    return job;
  };
  const old = await mk(25 * HOUR);
  const fresh = await mk(23 * HOUR);
  const s = await run(now);
  assert.equal(s.scanned, 1);
  assert.equal(s.inputsDeleted, 2);
  assert.equal(await filesOf(old), null);
  assert.equal((await filesOf(fresh)).length, 2);
  const j = await load(old._id);
  assert.equal(j.inputPurgedAt.getTime(), now.getTime());
  assert.equal(j.resultPurgedAt, undefined);
  assert.equal(j.ack, null);
  assert.equal(j.status, 'cancelled');
});

test('הכנה נטושה (failed בלי inputPath) — קובץ קלט יתום נמחק אחרי החלון; קובץ חסר/תיקייה חסרה — לא שגיאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const orphan = await OcrJob.create({
    book: oid(),
    method: 'local',
    status: 'failed',
    errorCode: 'prep_abandoned',
    active: false,
    workerId: 'worker-1',
    finishedAt: ago(now, 25 * HOUR),
  });
  await writeFiles(orphan, [`input-${A}.pdf`, `input-${A}.pdf.tmp-0123456789abcdef`]);
  const gone = await makeAcked(now, 25 * HOUR);
  await fs.rm(dirOf(gone), { recursive: true });

  const s = await run(now);
  assert.equal(s.scanned, 2);
  assert.equal(s.errors, 0);
  // קובץ זמני טרי — לא נמחק (sweepTmpFiles רק מעל 24 שעות), ולכן התיקייה נשארת
  assert.deepEqual(await filesOf(orphan), [`input-${A}.pdf.tmp-0123456789abcdef`]);
  const oj = await load(orphan._id);
  assert.equal(oj.filesPurgedAt, null);
  assert.equal(oj.inputPurgedAt, undefined, 'אין inputPath — אין מה לסמן');
  const gj = await load(gone._id);
  assert.ok(gj.filesPurgedAt && gj.inputPurgedAt && gj.resultPurgedAt);
});

test('קבצים לא מוכרים, תיקייה פנימית וקישור — לא נוגעים; התיקייה לא נמחקת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 25 * HOUR);
  await writeFiles(job, ['notes.txt']);
  await fs.mkdir(path.join(dirOf(job), `input-${C}.pdf`));
  const outside = path.join(tmp, `outside-${String(job._id)}.json`);
  await fs.writeFile(outside, 'keep');
  let linked = false;
  try {
    await fs.symlink(outside, path.join(dirOf(job), `rejected-${D}.json`));
    linked = true;
  } catch {
    // Windows בלי הרשאת symlink — מדלגים על החלק הזה
  }
  await OcrJob.updateOne({ _id: job._id }, { $set: { resultRejections: [{ sha256: D, receivedAt: ago(now, 400 * DAY) }] } });

  const s = await run(now);
  assert.equal(s.inputsDeleted, 1);
  assert.equal(s.resultsDeleted, 1);
  const left = await filesOf(job);
  assert.ok(left.includes('notes.txt'));
  assert.ok(left.includes(`input-${C}.pdf`));
  if (linked) assert.ok(left.includes(`rejected-${D}.json`));
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
  assert.equal((await load(job._id)).filesPurgedAt, null);
});

test('תיקיית העבודה עצמה היא קישור (symlink/junction) לתיקייה מחוץ לשורש — לא מוחקים בה כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 25 * HOUR);
  const outsideDir = await fs.mkdtemp(path.join(tmp, 'outside-dir-'));
  const victims = [`input-${A}.pdf`, `result-${B}.json`];
  for (const name of victims) await fs.writeFile(path.join(outsideDir, name), 'keep');
  await fs.rm(dirOf(job), { recursive: true, force: true });
  try {
    await fs.symlink(outsideDir, dirOf(job), process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    return t.skip('אין אפשרות ליצור קישור לתיקייה בסביבה הזו');
  }

  const s = await run(now);
  assert.equal(s.inputsDeleted, 0);
  assert.equal(s.resultsDeleted, 0);
  assert.equal(s.errors, 1);
  assert.deepEqual((await fs.readdir(outsideDir)).sort(), victims.slice().sort());
  assert.ok((await fs.lstat(dirOf(job))).isSymbolicLink(), 'הקישור עצמו לא נמחק');
  const j = await load(job._id);
  assert.equal(j.filesPurgedAt ?? null, null);
  assert.equal(j.inputPurgedAt ?? null, null);
  assert.equal(j.resultPurgedAt ?? null, null);
});

test('תיקייה שנוצרה מחדש אחרי ניקוי: תוצאה מאוחרת לעבודה שבוטלה → ack=cancelled → נמחקת 24 שעות אחרי ה-ack', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const t0 = new Date(Date.now() - 3 * DAY);
  const _id = oid();
  const pageId = oid();
  await OcrJob.create({
    _id,
    book: oid(),
    method: 'local',
    status: 'queued',
    active: true,
    workerId: 'worker-1',
    requestId: `req-${_id}`,
    inputPath: `${_id}/input-${A}.pdf`,
    inputSha256: A,
    inputBytes: 10,
    pageMap: [{ pdfPageIndex: 1, page: pageId, pageNumber: 1, expectedUpdatedAt: t0, imageSha256: A }],
  });
  const job = { _id };
  await writeFiles(job, [`input-${A}.pdf`]);
  assert.deepEqual(await cancelLocalJob(_id, { now: t0 }), { ok: true });

  // 25 שעות אחרי הביטול — הקלט נמחק
  const t1 = new Date(t0.getTime() + 25 * HOUR);
  assert.equal((await run(t1)).inputsDeleted, 1);
  assert.equal(await filesOf(job), null);

  // התוצאה מגיעה (המחשב היה כבוי) — התיקייה נוצרת מחדש, ack=cancelled
  const doc = { schemaVersion: 1, jobId: String(_id), inputSha256: A, outcome: 'success', pipelineVersion: '1', pages: [{ pdfPageIndex: 1, text: 'x' }] };
  const buf = Buffer.from(JSON.stringify(doc));
  const t2 = new Date(t1.getTime() + HOUR);
  const r = await intakeResult({ job: await load(_id), claimedSha: sha256(buf), body: Readable.from([buf]), now: t2, env });
  assert.equal(r.body.ack, 'cancelled');
  assert.deepEqual(await filesOf(job), [`result-${sha256(buf)}.json`]);

  // 23 שעות אחרי ה-ack — נשמר; 25 — נמחק, והעבודה מסומנת שוב כנוקתה
  assert.equal((await run(new Date(t2.getTime() + 23 * HOUR))).scanned, 0);
  assert.deepEqual(await filesOf(job), [`result-${sha256(buf)}.json`]);
  const t3 = new Date(t2.getTime() + 25 * HOUR);
  const s = await run(t3);
  assert.equal(s.resultsDeleted, 1);
  assert.equal(await filesOf(job), null);
  const j = await load(_id);
  assert.equal(j.filesPurgedAt.getTime(), t3.getTime());
  assert.equal(j.resultPurgedAt.getTime(), t3.getTime());
  assert.equal(j.ack.ack, 'cancelled');

  // ושליחה חוזרת אחרי הניקוי — עדיין cancelled (לא תלוי בקבצים)
  const again = await intakeResult({ job: await load(_id), claimedSha: sha256(buf), body: Readable.from([buf]), env });
  assert.equal(again.body.ack, 'cancelled');
});

test('תוצאה מתנגשת שהגיעה אחרי ניקוי (תיקייה נוצרה מחדש עם rejected) — נבדקת שוב ונשמרת עד בדיקה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 25 * HOUR);
  assert.equal((await run(now)).jobsPurged, 1);
  const t1 = new Date(now.getTime() + HOUR);
  await OcrJob.updateOne({ _id: job._id }, { $push: { resultConflicts: { sha256: C, receivedAt: t1, bytes: 1, path: 'x' } } });
  await writeFiles(job, [`rejected-${C}.json`]);
  const s = await run(new Date(now.getTime() + 2 * HOUR));
  assert.equal(s.scanned, 1);
  assert.equal(s.kept, 1);
  assert.deepEqual(await filesOf(job), [`rejected-${C}.json`]);
  assert.equal((await load(job._id)).filesPurgedAt, null);
});

test('שורש האחסון חסר — לא מוחקים ולא מסמנים כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const job = await makeAcked(now, 25 * HOUR);
  const s = await purgeLocalJobFiles({ now, env: { OCR_LOCAL_STORAGE_DIR: path.join(tmp, 'missing-root') } });
  assert.equal(s.storageMissing, true);
  assert.equal(s.scanned, 0);
  const j = await load(job._id);
  assert.equal(j.filesCheckedAt, undefined);
  assert.equal(j.filesPurgedAt, undefined);
});

test('חסום בכמות ובזמן: limit ו-maxMs — השאר בהרצה הבאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const jobs = [];
  for (let i = 0; i < 3; i++) jobs.push(await makeAcked(now, 25 * HOUR));
  const s1 = await run(now, { limit: 2 });
  assert.equal(s1.scanned, 2);
  assert.equal(s1.truncated, true);
  // שעון שקופץ — אחרי העבודה הראשונה נגמר הזמן
  let tick = 0;
  const s2 = await run(now, { maxMs: 10, clock: () => (tick++ === 0 ? 0 : 1000) });
  assert.equal(s2.scanned, 0);
  assert.equal(s2.truncated, true);
  const s3 = await run(now);
  assert.equal(s3.scanned, 1);
  assert.equal(s3.truncated, false);
  for (const j of jobs) assert.equal(await filesOf(j), null);
});

test('runLocalOcrCleanup: משלים קליטה תקועה (ביטול בלי ack) לפני הניקוי, ולא מוחק את התוצאה הטרייה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const _id = oid();
  await OcrJob.create({
    _id,
    book: oid(),
    method: 'local',
    status: 'cancelled',
    decision: 'cancel',
    active: false,
    workerId: 'worker-1',
    inputSha256: A,
    resultSha256: B,
    resultPath: `${_id}/result-${B}.json`,
    resultReceivedAt: ago(now, 2 * HOUR),
    finishedAt: ago(now, 3 * DAY),
    cancelledAt: ago(now, 3 * DAY),
  });
  await writeFiles({ _id }, [`result-${B}.json`]);
  const r = await runLocalOcrCleanup({ now, env });
  assert.equal(r.resumed.count, 1);
  assert.equal(r.resumed.results[0].code, 'cancelled');
  assert.equal(r.purge.scanned, 0);
  assert.deepEqual(await filesOf({ _id }), [`result-${B}.json`]);
  const j = await load(_id);
  assert.deepEqual(j.ack, ackOf({ _id }, B, 'cancelled', 'cancelled'));
});
