import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ErrorReport from '../../models/ErrorReport.js';
import { startMongo } from './testing/mongo.js';
import { ingestReport } from './intake.js';
import { migrateLegacyReports } from './migrate.js';
import { listReports } from './volunteer.js';
import { LIST_FILTERS } from './listFilters.js';
import { libraryVersionKey, libraryVersionSortFields, sortSpec, LIBRARY_VERSION_SORT_SCHEMA } from './listSort.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });
const user = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
const at = new Date('2026-11-01T00:00:00Z');
const report = (id, version, extra = {}) => ({
  reportId: id, senderEmail: 'test@example.org', subject: 's', bookTitle: id, currentRef: 'a', lineNumber: 1,
  selectedText: 's', errorDetails: 'e', contextText: 'c', filePath: 'f', sourceFolder: 'MoreBooks',
  libraryVersion: version, reportKind: 'free_text', state: 'open', manual: { status: 'queued' }, createdAt: at, updatedAt: at, ...extra,
});
const list = (query = {}) => listReports({ user, query }).then((r) => r.body.items.map((i) => i.bookTitle));

test('create/save persist the effective library version, including build precedence and unknown', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await ErrorReport.create(report('new', '27', { location: { libraryBuildId: '100' } }));
  assert.equal(doc.libraryVersionSortKey, 100);
  assert.equal(doc.libraryVersionSortSchema, LIBRARY_VERSION_SORT_SCHEMA);
  const partial = await ErrorReport.findById(doc._id).select('subject');
  partial.subject = 'updated';
  await partial.save();
  assert.equal((await ErrorReport.findById(doc._id).lean()).libraryVersionSortKey, 100, 'saving unrelated projected fields does not erase the key');
  doc.location.libraryBuildId = '  ';
  doc.libraryVersion = 'v31';
  await doc.save();
  assert.equal((await ErrorReport.findById(doc._id).lean()).libraryVersionSortKey, 31);
  doc.libraryVersion = 'unknown';
  await doc.save();
  assert.equal((await ErrorReport.findById(doc._id).lean()).libraryVersionSortKey, null);
});

test('legacy resubmission updates the stored key atomically with the version', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const legacy = { report_id: 'legacy', sender_email: 'test@example.org', subject: 's', book_title: 'book', current_ref: 'a', line_number: 1,
    selected_text: 's', error_details: 'e', context_text: 'c', file_path: 'f', source_folder: 'MoreBooks', library_version: '27' };
  const validated = { schemaVersion: 1, kind: 'free_text', contentDigest: 'first', location: null, correction: null };
  const config = { verify: { enabled: false } };
  await ingestReport({ legacy, validated, config });
  await ingestReport({ legacy: { ...legacy, library_version: '100' }, validated: { ...validated, contentDigest: 'second' }, config });
  const doc = await ErrorReport.findOne({ reportId: 'legacy' }).lean();
  assert.equal(doc.libraryVersion, '100');
  assert.equal(doc.libraryVersionSortKey, 100);
  assert.equal(doc.libraryVersionSortSchema, LIBRARY_VERSION_SORT_SCHEMA);
});

test('projected version edits preserve build precedence and omitted source fields', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const original = await ErrorReport.create(report('projected', '27', { location: { libraryBuildId: '100', heRef: 'original' } }));
  const versionOnly = await ErrorReport.findById(original._id).select('libraryVersion');
  versionOnly.libraryVersion = '31';
  await versionOnly.save();
  let stored = await ErrorReport.findById(original._id).lean();
  assert.equal(stored.libraryVersionSortKey, 100, 'unselected build still has precedence');
  assert.equal(stored.location.libraryBuildId, '100');
  assert.equal(stored.location.heRef, 'original');
  const buildOnly = await ErrorReport.findById(original._id).select('location.libraryBuildId');
  buildOnly.location.libraryBuildId = '';
  await buildOnly.save();
  stored = await ErrorReport.findById(original._id).lean();
  assert.equal(stored.libraryVersionSortKey, 31, 'blank build falls back to unselected libraryVersion');
  assert.equal(stored.libraryVersion, '31');
  assert.equal(stored.location.heRef, 'original');
  const refOnly = await ErrorReport.findById(original._id).select('location.heRef');
  refOnly.location.heRef = 'updated';
  await refOnly.save();
  stored = await ErrorReport.findById(original._id).lean();
  assert.equal(stored.libraryVersionSortKey, 31, 'editing a sibling location field preserves the effective version');
  assert.equal(stored.location.libraryBuildId, '');
  assert.equal(stored.libraryVersion, '31');
});

test('mixed rollout keeps exact ordering and pagination; backfill is read-only in dry-run and idempotent', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rows = [report('old-27', '27'), report('old-unknown', 'unknown'), report('old-huge', '1'.repeat(400))];
  await ErrorReport.collection.insertMany(rows);
  await ErrorReport.create(report('new-100', '27', { location: { libraryBuildId: '100' } }));
  const before = await ErrorReport.collection.find({}).sort({ _id: 1 }).toArray();
  const expected = ['old-huge', 'new-100', 'old-27', 'old-unknown'];
  assert.deepEqual(await list(), expected, 'unbackfilled reports must participate in numeric sorting');
  const dry = await migrateLegacyReports();
  assert.deepEqual(dry.versionSort, { matched: 3, modified: 0 });
  assert.deepEqual(await ErrorReport.collection.find({}).sort({ _id: 1 }).toArray(), before);
  const migrated = await migrateLegacyReports({ apply: true });
  assert.deepEqual(migrated.versionSort, { matched: 3, modified: 3 });
  assert.deepEqual((await migrateLegacyReports({ apply: true })).versionSort, { matched: 0, modified: 0 });
  for (const doc of await ErrorReport.find({}).lean()) {
    assert.equal(doc.libraryVersionSortKey, libraryVersionKey(doc));
    assert.equal(doc.libraryVersionSortSchema, LIBRARY_VERSION_SORT_SCHEMA);
    assert.equal(doc.updatedAt.getTime(), at.getTime(), 'backfill does not alter report timestamps');
  }
  const aggregate = ErrorReport.aggregate;
  ErrorReport.aggregate = () => { throw new Error('backfilled list must not recompute keys'); };
  try {
    assert.deepEqual(await list({ limit: 2 }), expected.slice(0, 2));
    assert.deepEqual(await list({ skip: 2, limit: 2 }), expected.slice(2));
    assert.deepEqual(await list({ source: 'MoreBooks', kind: 'free_text' }), expected);
    const newest = await list({ sort: 'newest' });
    assert.deepEqual(await list({ sort: 'oldest' }), [...newest].reverse());
  } finally { ErrorReport.aggregate = aggregate; }
});

test('rerunning the migration repairs a stale key left by a rolled-back writer', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const doc = await ErrorReport.create(report('rolled-back', '27'));
  await ErrorReport.collection.insertOne(report('missing-key', 'unknown', { libraryVersionSortSchema: LIBRARY_VERSION_SORT_SCHEMA }));
  await ErrorReport.collection.updateOne({ _id: doc._id }, { $set: { libraryVersion: '100' } });
  assert.deepEqual((await migrateLegacyReports()).versionSort, { matched: 2, modified: 0 });
  await migrateLegacyReports({ apply: true });
  assert.equal((await ErrorReport.findById(doc._id).lean()).libraryVersionSortKey, 100);
  assert.equal((await ErrorReport.findOne({ reportId: 'missing-key' }).lean()).libraryVersionSortKey, null);
});

test('Mongo backfill and intake compute identical keys for optional builds and unusual strings', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const builds = [null, '', ' ', '\ufeff', '\u0000', 'v31', '1.10', '1'.repeat(100)];
  await ErrorReport.collection.insertMany(builds.map((build, i) => report(`edge-${i}`, '27', { location: { libraryBuildId: build } })));
  await migrateLegacyReports({ apply: true });
  for (const doc of await ErrorReport.find({}).lean()) {
    assert.equal(doc.libraryVersionSortKey, libraryVersionKey(doc), doc.reportId);
  }
});

test('backfilled first page and readiness check use indexes without scanning the whole collection', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rows = Array.from({ length: 3000 }, (_, i) => {
    // Higher-version closed reports test that the state prefix avoids scanning them.
    const r = report(`indexed-${i}`, String(i < 1000 ? 200 : 20 + i % 10), { state: i < 1000 ? 'closed_manual' : 'open' });
    return { ...r, ...libraryVersionSortFields(r) };
  });
  await ErrorReport.collection.insertMany(rows);
  const filter = { ...LIST_FILTERS.queued(user, new Date()), libraryVersionSortSchema: LIBRARY_VERSION_SORT_SCHEMA };
  const plan = await ErrorReport.find(filter).sort(sortSpec('version')).limit(50).explain('executionStats');
  assert.equal(plan.executionStats.nReturned, 50);
  assert.ok(plan.executionStats.totalDocsExamined <= 50, JSON.stringify(plan.executionStats));
  assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /IXSCAN/);
  assert.doesNotMatch(JSON.stringify(plan.queryPlanner.winningPlan), /"stage":"SORT"/);
  const readiness = await ErrorReport.find({ libraryVersionSortSchema: { $ne: LIBRARY_VERSION_SORT_SCHEMA } })
    .select('_id').limit(1).explain('executionStats');
  assert.equal(readiness.executionStats.totalDocsExamined, 0);
  assert.match(JSON.stringify(readiness.queryPlanner.winningPlan), /IXSCAN/);
});
