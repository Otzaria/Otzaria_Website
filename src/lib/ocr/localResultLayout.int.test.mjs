/**
 * בדיקות אינטגרציה לנתוני פריסה/עזר בקליטת תוצאה מהעובד המקומי (localResultIntake.js +
 * localApply.js → OcrPageResult) מול MongoDB אמיתי, עם הפיקסצ'ר המשותף של החוזה
 * (fixtures/localResultLayout.result.json) ועבודה שנבנית מהמעטפה שלו (.envelope.json).
 * מכסה: שמירה מלאה של layout/metadata/אזהרות, תוצאה בפורמט הישן, layout פגום/גדול שנפסל רק
 * בעמוד שלו, התנגשות ואימוץ (→ current בנתיב הקריאה), ביטול עם עמודים (job_cancelled), קריסה בין
 * הרשומה לעמוד, resumeStalledApply לעבודה מבוטלת, ו-partial עם error עליון.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import OcrJob from '../../models/OcrJob.js';
import Page from '../../models/Page.js';
import OcrConflict from '../../models/OcrConflict.js';
import OcrPageResult from '../../models/OcrPageResult.js';
import { intakeResult } from './localResultIntake.js';
import { APPLY_LEASE_MS, resumeStalledApply } from './localApply.js';
import { cancelLocalJob } from './localCancel.js';
import { resolveConflict } from './ocrConflictResolve.js';
import { loadOcrPageData } from './ocrPageData.js';
import { startMongo } from '../corrections/testing/mongo.js';

const FIXTURE_BYTES = readFileSync(new URL('./fixtures/localResultLayout.result.json', import.meta.url));
const FIXTURE = JSON.parse(FIXTURE_BYTES.toString('utf8'));
const ENVELOPE = JSON.parse(readFileSync(new URL('./fixtures/localResultLayout.envelope.json', import.meta.url), 'utf8'));

let db;
let root;
let env;
before(async () => {
  db = await startMongo();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-layout-'));
  env = { OCR_LOCAL_STORAGE_DIR: root };
});
after(async () => {
  if (!db.skip) await db.stop();
  await fs.rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  if (!db.skip) await db.reset();
  if (root) await fs.rm(path.join(root, ENVELOPE.jobId), { recursive: true, force: true });
});

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noImage = async () => null;

// העבודה מהמעטפה: אותו jobId, inputSha256, pageMap (pageId/pageNumber/imageSha256); העמודים נוצרים
// עם ה-_id מה-pageMap, ו-expectedUpdatedAt הוא updatedAt שלהם בפועל
async function makeJobFromEnvelope({ mode = 'skip' } = {}) {
  const book = new mongoose.Types.ObjectId();
  const pages = [];
  for (const e of ENVELOPE.pageMap) {
    pages.push(await Page.create({
      _id: e.pageId, book, pageNumber: e.pageNumber, imagePath: `/uploads/books/x/page.${e.pageNumber}.jpg`, content: '',
    }));
  }
  const job = await OcrJob.create({
    _id: ENVELOPE.jobId,
    book,
    method: 'local',
    status: 'delivery_pending',
    active: true,
    workerId: ENVELOPE.workerId,
    requestId: `req-${new mongoose.Types.ObjectId()}`,
    existingTextMode: mode,
    inputPath: 'x/input.pdf',
    inputSha256: ENVELOPE.inputSha256,
    inputBytes: 1234,
    totalPages: ENVELOPE.pageMap.length,
    options: ENVELOPE.options,
    pageMap: ENVELOPE.pageMap.map((e, i) => ({
      pdfPageIndex: e.pdfPageIndex,
      page: e.pageId,
      pageNumber: e.pageNumber,
      expectedUpdatedAt: pages[i].updatedAt,
      imageSha256: e.imageSha256,
    })),
  });
  await fs.mkdir(path.join(root, String(job._id)), { recursive: true });
  return { job, pages, book };
}

async function send(jobId, docOrBytes, { now, hooks } = {}) {
  const buf = Buffer.isBuffer(docOrBytes) ? docOrBytes : Buffer.from(JSON.stringify(docOrBytes), 'utf8');
  const job = await OcrJob.findById(jobId).lean();
  return intakeResult({ job, claimedSha: sha256(buf), body: Readable.from([buf]), now: now ?? new Date(), env, hooks });
}

const load = (id) => OcrJob.findById(id).lean();
const pagesOf = (pages) => Promise.all(pages.map((p) => Page.findById(p._id).lean()));
const recordsOf = (job) => OcrPageResult.find({ job: job._id }).sort({ pdfPageIndex: 1 }).lean();
const fixture = () => structuredClone(FIXTURE);

const expectAck = (r, ack, sha, outcome) => {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ack, jobId: ENVELOPE.jobId, resultSha256: sha, outcome });
};

test('הפיקסצ\'ר (partial, 4 עמודים) נקלט ונשמר במלואו: layout/metadata/אזהרות לעמודים 1–3, טקסט כמו היום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const sha = sha256(FIXTURE_BYTES);
  expectAck(await send(job._id, FIXTURE_BYTES), 'accepted', sha, 'partial');

  const j = await load(job._id);
  assert.equal(j.status, 'completed');
  assert.equal(j.pipelineVersion, FIXTURE.pipelineVersion);
  assert.equal(j.resultMetadataTruncated, false);
  assert.deepEqual(JSON.parse(j.resultMetadataJson), FIXTURE.metadata);
  assert.equal(j.resultError, undefined);
  assert.deepEqual(j.layoutSummary, { ok: 2, absent: 0, dropped: 1 });
  assert.equal(j.successPages, 3);
  assert.equal(j.failedPages, 1);
  assert.deepEqual(j.pageErrors.map((e) => [e.pageNumber, e.code]), [[14, 'not_processed']]);
  assert.match(j.pageErrors[0].message, /not_processed/);

  const ps = await pagesOf(pages);
  assert.deepEqual(ps.map((p) => p.content), [...FIXTURE.pages.slice(0, 3).map((p) => p.text), '']);
  assert.equal(ps[3].lastOcrJobId, undefined);

  const recs = await recordsOf(job);
  assert.deepEqual(recs.map((r) => [r.pdfPageIndex, r.pageNumber, r.layoutStatus]), [[1, 11, 'ok'], [2, 12, 'ok'], [3, 13, 'absent']]);
  for (const [i, r] of recs.entries()) {
    const src = FIXTURE.pages[i];
    assert.equal(String(r.page), ENVELOPE.pageMap[i].pageId);
    assert.equal(String(r.book), String(job.book));
    assert.equal(r.resultSha256, sha);
    assert.equal(r.outcome, 'partial');
    assert.equal(r.pipelineVersion, FIXTURE.pipelineVersion);
    assert.equal(r.imageSha256, ENVELOPE.pageMap[i].imageSha256);
    assert.equal(r.textSha256, sha256(Buffer.from(src.text, 'utf8')));
    assert.equal(r.hasText, true);
    assert.deepEqual(JSON.parse(r.metadataJson), src.metadata);
    if (src.layout) {
      assert.deepEqual(JSON.parse(r.layoutJson), src.layout);
      assert.equal(r.layoutVersion, 1);
      assert.equal(r.layoutBytes, Buffer.byteLength(JSON.stringify(src.layout)));
    }
  }
  assert.deepEqual(recs[2].warnings.map((w) => ({ code: w.code, message: w.message, source: w.source })), [
    { code: 'layout_too_large', message: FIXTURE.pages[2].warnings[0].message, source: 'worker' },
  ]);

  // נתיב הקריאה: עמוד 1 — current, ה-layout כמות שהוא
  const data = await loadOcrPageData({ page: ps[0], inspectImage: noImage });
  assert.equal(data.state, 'current');
  assert.equal(data.contentMatchesOcr, true);
  assert.deepEqual(data.layout, FIXTURE.pages[0].layout);
  assert.equal(data.image.matches, null);

  // שליחה חוזרת → already_received, אין כפילויות ואין שינוי ברשומות
  await sleep(5);
  expectAck(await send(job._id, FIXTURE_BYTES), 'already_received', sha, 'partial');
  assert.deepEqual(await recordsOf(job), recs);
});

test('תוצאה בפורמט הישן (בלי layout/warnings/metadata חדש) עובדת כמו היום; רשומות absent בלי אזהרות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const doc = {
    schemaVersion: 1, jobId: ENVELOPE.jobId, inputSha256: ENVELOPE.inputSha256, outcome: 'success', pipelineVersion: '0.1.0',
    pages: ENVELOPE.pageMap.map((e) => ({ pdfPageIndex: e.pdfPageIndex, text: `טקסט ${e.pdfPageIndex}`, metadata: { lines: 1 } })),
    metadata: { bridge_version: 1 },
  };
  expectAck(await send(job._id, doc), 'accepted', sha256(Buffer.from(JSON.stringify(doc))), 'success');
  const j = await load(job._id);
  assert.equal(j.status, 'completed');
  assert.equal(j.successPages, 4);
  assert.deepEqual(j.layoutSummary, { ok: 0, absent: 4, dropped: 0 });
  assert.deepEqual(JSON.parse(j.resultMetadataJson), { bridge_version: 1 });
  assert.deepEqual((await pagesOf(pages)).map((p) => p.content), ['טקסט 1', 'טקסט 2', 'טקסט 3', 'טקסט 4']);
  const recs = await recordsOf(job);
  assert.equal(recs.length, 4);
  for (const r of recs) {
    assert.equal(r.layoutStatus, 'absent');
    assert.equal(r.layoutJson, null);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(JSON.parse(r.metadataJson), { lines: 1 });
  }
});

test('layout פגום/גדול/גרסה לא נתמכת, warnings זבל ו-metadata עם $key: התוצאה מתקבלת, רק ה-layout של העמוד נפסל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const doc = fixture();
  doc.pages[0].layout = 'x';
  doc.pages[1].layout.lines[0].huge = 'א'.repeat(700_000); // ~1.4MB
  doc.pages[2].layout = { ...FIXTURE.pages[0].layout, layoutVersion: 2 };
  doc.pages[2].warnings = 5;
  doc.pages[2].metadata = { $key: 1, 'a.b': 2 };
  const sha = sha256(Buffer.from(JSON.stringify(doc)));
  expectAck(await send(job._id, doc), 'accepted', sha, 'partial');
  const ps = await pagesOf(pages);
  assert.deepEqual(ps.slice(0, 3).map((p) => p.content), FIXTURE.pages.slice(0, 3).map((p) => p.text));
  const recs = await recordsOf(job);
  assert.deepEqual(recs.map((r) => r.layoutStatus), ['invalid', 'too_large', 'unsupported_version']);
  assert.equal(recs[0].layoutRejectedJson, '"x"');
  assert.deepEqual(recs[0].warnings.map((w) => [w.code, w.source]), [['layout_invalid', 'site']]);
  assert.equal(recs[1].layoutRejectedJson, null);
  assert.deepEqual(recs[1].warnings.map((w) => w.code), ['layout_too_large']);
  assert.equal(JSON.parse(recs[2].layoutRejectedJson).layoutVersion, 2);
  assert.deepEqual(recs[2].warnings.map((w) => w.code), ['layout_version_unsupported']); // warnings:5 — מתעלמים
  assert.deepEqual(JSON.parse(recs[2].metadataJson), { $key: 1, 'a.b': 2 }); // מחרוזת — בלי מגבלות מפתחות של Mongo
  assert.deepEqual((await load(job._id)).layoutSummary, { ok: 0, absent: 0, dropped: 3 });
});

test('קינון עמוק מאוד ב-metadata (ספר ועמוד) וב-layout: לא 500 — התוצאה מתקבלת והטקסט נכתב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  // JSON.stringify זורק RangeError על עומק כזה, ולכן הבתים נבנים כמחרוזת
  const deep = `${'['.repeat(100_000)}0${']'.repeat(100_000)}`;
  const doc = fixture();
  doc.metadata.deep = '@DEEP@';
  doc.pages[0].metadata.deep = '@DEEP@';
  doc.pages[1].layout.extra = '@DEEP@';
  const bytes = Buffer.from(JSON.stringify(doc).replaceAll('"@DEEP@"', deep), 'utf8');
  expectAck(await send(job._id, bytes), 'accepted', sha256(bytes), 'partial');
  const ps = await pagesOf(pages);
  assert.deepEqual(ps.slice(0, 3).map((p) => p.content), FIXTURE.pages.slice(0, 3).map((p) => p.text));
  const recs = await recordsOf(job);
  assert.deepEqual(recs.map((r) => r.layoutStatus), ['ok', 'invalid', 'absent']);
  assert.equal(recs[0].metadataJson, null);
  assert.ok(recs[0].warnings.some((w) => w.code === 'metadata_too_large' && w.source === 'site'));
  const j = await load(job._id);
  assert.equal(j.resultMetadataTruncated, true);
  assert.equal(JSON.parse(j.resultMetadataJson).service_version, FIXTURE.metadata.service_version);
});

test('התנגשות: עמוד שנערך → OcrConflict + רשומה (pending_conflict); אימוץ → current בנתיב הקריאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  await sleep(5);
  await Page.updateOne({ _id: pages[0]._id }, { $set: { content: 'עריכה אנושית' } });
  const sha = sha256(FIXTURE_BYTES);
  expectAck(await send(job._id, FIXTURE_BYTES), 'accepted', sha, 'partial');
  const j = await load(job._id);
  assert.equal(j.conflictPages, 1);
  const conflict = await OcrConflict.findOne({ job: job._id }).lean();
  assert.equal(conflict.reason, 'page_changed');
  assert.equal(String(conflict.page), String(pages[0]._id));
  const before1 = await Page.findById(pages[0]._id).lean();
  assert.equal(before1.content, 'עריכה אנושית');
  assert.equal(await OcrPageResult.countDocuments({ job: job._id, page: pages[0]._id }), 1);

  assert.equal(await loadOcrPageData({ page: before1, inspectImage: noImage }), null); // אין רשומה נוכחית
  const pending = await loadOcrPageData({ page: before1, jobId: job._id, inspectImage: noImage });
  assert.equal(pending.state, 'pending_conflict');
  assert.deepEqual(pending.layout, FIXTURE.pages[0].layout);

  const res = await resolveConflict({ id: conflict._id, action: 'apply', expected: before1.updatedAt, byName: 'מנהל' });
  assert.equal(res.ok, true);
  const after1 = await Page.findById(pages[0]._id).lean();
  assert.equal(after1.content, FIXTURE.pages[0].text);
  const current = await loadOcrPageData({ page: after1, inspectImage: noImage });
  assert.equal(current.state, 'current');
  assert.equal(current.contentMatchesOcr, true);
  assert.deepEqual(current.layout, FIXTURE.pages[0].layout);
});

test('ביטול באתר + תוצאה cancelled עם עמודים: אפס כתיבות ל-Page, OcrConflict job_cancelled לעמודים 1–3, ack cancelled; שליחה חוזרת בלי כפילויות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const outcome of ['cancelled', 'partial']) {
    await db.reset();
    await fs.rm(path.join(root, ENVELOPE.jobId), { recursive: true, force: true });
    const { job, pages } = await makeJobFromEnvelope();
    assert.deepEqual(await cancelLocalJob(job._id, { reason: 'admin' }), { ok: true });
    const doc = { ...fixture(), outcome };
    const sha = sha256(Buffer.from(JSON.stringify(doc)));
    const snap = await pagesOf(pages);
    expectAck(await send(job._id, doc), 'cancelled', sha, 'cancelled');
    expectAck(await send(job._id, doc), 'cancelled', sha, 'cancelled');
    const ps = await pagesOf(pages);
    ps.forEach((p, i) => {
      assert.equal(p.content, '', outcome);
      assert.equal(p.updatedAt.getTime(), snap[i].updatedAt.getTime());
      assert.equal(p.lastOcrJobId, undefined);
    });
    const conflicts = await OcrConflict.find({ job: job._id }).sort({ pdfPageIndex: 1 }).lean();
    assert.deepEqual(conflicts.map((c) => [c.pdfPageIndex, c.reason, c.status, c.ocrText]),
      FIXTURE.pages.slice(0, 3).map((p) => [p.pdfPageIndex, 'job_cancelled', 'open', p.text]));
    assert.equal(conflicts[0].resultSha256, sha);
    assert.equal(conflicts[0].foundUpdatedAt.getTime(), snap[0].updatedAt.getTime());
    assert.deepEqual((await recordsOf(job)).map((r) => r.layoutStatus), ['ok', 'ok', 'absent']);
    const j = await load(job._id);
    assert.equal(j.status, 'cancelled');
    assert.equal(j.ack.ack, 'cancelled');
    // אימוץ התנגשות job_cancelled → הטקסט וה-layout הופכים לנוכחיים
    const res = await resolveConflict({ id: conflicts[1]._id, action: 'apply', expected: snap[1].updatedAt, byName: 'מנהל' });
    assert.equal(res.ok, true);
    const adopted = await Page.findById(pages[1]._id).lean();
    assert.equal(adopted.content, FIXTURE.pages[1].text);
    assert.equal((await loadOcrPageData({ page: adopted, inspectImage: noImage })).state, 'current');
  }
});

test('outcome cancelled מהעובד בלי ביטול באתר → accepted/cancelled, בלי כתיבה לעמודים, התנגשויות job_cancelled', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const doc = { ...fixture(), outcome: 'cancelled' };
  expectAck(await send(job._id, doc), 'accepted', sha256(Buffer.from(JSON.stringify(doc))), 'cancelled');
  assert.deepEqual((await pagesOf(pages)).map((p) => p.content), ['', '', '', '']);
  assert.equal(await OcrConflict.countDocuments({ job: job._id, reason: 'job_cancelled' }), 3);
  const j = await load(job._id);
  assert.equal(j.status, 'cancelled');
  assert.deepEqual(j.layoutSummary, { ok: 0, absent: 0, dropped: 0 });
});

test('קריסה אחרי הרשומה ולפני כתיבת העמוד → שליחה חוזרת ממשיכה; כל עמוד נכתב, רשומה אחת לכל עמוד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const sha = sha256(FIXTURE_BYTES);
  let n = 0;
  await assert.rejects(send(job._id, FIXTURE_BYTES, { hooks: { afterPageRecord: () => { if (++n === 2) throw new Error('crash'); } } }));
  assert.ok((await OcrPageResult.countDocuments({ job: job._id })) >= 2);
  expectAck(await send(job._id, FIXTURE_BYTES), 'accepted', sha, 'partial');
  assert.deepEqual((await pagesOf(pages)).slice(0, 3).map((p) => p.content), FIXTURE.pages.slice(0, 3).map((p) => p.text));
  assert.equal(await OcrPageResult.countDocuments({ job: job._id }), 3);
  assert.deepEqual((await load(job._id)).layoutSummary, { ok: 2, absent: 0, dropped: 1 });
});

test('resumeStalledApply לעבודה מבוטלת: מציל מהקובץ השמור (job_cancelled); כשהקובץ חסר — ack בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const t0 = new Date(Date.now() - APPLY_LEASE_MS - 60000);
  const { job, pages } = await makeJobFromEnvelope();
  const sha = sha256(FIXTURE_BYTES);
  const rel = `${job._id}/result-${sha}.json`;
  await fs.writeFile(path.join(root, rel), FIXTURE_BYTES);
  await OcrJob.updateOne({ _id: job._id }, { $set: { resultSha256: sha, resultOutcome: 'partial', resultPath: rel, resultReceivedAt: t0 } });
  await cancelLocalJob(job._id, { reason: 'admin' });
  const r = await resumeStalledApply(job._id, { env });
  assert.equal(r.code, 'cancelled');
  assert.equal((await load(job._id)).ack.ack, 'cancelled');
  assert.equal(await OcrConflict.countDocuments({ job: job._id, reason: 'job_cancelled' }), 3);
  assert.deepEqual((await pagesOf(pages)).map((p) => p.content), ['', '', '', '']);

  // הקובץ חסר — הביטול גובר: ack בלבד, בלי התנגשויות
  await db.reset();
  const b = await makeJobFromEnvelope();
  await OcrJob.updateOne({ _id: b.job._id }, { $set: { resultSha256: sha, resultOutcome: 'partial', resultPath: `${b.job._id}/missing.json`, resultReceivedAt: t0 } });
  await cancelLocalJob(b.job._id, { reason: 'admin' });
  const warn = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    assert.equal((await resumeStalledApply(b.job._id, { env })).code, 'cancelled');
  } finally {
    console.warn = warn;
  }
  assert.equal((await load(b.job._id)).ack.ack, 'cancelled');
  assert.equal(await OcrConflict.countDocuments({ job: b.job._id }), 0);
  assert.ok(warned.some((w) => w.includes('result_unavailable')));
});

test('partial אחרי מיצוי ניסיונות עם error עליון → resultError נשמר, status completed', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job } = await makeJobFromEnvelope();
  const doc = { ...fixture(), error: { code: 'gpu_lost', message: 'failed after 3 attempts: device lost; 3 pages salvaged from the checkpoint' } };
  doc.metadata.salvage = { reason: 'failed', pages: 3 };
  expectAck(await send(job._id, doc), 'accepted', sha256(Buffer.from(JSON.stringify(doc))), 'partial');
  const j = await load(job._id);
  assert.equal(j.status, 'completed');
  assert.deepEqual(j.resultError, { code: 'gpu_lost', message: doc.error.message });
  assert.deepEqual(JSON.parse(j.resultMetadataJson).salvage, { reason: 'failed', pages: 3 });
  assert.equal(j.error, '');
});

test('failed עם עמודים מזוהים: שום עמוד לא נכתב, אבל הרשומות נשמרות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const { job, pages } = await makeJobFromEnvelope();
  const doc = { ...fixture(), outcome: 'failed', error: { code: 'salvaged_after_failure', message: '3 of 4 pages salvaged' } };
  expectAck(await send(job._id, doc), 'accepted', sha256(Buffer.from(JSON.stringify(doc))), 'failed');
  assert.deepEqual((await pagesOf(pages)).map((p) => p.content), ['', '', '', '']);
  assert.equal(await OcrPageResult.countDocuments({ job: job._id }), 3);
  const j = await load(job._id);
  assert.equal(j.status, 'failed');
  assert.deepEqual(j.layoutSummary, { ok: 2, absent: 0, dropped: 1 });
  assert.deepEqual(j.pageErrors.map((e) => e.code), ['not_processed']);
});
