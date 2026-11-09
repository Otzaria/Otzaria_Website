/**
 * בדיקות אינטגרציה לתפיסת עמודים בעריכת ספרים (bookPageClaims.js) מול MongoDB אמיתי:
 * מכסת 5 עמודים, שחרור אוטומטי אחרי 5 ימים בלי עריכה, ספרים אישיים, ותפיסות מקבילות.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import Page from '../models/Page.js';
import { startMongo } from './corrections/testing/mongo.js';
import {
  claimBookPage,
  countActiveClaims,
  releaseExpiredPageClaims,
  checkClaimLimit,
} from './bookPageClaims.js';
import { DAY_MS, CLAIM_LIMIT_ERROR_CODE } from './pageClaimPolicy.js';

let db;
before(async () => {
  db = await startMongo();
  if (!db.skip) await Promise.all([Book.syncIndexes(), Page.syncIndexes()]);
});
after(async () => {
  if (!db.skip) await db.stop();
});

const me = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
let shared;
let shared2;
let personal;

beforeEach(async () => {
  if (db.skip) return;
  await Promise.all([Book.deleteMany({}), Page.deleteMany({})]);
  shared = await Book.create({ name: 'ספר משותף', slug: 'shared' });
  shared2 = await Book.create({ name: 'ספר משותף ב', slug: 'shared2' });
  personal = await Book.create({ name: 'ספר אישי', slug: 'mine', isPrivate: true, ownerId: me });
  const docs = [];
  for (const book of [shared, shared2, personal]) {
    for (let n = 1; n <= 8; n += 1) docs.push({ book: book._id, pageNumber: n, imagePath: `/x/${n}.jpg` });
  }
  await Page.insertMany(docs);
});

const t = (name, fn) => test(name, async (ctx) => {
  if (db.skip) return ctx.skip(db.skip);
  await fn();
});

/** מסמן עמוד כתפוס, עם עריכה אחרונה לפני daysAgo ימים */
async function hold(book, pageNumber, userId, daysAgo = 0) {
  const at = new Date(Date.now() - daysAgo * DAY_MS);
  await Page.updateOne(
    { book: book._id, pageNumber },
    { $set: { status: 'in-progress', claimedBy: userId, claimedAt: at, updatedAt: at } },
    { timestamps: false }
  );
}

const claim = (book, pageNumber, userId = me, isAdmin = false) =>
  claimBookPage({ userId, isAdmin, book, pageNumber });

t('תפיסה רגילה של עמוד פנוי', async () => {
  const r = await claim(shared, 1);
  assert.equal(r.status, 200);
  assert.equal(r.body.activeClaims, 1);
  assert.equal(r.isNewClaim, true);
  const page = await Page.findOne({ book: shared._id, pageNumber: 1 }).lean();
  assert.equal(page.status, 'in-progress');
  assert.equal(String(page.claimedBy), String(me));
});

t('מכסה: החמישי עובר, השישי נחסם — בכל הספרים יחד', async () => {
  for (const n of [1, 2, 3]) assert.equal((await claim(shared, n)).status, 200);
  for (const n of [1, 2]) assert.equal((await claim(shared2, n)).status, 200);
  const sixth = await claim(shared2, 3);
  assert.equal(sixth.status, 409);
  assert.equal(sixth.body.code, CLAIM_LIMIT_ERROR_CODE);
  assert.equal(sixth.body.activeClaims, 5);
  assert.match(sixth.body.error, /עד 5 עמודים/);
  const page = await Page.findOne({ book: shared2._id, pageNumber: 3 }).lean();
  assert.equal(page.status, 'available');
});

t('תפיסה חוזרת של עמוד שכבר שלי אינה נחסמת ואינה נותנת נקודות', async () => {
  for (const n of [1, 2, 3, 4, 5]) await claim(shared, n);
  const again = await claim(shared, 3);
  assert.equal(again.status, 200);
  assert.equal(again.isNewClaim, false);
});

t('ספר אישי: לא נספר ולא מוגבל', async () => {
  for (const n of [1, 2, 3, 4, 5]) await claim(shared, n);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.equal((await claim(personal, n)).status, 200);
  assert.equal(await countActiveClaims(me), 5);
});

t('מנהל עוקף את המכסה', async () => {
  for (const n of [1, 2, 3, 4, 5]) await claim(shared, n, me, true);
  assert.equal((await claim(shared, 6, me, true)).status, 200);
});

t('עמוד שפג תוקפו אינו נספר במכסה', async () => {
  for (const n of [1, 2, 3, 4]) await hold(shared, n, me);
  await hold(shared, 5, me, 6);
  assert.equal(await countActiveClaims(me), 4);
  assert.equal((await claim(shared, 6)).status, 200);
});

t('עמוד של אחר: נחסם; אחרי 5 ימים בלי עריכה — ניתן לתפוס (גם לפני שה-cron רץ)', async () => {
  await hold(shared, 1, other, 4.9);
  assert.equal((await claim(shared, 1)).status, 409);
  await hold(shared, 1, other, 5.1);
  const r = await claim(shared, 1);
  assert.equal(r.status, 200);
  const page = await Page.findOne({ book: shared._id, pageNumber: 1 }).lean();
  assert.equal(String(page.claimedBy), String(me));
});

t('עמוד שהושלם ע"י אחר — לא ניתן לתפוס', async () => {
  await Page.updateOne({ book: shared._id, pageNumber: 2 }, { status: 'completed', claimedBy: other });
  assert.equal((await claim(shared, 2)).status, 409);
});

t('releaseExpiredPageClaims: משחרר רק אחרי 5 ימים ורק בספרים משותפים', async () => {
  await hold(shared, 1, other, 6);
  await hold(shared, 2, other, 4);
  await hold(personal, 1, me, 30);
  assert.equal(await releaseExpiredPageClaims(), 1);
  const [p1, p2, pp] = await Promise.all([
    Page.findOne({ book: shared._id, pageNumber: 1 }).lean(),
    Page.findOne({ book: shared._id, pageNumber: 2 }).lean(),
    Page.findOne({ book: personal._id, pageNumber: 1 }).lean(),
  ]);
  assert.equal(p1.status, 'available');
  assert.equal(p1.claimedBy, undefined);
  assert.equal(p2.status, 'in-progress');
  assert.equal(pp.status, 'in-progress');
});

t('releaseExpiredPageClaims עם bookId — רק אותו ספר', async () => {
  await hold(shared, 1, other, 6);
  await hold(shared2, 1, other, 6);
  assert.equal(await releaseExpiredPageClaims({ bookId: shared._id }), 1);
  assert.equal((await Page.findOne({ book: shared2._id, pageNumber: 1 }).lean()).status, 'in-progress');
});

t('תפיסות מקבילות של אותו משתמש לא עוברות את המכסה', async () => {
  for (const n of [1, 2, 3]) await claim(shared, n);
  const results = await Promise.all([4, 5, 6, 7, 8].map((n) => claim(shared, n)));
  assert.ok(results.some((r) => r.status === 409));
  assert.ok(await countActiveClaims(me) <= 5);
  // עמודים שהתפיסה שלהם בוטלה חזרו להיות פנויים לגמרי
  const rolledBack = await Page.find({ book: shared._id, status: 'available', claimedBy: { $ne: null } }).lean();
  assert.equal(rolledBack.length, 0);
});

t('שני משתמשים על אותו עמוד במקביל — רק אחד מצליח', async () => {
  const [a, b] = await Promise.all([claim(shared, 1, me), claim(shared, 1, other)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

t('checkClaimLimit (ביטול סיום) — חוסם רק כשהמכסה מלאה', async () => {
  for (const n of [1, 2, 3, 4]) await hold(shared, n, me);
  assert.equal((await checkClaimLimit({ userId: me, isAdmin: false, book: shared })).ok, true);
  await hold(shared, 5, me);
  assert.equal((await checkClaimLimit({ userId: me, isAdmin: false, book: shared })).ok, false);
  assert.equal((await checkClaimLimit({ userId: me, isAdmin: false, book: personal })).ok, true);
  assert.equal((await checkClaimLimit({ userId: me, isAdmin: true, book: shared })).ok, true);
});
