/**
 * גלאי האזורים מול MongoDB אמיתי (framesDb.js): רשימת הספרים ומצביהם, תפיסת ספר ל-48 שעות (אטומית גם
 * בבקשות מקבילות; ספר אחד למתנדב), שחרור ו"הופסק באמצע", ספר שהזמן שלו עבר, שמירה מיידית של טיוטה
 * ו"העמוד נכון", מתנדב שממשיך ורואה את מה שסומן, זרם שנוסף, עמוד שאושר, והתוצאה בקובץ-ההחזרה (§5.3).
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import TrainingProofItem from '../../../../../models/TrainingProofItem.js';
import TrainingProofBook from '../../../../../models/TrainingProofBook.js';
import TrainingProofPackage from '../../../../../models/TrainingProofPackage.js';
import User from '../../../../../models/User.js';
import { itemDoc } from '../../../../../lib/trainingProof/storage.js';
import { manifestOf, framesItem, BOOKS } from '../../../../../lib/trainingProof/testFixtures.js';
import { BOOK_CLAIM_MS } from '../../../../../lib/trainingProof/vocab.js';
import { buildReturnZip, checkReturnLine } from '../../../../../lib/trainingProof/returnFile.js';
import { startMongo } from '../../../../../lib/corrections/testing/mongo.js';
import { listBooks, claimBook, releaseBook, bookDetail, savePage, addStream, setStreamKind, pageImagePath, sweepBooks } from './framesDb.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

const A = new mongoose.Types.ObjectId().toString();
const B = new mongoose.Types.ObjectId().toString();
const KEY = BOOKS[0].book;
const HOUR = 3600 * 1000;
const T0 = new Date('2026-10-28T10:00:00Z');

async function seed({ n = 4, open = true } = {}) {
  const m = manifestOf('frames', { counts: { items: n } });
  await TrainingProofPackage.create({ packageId: m.package_id, part: 1, parts: 1, section: 'frames', stationId: m.station_id, open });
  await TrainingProofItem.insertMany(Array.from({ length: n }, (_, i) => itemDoc(m, framesItem(n - 1 - i))));
  const b = BOOKS[0];
  await TrainingProofBook.create({ book: b.book, alias: b.alias, kind: b.kind, streams: b.streams, pagesTotal: n });
  await User.collection.insertMany([
    { _id: new mongoose.Types.ObjectId(A), name: 'מתנדב א', email: 'a@x' },
    { _id: new mongoose.Types.ObjectId(B), name: 'מתנדב ב', email: 'b@x' },
  ]);
}

beforeEach(async () => {
  if (!db.skip) await db.reset();
});

const marked = (frames) => ({ status: 'marked', frames });
const stateOf = async (u, now = T0) => (await listBooks(u, now)).books[0];

test('רשימה: פנוי → אצלך / בעבודה אצל …', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  assert.equal((await stateOf(A)).state, 'free');
  const c = await claimBook(A, KEY, T0);
  assert.equal(c.ok, true);
  assert.equal(new Date(c.claimedUntil).getTime(), T0.getTime() + BOOK_CLAIM_MS);
  assert.equal((await stateOf(A)).state, 'mine');
  const forB = await stateOf(B);
  assert.equal(forB.state, 'taken');
  assert.equal(forB.who, 'מתנדב א');
  assert.equal(forB.pages, 4);
});

test('שני מתנדבים לוקחים במקביל — רק אחד מקבל', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  const rs = await Promise.all([claimBook(A, KEY, T0), claimBook(B, KEY, T0)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(rs.find((r) => !r.ok).status, 409);
});

test('ספר אחד למתנדב בבת אחת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await TrainingProofBook.create({ book: 'b-0000000001', alias: 'ספר 12', streams: [] });
  const m = manifestOf('frames', { package_id: 'tp-20261027-00000001' });
  await TrainingProofItem.create(itemDoc(m, framesItem(9, { uid: 'frames:fpages:999', book: 'b-0000000001' })));
  assert.equal((await claimBook(A, 'b-0000000001', T0)).ok, true);
  const r = await claimBook(A, KEY, T0);
  assert.equal(r.status, 409);
  assert.match(r.error, /ספר 12/);
});

test('עמודי הספר: רק למי שמחזיק אותו (ולמנהל), לפי סדר העמודים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  assert.equal((await bookDetail(A, KEY, { now: T0 })).status, 403);
  await claimBook(A, KEY, T0);
  const d = await bookDetail(A, KEY, { now: T0 });
  assert.equal(d.ok, true);
  assert.deepEqual(d.pages.map((p) => p.page), [1, 2, 3, 4]);
  assert.equal(d.pages[0].state, 'proposed');
  assert.ok(d.pages[0].frames.every((f) => f.src === 'auto'));
  assert.equal(d.book.mine, true);
  assert.equal('sig' in d.pages[0], false);
  assert.equal((await bookDetail(B, KEY, { now: T0 })).status, 403);
  assert.equal((await bookDetail(B, KEY, { now: T0, isAdmin: true })).ok, true);
  // התמונה — באותם כללים
  const id = d.pages[0].id;
  assert.equal((await pageImagePath(A, id, { now: T0 })).ok, true);
  assert.equal((await pageImagePath(B, id, { now: T0 })).status, 403);
  assert.equal((await pageImagePath(B, id, { now: T0, isAdmin: true })).ok, true);
});

test('כל שינוי נשמר מיד כטיוטה; "העמוד נכון" — בצורה של קובץ-ההחזרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await claimBook(A, KEY, T0);
  const [p1] = (await bookDetail(A, KEY, { now: T0 })).pages;
  const moved = p1.frames.map((f) => (f.fid === 'f2' ? { ...f, box: [880, 270, 1510, 2240], src: 'human' } : f));
  const d = await savePage(A, p1.id, { status: 'draft', frames: moved }, { now: T0 });
  assert.equal(d.ok, true);
  assert.equal(d.page.state, 'draft');
  let doc = await TrainingProofItem.findById(p1.id).lean();
  assert.equal(doc.status, 'held');
  assert.equal(String(doc.heldBy), A);
  assert.equal(doc.vol, null);
  assert.deepEqual(doc.result.frames.map((f) => f.src), ['auto', 'human', 'auto']);
  assert.equal((await stateOf(A)).draft, 1);

  const m = await savePage(A, p1.id, marked(moved), { now: T0 });
  assert.equal(m.page.state, 'marked');
  doc = await TrainingProofItem.findById(p1.id).lean();
  assert.equal(doc.status, 'submitted');
  assert.equal(String(doc.vol), A);
  assert.deepEqual(Object.keys(doc.result).sort(), ['frames', 'status', 'streams_added']);
  // כמו שהמנהל יאשר ויוריד: השורה בקובץ-ההחזרה תקינה
  const approved = { ...doc, status: 'approved', reviewedAt: T0 };
  const { lines } = buildReturnZip('frames', [approved], { stationOf: () => 'st-6b1e0d5a', now: T0 });
  assert.equal(checkReturnLine('frames', lines[0]), null);
  assert.equal(lines[0].status, 'marked');
  assert.deepEqual(lines[0].frames[1], { fid: 'f2', kind: 'text', role: 'body', box: [880, 270, 1510, 2240], stream: 's1', ord: 2, cont: true });
});

test('שינוי בעמוד שכבר אושר בידי המתנדב — חוזר לטיוטה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await claimBook(A, KEY, T0);
  const [p1] = (await bookDetail(A, KEY, { now: T0 })).pages;
  await savePage(A, p1.id, marked(p1.frames), { now: T0 });
  await savePage(A, p1.id, { status: 'draft', frames: p1.frames.slice(1) }, { now: T0 });
  const doc = await TrainingProofItem.findById(p1.id).lean();
  assert.equal(doc.status, 'held');
  assert.equal(doc.vol, null);
});

test('בלי הספר — אי-אפשר לשמור; עמוד שהמנהל אישר — קריאה בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await claimBook(A, KEY, T0);
  const [p1, p2] = (await bookDetail(A, KEY, { now: T0 })).pages;
  assert.equal((await savePage(B, p1.id, { status: 'draft', frames: [] }, { now: T0 })).status, 409);
  await TrainingProofItem.updateOne({ _id: p2.id }, { $set: { status: 'approved', reviewedAt: T0, vol: new mongoose.Types.ObjectId(A) } });
  const r = await savePage(A, p2.id, { status: 'draft', frames: [] }, { now: T0 });
  assert.equal(r.status, 409);
  assert.match(r.error, /אישר/);
  // סימון לא תקין — 400
  assert.equal((await savePage(A, p1.id, { status: 'marked', frames: [{ fid: 'x', role: 'body', kind: 'text', box: [0, 0, 1, 1], ord: null }] }, { now: T0 })).status, 400);
});

test('שחרור → "הופסק באמצע — N עמודים בידי …"; מי שממשיך רואה את מה שסומן', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await claimBook(A, KEY, T0);
  const [p1, p2] = (await bookDetail(A, KEY, { now: T0 })).pages;
  await savePage(A, p1.id, marked(p1.frames.slice(0, 2)), { now: T0 });
  await savePage(A, p2.id, { status: 'draft', frames: p2.frames.slice(1) }, { now: T0 });
  assert.equal((await releaseBook(B, KEY)).status, 409);
  assert.equal((await releaseBook(A, KEY)).ok, true);
  const st = await stateOf(B);
  assert.equal(st.state, 'partial');
  assert.equal(st.worked, 2);
  assert.equal(st.workedBy, 'מתנדב א');
  assert.equal((await claimBook(B, KEY, T0)).ok, true);
  const d = await bookDetail(B, KEY, { now: T0 });
  assert.equal(d.pages[0].state, 'marked');
  assert.equal(d.pages[0].by, 'מתנדב א');
  assert.equal(d.pages[0].frames.length, 2);
  assert.equal(d.pages[1].state, 'draft');
  assert.equal(d.pages[1].frames.length, 2);
  // B מתקן עמוד ש-A אישר ומאשר שוב — עכשיו הוא של B
  const fix = await savePage(B, d.pages[0].id, marked(d.pages[0].frames), { now: T0 });
  assert.equal(fix.page.by, 'you');
});

test('48 שעות עברו — הספר חוזר לרשימה, ו-lastBy = מי שהחזיק', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  await claimBook(A, KEY, T0);
  const [p1] = (await bookDetail(A, KEY, { now: T0 })).pages;
  await savePage(A, p1.id, marked(p1.frames), { now: T0 });
  const late = new Date(T0.getTime() + BOOK_CLAIM_MS + HOUR);
  assert.equal((await savePage(A, p1.id, marked(p1.frames), { now: late })).status, 409);
  const st = await stateOf(B, late);
  assert.equal(st.state, 'partial');
  const book = await TrainingProofBook.findOne({ book: KEY }).lean();
  assert.equal(String(book.lastBy), A);
  assert.equal(book.claimedBy, null);
  assert.equal(await sweepBooks(late), 0);
  assert.equal((await claimBook(B, KEY, late)).ok, true);
});

test('זרם שנוסף לספר — נכנס ל-streams_added של עמוד שמשתמש בו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed();
  assert.equal((await addStream(A, KEY, { name: 'הגהות', role: 'notes' }, T0)).status, 409);
  await claimBook(A, KEY, T0);
  const s = await addStream(A, KEY, { name: 'הגהות', role: 'notes' }, T0);
  assert.equal(s.ok, true);
  assert.equal(s.stream.id, 'x1');
  assert.deepEqual(s.streams.at(-1), { id: 'x1', name: 'הגהות', role: 'notes', added: true });
  assert.equal((await addStream(A, KEY, { name: 'הגהות', role: 'notes' }, T0)).status, 400);
  const [p1] = (await bookDetail(A, KEY, { now: T0 })).pages;
  const fr = [...p1.frames, { fid: 'n1', kind: 'text', role: 'notes', box: [100, 2300, 900, 2400], stream: 'x1', ord: 3, cont: false }];
  const m = await savePage(A, p1.id, marked(fr), { now: T0 });
  assert.equal(m.ok, true);
  const doc = await TrainingProofItem.findById(p1.id).lean();
  assert.deepEqual(doc.result.streams_added, [{ id: 'x1', name: 'הגהות', role: 'notes' }]);
});

test('סוג של זרם שנוסף משתנה בכל העמודים שלו; זרם מהתחנה ועמוד שאושר — לא', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ n: 3 });
  await claimBook(A, KEY, T0);
  await addStream(A, KEY, { name: 'הגהות', role: 'notes' }, T0);
  const pages = (await bookDetail(A, KEY, { now: T0 })).pages;
  const add = (p, k) => [...p.frames, { fid: 'n1', kind: 'text', role: 'notes', box: [100, 2300 + k, 900, 2400], stream: 'x1', ord: 9, cont: false }];
  await savePage(A, pages[0].id, marked(add(pages[0], 0)), { now: T0 });
  await savePage(A, pages[1].id, { status: 'draft', frames: add(pages[1], 1) }, { now: T0 });
  assert.equal((await setStreamKind(A, KEY, 's1', { role: 'heading' }, T0)).status, 400);
  assert.equal((await setStreamKind(B, KEY, 'x1', { role: 'commentary' }, T0)).status, 409);
  const r = await setStreamKind(A, KEY, 'x1', { role: 'commentary' }, T0);
  assert.equal(r.ok, true);
  assert.equal(r.pages, 2);
  assert.equal(r.streams.find((s) => s.id === 'x1').role, 'commentary');
  const d0 = await TrainingProofItem.findById(pages[0].id).lean();
  assert.equal(d0.status, 'submitted');
  assert.equal(d0.result.frames.find((f) => f.fid === 'n1').role, 'commentary');
  assert.deepEqual(d0.result.streams_added, [{ id: 'x1', name: 'הגהות', role: 'commentary' }]);
  const d1 = await TrainingProofItem.findById(pages[1].id).lean();
  assert.equal(d1.result.frames.find((f) => f.fid === 'n1').role, 'commentary');
  // שמירה עם הסוג הישן מהדפדפן — השרת קובע לפי הזרם
  const again = await savePage(A, pages[1].id, { status: 'draft', frames: add(pages[1], 1) }, { now: T0 });
  assert.equal(again.page.frames.find((f) => f.fid === 'n1').role, 'commentary');
  // עמוד שאושר עם הזרם — אי-אפשר לשנות עוד
  await TrainingProofItem.updateOne({ _id: d0._id }, { $set: { status: 'approved', reviewedAt: T0 } });
  const no = await setStreamKind(A, KEY, 'x1', { role: 'notes' }, T0);
  assert.equal(no.status, 409);
  assert.match(no.error, /אושר/);
  assert.equal((await TrainingProofBook.findOne({ book: KEY }).lean()).streams.find((s) => s.id === 'x1').role, 'commentary');
});

test('סוג של זרם מהתחנה משתנה — stationRole נשמר, ו-streams_changed יוצא בקובץ-ההחזרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ n: 2 });
  await claimBook(A, KEY, T0);
  const pages = (await bookDetail(A, KEY, { now: T0 })).pages;
  await savePage(A, pages[0].id, marked(pages[0].frames), { now: T0 });
  const r = await setStreamKind(A, KEY, 's1', { role: 'commentary' }, T0);
  assert.equal(r.ok, true);
  assert.equal(r.pages, 1);
  assert.deepEqual(r.streams.find((s) => s.id === 's1'), { id: 's1', name: 'פנים', role: 'commentary', stationRole: 'body' });
  const d0 = await TrainingProofItem.findById(pages[0].id).lean();
  assert.equal(d0.result.frames.find((f) => f.stream === 's1').role, 'commentary');
  assert.deepEqual(d0.result.streams_changed, [{ id: 's1', role: 'commentary', from: 'body' }]);
  // שינוי נוסף — from נשאר הסוג של התחנה
  await setStreamKind(A, KEY, 's1', { role: 'notes' }, T0);
  const d1 = await TrainingProofItem.findById(pages[0].id).lean();
  assert.deepEqual(d1.result.streams_changed, [{ id: 's1', role: 'notes', from: 'body' }]);
  // עמוד שני נשמר אחר-כך — נושא גם הוא את השינוי
  await savePage(A, pages[1].id, marked(pages[1].frames), { now: T0 });
  await TrainingProofItem.updateMany({}, { $set: { status: 'approved', reviewedAt: T0 } });
  const items = await TrainingProofItem.find({}).lean();
  const zip = buildReturnZip('frames', items, { stationOf: () => 'st-6b1e0d5a', now: T0 });
  assert.equal(zip.lines.length, 2);
  for (const l of zip.lines) {
    assert.equal(checkReturnLine('frames', l), null);
    assert.deepEqual(l.streams_changed, [{ id: 's1', role: 'notes', from: 'body' }]);
    assert.equal(l.frames.find((f) => f.stream === 's1').role, 'notes');
  }
  // חזרה לסוג של התחנה — השדה יורד
  await TrainingProofItem.updateMany({}, { $set: { status: 'submitted', reviewedAt: null } });
  await setStreamKind(A, KEY, 's1', { role: 'body' }, T0);
  assert.equal('streams_changed' in (await TrainingProofItem.findById(pages[0].id).lean()).result, false);
});

test('כל העמודים סומנו — הספר "הושלם" ו-doneBy', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ n: 2 });
  await claimBook(A, KEY, T0);
  const pages = (await bookDetail(A, KEY, { now: T0 })).pages;
  assert.equal((await savePage(A, pages[0].id, marked(pages[0].frames), { now: T0 })).bookDone, false);
  assert.equal((await savePage(A, pages[1].id, { status: 'skip', frames: pages[1].frames }, { now: T0 })).bookDone, true);
  assert.equal(String((await TrainingProofBook.findOne({ book: KEY }).lean()).doneBy), A);
  assert.equal((await stateOf(B)).state, 'done');
  assert.equal((await claimBook(B, KEY, T0)).status, 409);
});

test('ספר שהוגש כולו וממתין לאישור — לא חוסם לקיחת ספר נוסף', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ n: 2 });
  await TrainingProofBook.create({ book: 'b-0000000001', alias: 'ספר 12', streams: [] });
  const m = manifestOf('frames', { package_id: 'tp-20261027-00000001' });
  await TrainingProofItem.create(itemDoc(m, framesItem(9, { uid: 'frames:fpages:999', book: 'b-0000000001' })));
  await claimBook(A, KEY, T0);
  const pages = (await bookDetail(A, KEY, { now: T0 })).pages;
  await savePage(A, pages[0].id, marked(pages[0].frames), { now: T0 });
  // עמוד אחד עוד פתוח — הספר בעבודה וחוסם
  assert.equal((await claimBook(A, 'b-0000000001', T0)).status, 409);
  assert.equal((await savePage(A, pages[1].id, marked(pages[1].frames), { now: T0 })).bookDone, true);
  assert.equal((await listBooks(A, T0)).books.find((b) => b.book === KEY).state, 'done');
  const aggregate = TrainingProofItem.aggregate;
  const calls = t.mock.method(TrainingProofItem, 'aggregate', function (...args) {
    return aggregate.apply(this, args);
  });
  const r = await claimBook(A, 'b-0000000001', T0);
  assert.equal(r.ok, true, r.error);
  assert.equal(calls.mock.callCount(), 1, 'מוני הספר המבוקש והספר הקודם נקראים יחד');
  calls.mock.restore();

  // אם המנהל דוחה עמוד בספר הקודם, הוא שוב חוסם גם אחרי שהספר החדש שוחרר.
  await TrainingProofItem.updateOne({ _id: pages[0].id }, { $set: { status: 'available', result: null, vol: null } });
  assert.equal((await releaseBook(A, 'b-0000000001')).ok, true);
  assert.equal((await claimBook(A, 'b-0000000001', T0)).status, 409);
});

test('ספירת ספר משתמשת באינדקס ולא קוראת עמודים מספרים אחרים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ n: 2 });
  await TrainingProofItem.collection.insertMany(Array.from({ length: 500 }, (_, i) => ({
    section: 'frames', book: `other-${i}`, status: 'available', packageId: 'other-package', uid: `other-${i}`,
  })));
  const plan = await TrainingProofItem.aggregate([
    { $match: { section: 'frames', book: { $in: [KEY] } } },
    { $group: { _id: '$book', total: { $sum: 1 }, done: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'approved']] }, 1, 0] } } } },
  ]).explain('executionStats');
  const stats = plan.stages?.[0]?.$cursor?.executionStats || plan.executionStats;
  assert.equal(stats.totalDocsExamined, 2, 'רק שני עמודי הספר המבוקש נקראים');
});

test('חבילה מושהית — הספר לא מופיע למתנדבים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await seed({ open: false });
  assert.equal((await listBooks(A, T0)).books.length, 0);
  assert.equal((await claimBook(A, KEY, T0)).status, 404);
});
