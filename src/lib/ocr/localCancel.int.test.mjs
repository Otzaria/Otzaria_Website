/**
 * בדיקות אינטגרציה לביטול עבודות OCR (localCancel.js) מול MongoDB אמיתי (standalone).
 * מכסה: סגירה מיידית של local ושחרור הספר, נעילת החלטה מול החלה (apply_started),
 * ביטול כפול, ביטול בהכנה, שמירת מה שנדרש ל-ack=cancelled מאוחר, ו-gemini/ocrwin כמו היום.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OcrJob from '../../models/OcrJob.js';
import {
  cancelLocalJob,
  cancelActiveOcrForBook,
  cancelActiveOcrForBooks,
  cancelLateOcrJobsQuiet,
  requestServerJobCancel,
  OcrApplyInProgressError,
  isOcrApplyInProgress,
} from './localCancel.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
});

const oid = () => new mongoose.Types.ObjectId();
const SHA = 'a'.repeat(64);

function localJob(book, extra = {}) {
  return OcrJob.create({
    book,
    method: 'local',
    status: 'queued',
    active: true,
    workerId: 'worker-1',
    requestId: `req-${new mongoose.Types.ObjectId()}`,
    inputPath: 'x/input.pdf',
    inputSha256: SHA,
    inputBytes: 1234,
    preparedAt: new Date(),
    totalPages: 2,
    pageMap: [
      { pdfPageIndex: 1, page: oid(), pageNumber: 1, expectedUpdatedAt: new Date(), imageSha256: SHA },
      { pdfPageIndex: 2, page: oid(), pageNumber: 2, expectedUpdatedAt: new Date(), imageSha256: SHA },
    ],
    ...extra,
  });
}

const raw = (id) => OcrJob.collection.findOne({ _id: id });

test('ביטול queued → cancelled, active:false, מתועד; הספר משתחרר לעבודה חדשה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  const job = await localJob(book);
  const now = new Date('2026-10-20T10:00:00Z');

  const r = await cancelLocalJob(job._id, { reason: 'admin', byName: 'מנהל ספרים', now });
  assert.deepEqual(r, { ok: true });

  const after = await raw(job._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.active, false);
  assert.equal(after.decision, 'cancel');
  assert.equal(after.cancelRequested, true);
  assert.equal(after.cancelReason, 'admin');
  assert.equal(after.cancelledByName, 'מנהל ספרים');
  assert.equal(after.cancelledAt.getTime(), now.getTime());
  assert.equal(after.finishedAt.getTime(), now.getTime());
  assert.equal(after.prepLeaseUntil, null);
  // נשמר כל מה שקליטת תוצאה מאוחרת צריכה כדי לאמת ולהחזיר ack=cancelled (שלב 8)
  assert.equal(after.inputSha256, SHA);
  assert.equal(after.workerId, 'worker-1');
  assert.equal(after.pageMap.length, 2);
  assert.equal(after.ack ?? null, null);
  assert.equal(after.resultSha256 ?? null, null);

  // book_active_unique לא חוסם יותר — עבודה פעילה חדשה לאותו ספר נוצרת
  const next = await localJob(book);
  assert.equal(next.active, true);
});

test('ביטול אחרי decision=apply → apply_started ושום דבר לא משתנה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const job = await localJob(oid(), {
    status: 'applying',
    decision: 'apply',
    resultSha256: 'b'.repeat(64),
    applyStartedAt: new Date(),
  });
  const before = await raw(job._id);

  const r = await cancelLocalJob(job._id, { reason: 'admin', byName: 'x' });
  assert.deepEqual(r, { ok: false, code: 'apply_started' });
  assert.deepEqual(await raw(job._id), before);
});

test('ביטול כפול → not_active, והתיעוד של הביטול הראשון נשמר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const job = await localJob(oid());
  const first = new Date('2026-10-20T10:00:00Z');
  assert.equal((await cancelLocalJob(job._id, { reason: 'admin', byName: 'א', now: first })).ok, true);
  const r = await cancelLocalJob(job._id, { reason: 'book_deleted', byName: 'ב' });
  assert.deepEqual(r, { ok: false, code: 'not_active' });
  const after = await raw(job._id);
  assert.equal(after.cancelReason, 'admin');
  assert.equal(after.cancelledByName, 'א');
  assert.equal(after.cancelledAt.getTime(), first.getTime());
});

test('ביטול גובר: אחרי ביטול, נעילת ההחלה המותנית (decision:null) לא תופסת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const sha = 'c'.repeat(64);
  // התוצאה כבר ננעלה (שלב 8 סעיף 2) אבל ההחלטה עוד פתוחה — הביטול עדיין תופס
  const job = await localJob(oid(), { status: 'delivery_pending', resultSha256: sha });
  assert.equal((await cancelLocalJob(job._id, { reason: 'admin' })).ok, true);
  const lock = await OcrJob.updateOne(
    { _id: job._id, decision: null, resultSha256: sha },
    { $set: { decision: 'apply', status: 'applying', applyStartedAt: new Date() } }
  );
  assert.equal(lock.matchedCount, 0);
  const after = await raw(job._id);
  assert.equal(after.decision, 'cancel');
  assert.equal(after.status, 'cancelled');
});

test('ביטול בהכנה (preparing) → המעבר המותנה של היוצר ל-queued כבר לא תופס', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const job = await localJob(oid(), {
    status: 'preparing',
    preparedAt: undefined,
    inputPath: undefined,
    inputSha256: undefined,
    pageMap: undefined,
    prepLeaseUntil: new Date(Date.now() + 60_000),
  });
  assert.equal((await cancelLocalJob(job._id, { reason: 'admin' })).ok, true);
  const after = await raw(job._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.prepLeaseUntil, null);
  // אותו פילטר כמו ב-localJobCreate.prepare
  const committed = await OcrJob.findOneAndUpdate(
    { _id: job._id, status: 'preparing', active: true },
    { $set: { status: 'queued', inputPath: 'y/input.pdf' } },
    { returnDocument: 'after', lean: true }
  );
  assert.equal(committed, null);
  assert.equal((await raw(job._id)).status, 'cancelled');
});

test('cancelLocalJob לא נוגע בעבודות שאינן local ובעבודות סגורות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const ocrwin = await OcrJob.create({ book: oid(), method: 'ocrwin', status: 'running', active: true });
  const done = await localJob(oid(), { status: 'completed', active: false });
  const failed = await localJob(oid(), { status: 'failed', active: false });
  for (const j of [ocrwin, done, failed]) {
    const before = await raw(j._id);
    assert.deepEqual(await cancelLocalJob(j._id, { reason: 'admin' }), { ok: false, code: 'not_active' });
    assert.deepEqual(await raw(j._id), before);
  }
  assert.deepEqual(await cancelLocalJob(oid(), { reason: 'admin' }), { ok: false, code: 'not_active' });
});

test('gemini/ocrwin: רק cancelRequested (runOcrJob סוגר), כולל רשומה ישנה בלי active', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date('2026-10-20T11:00:00Z');
  const gemini = await OcrJob.create({ book: oid(), method: 'gemini', status: 'running', active: true });
  const legacyId = oid();
  await OcrJob.collection.insertOne({ _id: legacyId, book: oid(), method: 'ocrwin', status: 'running', createdAt: new Date() });

  for (const id of [gemini._id, legacyId]) {
    const doc = await raw(id);
    const res = await cancelActiveOcrForBook(doc.book, { reason: 'book_deleted', byName: 'מנהל', now });
    assert.deepEqual(res.cancelled, [{ jobId: String(id), method: doc.method }]);
    const after = await raw(id);
    assert.equal(after.cancelRequested, true);
    assert.equal(after.status, 'running'); // ההתנהגות הקיימת — לא נסגר כאן
    assert.equal(after.active, doc.active);
    assert.equal(after.decision ?? null, null);
    assert.equal(after.cancelReason, 'book_deleted');
    assert.equal(after.cancelledByName, 'מנהל');
    assert.equal(after.cancelledAt.getTime(), now.getTime());
  }
  // עבודת gemini שכבר הסתיימה — לא נוגעים
  const finished = await OcrJob.create({ book: oid(), method: 'gemini', status: 'completed', active: false });
  assert.deepEqual(await requestServerJobCancel(finished._id, { reason: 'admin' }), { ok: false });
});

test('cancelActiveOcrForBook: local פעיל נסגר עם cancelReason=book_deleted; ספר בלי עבודה → ריק', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  const old = await localJob(book, { status: 'completed', active: false });
  const job = await localJob(book, { status: 'needs_attention' });
  const res = await cancelActiveOcrForBook(book, { reason: 'book_deleted', byName: 'מנהל' });
  assert.deepEqual(res.cancelled, [{ jobId: String(job._id), method: 'local' }]);
  const after = await raw(job._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.cancelReason, 'book_deleted');
  assert.equal((await raw(old._id)).status, 'completed');
  assert.deepEqual(await cancelActiveOcrForBook(oid(), { reason: 'book_deleted' }), { cancelled: [] });
  // היסטוריה נשמרת — לא נמחקה אף רשומה
  assert.equal(await OcrJob.countDocuments({ book }), 2);
});

test('מיזוג: החלה בעיצומה באחד הספרים → OcrApplyInProgressError לפני שבוטל דבר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const [b1, b2] = [oid(), oid()];
  const free = await localJob(b1);
  const applying = await localJob(b2, { status: 'applying', decision: 'apply', resultSha256: SHA });
  const before = await raw(free._id);

  await assert.rejects(
    cancelActiveOcrForBooks([b1, b2], { reason: 'book_merged', byName: 'x' }),
    (err) => err instanceof OcrApplyInProgressError && isOcrApplyInProgress(err) && err.jobId === String(applying._id)
  );
  assert.deepEqual(await raw(free._id), before);

  // הסבב השקט שאחרי המחיקה לא זורק
  assert.deepEqual(await cancelLateOcrJobsQuiet([b2], { reason: 'book_merged' }), { cancelled: [] });
});

test('סיבה לא חוקית נדחית לפני כל כתיבה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const job = await localJob(oid());
  await assert.rejects(cancelLocalJob(job._id, { reason: 'whatever' }), TypeError);
  await assert.rejects(cancelActiveOcrForBook(job.book, { reason: 'whatever' }), TypeError);
  assert.equal((await raw(job._id)).status, 'queued');
});
