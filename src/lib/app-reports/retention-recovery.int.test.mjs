import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { saveFileToGridFS, getFileFromGridFS } from '../gridfs-service.js';
import { cleanupClosedReportPayloads, PAYLOAD_RETENTION_MS, CLEANUP_RETRY_MS } from './retention.js';
import { handleIssueStateChange } from './state-change.js';

let db, now, issues;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  await mongoose.connection.db.collection('uploads.files').deleteMany({});
  await mongoose.connection.db.collection('uploads.chunks').deleteMany({});
  now = new Date('2026-11-06T12:00:00.000Z');
  issues = new Map();
});

const input = () => ({
  clock: () => now,
  githubFor: () => ({ getIssue: async (number) => ({ ...issues.get(number) }) }),
});

for (const failureAfterWrite of [false, true]) {
  test(`כשל זמני ${failureAfterWrite ? 'אחרי' : 'לפני'} כתיבת בעלות משותפת אינו חוסם את הניקוי העתידי`, async (t) => {
    if (db.skip) return t.skip(db.skip);
    const ownerId = 'qa-shared-owner';
    const activeId = 'qa-shared-active';
    const bytes = Buffer.from('נתוני אבחון משותפים לבדיקה');
    const file = await saveFileToGridFS(bytes, 'diagnostics.json', 'application/json', { appReportId: ownerId });
    const fileIds = { diagnostics: { gridfsId: file.gridfsId, size: file.size } };
    const closedAt = new Date(now.getTime() - PAYLOAD_RETENTION_MS);
    const owner = await AppReport.create({ reportId: ownerId, type: 'bug', trigger: 'manual',
      title: 'בדיקת בעלות', description: 'תוכן בדיקה', contentHash: ownerId,
      issueNumber: 1, issueState: 'closed', issueClosedAt: closedAt, issuePending: false, fileIds });
    const active = await AppReport.create({ reportId: activeId, type: 'bug', trigger: 'manual',
      title: 'בדיקת שיתוף', description: 'תוכן בדיקה', contentHash: activeId,
      issueNumber: 2, issueState: 'open', issueClosedAt: null, issuePending: false, fileIds });
    issues.set(1, { number: 1, state: 'closed', closed_at: closedAt.toISOString() });
    issues.set(2, { number: 2, state: 'open', closed_at: null });

    const files = mongoose.connection.db.collection('uploads.files');
    const prototype = Object.getPrototypeOf(files);
    const originalUpdate = prototype.updateOne;
    let injectedFailures = 0;
    const mock = t.mock.method(prototype, 'updateOne', async function (filter, update, ...args) {
      if (this.collectionName === 'uploads.files'
        && update?.$set?.['metadata.appReportId'] === activeId && injectedFailures === 0) {
        injectedFailures += 1;
        if (failureAfterWrite) await originalUpdate.call(this, filter, update, ...args);
        throw new Error('כשל זמני יחיד בהעברת בעלות');
      }
      return originalUpdate.call(this, filter, update, ...args);
    });
    const first = await cleanupClosedReportPayloads(input());
    mock.mock.restore();
    assert.equal(injectedFailures, 1);
    assert.equal(first.errors, 1);
    assert.deepEqual(await getFileFromGridFS(file.gridfsId), bytes);
    assert.ok((await AppReport.findById(active._id).lean()).fileIds.diagnostics);
    const pending = await AppReport.findById(owner._id).lean();
    assert.equal(pending.payloadCleanup.pendingDeletes.length, 1);
    assert.equal(pending.payloadCleanup.removedFiles, 0);
    assert.equal(pending.payloadCleanup.sharedFiles, 0);
    assert.equal(pending.payloadCleanup.purgedAt, null);

    now = new Date(now.getTime() + CLEANUP_RETRY_MS);
    const retry = await cleanupClosedReportPayloads(input());
    assert.equal(retry.errors, 0);
    assert.equal(retry.shared, 1);
    const recovered = await AppReport.findById(owner._id).lean();
    assert.equal(recovered.payloadCleanup.pendingDeletes.length, 0);
    assert.equal(recovered.payloadCleanup.removedFiles, 1);
    assert.equal(recovered.payloadCleanup.sharedFiles, 1);
    assert.equal(recovered.payloadCleanup.removedBytes, 0);
    assert.equal((await files.findOne({ _id: file.gridfsId })).metadata.appReportId, activeId);
    assert.deepEqual(await getFileFromGridFS(file.gridfsId), bytes);
    assert.ok((await AppReport.findById(active._id).lean()).fileIds.diagnostics);
    assert.equal((await cleanupClosedReportPayloads(input())).files, 0);
    assert.equal((await AppReport.findById(owner._id).lean()).payloadCleanup.sharedFiles, 1);
    const reopenedClosedAt = new Date(now);
    const closed = { number: 2, state: 'closed', closed_at: reopenedClosedAt.toISOString() };
    issues.set(2, closed);
    await handleIssueStateChange(closed, { now });
    now = new Date(reopenedClosedAt.getTime() + PAYLOAD_RETENTION_MS);
    const final = await cleanupClosedReportPayloads(input());
    const ownerAfter = await AppReport.findById(owner._id).lean();
    const activeAfter = await AppReport.findById(active._id).lean();
    t.diagnostic(JSON.stringify({ injectedFailures, final,
      previousOwnerHasReference: Boolean(ownerAfter.fileIds?.diagnostics),
      previousOwnerPurged: Boolean(ownerAfter.payloadCleanup?.purgedAt),
      activeHasReference: Boolean(activeAfter.fileIds?.diagnostics),
      remainingFiles: await files.countDocuments() }));
    assert.equal(final.errors, 0, 'לאחר התאוששות אין להיתקע על תג הבעלות של הדיווח שכבר נוקה');
    assert.equal(final.files, 1);
    assert.equal(await files.countDocuments(), 0);
    assert.equal(activeAfter.payloadCleanup.removedFiles, 1);
    assert.equal(activeAfter.payloadCleanup.removedBytes, bytes.length);
    assert.equal(ownerAfter.payloadCleanup.removedFiles, 1);
  });
}

test('בחירת מחיקות ממתינות אינה סורקת דיווחים פעילים לא קשורים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const unrelated = Array.from({ length: 1000 }, (_, i) => ({
    reportId: `qa-unrelated-${i}`, issueState: 'open', issuePending: false,
    payloadCleanup: { pendingDeletes: [], nextAttemptAt: null },
  }));
  await AppReport.collection.insertMany(unrelated);
  await AppReport.collection.insertOne({ reportId: 'qa-pending', issueState: 'open', issuePending: false,
    payloadCleanup: { nextAttemptAt: null, pendingDeletes: [{
      gridfsId: new mongoose.Types.ObjectId(), ownerReportId: 'qa-pending',
      detachedAt: now, leaseUntil: null, leaseToken: null,
    }] } });
  const explain = await AppReport.find({
    'payloadCleanup.pendingDeletes.0': { $exists: true },
    $or: [{ 'payloadCleanup.nextAttemptAt': null }, { 'payloadCleanup.nextAttemptAt': { $lte: now } }],
  }).select('_id reportId fileIds contactLog.images payloadCleanup.pendingDeletes').limit(10).explain('executionStats');
  const { nReturned, totalDocsExamined, totalKeysExamined } = explain.executionStats;
  t.diagnostic(JSON.stringify({ nReturned, totalDocsExamined, totalKeysExamined,
    winningPlan: explain.queryPlanner.winningPlan }));
  assert.equal(nReturned, 1);
  assert.ok(totalDocsExamined <= 20, `בחירת רשומה אחת בחנה ${totalDocsExamined} דיווחים`);
});
