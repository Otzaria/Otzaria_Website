import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import ErrorReport from '../../models/ErrorReport.js';
import { startMongo } from './testing/mongo.js';
import { listReports } from './volunteer.js';
import { appendPage, neighbors, readNavList, writeNavList } from './queue-nav.js';
import { libraryVersionSortFields, libraryVersionKeyExpr, sortSpec } from './listSort.js';
import { afterReportCursor, parseReportCursor } from './listCursor.js';
import { LIST_FILTERS } from './listFilters.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); });
const user = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
const report = (i) => {
  const row = { reportId: `r${i}`, bookTitle: 'book', libraryVersion: i % 5 ? String(i % 7) : 'unknown',
    state: 'open', manual: { status: 'queued' }, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 11)), sourceFolder: 'MoreBooks', reportKind: 'free_text' };
  return { ...row, ...libraryVersionSortFields(row) };
};
const page = async (query) => {
  const result = await listReports({ user, query });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
};

for (const sort of ['oldest', 'newest', 'version']) {
  for (const close of ['all', 'first-ten']) {
    test(`300 reports: ${sort}, closing ${close}, preserves every next/previous link`, async (t) => {
      if (db.skip) return t.skip(db.skip);
      const rows = Array.from({ length: 300 }, (_, i) => report(i));
      // Exercise numeric ordering during a mixed migration too.
      if (sort === 'version') for (let i = 0; i < rows.length; i += 2) {
        delete rows[i].libraryVersionSortKey;
        delete rows[i].libraryVersionSortSchema;
      }
      await ErrorReport.collection.insertMany(rows);
      const initial = await page({ sort, limit: 50 });
      let nav = appendPage({ query: `sort=${sort}`, ids: [], total: 0, at: Date.now() }, initial);
      const expected = sort === 'version'
        ? await ErrorReport.aggregate([{ $addFields: { libraryVersionSortKey: libraryVersionKeyExpr() } }, { $sort: sortSpec(sort) }])
        : await ErrorReport.find({}).sort(sortSpec(sort)).lean();
      const visited = [];
      let current = nav.ids[0];
      while (current && visited.length < 301) {
        visited.push(current);
        if (neighbors(nav, current).needMore) {
          nav = appendPage(nav, await page({ sort, limit: 100, cursor: nav.nextCursor }));
        }
        if (close === 'all' || visited.length <= 10) {
          await ErrorReport.updateOne({ _id: current }, { $set: { state: 'closed_rejected' } });
        }
        const pos = neighbors(nav, current);
        assert.equal(pos.prevId, visited.at(-2) ?? null);
        current = pos.nextId;
        // Remounting the detail page restores exactly this navigation state.
        const storage = { value: '', setItem(_key, value) { this.value = value; }, getItem() { return this.value; } };
        writeNavList(storage, nav);
        nav = readNavList(storage);
      }
      assert.deepEqual(visited, expected.map((row) => String(row._id)));
      assert.equal(nav.total, 300);
      assert.equal(nav.hasMore, false);
    });
  }
}

test('cursor retains filters and works after deleting its anchor and inserting a newer report', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ErrorReport.collection.insertMany(Array.from({ length: 12 }, (_, i) => report(i)));
  const query = { sort: 'newest', limit: 3, source: 'MoreBooks', kind: 'free_text', book: 'book' };
  const expected = (await ErrorReport.find({}).sort(sortSpec('newest')).lean()).map((r) => String(r._id));
  const first = await page(query);
  await ErrorReport.deleteOne({ _id: first.items.at(-1).id });
  await ErrorReport.collection.insertMany([
    { ...report(100), createdAt: new Date('2027-01-01') },
    { ...report(101), sourceFolder: 'Elsewhere' },
  ]);
  const next = await page({ ...query, cursor: first.nextCursor });
  assert.deepEqual(next.items.map((r) => r.id), expected.slice(3, 6));
  assert.equal((await listReports({ user, query: { sort: 'oldest', cursor: first.nextCursor } })).status, 400);
  assert.equal((await listReports({ user, query: { cursor: 'invalid' } })).status, 400);
});

test('cursor ordering includes legacy missing dates and null version keys in every sort', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const rows = Array.from({ length: 9 }, (_, i) => report(i));
  rows[0].createdAt = null;
  delete rows[1].createdAt;
  await ErrorReport.collection.insertMany(rows);
  for (const sort of ['oldest', 'newest', 'version']) {
    const expected = (await ErrorReport.find({}).sort(sortSpec(sort)).lean()).map((r) => String(r._id));
    let result = await page({ sort, limit: 1 });
    const found = result.items.map((r) => r.id);
    while (result.hasMore && found.length < 10) {
      result = await page({ sort, limit: 1, cursor: result.nextCursor });
      found.push(...result.items.map((r) => r.id));
    }
    assert.deepEqual(found, expected, sort);
  }
});

test('backfilled cursor continuation uses the version index without scanning previous pages', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await ErrorReport.collection.insertMany(Array.from({ length: 3000 }, (_, i) => report(i)));
  const first = await page({ sort: 'version', skip: 1400, limit: 100 });
  const boundary = afterReportCursor(parseReportCursor(first.nextCursor, 'version'), 'version');
  const filter = { $and: [LIST_FILTERS.queued(user, new Date()), boundary], libraryVersionSortSchema: 1 };
  const plan = await ErrorReport.find(filter).sort(sortSpec('version')).limit(101).explain('executionStats');
  assert.equal(plan.executionStats.nReturned, 101);
  assert.ok(plan.executionStats.totalDocsExamined <= 110, JSON.stringify({ docs: plan.executionStats.totalDocsExamined, keys: plan.executionStats.totalKeysExamined }));
  assert.doesNotMatch(JSON.stringify(plan.queryPlanner.winningPlan), /"stage":"SORT"/);
});
