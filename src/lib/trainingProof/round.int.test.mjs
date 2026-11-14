/**
 * הסבב של 30, הדופק והסימונים (round.js) והמונים (stats.js) מול MongoDB אמיתי:
 * תפיסה אטומית בלי כפילויות גם בבקשות מקבילות, חבילה מושהית, דופק שפסק,
 * יציאה מהדף, "דלג", סימון שנשמר מיד, ו"ההגהות שלי". הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import TrainingProofItem from '../../models/TrainingProofItem.js';
import TrainingProofPackage from '../../models/TrainingProofPackage.js';
import TrainingProofVolunteer from '../../models/TrainingProofVolunteer.js';
import { takeRound, currentRound, heartbeat, releaseRound, markItem, sweepExpired } from './round.js';
import { volunteerStats, archiveDelta, applyArchive } from './stats.js';
import { itemDoc } from './storage.js';
import { manifestOf, ocrItem, routerItem } from './testFixtures.js';
import { HOLD_MS, ROUND_SIZE } from './vocab.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

const A = new mongoose.Types.ObjectId().toString();
const B = new mongoose.Types.ObjectId().toString();
const MIN = 60 * 1000;

async function seed(section, n, { packageId = 'tp-20261027-1f3a9c2e', part = 1, open = true } = {}) {
  const m = manifestOf(section, { package_id: packageId, part, parts: Math.max(part, 1), counts: { items: n } });
  await TrainingProofPackage.create({ packageId, part, parts: m.parts, section, stationId: m.station_id, open });
  const make = section === 'ocr' ? ocrItem : routerItem;
  const docs = Array.from({ length: n }, (_, i) => itemDoc(m, make(i + part * 10000)));
  await TrainingProofItem.insertMany(docs);
}

beforeEach(async () => {
  if (!db.skip) await db.reset();
});

test('סבב: 30 פריטים, כולם held אצל המתנדב, באותו סבב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 50);
  const r = await takeRound(A, 'ocr');
  assert.equal(r.ok, true);
  assert.equal(r.items.length, ROUND_SIZE);
  assert.equal(r.resumed, false);
  const held = await TrainingProofItem.countDocuments({ heldBy: A, status: 'held', round: r.round });
  assert.equal(held, ROUND_SIZE);
  // הסבב הנוכחי — באותו סדר אחרי "רענון"
  const cur = await currentRound(A, 'ocr');
  assert.deepEqual(cur.items.map((d) => String(d._id)), r.items.map((d) => String(d._id)));
  assert.equal(cur.open, ROUND_SIZE);
});

test('"קח 30 נוספות" לפני שסיים — מחזיר את הסבב הקיים, לא תופס עוד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 80);
  const r1 = await takeRound(A, 'ocr');
  const r2 = await takeRound(A, 'ocr');
  assert.equal(r2.resumed, true);
  assert.equal(r2.round, r1.round);
  assert.equal(await TrainingProofItem.countDocuments({ heldBy: A }), ROUND_SIZE);
});

test('שני מתנדבים במקביל — אין פריט אצל שניהם; מאגר קטן מתחלק בלי כפילות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 40);
  const [ra, rb] = await Promise.all([takeRound(A, 'ocr'), takeRound(B, 'ocr')]);
  const ids = [...ra.items, ...rb.items].map((d) => String(d._id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 40);
});

test('שתי בקשות "סבב חדש" במקביל מאותו מתנדב — סבב אחד, עד 30, העודף חוזר למאגר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 15);
  const [r1, r2] = await Promise.all([takeRound(A, 'ocr'), takeRound(A, 'ocr')]);
  assert.equal(r1.round, r2.round);
  assert.equal(r1.items.length, 15);
  assert.equal(new Set((await TrainingProofItem.find({ heldBy: A }).lean()).map((d) => d.round)).size, 1);

  await db.reset();
  await seed('ocr', 80);
  const [x, y, z] = await Promise.all([takeRound(A, 'ocr'), takeRound(A, 'ocr'), takeRound(A, 'ocr')]);
  assert.equal(new Set([x.round, y.round, z.round]).size, 1);
  assert.equal(await TrainingProofItem.countDocuments({ heldBy: A, status: 'held' }), ROUND_SIZE);
  assert.equal(await TrainingProofItem.countDocuments({ status: 'available' }), 80 - ROUND_SIZE);
});

test('חבילה מושהית — לא מחולקת; חלק אחר — לא מתערבב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 10, { part: 1, open: false });
  await seed('ocr', 5, { part: 2 });
  await seed('router', 5, { packageId: 'tp-20261027-77aa0e10' });
  const r = await takeRound(A, 'ocr');
  assert.equal(r.items.length, 5);
  assert.ok(r.items.every((d) => d.part === 2 && d.section === 'ocr'));
});

test('דופק: מאריך; דופק שפסק — הפריטים פנויים לאחר; דופק מאוחר מחזיר את מה שאיש לא לקח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 30);
  const t0 = new Date();
  await takeRound(A, 'ocr', { now: t0, size: 10 });
  const t1 = new Date(t0.getTime() + 2 * MIN);
  assert.equal(await heartbeat(A, 'ocr', t1), 10);
  const one = await TrainingProofItem.findOne({ heldBy: A }).lean();
  assert.equal(one.heldUntil.getTime(), t1.getTime() + HOLD_MS);

  // A נעלם (הדופק פסק) — אחרי 3 דקות B מקבל גם את שלו
  const late = new Date(t1.getTime() + HOLD_MS + 1000);
  const rb = await takeRound(B, 'ocr', { now: late, size: 30 });
  assert.equal(rb.items.length, 30);
  assert.equal(await heartbeat(A, 'ocr', late), 0);
  const curA = await currentRound(A, 'ocr');
  assert.equal(curA.items.length, 0);
});

test('sweepExpired משחרר רק held שזמנו עבר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 4);
  const t0 = new Date();
  await takeRound(A, 'ocr', { now: t0, size: 2 });
  assert.equal(await sweepExpired('ocr', new Date(t0.getTime() + MIN)), 0);
  assert.equal(await sweepExpired('ocr', new Date(t0.getTime() + HOLD_MS + 1)), 2);
  assert.equal(await TrainingProofItem.countDocuments({ status: 'available' }), 4);
});

test('יציאה מהדף: מה שלא סומן חוזר; מה שסומן נשאר submitted', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 10);
  const r = await takeRound(A, 'ocr', { size: 5 });
  const m = await markItem(A, r.items[0]._id, { action: 'ok' });
  assert.equal(m.ok, true);
  assert.equal(await releaseRound(A, 'ocr'), 4);
  assert.equal(await TrainingProofItem.countDocuments({ status: 'submitted', vol: A }), 1);
  assert.equal(await TrainingProofItem.countDocuments({ status: 'available' }), 9);
});

test('סימון: נשמר מיד, אפשר לשנות עד הסקירה, לא של מתנדב אחר; הסבב נגמר כשהכול סומן', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 3);
  const r = await takeRound(A, 'ocr', { size: 3 });
  const [x, y, z] = r.items;
  assert.equal((await markItem(A, x._id, { action: 'fixed', text: 'טקסט מתוקן' })).item.result.text, 'טקסט מתוקן');
  assert.equal((await markItem(A, x._id, { action: 'bad' })).item.result.action, 'bad');
  const other = await markItem(B, y._id, { action: 'ok' });
  assert.equal(other.ok, false);
  assert.equal(other.status, 409);
  assert.equal((await markItem(A, y._id, { action: 'fixed', text: '' })).status, 400);
  await markItem(A, y._id, { action: 'router' });
  let cur = await currentRound(A, 'ocr');
  assert.equal(cur.done, false);
  await markItem(A, z._id, { action: 'seg' });
  cur = await currentRound(A, 'ocr');
  assert.equal(cur.done, true);
  assert.equal(cur.items.length, 3);
  // אחרי הסקירה — כבר לא משנים
  await TrainingProofItem.updateOne({ _id: x._id }, { $set: { status: 'approved', reviewedAt: new Date() } });
  assert.equal((await markItem(A, x._id, { action: 'ok' })).status, 409);
  // סבב חדש — רק אחרי שסיים
  const next = await takeRound(A, 'ocr');
  assert.equal(next.resumed, false);
});

test('"דלג": הפריט חוזר למאגר, ואותו מתנדב לא יקבל אותו שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 1);
  const r = await takeRound(A, 'ocr');
  const s = await markItem(A, r.items[0]._id, { action: 'skip' });
  assert.equal(s.skipped, true);
  const d = await TrainingProofItem.findById(r.items[0]._id).lean();
  assert.equal(d.status, 'available');
  assert.equal(d.heldBy, null);
  assert.equal((await takeRound(A, 'ocr')).items.length, 0);
  assert.equal((await takeRound(B, 'ocr')).items.length, 1);
});

test('נתב, "דלג": השורה חוזרת למאגר בלי תוצאה, ואותו מתנדב לא יקבל אותה שוב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('router', 1);
  const r = await takeRound(A, 'router');
  const s = await markItem(A, r.items[0]._id, { skip: true });
  assert.equal(s.skipped, true);
  const d = await TrainingProofItem.findById(r.items[0]._id).lean();
  assert.equal(d.status, 'available');
  assert.equal(d.heldBy, null);
  assert.equal(d.result, null);
  assert.equal((await takeRound(A, 'router')).items.length, 0);
  assert.equal((await takeRound(B, 'router')).items.length, 1);
});

test('נתב: סימון מעורבת עם מילים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('router', 2);
  const r = await takeRound(A, 'router');
  const it = r.items.find((d) => d.payload.words);
  const words = it.payload.words.map((w) => ({ k: w.k, box: w.box, label: 'rashi' }));
  const m = await markItem(A, it._id, { label: 'mixed', words });
  assert.equal(m.item.result.words_src, 'station');
  assert.equal((await markItem(A, it._id, { label: 'banana' })).status, 400);
});

test('ההגהות שלי: ממתינות, אושרו, נדחו, שיעור התאמה — גם אחרי שהחומר ירד ונמחק', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed('ocr', 4);
  await TrainingProofVolunteer.create({ userId: A, status: 'approved' });
  const r = await takeRound(A, 'ocr');
  for (const d of r.items) await markItem(A, d._id, { action: 'ok' });
  const [a, b, c] = r.items.map((d) => d._id);
  await TrainingProofItem.updateOne({ _id: a }, { $set: { status: 'approved', reviewedAt: new Date() } });
  await TrainingProofItem.updateOne({ _id: b }, { $set: { status: 'approved', reviewedAt: new Date(), adminFixed: true } });
  // דחייה (כמו שמסך הניהול עושה): חוזר למאגר, המתנדב ב-notFor וב-rejectedFor
  await TrainingProofItem.updateOne(
    { _id: c },
    { $set: { status: 'available', result: null, vol: null, heldBy: null, round: null }, $addToSet: { notFor: A, rejectedFor: A } }
  );
  let s = await volunteerStats(A);
  assert.deepEqual(
    { saved: s.ocr.saved, pending: s.ocr.pending, approved: s.ocr.approved, rejected: s.ocr.rejected },
    { saved: 4, pending: 1, approved: 2, rejected: 1 }
  );
  assert.equal(s.ocr.match, 1 / 3);
  assert.equal(s.router.saved, 0);

  // ההורדה: קודם המונים נשמרים, ואז הפריטים נמחקים — והמספרים לא משתנים
  const gone = await TrainingProofItem.find({ $or: [{ status: 'approved' }, { rejectedFor: { $ne: [] } }] }).lean();
  await applyArchive(archiveDelta(gone));
  await TrainingProofItem.deleteMany({ _id: { $in: gone.map((d) => d._id) } });
  s = await volunteerStats(A);
  assert.deepEqual([s.ocr.saved, s.ocr.approved, s.ocr.unchanged, s.ocr.rejected], [4, 2, 1, 1]);
});
