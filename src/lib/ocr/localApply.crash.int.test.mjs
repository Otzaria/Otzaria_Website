/**
 * בדיקות QA (שלב 8) לקליטת תוצאה: קריסה בכל גבול של סדר הקליטה (מפרט סעיף 4 א–ג) ומרוצים
 * (שתי תוצאות, תוצאה מול ביטול, תוצאה מול resumeStalledApplies, דיווח מצב באמצע ההחלה).
 * הקריסות מדומות כמצב ה-DB/דיסק שקריסת תהליך הייתה משאירה בדיוק באותה נקודה, ואחריהן שליחה
 * חוזרת (ו/או resumeStalledApplies) חייבת לסיים נכון: בלי כתיבה כפולה לעמוד, בלי מונים כפולים,
 * בלי דריסת עריכה אנושית, ועם ack תקין.
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
import Page from '../../models/Page.js';
import OcrConflict from '../../models/OcrConflict.js';
import { intakeResult } from './localResultIntake.js';
import { APPLY_LEASE_MS, resumeStalledApplies } from './localApply.js';
import { isValidAck } from './localApply.pure.js';
import { cancelLocalJob } from './localCancel.js';
import { statusUpdateFilter, statusUpdateSet } from './localStatusReport.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
let root;
let env;
before(async () => {
  db = await startMongo();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-apply-crash-'));
  env = { OCR_LOCAL_STORAGE_DIR: root };
});
after(async () => {
  if (!db.skip) await db.stop();
  await fs.rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
});

const oid = () => new mongoose.Types.ObjectId();
const A = 'a'.repeat(64);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bytesOf = (doc) => Buffer.from(JSON.stringify(doc), 'utf8');

// n עמודים; עמוד 2 ייערך ע"י אדם (התנגשות), עמוד 3 ייכשל בתוצאה, עמוד 4 יימחק (missing)
async function makeJob({ n = 8, mode = 'skip' } = {}) {
  const book = oid();
  const pages = [];
  for (let i = 1; i <= n; i++) {
    pages.push(await Page.create({ book, pageNumber: i, imagePath: `/uploads/books/x/page.${i}.jpg`, content: '' }));
  }
  const job = await OcrJob.create({
    book,
    method: 'local',
    status: 'delivery_pending',
    active: true,
    workerId: 'worker-1',
    requestId: `req-${oid()}`,
    existingTextMode: mode,
    inputPath: 'x/input.pdf',
    inputSha256: A,
    inputBytes: 1234,
    totalPages: n,
    reportSeq: 5,
    pageMap: pages.map((p, i) => ({
      pdfPageIndex: i + 1,
      page: p._id,
      pageNumber: p.pageNumber,
      expectedUpdatedAt: p.updatedAt,
      imageSha256: A,
    })),
  });
  await fs.mkdir(path.join(root, String(job._id)), { recursive: true });
  return { job, pages, book };
}

// עריכה אנושית בעמוד 2 ומחיקת עמוד 4 — אחרי יצירת העבודה
async function humanChanges(pages) {
  await sleep(5);
  await Page.updateOne({ _id: pages[1]._id }, { $set: { content: 'עריכה אנושית' } });
  await Page.deleteOne({ _id: pages[3]._id });
}

const partialDoc = (job, tag = '') => ({
  schemaVersion: 1,
  jobId: String(job._id),
  inputSha256: A,
  outcome: 'partial',
  pipelineVersion: `0.1.0${tag}`,
  pages: job.pageMap.map((e) =>
    e.pdfPageIndex === 3
      ? { pdfPageIndex: 3, text: '', error: { code: 'layout_failed', message: 'layout failed' } }
      : { pdfPageIndex: e.pdfPageIndex, text: `טקסט${tag} ${e.pdfPageIndex}` }
  ),
});

async function send(jobId, doc, { now, hooks, sha } = {}) {
  const buf = Buffer.isBuffer(doc) ? doc : bytesOf(doc);
  const job = await OcrJob.findById(jobId).lean();
  return intakeResult({ job, claimedSha: sha ?? sha256(buf), body: Readable.from([buf]), now: now ?? new Date(), env, hooks });
}

const load = (id) => OcrJob.findById(id).lean();
const snap = (pages) => Promise.all(pages.map((p) => Page.findById(p._id).lean()));

function expectAck(r, ack, job, sha, outcome) {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ack, jobId: String(job._id), resultSha256: sha, outcome });
  assert.equal(isValidAck(r.body), true);
}

// המצב הסופי הנכון אחרי קליטת partialDoc עם humanChanges — זהה בכל מסלול קריסה
async function expectFinal(job, pages, sha, { tag = '' } = {}) {
  const j = await load(job._id);
  assert.equal(j.status, 'completed');
  assert.equal(j.active, false);
  assert.equal(j.applyLeaseUntil, null);
  assert.deepEqual(j.ack, { ack: 'accepted', jobId: String(job._id), resultSha256: sha, outcome: 'partial' });
  const n = pages.length;
  assert.equal(j.successPages, n - 3);
  assert.equal(j.failedPages, 1);
  assert.equal(j.conflictPages, 1);
  assert.equal(j.missingPages, 1);
  assert.equal(j.processedPages, n);
  assert.deepEqual(
    j.pageErrors.map((e) => e.pageNumber),
    [3, 4]
  );
  const ps = await snap(pages);
  assert.equal(ps[3], null);
  assert.equal(ps[1].content, 'עריכה אנושית'); // לא נדרס
  assert.equal(ps[1].lastOcrJobId, undefined);
  assert.equal(ps[2].content, ''); // עמוד שנכשל — לא נכתב
  assert.equal(ps[2].lastOcrJobId, undefined);
  for (const i of [0, ...Array.from({ length: n - 4 }, (_, k) => k + 4)]) {
    assert.equal(ps[i].content, `טקסט${tag} ${i + 1}`);
    assert.equal(String(ps[i].lastOcrJobId), String(job._id));
    assert.equal(ps[i].lastOcrResultSha256, sha);
  }
  const conflicts = await OcrConflict.find({ job: job._id }).lean();
  assert.equal(conflicts.length, 1);
  assert.equal(String(conflicts[0].page), String(pages[1]._id));
  assert.equal(conflicts[0].ocrText, `טקסט${tag} 2`);
  return { j, ps };
}

// כל עמוד שכבר נכתב ע"י העבודה לפני הקריסה — לא נכתב שוב (updatedAt לא זז)
function expectNoRewrite(before, after) {
  before.forEach((p, i) => {
    if (p && p.lastOcrJobId) assert.equal(after[i].updatedAt.getTime(), p.updatedAt.getTime(), `page ${i + 1} rewritten`);
  });
}

test('קריסה אחרי שמירת הקובץ (לפני נעילת hash) → שליחה חוזרת: הקובץ נשמר פעם אחת, accepted', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJob();
  await humanChanges(pages);
  const doc = partialDoc(job);
  const buf = bytesOf(doc);
  const sha = sha256(buf);
  await fs.writeFile(path.join(root, String(job._id), `result-${sha}.json`), buf); // מצב הדיסק אחרי הקריסה
  expectAck(await send(job._id, doc), 'accepted', job, sha, 'partial');
  await expectFinal(job, pages, sha);
  assert.deepEqual(await fs.readdir(path.join(root, String(job._id))), [`result-${sha}.json`]);
});

test('קריסה אחרי נעילת resultSha256 (לפני נעילת החלטה): שליחה חוזרת / resumeStalledApplies מסיימים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const via of ['resend', 'resume']) {
    const { job, pages } = await makeJob();
    await humanChanges(pages);
    const doc = partialDoc(job);
    const buf = bytesOf(doc);
    const sha = sha256(buf);
    const t0 = new Date(Date.now() - APPLY_LEASE_MS - 60000);
    await fs.writeFile(path.join(root, String(job._id), `result-${sha}.json`), buf);
    await OcrJob.updateOne(
      { _id: job._id },
      { $set: { resultSha256: sha, resultOutcome: 'partial', resultPath: `${job._id}/result-${sha}.json`, resultBytes: buf.length, resultReceivedAt: t0, pipelineVersion: '0.1.0' } }
    );
    // דיווח מצב בחלון הזה (לפני נעילת ההחלטה) מותר ולא מפריע לנעילה
    const rep = await OcrJob.updateOne(statusUpdateFilter(job._id, 'worker-1', 6), {
      $set: statusUpdateSet({ state: 'needs_attention', reportSeq: 6, attempt: 1, phase: null, pagesDone: 8, pagesTotal: 8, message: 'x: y' }, new Date()),
    });
    assert.equal(rep.matchedCount, 1);
    if (via === 'resend') {
      expectAck(await send(job._id, doc), 'accepted', job, sha, 'partial');
    } else {
      assert.deepEqual(await resumeStalledApplies({ env }), [{ jobId: String(job._id), ok: true, code: 'applied' }]);
      expectAck(await send(job._id, doc), 'already_received', job, sha, 'partial');
    }
    await expectFinal(job, pages, sha);
  }
});

test('קריסה אחרי נעילת ההחלטה (applying, בלי lease): שליחה חוזרת מסיימת; ביטול נדחה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJob();
  await humanChanges(pages);
  const doc = partialDoc(job);
  const buf = bytesOf(doc);
  const sha = sha256(buf);
  await fs.writeFile(path.join(root, String(job._id), `result-${sha}.json`), buf);
  await OcrJob.updateOne(
    { _id: job._id },
    { $set: { resultSha256: sha, resultOutcome: 'partial', resultPath: `${job._id}/result-${sha}.json`, resultReceivedAt: new Date(), decision: 'apply', status: 'applying', applyStartedAt: new Date() } }
  );
  assert.deepEqual(await cancelLocalJob(job._id, { reason: 'admin' }), { ok: false, code: 'apply_started' });
  // דיווח מצב אחרי נעילת ההחלטה — לא משנה כלום
  const rep = await OcrJob.updateOne(statusUpdateFilter(job._id, 'worker-1', 7), {
    $set: statusUpdateSet({ state: 'running', reportSeq: 7, attempt: 1, phase: null, pagesDone: 1, pagesTotal: 8, message: null }, new Date()),
  });
  assert.equal(rep.matchedCount, 0);
  expectAck(await send(job._id, doc), 'accepted', job, sha, 'partial');
  await expectFinal(job, pages, sha);
});

test('קריסת תהליך באמצע ההחלה (lease נשאר): 503 עד פקיעה, ואז שליחה חוזרת/resume — בלי כתיבה כפולה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const via of ['resend', 'resume']) {
    for (const k of [1, 3, 5]) {
      const { job, pages } = await makeJob();
      await humanChanges(pages);
      const doc = partialDoc(job);
      const sha = sha256(bytesOf(doc));
      const t0 = new Date();
      let w = 0;
      await assert.rejects(send(job._id, doc, { now: t0, hooks: { afterPageWrite: () => { if (++w === k) throw new Error('crash'); } } }));
      // קריסת תהליך אמיתית לא מגיעה ל-catch שמשחרר את ה-lease
      await OcrJob.updateOne({ _id: job._id }, { $set: { applyLeaseUntil: new Date(t0.getTime() + APPLY_LEASE_MS) } });
      const before = await snap(pages);
      const busy = await send(job._id, doc, { now: new Date(t0.getTime() + 1000) });
      assert.equal(busy.status, 503);
      assert.deepEqual(await resumeStalledApplies({ now: new Date(t0.getTime() + 1000), env }), []);
      const later = new Date(t0.getTime() + APPLY_LEASE_MS + 60000);
      let rewrites = 0;
      if (via === 'resend') {
        expectAck(await send(job._id, doc, { now: later, hooks: { afterPageWrite: () => rewrites++ } }), 'accepted', job, sha, 'partial');
      } else {
        assert.deepEqual(await resumeStalledApplies({ now: later, env }), [{ jobId: String(job._id), ok: true, code: 'applied' }]);
        expectAck(await send(job._id, doc), 'already_received', job, sha, 'partial');
      }
      const { ps } = await expectFinal(job, pages, sha);
      expectNoRewrite(before, ps);
      if (via === 'resend') {
        const writtenBefore = before.filter((p) => p && p.lastOcrJobId).length;
        assert.equal(rewrites, pages.length - 3 - writtenBefore);
      }
    }
  }
});

test('קריסה אחרי החלת כל העמודים ולפני הסגירה (ack לא נשמר) → שליחה חוזרת: אותם מונים, בלי כתיבה, בלי התנגשות כפולה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJob();
  await humanChanges(pages);
  const doc = partialDoc(job);
  const sha = sha256(bytesOf(doc));
  expectAck(await send(job._id, doc), 'accepted', job, sha, 'partial');
  const { j: closed, ps: before } = await expectFinal(job, pages, sha);
  // המצב שקריסה רגע לפני עדכון הסגירה הייתה משאירה: העמודים הוחלו, העבודה עדיין applying
  await OcrJob.updateOne(
    { _id: job._id },
    {
      $set: { status: 'applying', active: true, ack: null, ackAt: null, finishedAt: null, successPages: 0, failedPages: 0, conflictPages: 0, missingPages: 0, pageErrors: [] },
    }
  );
  await sleep(5);
  let rewrites = 0;
  expectAck(await send(job._id, doc, { hooks: { afterPageWrite: () => rewrites++ } }), 'accepted', job, sha, 'partial');
  assert.equal(rewrites, 0);
  const { j, ps } = await expectFinal(job, pages, sha);
  expectNoRewrite(before, ps);
  const strip = (a) => a.map(({ pageNumber, message }) => ({ pageNumber, message }));
  assert.deepEqual(strip(j.pageErrors), strip(closed.pageErrors));
  // ושליחה נוספת → already_received
  expectAck(await send(job._id, doc), 'already_received', job, sha, 'partial');
});

test('מרוץ: שתי תוצאות שונות במקביל — בדיוק אחת ננעלת, השנייה 409; העמודים רק מהמנצחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (let i = 0; i < 5; i++) {
    const { job, pages } = await makeJob({ n: 6 });
    const d1 = partialDoc(job, 'A');
    const d2 = partialDoc(job, 'B');
    const [r1, r2] = await Promise.all([send(job._id, d1), send(job._id, d2)]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const winner = r1.status === 200 ? 'A' : 'B';
    const sha = sha256(bytesOf(winner === 'A' ? d1 : d2));
    const j = await load(job._id);
    assert.equal(j.resultSha256, sha);
    assert.equal(j.resultConflicts.length, 1);
    for (const p of await snap(pages)) {
      if (p.pageNumber === 3) continue;
      assert.equal(p.content, `טקסט${winner} ${p.pageNumber}`);
    }
  }
});

test('מרוץ: תוצאה מול ביטול — בדיוק אחד מנצח; בביטול שום טקסט לא הוחל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const { job, pages } = await makeJob({ n: 6 });
    const doc = partialDoc(job);
    const sha = sha256(bytesOf(doc));
    const delay = [0, 2, 5, 10, 20, 40, 80, 150][i % 8];
    const [r, c] = await Promise.all([
      send(job._id, doc),
      (async () => {
        await sleep(delay);
        return cancelLocalJob(job._id, { reason: 'admin' });
      })(),
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const j = await load(job._id);
    const ps = await snap(pages);
    if (c.ok) {
      seen.add('cancel');
      expectAck(r, 'cancelled', job, sha, 'cancelled');
      assert.equal(j.status, 'cancelled');
      assert.equal(j.decision, 'cancel');
      for (const p of ps) {
        assert.equal(p.content, '');
        assert.equal(p.lastOcrJobId, undefined);
      }
    } else {
      seen.add('apply');
      expectAck(r, 'accepted', job, sha, 'partial');
      assert.ok(['apply_started', 'not_active'].includes(c.code), c.code);
      assert.equal(j.status, 'completed');
      assert.equal(j.decision, 'apply');
    }
    assert.equal(j.active, false);
  }
  assert.ok(seen.size >= 1);
});

test('מרוץ: שליחה חוזרת מול resumeStalledApplies על עבודה תקועה — כל עמוד נכתב פעם אחת, ack אחד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (let i = 0; i < 5; i++) {
    const { job, pages } = await makeJob({ n: 20 });
    await humanChanges(pages);
    const doc = partialDoc(job);
    const buf = bytesOf(doc);
    const sha = sha256(buf);
    const t0 = new Date(Date.now() - APPLY_LEASE_MS - 60000);
    await fs.writeFile(path.join(root, String(job._id), `result-${sha}.json`), buf);
    await OcrJob.updateOne(
      { _id: job._id },
      { $set: { resultSha256: sha, resultOutcome: 'partial', resultPath: `${job._id}/result-${sha}.json`, resultReceivedAt: t0 } }
    );
    let writes = 0;
    const hooks = { afterPageWrite: () => writes++ };
    const [r, rs] = await Promise.all([send(job._id, doc, { hooks }), resumeStalledApplies({ env })]);
    if (r.status === 503) expectAck(await send(job._id, doc), 'already_received', job, sha, 'partial');
    else assert.ok(['accepted', 'already_received'].includes(r.body.ack), JSON.stringify(r.body));
    assert.ok(rs.length <= 1);
    // ה-hook נספר רק במסלול השליחה; resume כותב בלי hook — לכן בודקים לפי DB
    assert.ok(writes <= 20 - 3);
    await expectFinal(job, pages, sha);
  }
});

test('ביטול בדיוק בחלון שבין נעילת ה-hash לנעילת ההחלטה → ack=cancelled, שום טקסט לא הוחל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJob({ n: 4 });
  const doc = partialDoc(job);
  const sha = sha256(bytesOf(doc));
  const original = OcrJob.updateOne;
  let cancelled = null;
  OcrJob.updateOne = function patched(filter, ...rest) {
    if (cancelled === null && filter?.decision === null && filter?.resultSha256 === sha) {
      return (async () => {
        cancelled = await cancelLocalJob(job._id, { reason: 'admin' });
        return original.call(this, filter, ...rest);
      })();
    }
    return original.call(this, filter, ...rest);
  };
  try {
    expectAck(await send(job._id, doc), 'cancelled', job, sha, 'cancelled');
  } finally {
    OcrJob.updateOne = original;
  }
  assert.deepEqual(cancelled, { ok: true });
  const j = await load(job._id);
  assert.equal(j.status, 'cancelled');
  assert.equal(j.decision, 'cancel');
  assert.equal(j.resultSha256, sha);
  for (const p of await snap(pages)) assert.equal(p.lastOcrJobId, undefined);
  expectAck(await send(job._id, doc), 'cancelled', job, sha, 'cancelled');
});
