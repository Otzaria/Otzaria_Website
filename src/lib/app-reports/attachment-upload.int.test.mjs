import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { saveFileToGridFS, deleteFileFromGridFS, getFileFromGridFS } from '../gridfs-service.js';
import { handleAppReportPost } from './handler.js';
import { getAppReportsConfig } from './config.js';
import { FakeIssuesGitHub } from './testing/fake-github.js';
import { ANIMATED_GIF } from './testing/gif-fixtures.js';

let db, server, url, github;
before(async () => {
  db = await startMongo();
  if (db.skip) return;
  server = createServer(async (req, res) => {
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method, headers: req.headers, body: Readable.toWeb(req), duplex: 'half',
    });
    const response = await handleAppReportPost(request, {
      saveFile: saveFileToGridFS, deleteFile: deleteFileFromGridFS,
      config: getAppReportsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 'test' }),
      connectDB: async () => {}, rateLimit: () => true, fetchImpl: (...args) => github.fetch(...args),
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/api/app-reports`;
});
after(async () => {
  if (db.skip) return;
  await new Promise((resolve) => server.close(resolve));
  await db.stop();
});
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  await mongoose.connection.db.collection('uploads.files').deleteMany({});
  await mongoose.connection.db.collection('uploads.chunks').deleteMany({});
  github = new FakeIssuesGitHub();
});

const image = (size) => {
  const buffer = Buffer.concat([ANIMATED_GIF, Buffer.alloc(size - ANIMATED_GIF.length)]);
  return { fileName: 'animation.gif', data: buffer.toString('base64') };
};
const report = (attachments, schema = 2) => ({
  schema, reportId: 'http-upload', type: 'bug', trigger: 'manual',
  title: 'בדיקת גבולות העלאה', description: 'אנימציה מהתוכנה', reporterEmail: 'test@example.com',
  platform: 'linux', appVersion: '1.0.0', attachments,
});
const post = (body) => fetch(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('HTTP + MongoDB + GridFS: שני GIF בגודל10MiB מתקבלים ושחזור נותן בתים זהים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const images = [image(10 * 1024 * 1024), image(10 * 1024 * 1024)];
  const response = await post(report({ images }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.issuePending, false);
  const saved = await AppReport.findOne({ reportId: result.reportId }).lean();
  assert.equal(saved.schema, 2);
  assert.equal(saved.fileIds.images.length, 2);
  for (const [i, file] of saved.fileIds.images.entries()) {
    const bytes = await getFileFromGridFS(file.gridfsId);
    assert.deepEqual(bytes, Buffer.from(images[i].data, 'base64'));
    assert.equal(file.mimeType, 'image/gif');
  }
  const again = await post(report({ images }));
  assert.equal((await again.json()).duplicate, true);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 2);
});

test('HTTP: בית אחד מעל סך הצרופות נדחה לפני שמירה ולפני פרסום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const response = await post(report({ images: [image(10 * 1024 * 1024), image(10 * 1024 * 1024)], errorLog: 'x' }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).field, 'attachments');
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 0);
  assert.equal(github.calls.length, 0);
});

test('HTTP: דיווח ישן עםdump של16MiB עדיין נקלט ומפורסם', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const bytes = Buffer.alloc(16 * 1024 * 1024);
  bytes.write('MDMP');
  const response = await post(report({ minidump: { fileName: 'crash.dmp', data: bytes.toString('base64') } }, 1));
  assert.equal(response.status, 200);
  const saved = await AppReport.findOne({ reportId: 'http-upload' }).lean();
  assert.equal(saved.schema, 1);
  assert.deepEqual(await getFileFromGridFS(saved.fileIds.minidump.gridfsId), bytes);
});

test('HTTP + GridFS: אבחון ולוג ב10MiB כל אחד נשמרים בשלמותם גם אחרי escaping', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const diagnostics = { text: 'x'.repeat(10 * 1024 * 1024 - 11) };
  const errorLog = '\0'.repeat(10 * 1024 * 1024);
  const response = await post(report({ diagnostics, errorLog }));
  assert.equal(response.status, 200);
  const saved = await AppReport.findOne({ reportId: 'http-upload' }).lean();
  assert.equal(saved.fileIds.diagnostics.size, 10 * 1024 * 1024);
  assert.equal(saved.fileIds.errors.size, 10 * 1024 * 1024);
  assert.equal((await getFileFromGridFS(saved.fileIds.diagnostics.gridfsId)).toString('utf8'), JSON.stringify(diagnostics));
  assert.equal((await getFileFromGridFS(saved.fileIds.errors.gridfsId)).toString('utf8'), errorLog);
});


test('HTTP + GridFS: schema2 diagnostics-only changes are stored under a new report ID', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const base = report({});
  assert.equal((await post(base)).status, 200);

  const diagnostics = { collectedAt: '2026-11-05T12:00:00Z', memoryMiB: 12.5, details: 'אבחון חדש' };
  const added = { ...base, reportId: 'diagnostics-added', attachments: { diagnostics } };
  const first = await post(added);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).duplicate, false);
  const firstDoc = await AppReport.findOne({ reportId: added.reportId }).lean();
  assert.equal((await getFileFromGridFS(firstDoc.fileIds.diagnostics.gridfsId)).toString('utf8'), JSON.stringify(diagnostics));

  const changed = {
    ...added, reportId: 'diagnostics-changed',
    attachments: { diagnostics: { ...diagnostics, memoryMiB: 25.25, details: 'אבחון אחר' } },
  };
  const second = await post(changed);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, false);
  const secondDoc = await AppReport.findOne({ reportId: changed.reportId }).lean();
  assert.equal((await getFileFromGridFS(secondDoc.fileIds.diagnostics.gridfsId)).toString('utf8'), JSON.stringify(changed.attachments.diagnostics));
  assert.equal(await AppReport.countDocuments(), 3);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 2);

  const calls = github.calls.length;
  const retry = await post(changed);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  const resent = await post({ ...changed, reportId: 'diagnostics-unchanged-resend' });
  assert.equal(resent.status, 200);
  assert.equal((await resent.json()).duplicate, true);
  assert.equal(await AppReport.countDocuments(), 3);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 2);
  assert.equal(github.calls.length, calls);
});

test('HTTP + GridFS: schema2 same-ID diagnostics changes are conflicts; schema1 retries stay compatible', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const diagnostics = { value: 'original exact attachment' };
  const base = report({ diagnostics });
  assert.equal((await post(base)).status, 200);
  const before = await AppReport.findOne({ reportId: base.reportId }).lean();
  const originalFileId = String(before.fileIds.diagnostics.gridfsId);
  const calls = github.calls.length;

  for (const attachments of [{}, { diagnostics: { value: 'different attachment' } }]) {
    const response = await post({ ...base, attachments });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'reportId conflict' });
    const kept = await AppReport.findOne({ reportId: base.reportId }).lean();
    assert.equal(String(kept.fileIds.diagnostics.gridfsId), originalFileId);
    assert.equal((await getFileFromGridFS(kept.fileIds.diagnostics.gridfsId)).toString('utf8'), JSON.stringify(diagnostics));
  }
  assert.equal(await AppReport.countDocuments(), 1);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 1);
  assert.equal(github.calls.length, calls);
  assert.equal((await (await post(base)).json()).duplicate, true);

  // A legacy client cannot reuse a schema 2 identity and receive a false
  // acknowledgement, even when its visible content or diagnostics happen to match.
  for (const attachments of [{ diagnostics }, {}, { diagnostics: { value: 'legacy replacement' } }]) {
    const downgrade = await post({ ...base, schema: 1, attachments });
    assert.equal(downgrade.status, 409);
    assert.deepEqual(await downgrade.json(), { error: 'reportId conflict' });
  }
  assert.equal(await AppReport.countDocuments(), 1);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 1);

  const legacy = { ...base, schema: 1, reportId: 'legacy-diagnostics' };
  const firstLegacy = await post(legacy);
  assert.equal(firstLegacy.status, 200);
  assert.equal((await firstLegacy.json()).duplicate, false);
  for (const reportId of [legacy.reportId, 'legacy-diagnostics-resend']) {
    const retry = await post({ ...legacy, reportId, attachments: { diagnostics: { value: 'legacy recollected diagnostics' } } });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).duplicate, true);
  }
  const legacyDoc = await AppReport.findOne({ reportId: legacy.reportId }).lean();
  assert.deepEqual(JSON.parse((await getFileFromGridFS(legacyDoc.fileIds.diagnostics.gridfsId)).toString('utf8')), diagnostics);
  assert.equal(await AppReport.countDocuments(), 2);
  assert.equal(await mongoose.connection.db.collection('uploads.files').countDocuments(), 2);
});
