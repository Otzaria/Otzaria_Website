import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AppReport from '../../models/AppReport.js';
import FileStorage from '../../models/FileStorage.js';
import Upload from '../../models/Upload.js';
import { startMongo } from '../corrections/testing/mongo.js';

const refPaths = ['fileIds.diagnostics.gridfsId', 'fileIds.errors.gridfsId', 'fileIds.minidump.gridfsId', 'fileIds.images.gridfsId', 'contactLog.images.gridfsId'];
const count = 1500;
const gridfsIds = Array.from({ length: count }, () => new mongoose.Types.ObjectId());
const storageIds = Array.from({ length: count }, () => new mongoose.Types.ObjectId());
let db;

before(async () => {
  db = await startMongo();
  if (db.skip) return;
  // Mixed scalar and array references exercise every branch of the safety lookup.
  await AppReport.collection.insertMany(gridfsIds.map((id, i) => {
    const ref = { gridfsId: id };
    const locations = [
      { fileIds: { diagnostics: ref } }, { fileIds: { errors: ref } },
      { fileIds: { minidump: ref } }, { fileIds: { images: [ref] } },
      { contactLog: [{ images: [ref] }] },
    ];
    return { reportId: `reference-${i}`, ...locations[i % locations.length] };
  }));
  await FileStorage.collection.insertMany(gridfsIds.map((id, i) => ({ _id: storageIds[i], gridfsId: id })));
  await Upload.collection.insertMany(storageIds.map((id, i) => ({ fileStorageId: id, isDeleted: false, bookName: `Book ${i}` })));
});
after(async () => { if (db && !db.skip) await db.stop(); });

function assertBoundedLookup(plan, returned) {
  assert.equal(plan.executionStats.nReturned, returned);
  assert.ok(plan.executionStats.totalDocsExamined <= 1,
    `reference lookup examined ${plan.executionStats.totalDocsExamined} of ${count} documents`);
  // Allow bounded end-of-range seeks across MongoDB query engine versions.
  assert.ok(plan.executionStats.totalKeysExamined <= 2 * refPaths.length,
    `reference lookup examined ${plan.executionStats.totalKeysExamined} index keys`);
}

test('orphan and shared report-file lookups stay bounded across all reference families', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const [id, found] of [...gridfsIds.slice(-refPaths.length).map((id) => [id, 1]), [new mongoose.Types.ObjectId(), 0]]) {
    const plan = await AppReport.findOne({ $or: refPaths.map((path) => ({ [path]: id })) })
      .select('_id').explain('executionStats');
    assertBoundedLookup(plan, found);
  }
});

test('staged-file metadata and active-book lookups do not scan unrelated uploads', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const [id, found] of [[gridfsIds.at(-1), 1], [new mongoose.Types.ObjectId(), 0]]) {
    const plan = await FileStorage.find({ gridfsId: id }).select('_id').explain('executionStats');
    assertBoundedLookup(plan, found);
  }
  // Missing legacy isDeleted is active too; a deleted upload cannot keep a file alive.
  await Upload.collection.updateOne({ fileStorageId: storageIds.at(-2) }, { $unset: { isDeleted: '' } });
  await Upload.collection.updateOne({ fileStorageId: storageIds.at(-1) }, { $set: { isDeleted: true } });
  for (const [id, found] of [[storageIds.at(-2), 1], [storageIds.at(-1), 0], [new mongoose.Types.ObjectId(), 0]]) {
    const plan = await Upload.findOne({ fileStorageId: { $in: [id] }, isDeleted: { $ne: true } })
      .select('_id').explain('executionStats');
    assertBoundedLookup(plan, found);
  }
});
