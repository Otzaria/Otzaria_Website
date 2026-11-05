import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import FileStorage from '../../models/FileStorage.js';
import Upload from '../../models/Upload.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { handleAppReportPost } from './handler.js';
import { publishReport, runAppReportsSync } from './service.js';
import { getAppReportsConfig } from './config.js';
import { FakeIssuesGitHub } from './testing/fake-github.js';

let db, github, files;
const config = getAppReportsConfig({ DICTA_LIBRARY_GITHUB_TOKEN: 'test-token' });
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  github = new FakeIssuesGitHub();
  files = new Map();
});
const saveFile = async (buffer, filename) => {
  const gridfsId = new mongoose.Types.ObjectId();
  files.set(String(gridfsId), { buffer, filename });
  return { gridfsId };
};
const deleteFile = async (id) => { files.delete(String(id)); };
const report = (over = {}) => ({
  schema: 2, reportId: 'staging-report', type: 'bug', trigger: 'manual',
  title: 'Concurrent report', description: 'Keep every attachment',
  reporterEmail: 'reporter@example.com', appVersion: '1.0.0', platform: 'linux',
  attachments: { diagnostics: { memoryMiB: 12.5 }, errorLog: 'the complete log' },
  ...over,
});
const syncDeps = () => ({ config, fetchImpl: github.fetch, sendClosedMail: async () => ({ sent: true }) });
async function post(body, deps = {}) {
  const request = new Request('http://localhost/api/app-reports', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await handleAppReportPost(request, {
    saveFile, deleteFile, config, fetchImpl: github.fetch,
    connectDB: async () => {}, rateLimit: () => true, ...deps,
  });
  return { status: response.status, body: await response.json() };
}
async function assertComplete(body) {
  const saved = await AppReport.findOne({ reportId: body.reportId }).lean();
  assert.ok(saved);
  assert.equal(files.get(String(saved.fileIds.diagnostics.gridfsId)).buffer.toString('utf8'), JSON.stringify(body.attachments.diagnostics));
  assert.equal(files.get(String(saved.fileIds.errors.gridfsId)).buffer.toString('utf8'), body.attachments.errorLog);
  return saved;
}

for (const sameId of [true, false]) {
  test(`schema2 staging: failed upload cannot acknowledge or delete a parallel ${sameId ? 'same-ID' : 'new-ID'} retry`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    const body = report();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let calls = 0;
    const first = post(body, { saveFile: async (...args) => {
      if (++calls === 2) {
        entered.resolve();
        await release.promise;
        throw new Error('paused upload failed');
      }
      return saveFile(...args);
    } });
    let firstResult;
    const retryBody = { ...body, reportId: sameId ? body.reportId : 'retry-new-id' };
    try {
      await entered.promise;
      assert.equal(files.size, 1);
      assert.equal(await AppReport.countDocuments(), 0, 'partial uploads must not be visible as received reports');
      assert.equal(await publishReport(body.reportId, syncDeps()), null);
      const sync = await runAppReportsSync(syncDeps());
      assert.equal(sync.pending.attempted, 0);
      assert.equal(github.calls.length, 0);

      const retry = await post(retryBody);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.duplicate, false, 'a successful retry must first persist its own full payload');
      await assertComplete(retryBody);
    } finally {
      release.resolve();
      firstResult = await first;
    }
    assert.equal(firstResult.status, 500);
    assert.equal(await AppReport.countDocuments(), 1);
    assert.equal(files.size, 2, 'only the successful request retains files');
    await assertComplete(retryBody);
    assert.equal((await post(retryBody)).body.duplicate, true);
    assert.equal(files.size, 2);
    assert.equal(github.issues.size, 1);
  });
}

for (const scenario of [
  { name: 'same-ID duplicate', sameId: true, conflict: false },
  { name: 'new-ID resend', sameId: false, conflict: false },
  { name: 'same-ID conflict', sameId: true, conflict: true },
]) {
  test(`schema2 staging: a late ${scenario.name} keeps the winner and removes only unused files`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    const body = report();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let paused = false;
    const first = post(body, { saveFile: async (...args) => {
      if (!paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
      return saveFile(...args);
    } });
    const winner = {
      ...body, reportId: scenario.sameId ? body.reportId : 'winner-new-id',
      attachments: scenario.conflict ? { ...body.attachments, diagnostics: { memoryMiB: 25.25 } } : body.attachments,
    };
    let late;
    try {
      await entered.promise;
      assert.equal((await post(winner)).status, 200);
      await assertComplete(winner);
    } finally {
      release.resolve();
      late = await first;
    }
    if (scenario.conflict) {
      assert.equal(late.status, 409);
      assert.deepEqual(late.body, { error: 'reportId conflict' });
    } else {
      assert.equal(late.status, 200);
      assert.equal(late.body.duplicate, true);
    }
    assert.equal(await AppReport.countDocuments(), 1);
    assert.equal(files.size, 2);
    assert.equal(github.issues.size, 1);
    await assertComplete(winner);
  });
}

for (const referenceLookupFails of [false, true]) {
  test(`schema2 staging: a committed insert with lost acknowledgement keeps files${referenceLookupFails ? ' even if reference lookup also fails' : ''}`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    const body = report();
    const update = AppReport.findOneAndUpdate.bind(AppReport);
    t.mock.method(AppReport, 'findOneAndUpdate', (...args) => ({ lean: async () => {
      await update(...args).lean();
      throw new Error('insert committed but acknowledgement lost');
    } }));
    if (referenceLookupFails) {
      t.mock.method(AppReport, 'exists', async () => { throw new Error('reference lookup unavailable'); });
    }
    const failed = await post(body);
    assert.equal(failed.status, 500);
    t.mock.restoreAll();
    assert.equal(await AppReport.countDocuments(), 1);
    assert.equal(files.size, 2);
    const saved = await assertComplete(body);
    assert.equal(saved.issuePending, true);
    assert.equal(github.issues.size, 0);

    const sync = await runAppReportsSync(syncDeps());
    assert.equal(sync.pending.published, 1);
    const retry = await post(body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.duplicate, true);
    assert.equal(github.issues.size, 1);
    assert.equal(files.size, 2);
    await assertComplete(body);
  });
}

test('schema2 staging: an insert that never committed removes staged files without acknowledging delivery', async (t) => {
  if (db.skip) return t.skip(db.skip);
  t.mock.method(AppReport, 'findOneAndUpdate', () => ({ lean: async () => { throw new Error('insert failed'); } }));
  const failed = await post(report());
  assert.equal(failed.status, 500);
  assert.equal(await AppReport.countDocuments(), 0);
  assert.equal(files.size, 0);
  assert.equal(github.calls.length, 0);
});

for (const owner of ['report', 'upload']) {
  test(`schema2 staging: cleanup preserves a file referenced by another active ${owner}`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    let shared;
    if (owner === 'report') {
      const active = report({ reportId: 'active-report', title: 'Another report' });
      assert.equal((await post(active)).status, 200);
      shared = (await assertComplete(active)).fileIds.diagnostics.gridfsId;
    } else {
      const stored = await saveFile(Buffer.from('active upload bytes'), 'active.txt');
      shared = stored.gridfsId;
      const metadata = await FileStorage.create({
        filename: 'active.txt', originalName: 'active.txt', contentType: 'text/plain', size: 19, gridfsId: shared,
      });
      await Upload.create({ bookName: 'Active upload', fileStorageId: metadata._id });
    }
    const original = Buffer.from(files.get(String(shared)).buffer);
    let calls = 0;
    const failed = await post(report(), { saveFile: async () => {
      if (++calls === 1) return { gridfsId: shared };
      throw new Error('next file failed');
    } });
    assert.equal(failed.status, 500);
    assert.deepEqual(files.get(String(shared)).buffer, original);
    assert.equal(await AppReport.countDocuments({ reportId: 'staging-report' }), 0);
    if (owner === 'report') assert.equal((await AppReport.findOne({ reportId: 'active-report' }).lean()).issueState, 'open');
    else assert.equal(await Upload.countDocuments({ isDeleted: false }), 1);
  });
}

test('schema2 staging: a legacy row still receiving attachments cannot satisfy a new schema2 resend', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const legacy = report({ schema: 1, reportId: 'legacy-pending-upload' });
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const first = post(legacy, { saveFile: async () => {
    entered.resolve();
    await release.promise;
    throw new Error('legacy upload failed');
  } });
  const current = report({ reportId: 'schema2-complete' });
  let failed;
  try {
    await entered.promise;
    assert.ok(await AppReport.exists({ reportId: legacy.reportId }));
    const second = await post(current);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, false);
    await assertComplete(current);
  } finally {
    release.resolve();
    failed = await first;
  }
  assert.equal(failed.status, 500);
  assert.equal(await AppReport.countDocuments(), 1);
  assert.equal(files.size, 2);
  await assertComplete(current);
});
