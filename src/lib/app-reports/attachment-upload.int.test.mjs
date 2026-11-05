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
