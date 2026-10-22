/**
 * בדיקות אינטגרציה למיגרציית active / book_active_unique (ocrJobMigration.js) מול MongoDB
 * אמיתי. כל בדיקה מתחילה ממצב "לפני המיגרציה": רק האינדקס הישן { book:1 } partial
 * { status:'running' } ורשומות בלי active. הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OcrJob from '../../models/OcrJob.js';
import {
  backfillActive,
  findDuplicateActive,
  swapActiveIndex,
  migrateOcrLocal,
  planIndexChanges,
  isLegacyBookIndex,
} from './ocrJobMigration.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

const coll = () => OcrJob.collection;
const oid = () => new mongoose.Types.ObjectId();

beforeEach(async () => {
  if (db.skip) return;
  await coll().deleteMany({});
  await coll().dropIndexes();
  await coll().createIndex(
    { book: 1 },
    { name: 'book_1', unique: true, partialFilterExpression: { status: 'running' } }
  );
});

// רשומה "ישנה" כפי שנשמרה לפני הוספת active (insert ישיר — בלי ברירות מחדל של Mongoose)
function legacy(book, status, extra = {}) {
  return { book, method: 'ocrwin', status, createdAt: new Date(), ...extra };
}

async function indexNames() {
  return (await coll().indexes()).map((i) => i.name).sort();
}

test('planIndexChanges / isLegacyBookIndex (טהור)', () => {
  const legacyIdx = { name: 'book_1', key: { book: 1 }, unique: true, partialFilterExpression: { status: 'running' } };
  const otherBook = { name: 'book_x', key: { book: 1 } };
  assert.equal(isLegacyBookIndex(legacyIdx), true);
  assert.equal(isLegacyBookIndex(otherBook), false);
  const plan = planIndexChanges([{ name: '_id_', key: { _id: 1 } }, legacyIdx, otherBook]);
  assert.deepEqual(plan.toDrop, ['book_1']);
  assert.deepEqual(plan.toCreate, [
    'book_active_unique',
    'requestId_unique',
    'method_1_workerId_1_active_1__id_1',
    'method_1_active_1_ackAt_1',
  ]);
});

test('backfill: running → active:true, completed → active:false; dry-run לא משנה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const [b1, b2] = [oid(), oid()];
  await coll().insertMany([
    legacy(b1, 'running'),
    legacy(b1, 'completed'),
    legacy(b2, 'failed'),
    { book: b2, method: 'local', status: 'queued', active: true },
  ]);

  const dry = await backfillActive({ apply: false });
  assert.deepEqual(dry, { missing: 3, toActiveTrue: 1, toActiveFalse: 2, modified: 0, applied: false });
  assert.equal(await coll().countDocuments({ active: { $exists: false } }), 3);

  const res = await backfillActive({ apply: true });
  assert.equal(res.modified, 3);
  assert.equal(res.applied, true);
  assert.equal((await coll().findOne({ book: b1, status: 'running' })).active, true);
  assert.equal((await coll().findOne({ book: b1, status: 'completed' })).active, false);
  assert.equal((await coll().findOne({ book: b2, status: 'failed' })).active, false);
  // רשומה שכבר הייתה עם active לא נגעו בה
  assert.equal((await coll().findOne({ book: b2, status: 'queued' })).active, true);

  const again = await backfillActive({ apply: true });
  assert.equal(again.missing, 0);
  assert.equal(again.modified, 0);
});

test('זיהוי כפילות: running ישן בלי active + עבודה חדשה active לאותו ספר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  const older = new Date('2026-01-01');
  const newer = new Date('2026-02-01');
  await coll().insertMany([
    legacy(book, 'running', { createdAt: older }),
    { book, method: 'local', status: 'queued', active: true, createdAt: newer },
    legacy(oid(), 'running'),
  ]);
  const dups = await findDuplicateActive();
  assert.equal(dups.length, 1);
  assert.equal(dups[0].book, String(book));
  assert.equal(dups[0].count, 2);
  // החדשה ראשונה (היא שתישמר)
  assert.equal(dups[0].jobs[0].status, 'queued');
  assert.equal(dups[0].jobs[1].status, 'running');
});

test('כפילויות בלי --fail-older-duplicates: עוצר ולא משנה דבר (גם ב---apply)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  await coll().insertMany([
    legacy(book, 'running', { createdAt: new Date('2026-01-01') }),
    { book, method: 'local', status: 'queued', active: true, createdAt: new Date('2026-02-01') },
    legacy(oid(), 'completed'),
  ]);
  const before = await indexNames();
  const res = await migrateOcrLocal({ apply: true });
  assert.equal(res.ok, false);
  assert.equal(res.stoppedAt, 'duplicates');
  assert.equal(res.duplicates.length, 1);
  assert.deepEqual(await indexNames(), before);
  assert.equal(await coll().countDocuments({ active: { $exists: false } }), 2);

  // swapActiveIndex לבדו גם מסרב
  const swap = await swapActiveIndex({ apply: true });
  assert.equal(swap.ok, false);
  assert.equal(swap.reason, 'duplicates');
  assert.deepEqual(await indexNames(), before);
});

test('--fail-older-duplicates: הישנה מסומנת failed + active:false, החדשה נשמרת, האינדקס מוחלף', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  await coll().insertMany([
    legacy(book, 'running', { createdAt: new Date('2026-01-01') }),
    { book, method: 'local', status: 'queued', active: true, createdAt: new Date('2026-02-01') },
  ]);

  // dry-run: מדווח מה ייעשה, לא משנה
  const dry = await migrateOcrLocal({ apply: false, failOlder: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.changes, true);
  assert.equal(dry.duplicateFix.jobIds.length, 1);
  assert.equal(await coll().countDocuments({ status: 'failed' }), 0);
  assert.ok((await indexNames()).includes('book_1'));

  const res = await migrateOcrLocal({ apply: true, failOlder: true });
  assert.equal(res.ok, true);
  assert.equal(res.duplicateFix.modified, 1);
  const old = await coll().findOne({ book, method: 'ocrwin' });
  assert.equal(old.status, 'failed');
  assert.equal(old.active, false);
  assert.ok(old.error.length > 0);
  const kept = await coll().findOne({ book, method: 'local' });
  assert.equal(kept.status, 'queued');
  assert.equal(kept.active, true);
  assert.ok((await indexNames()).includes('book_active_unique'));
  assert.equal((await indexNames()).includes('book_1'), false);
});

test('החלפת האינדקס: dry-run לא נוגע; apply → שתי active לאותו ספר נכשלות ב-11000, שתי completed לא; הרצה שנייה לא עושה כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const book = oid();
  await coll().insertMany([legacy(book, 'running'), legacy(book, 'completed'), legacy(oid(), 'cancelled')]);

  const dry = await migrateOcrLocal({ apply: false });
  assert.equal(dry.ok, true);
  assert.equal(dry.applied, false);
  assert.equal(dry.changes, true);
  assert.deepEqual(dry.index.toDrop, ['book_1']);
  assert.ok(dry.index.toCreate.includes('book_active_unique'));
  assert.deepEqual(await indexNames(), ['_id_', 'book_1']);
  assert.equal(await coll().countDocuments({ active: { $exists: false } }), 3);

  const res = await migrateOcrLocal({ apply: true });
  assert.equal(res.ok, true);
  assert.equal(res.applied, true);
  assert.deepEqual(res.index.dropped, ['book_1']);
  assert.deepEqual(res.backfill.modified, 3);

  const indexes = await coll().indexes();
  assert.equal(indexes.some(isLegacyBookIndex), false);
  const active = indexes.find((i) => i.name === 'book_active_unique');
  assert.deepEqual(active.key, { book: 1 });
  assert.equal(active.unique, true);
  assert.deepEqual(active.partialFilterExpression, { active: true });
  const req = indexes.find((i) => i.name === 'requestId_unique');
  assert.equal(req.unique, true);
  assert.deepEqual(req.partialFilterExpression, { requestId: { $type: 'string' } });
  assert.ok(indexes.some((i) => i.name === 'method_1_workerId_1_active_1__id_1'));
  assert.ok(indexes.some((i) => i.name === 'method_1_active_1_ackAt_1'));

  // הרשומה הישנה ב-running קיבלה active:true — עבודה פעילה נוספת לאותו ספר נחסמת
  await assert.rejects(
    () => coll().insertOne({ book, method: 'local', status: 'queued', active: true }),
    (err) => err.code === 11000
  );
  const b2 = oid();
  await coll().insertOne({ book: b2, method: 'local', status: 'queued', active: true });
  await assert.rejects(
    () => coll().insertOne({ book: b2, method: 'ocrwin', status: 'running', active: true }),
    (err) => err.code === 11000
  );
  // שתי עבודות שהסתיימו לאותו ספר — מותר
  const b3 = oid();
  await coll().insertOne({ book: b3, method: 'ocrwin', status: 'completed', active: false });
  await coll().insertOne({ book: b3, method: 'ocrwin', status: 'completed', active: false });
  // requestId ייחודי רק כשקיים
  await coll().insertOne({ book: oid(), method: 'local', status: 'completed', active: false, requestId: 'req-aaaaaaaa' });
  await assert.rejects(
    () => coll().insertOne({ book: oid(), method: 'local', status: 'completed', active: false, requestId: 'req-aaaaaaaa' }),
    (err) => err.code === 11000
  );

  const before = await indexNames();
  const again = await migrateOcrLocal({ apply: true });
  assert.equal(again.ok, true);
  assert.equal(again.changes, false);
  assert.deepEqual(again.index.dropped, []);
  assert.deepEqual(again.index.created, []);
  assert.equal(again.backfill.modified, 0);
  assert.deepEqual(await indexNames(), before);

  const dryAgain = await migrateOcrLocal({ apply: false });
  assert.equal(dryAgain.changes, false);
});

test('autoIndex כבר יצר את book_active_unique לצד הישן: המיגרציה מוחקת רק את הישן', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await coll().deleteMany({});
  await coll().dropIndexes();
  await coll().createIndex(
    { book: 1 },
    { name: 'book_1', unique: true, partialFilterExpression: { status: 'running' } }
  );
  await coll().createIndex(
    { book: 1 },
    { name: 'book_active_unique', unique: true, partialFilterExpression: { active: true } }
  );
  await coll().insertOne(legacy(oid(), 'running'));
  const res = await migrateOcrLocal({ apply: true });
  assert.equal(res.ok, true);
  assert.deepEqual(res.index.dropped, ['book_1']);
  assert.equal(res.index.created.includes('book_active_unique'), false);
  assert.equal(res.backfill.modified, 1);
  const names = await indexNames();
  assert.ok(names.includes('book_active_unique'));
  assert.equal(names.includes('book_1'), false);
});

test('DB ריק (האוסף לא קיים): dry-run מדווח שאין מה למחוק, apply יוצר את האינדקסים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await coll().drop();
  const dry = await migrateOcrLocal({ apply: false });
  assert.equal(dry.ok, true);
  assert.deepEqual(dry.index.toDrop, []);
  assert.equal(dry.backfill.missing, 0);
  const res = await migrateOcrLocal({ apply: true });
  assert.equal(res.ok, true);
  assert.ok((await indexNames()).includes('book_active_unique'));
});
