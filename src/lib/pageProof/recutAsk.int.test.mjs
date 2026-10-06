/**
 * בדיקות אינטגרציה ל"נעול עד אחרי הזיהוי-מחדש" (בעל הפרויקט, 2026-10-06) מול MongoDB אמיתי: בקשה שאינה יכולה לצאת בלי
 * מנהל נשמרת על העמוד (recut_ask) — נעול, לא מוצע, לא נספר בעמודים שהמתנדב מחזיק — והמנהל מאשר (← recut, בקשה בשם
 * המתנדב שהעמוד חוזר אליו) או דוחה (← open, חוזר למתנדב לשלב הטקסט עם הודעה). הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import PageProofDraft from '../../models/PageProofDraft.js';
import { askRecut, decideRecutAsk, recutAskCount, recutAsksOf, recutPendingOf, recutRequesterOf } from './recutRequests.js';
import { claimPage, heldSequences } from './claims.js';
import { adminBookPages } from './adminPages.js';
import { startMongo } from '../corrections/testing/mongo.js';

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
});

const HOUR = 3600 * 1000;
const inHours = (h) => new Date(Date.now() + h * HOUR);
const line = (id, extra = {}) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, stream: 'main', ...extra });
const DOC = { page: 7, size: [1000, 2000], lines: [line(1), line(2), line(3)] };
const SPLIT = { kind: 'line_split', page: 7, ids: [2], value: { x: 500 } };
const TEXT = { kind: 'text', page: 7, ids: [1], value: 'שורה 1 מתוקנת' };

let a;
let b;
let book;
let page;

const reload = () => PageProofPage.findById(page._id).lean();

beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  a = await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isVerified: true });
  b = await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isVerified: true });
  book = await PageProofBook.create({ gid: 'gAsk0001', title: 'ספר', script: 'square' });
  page = await PageProofPage.create({
    book: book._id,
    gid: book.gid,
    page: 7,
    seq: 1,
    doc: DOC,
    lineCount: 3,
    imagePath: '/uploads/page-proof/gAsk0001/p0007.jpg',
    leasedBy: a._id,
    leasedUntil: inHours(40),
  });
  await PageProofDraft.create({ page: page._id, gid: book.gid, pageNo: 7, by: a._id, byName: 'מתנדב א', ops: [TEXT, SPLIT], stage: 'structure', revision: 1 });
});

test('בקשה לאישור מנהל: העמוד נעול (recut_ask), התפיסה משתחררת, רק תיקוני-החיתוך נשמרים, ומופיע ב"העמודים שלי"', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const r = await askRecut(page._id, a._id, { revision: 1, ops: [TEXT, SPLIT], userName: 'מתנדב א', reason: 'cap' });
  assert.equal(r.ok, true);
  assert.equal(r.asked, true);
  const p = await reload();
  assert.equal(p.status, 'recut_ask');
  assert.equal(p.leasedBy, null);
  assert.equal(String(p.recutAsk.user), String(a._id));
  assert.equal(p.recutAsk.reason, 'cap');
  assert.deepEqual(p.recutAsk.ops.map((o) => o.kind), ['line_split']);
  // הטיוטה — לשלב הטקסט כשיחזור
  const d = await PageProofDraft.findOne({ page: page._id }).lean();
  assert.equal(d.stage, 'text');
  assert.equal(d.recut.asked, true);
  // "העמודים שלי": ממתין לאישור מנהל; ואינו נספר בעמודים שהוא מחזיק
  const pending = await recutPendingOf(a._id);
  assert.deepEqual(pending.map((x) => [x.page, x.asked]), [[7, true]]);
  assert.deepEqual(await heldSequences(a._id), []);
  assert.equal(await recutAskCount(), 1);
  assert.deepEqual((await recutAsksOf(book.gid)).map((x) => [x.page, x.by, x.reason, x.opCount]), [[7, 'מתנדב א', 'cap', 1]]);
  // בעיני המנהל
  const grid = await adminBookPages(book.gid);
  assert.equal(grid.pages[0].state, 'recut_ask');
  assert.deepEqual(grid.pages[0].recutAsk.opCount, 1);
  assert.equal(grid.counts.recut_ask, 1);
});

test('עמוד שממתין לאישור — אף אחד אינו תופס אותו, ובקשה שנייה נדחית', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await askRecut(page._id, a._id, { revision: 1, ops: [SPLIT], userName: 'מתנדב א', reason: 'off' });
  const c = await claimPage(page._id, b._id);
  assert.equal(c.ok, false);
  const again = await askRecut(page._id, a._id, { revision: 1, ops: [SPLIT], userName: 'מתנדב א', reason: 'off' });
  assert.equal(again.ok, false);
});

test('בלי תיקון-חיתוך / עמוד שאינו בטיפולו — אין בקשה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal((await askRecut(page._id, a._id, { revision: 1, ops: [TEXT], reason: 'off' })).status, 400);
  assert.equal((await askRecut(page._id, b._id, { revision: 1, ops: [SPLIT], reason: 'off' })).status, 409);
  assert.equal((await reload()).status, 'open');
});

test('המנהל מאשר: העמוד ממתין לזיהוי-מחדש, עם בקשה בשם המתנדב — הוא שיקבל אותו בחזרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await askRecut(page._id, a._id, { revision: 1, ops: [SPLIT], userName: 'מתנדב א', reason: 'off' });
  const r = await decideRecutAsk(page._id, 'approve', { reviewedByName: 'מנהלת' });
  assert.deepEqual(r, { ok: true, decision: 'approve' });
  const p = await reload();
  assert.equal(p.status, 'recut');
  assert.equal(p.recutAsk, null);
  const subs = await PageProofSubmission.find({ page: page._id }).lean();
  assert.equal(subs.length, 1);
  assert.equal(subs[0].recutRequest, true);
  assert.equal(subs[0].status, 'approved');
  assert.equal(subs[0].reviewedByName, 'מנהלת');
  assert.equal(String(await recutRequesterOf(page._id, 1)), String(a._id));
  // ההחלטה כבר התקבלה — שנייה נדחית
  assert.equal((await decideRecutAsk(page._id, 'reject', {})).ok, false);
});

test('המנהל דוחה: העמוד חוזר למתנדב (תפיסה חדשה) לשלב הטקסט, עם הודעה בטיוטה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await askRecut(page._id, a._id, { revision: 1, ops: [SPLIT], userName: 'מתנדב א', reason: 'other' });
  const r = await decideRecutAsk(page._id, 'reject', { reviewedByName: 'מנהלת' }, { note: 'הגש עם החיתוך' });
  assert.equal(r.ok, true);
  const p = await reload();
  assert.equal(p.status, 'open');
  assert.equal(p.recutAsk, null);
  assert.equal(String(p.leasedBy), String(a._id));
  assert.ok(new Date(p.leasedUntil).getTime() > Date.now());
  const d = await PageProofDraft.findOne({ page: page._id }).lean();
  assert.equal(d.stage, 'text');
  assert.ok(d.recut.rejectedAt);
  assert.equal(d.recut.note, 'הגש עם החיתוך');
  assert.equal(await PageProofSubmission.countDocuments({ page: page._id }), 0);
  assert.equal(await recutAskCount(), 0);
});

test('החלטה על עמוד שאינו ממתין / פעולה לא מוכרת — שגיאה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal((await decideRecutAsk(page._id, 'approve', {})).status, 409);
  assert.equal((await decideRecutAsk(page._id, 'maybe', {})).status, 400);
});
