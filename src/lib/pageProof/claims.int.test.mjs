/**
 * בדיקות אינטגרציה לבחירת עמודים בידי המתנדב (claims.js) מול MongoDB אמיתי:
 * מצבי העמודים בעיני כל צופה, המונים ברשימת הספרים (שמחושבים בקבוצות במסד)
 * מול הרשת (עמוד-עמוד), ותפיסה/שחרור אטומיים. הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import {
  listBooks,
  bookPages,
  claimPage,
  releasePage,
  claimSequence,
  renewLease,
  sequenceOfPage,
  heldSequences,
  pageBrief,
  CLAIM_MS,
  MAX_HELD,
} from './claims.js';
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

let me;
let other;
let bookA;
let pages; // מספר-עמוד ← מסמך, בספר א'

async function mkBook(gid, title, extra = {}) {
  return PageProofBook.create({ gid, title, script: 'square', ...extra });
}

function mkPage(book, page, extra = {}) {
  return PageProofPage.create({
    book: book._id,
    gid: book.gid,
    page,
    seq: Math.floor((page - 1) / 5),
    doc: { page, size: [10, 10], lines: [] },
    lineCount: 3,
    imagePath: `/uploads/page-proof/${book.gid}/p${page}.jpg`,
    ...extra,
  });
}

function mkSub(page, user, status, extra = {}) {
  return PageProofSubmission.create({
    page: page._id,
    book: page.book,
    gid: page.gid,
    pageNo: page.page,
    user: user._id,
    who: `otz-${user._id}`,
    status,
    ...extra,
  });
}

// ספר א': כל המצבים. הצופה = me.
//   1 פנוי · 2 בטיפולך · 3 תפוס (אחר) · 4 דרוש בודק נוסף · 5 הוגש (me)
//   6 אושר (me) · 7 הושלם (אחר) · 8 ממתין לזיהוי-מחדש (אחר) · 9 החכרה שפגה
//   10 גרסה 2 — me הגיש רק את גרסה 1 ← פנוי שוב
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  me = await User.create({ name: 'אני המתנדב', email: 'me@example.org', password: 'x', isVerified: true });
  other = await User.create({ name: 'מתנדב אחר', email: 'o@example.org', password: 'x', isVerified: true });
  bookA = await mkBook('gA', 'ספר א');
  pages = {};
  pages[1] = await mkPage(bookA, 1);
  pages[2] = await mkPage(bookA, 2, { leasedBy: me._id, leasedUntil: inHours(3) });
  pages[3] = await mkPage(bookA, 3, { leasedBy: other._id, leasedUntil: inHours(3) });
  pages[4] = await mkPage(bookA, 4, { required: 2, activeCount: 1, submitters: [other._id] });
  pages[5] = await mkPage(bookA, 5, { status: 'done', activeCount: 1, submitters: [me._id] });
  pages[6] = await mkPage(bookA, 6, { status: 'done', activeCount: 1, approvedCount: 1, submitters: [me._id] });
  pages[7] = await mkPage(bookA, 7, { status: 'done', activeCount: 1, submitters: [other._id] });
  pages[8] = await mkPage(bookA, 8, { status: 'recut', activeCount: 1, approvedCount: 1, submitters: [other._id] });
  pages[9] = await mkPage(bookA, 9, { leasedBy: other._id, leasedUntil: inHours(-1) });
  pages[10] = await mkPage(bookA, 10, { revision: 2 });
  await mkSub(pages[5], me, 'submitted');
  await mkSub(pages[6], me, 'approved');
  await mkSub(pages[7], other, 'submitted');
  await mkSub(pages[10], me, 'approved', { revision: 1 });
  // הגשה שנדחתה אינה נספרת
  await mkSub(pages[1], me, 'rejected');
});

const EXPECTED_A = {
  1: 'open',
  2: 'mine',
  3: 'taken',
  4: 'second',
  5: 'submitted',
  6: 'approved',
  7: 'done',
  8: 'recut',
  9: 'open',
  10: 'open',
};

test('רשת הספר: המצב של כל עמוד בעיני הצופה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await bookPages('gA', String(me._id));
  assert.equal(res.book.title, 'ספר א');
  assert.equal(res.book.active, true);
  assert.deepEqual(Object.fromEntries(res.pages.map((p) => [p.page, p.state])), EXPECTED_A);
  assert.deepEqual(res.pages.map((p) => p.page), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'לפי מספר העמוד');

  const byNo = Object.fromEntries(res.pages.map((p) => [p.page, p]));
  assert.equal(byNo[3].claimer, 'מתנדב אחר');
  assert.equal(byNo[2].claimer, null, 'לעמוד שלי — בלי שם ("משויך אליך")');
  assert.ok(new Date(byNo[2].leasedUntil) > new Date());
  assert.equal(byNo[9].leasedUntil, null, 'החכרה שפגה אינה נשלחת');
  assert.ok(byNo[5].submittedAt, 'מתי הגשתי');
  assert.equal(byNo[10].revision, 2);
  assert.equal(byNo[4].required, 2);
  assert.equal(byNo[1].seq, 0);
  assert.equal(byNo[6].seq, 1);
  // מזהים של משתמשים אחרים ורשימת המגישים אינם יוצאים
  for (const p of res.pages) {
    assert.equal('submitters' in p, false);
    assert.equal('leasedBy' in p, false);
  }
  assert.equal(res.counts.total, 10);
  assert.equal(res.counts.available, 4);
  assert.equal(res.counts.my, 3);
});

test('רשת הספר בעיני מתנדב אחר: העמוד שלי "תפוס" עם השם שלי; מה שהגשתי — "הושלם"', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await bookPages('gA', String(other._id));
  const byNo = Object.fromEntries(res.pages.map((p) => [p.page, p]));
  assert.equal(byNo[2].state, 'taken');
  assert.equal(byNo[2].claimer, 'אני המתנדב');
  assert.equal(byNo[3].state, 'mine');
  assert.equal(byNo[4].state, 'submitted');
  assert.equal(byNo[5].state, 'done');
  assert.equal(byNo[7].state, 'submitted');
  assert.equal(byNo[8].state, 'submitted', 'המגיש רואה את הגשתו גם כשהעמוד ממתין לזיהוי-מחדש');
});

test('ספר שלא קיים ← null', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal(await bookPages('no-such-gid', String(me._id)), null);
});

test('רשימת הספרים: רק פעילים, מונים זהים לרשת, העמוד הראשון לתמונה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const paused = await mkBook('gP', 'ספר מושהה', { status: 'paused' });
  await mkPage(paused, 1);
  const bookB = await mkBook('gB', 'אבני זיכרון');
  // העמוד הראשון נוצר אחרון — הראשון לפי מספר, לא לפי סדר היצירה
  await mkPage(bookB, 3);
  const firstB = await mkPage(bookB, 2);

  const list = await listBooks(String(me._id));
  assert.deepEqual(list.map((b) => b.gid), ['gB', 'gA'], 'לפי שם הספר, בלי המושהה');
  const a = list.find((b) => b.gid === 'gA');
  const grid = await bookPages('gA', String(me._id));
  assert.deepEqual(a.counts, grid.counts, 'המונים בקבוצות = המונים עמוד-עמוד');
  assert.equal(a.counts.open, 3);
  assert.equal(a.counts.recut, 1);
  assert.equal(a.firstPage.id, String(pages[1]._id));
  assert.equal(list[0].firstPage.id, String(firstB._id));
  assert.equal(list[0].counts.open, 2);

  // גם בעיני המתנדב האחר
  const theirs = (await listBooks(String(other._id))).find((b) => b.gid === 'gA');
  assert.deepEqual(theirs.counts, (await bookPages('gA', String(other._id))).counts);
});

test(`תפיסת עמוד פנוי: ל-${CLAIM_MS / HOUR} שעות, ומאותו רגע הוא "תפוס" לאחרים`, async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const res = await claimPage(String(pages[1]._id), String(me._id), now);
  assert.equal(res.ok, true);
  assert.equal(res.page.page, 1);
  assert.equal(new Date(res.page.leasedUntil).getTime(), now.getTime() + CLAIM_MS);

  const refused = await claimPage(String(pages[1]._id), String(other._id));
  assert.deepEqual(refused, { ok: false, status: 409, error: 'העמוד נתפס בינתיים בידי מתנדב אחר' });
  const theirView = await bookPages('gA', String(other._id));
  const p1 = theirView.pages.find((p) => p.page === 1);
  assert.equal(p1.state, 'taken');
  assert.equal(p1.claimer, 'אני המתנדב');
});

test('תפיסה: החכרה שפגה, בודק שני, והארכת עמוד שכבר שלי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal((await claimPage(String(pages[9]._id), String(me._id))).ok, true);
  assert.equal((await claimPage(String(pages[4]._id), String(me._id))).ok, true);
  const now = new Date();
  assert.equal((await claimPage(String(pages[2]._id), String(me._id), now)).ok, true);
  const p2 = await PageProofPage.findById(pages[2]._id).lean();
  assert.equal(p2.leasedUntil.getTime(), now.getTime() + CLAIM_MS, 'ההחכרה (3 שעות) הוארכה לתקופת-התפיסה המלאה');
  // עמוד שחזר מזיהוי-מחדש (גרסה 2) פתוח שוב גם למי שהגיש את גרסה 1
  assert.equal((await claimPage(String(pages[10]._id), String(me._id))).ok, true);
});

test('תפיסה נדחית עם הסבר לפי המצב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(me._id);
  assert.equal((await claimPage(String(pages[3]._id), uid)).error, 'העמוד נתפס בינתיים בידי מתנדב אחר');
  assert.equal((await claimPage(String(pages[5]._id), uid)).error, 'כבר הגשתם את העמוד הזה');
  assert.equal((await claimPage(String(pages[7]._id), uid)).error, 'העמוד כבר הושלם');
  assert.equal((await claimPage(String(pages[8]._id), uid)).error, 'העמוד ממתין לחיתוך ולזיהוי-מחדש ואינו פתוח כרגע');
  // מי שהגיש עמוד כפול לא יקבל אותו שוב כבודק שני
  assert.equal((await claimPage(String(pages[4]._id), String(other._id))).error, 'כבר הגשתם את העמוד הזה');
  assert.deepEqual(await claimPage('64b7f0c2a1b2c3d4e5f6ffff', uid), { ok: false, status: 404, error: 'העמוד לא נמצא' });
  // שום דחייה לא שינתה את ההחכרה
  const p3 = await PageProofPage.findById(pages[3]._id).lean();
  assert.equal(String(p3.leasedBy), String(other._id));
});

test('ספר מושהה: אין תפיסה חדשה, לא של עמוד ולא של רצף', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await PageProofBook.updateOne({ _id: bookA._id }, { $set: { status: 'paused' } });
  const one = await claimPage(String(pages[1]._id), String(me._id));
  assert.equal(one.status, 409);
  assert.match(one.error, /מושהה/);
  const seq = await claimSequence('gA', 0, String(me._id));
  assert.equal(seq.status, 409);
  assert.match(seq.error, /מושהה/);
  const grid = await bookPages('gA', String(me._id));
  assert.equal(grid.book.active, false);
  assert.equal(grid.pages.find((p) => p.page === 2).state, 'mine', 'מה שכבר בידי נשאר');
});

test('שני מתנדבים תופסים את אותו עמוד בבת אחת — רק אחד מצליח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const results = await Promise.all([
    claimPage(String(pages[1]._id), String(me._id)),
    claimPage(String(pages[1]._id), String(other._id)),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  const winner = results[0].ok ? me : other;
  const p1 = await PageProofPage.findById(pages[1]._id).lean();
  assert.equal(String(p1.leasedBy), String(winner._id));
});

test(`אי אפשר להחזיק יותר מ-${MAX_HELD} עמודים בבת אחת`, async (t) => {
  if (db.skip) return t.skip(db.skip);
  const big = await mkBook('gBig', 'ספר גדול');
  const docs = [];
  for (let n = 1; n <= MAX_HELD + 6; n++) {
    docs.push({
      book: big._id,
      gid: big.gid,
      page: n,
      seq: Math.floor((n - 1) / 5),
      doc: { page: n, size: [10, 10], lines: [] },
      imagePath: `/uploads/page-proof/gBig/p${n}.jpg`,
      ...(n < MAX_HELD ? { leasedBy: me._id, leasedUntil: inHours(20) } : {}),
    });
  }
  const created = await PageProofPage.insertMany(docs);
  // עמוד 2 בספר א' כבר שלי ← MAX_HELD בדיוק
  const refused = await claimPage(String(created[MAX_HELD + 2]._id), String(me._id));
  assert.equal(refused.status, 409);
  assert.match(refused.error, new RegExp(`עד ${MAX_HELD} עמודים`));
  assert.equal((await claimSequence('gBig', Math.floor((MAX_HELD + 5) / 5), String(me._id))).status, 409);
  // הארכה של עמוד שכבר שלי מותרת גם בתקרה
  assert.equal((await claimPage(String(created[0]._id), String(me._id))).ok, true);
  // אחרי שחרור — אפשר לתפוס שוב
  assert.equal((await releasePage(String(created[0]._id), String(me._id))).ok, true);
  assert.equal((await claimPage(String(created[MAX_HELD + 2]._id), String(me._id))).ok, true);
});

test(`תפיסת רצף נעצרת בתקרה: רק עד ${MAX_HELD} עמודים בסך הכול, והשאר מדווחים`, async (t) => {
  if (db.skip) return t.skip(db.skip);
  // me כבר מחזיק את עמוד 2 בספר א'; עוד MAX_HELD-2 עמודים בספר אחר ← נשאר מקום לעמוד אחד
  const other2 = await mkBook('gC', 'ספר ג');
  for (let n = 1; n <= MAX_HELD - 2; n++) await mkPage(other2, n, { leasedBy: me._id, leasedUntil: inHours(20) });
  const fresh = await mkBook('gD', 'ספר ד');
  for (let n = 1; n <= 5; n++) await mkPage(fresh, n);
  const res = await claimSequence('gD', 0, String(me._id));
  assert.equal(res.ok, true);
  assert.equal(res.claimed, 1);
  assert.equal(res.limited, 4);
  assert.deepEqual(res.pages.map((p) => p.page), [1], 'הראשון ברצף');
  const again = await claimSequence('gD', 0, String(me._id));
  assert.equal(again.status, 409);
  assert.match(again.error, new RegExp(`עד ${MAX_HELD} עמודים`));
});

test('שחרור: רק החכרה שלי, ורק עמוד שלא הגשתי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(me._id);
  assert.deepEqual(await releasePage(String(pages[3]._id), uid), { ok: false, status: 409, error: 'העמוד אינו משויך אליכם' });
  assert.deepEqual(await releasePage(String(pages[5]._id), uid), {
    ok: false,
    status: 409,
    error: 'כבר הגשתם את העמוד הזה — אין מה לשחרר',
  });
  assert.equal((await releasePage('64b7f0c2a1b2c3d4e5f6ffff', uid)).status, 404);

  assert.deepEqual(await releasePage(String(pages[2]._id), uid), { ok: true });
  const p2 = await PageProofPage.findById(pages[2]._id).lean();
  assert.equal(p2.leasedBy, null);
  assert.equal(p2.leasedUntil, null);
  const grid = await bookPages('gA', String(other._id));
  assert.equal(grid.pages.find((p) => p.page === 2).state, 'open', 'חזר למאגר');
});

test('תפיסת רצף: כל העמודים הפנויים בו, בלי לגעת בתפוסים ובמוגשים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  // רצף 0 של ספר א': 1 פנוי, 2 שלי, 3 תפוס, 4 בודק שני, 5 הוגש (me)
  const res = await claimSequence('gA', 0, String(me._id), now);
  assert.equal(res.ok, true);
  assert.equal(res.claimed, 3);
  assert.deepEqual(res.pages.map((p) => p.page), [1, 2, 4]);
  const after = await PageProofPage.find({ book: bookA._id, seq: 0 }).sort({ page: 1 }).lean();
  assert.deepEqual(
    after.map((p) => (p.leasedBy ? String(p.leasedBy) : null)),
    [String(me._id), String(me._id), String(other._id), String(me._id), null]
  );
  assert.equal(after[0].leasedUntil.getTime(), now.getTime() + CLAIM_MS);

  // רצף 1: 6 אושר, 7 הושלם, 8 זיהוי-מחדש, 9 החכרה שפגה, 10 גרסה חדשה
  const second = await claimSequence('gA', 1, String(me._id), now);
  assert.deepEqual(second.pages.map((p) => p.page), [9, 10]);
  // אין מה לתפוס
  assert.deepEqual(await claimSequence('gA', 1, String(other._id), now), {
    ok: false,
    status: 409,
    error: 'אין ברצף הזה עמודים פנויים לתפיסה',
  });
});

test('תפיסת רצף: קלט לא תקין וספר חסר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.equal((await claimSequence('gA', -1, String(me._id))).status, 400);
  assert.equal((await claimSequence('gA', 1.5, String(me._id))).status, 400);
  assert.equal((await claimSequence('nope', 0, String(me._id))).status, 404);
});

// ---------- עמודים שהמנהל סגר, "העמודים שלי", ופתיחה בעורך ----------

const close = (...nos) => PageProofPage.updateMany({ _id: { $in: nos.map((n) => pages[n]._id) } }, { $set: { volunteer: false } });

test('עמוד שהמנהל סגר: לא ברשת ולא במונים של המתנדב — חוץ ממה שבידיו או שהגיש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // 1 פנוי · 2 שלי · 3 של אחר · 5 הגשתי · 7 הושלם (אחר)
  await close(1, 2, 3, 5, 7);
  const mine = await bookPages('gA', String(me._id));
  assert.deepEqual(mine.pages.map((p) => p.page), [2, 4, 5, 6, 8, 9, 10], 'בלי 1, 3, 7');
  assert.equal(mine.pages.find((p) => p.page === 2).state, 'mine');
  assert.equal(mine.pages.find((p) => p.page === 5).state, 'submitted');
  assert.equal(mine.hidden, 3);
  assert.equal(mine.counts.total, 7);
  // רשימת הספרים — אותם מונים (בקבוצות במסד)
  const listed = (await listBooks(String(me._id))).find((b) => b.gid === 'gA');
  assert.deepEqual(listed.counts, mine.counts);
  // בעיני המתנדב האחר: 3 שלו, 7 הגיש; 1/2/5 סגורים בשבילו
  const theirs = await bookPages('gA', String(other._id));
  assert.deepEqual(theirs.pages.map((p) => p.page), [3, 4, 6, 7, 8, 9, 10]);
  assert.equal(theirs.pages.find((p) => p.page === 3).state, 'mine');
  assert.equal(theirs.hidden, 3);
  assert.deepEqual((await listBooks(String(other._id))).find((b) => b.gid === 'gA').counts, theirs.counts);
});

test('ספר שכל עמודיו סגורים (ואין בו כלום שלי) — לא ברשימת הספרים; התמונה — מהעמוד הפתוח הראשון', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const bookB = await mkBook('gB', 'ספר ב');
  await mkPage(bookB, 1, { volunteer: false });
  await mkPage(bookB, 2, { volunteer: false });
  await close(1);
  const list = await listBooks(String(me._id));
  assert.deepEqual(list.map((b) => b.gid), ['gA']);
  assert.equal(list[0].firstPage.id, String(pages[2]._id), 'עמוד 1 סגור — התמונה מעמוד 2');
});

test('עמוד סגור אינו נתפס — לא כעמוד ולא ברצף; עמוד בלי השדה (מלפני שנוסף) פתוח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await close(1, 4);
  assert.deepEqual(await claimPage(String(pages[1]._id), String(me._id)), { ok: false, status: 409, error: 'העמוד אינו פתוח להגהה כרגע' });
  // רצף 0: 1 סגור · 2 שלי · 3 תפוס · 4 סגור (בודק שני) · 5 הגשתי ← רק 2 (הארכה)
  const seq = await claimSequence('gA', 0, String(me._id));
  assert.equal(seq.ok, true);
  assert.deepEqual(seq.pages.map((p) => p.page), [2]);
  assert.equal((await PageProofPage.findById(pages[1]._id).lean()).leasedBy, null);
  // עמוד ישן בלי השדה (9: תפיסה של אחר שפגה — פנוי)
  await PageProofPage.collection.updateOne({ _id: pages[9]._id }, { $unset: { volunteer: '' } });
  assert.equal((await PageProofPage.collection.findOne({ _id: pages[9]._id })).volunteer, undefined);
  assert.equal((await claimPage(String(pages[9]._id), String(me._id))).ok, true);
});

test('פתיחה בעורך מחדשת ל-48 שעות מלאות רק תפיסה שבתוקף שלי — ולעולם לא תופסת עמוד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date();
  const uid = String(me._id);
  // שלי (נשארו 3 שעות) ← 48 שעות מעכשיו
  const renewed = await renewLease(String(pages[2]._id), uid, now);
  assert.equal(renewed.leasedUntil.getTime(), now.getTime() + CLAIM_MS);
  assert.equal(String(renewed.leasedBy), uid);
  // פנוי / תפיסה שפגה של אחר / תפוס בידי אחר / הגשתי ← null, ושום דבר לא השתנה
  for (const n of [1, 9, 3, 5]) {
    const before = await PageProofPage.findById(pages[n]._id).lean();
    assert.equal(await renewLease(String(pages[n]._id), uid, now), null, `עמוד ${n}`);
    const after = await PageProofPage.findById(pages[n]._id).lean();
    assert.equal(String(after.leasedBy), String(before.leasedBy), `עמוד ${n}: המחזיק`);
    assert.equal(after.leasedUntil?.getTime(), before.leasedUntil?.getTime(), `עמוד ${n}: המועד`);
  }
  // התפיסה שלי פגה ← כבר לא שלי: פתיחה אינה תופסת מחדש (תופסים שוב ברשת)
  await PageProofPage.updateOne({ _id: pages[1]._id }, { $set: { leasedBy: me._id, leasedUntil: inHours(-1) } });
  assert.equal(await renewLease(String(pages[1]._id), uid, now), null);
  // עמוד שהמנהל סגר בזמן שהוא בידי — ממשיך להתחדש
  await close(2);
  assert.ok(await renewLease(String(pages[2]._id), uid, now));
  // תפיסה ארוכה יותר אינה מתקצרת
  await PageProofPage.updateOne({ _id: pages[2]._id }, { $set: { leasedUntil: inHours(100) } });
  const kept = await renewLease(String(pages[2]._id), uid, now);
  assert.ok(kept.leasedUntil.getTime() > now.getTime() + CLAIM_MS);
});

test('הרצף של עמוד (פתיחה בעורך): רק עמוד שבטיפולי או שהגשתי; קריאה בלבד', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(me._id);
  const s = await sequenceOfPage(String(pages[2]._id), uid);
  assert.equal(s.seq, 0);
  assert.equal(s.book.gid, 'gA');
  const byNo = Object.fromEntries(s.pages.map((p) => [p.page, p]));
  assert.equal(byNo[2].state, 'mine');
  assert.ok(new Date(byNo[2].leasedUntil) > new Date(), 'עד מתי שמור לי');
  assert.equal(byNo[1].state, 'unavailable');
  assert.equal(byNo[1].leasedUntil, null);
  assert.equal(byNo[5].state, 'submitted');
  assert.equal((await sequenceOfPage(String(pages[5]._id), uid)).seq, 0, 'עמוד שהגשתי — לצפייה');
  // פנוי / של אחר / תפיסה שפגה / מזהה לא תקין ← null
  for (const n of [1, 3, 9]) assert.equal(await sequenceOfPage(String(pages[n]._id), uid), null, `עמוד ${n}`);
  assert.equal(await sequenceOfPage('not-an-id', uid), null);
  // שום דבר לא נתפס
  assert.equal((await PageProofPage.findById(pages[1]._id).lean()).leasedBy, null);
});

test('"העמודים שלי": הרצפים שבהם אני מחזיק עמודים שלא הגשתי — הקרוב לפקוע ראשון', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(me._id);
  assert.deepEqual((await heldSequences(uid)).map((s) => `${s.book.gid}:${s.seq}`), ['gA:0']);
  const bookB = await mkBook('gB', 'ספר ב');
  const b1 = await mkPage(bookB, 1, { leasedBy: me._id, leasedUntil: inHours(1) });
  await mkPage(bookB, 2, { leasedBy: me._id, leasedUntil: inHours(2) });
  // תפיסה שפגה ועמוד שהגשתי — לא
  await mkPage(bookB, 6, { leasedBy: me._id, leasedUntil: inHours(-1) });
  await mkPage(bookB, 11, { leasedBy: me._id, leasedUntil: inHours(5), submitters: [me._id], activeCount: 1 });
  const held = await heldSequences(uid);
  assert.deepEqual(held.map((s) => `${s.book.gid}:${s.seq}`), ['gB:0', 'gA:0'], 'רצף אחד לכל (ספר, רצף), לפי מה שפוקע ראשון');
  assert.deepEqual(held[0].pages.filter((p) => p.state === 'mine').map((p) => p.id), [String(b1._id), held[0].pages[1].id]);
  assert.deepEqual(await heldSequences(String(other._id)).then((l) => l.map((s) => `${s.book.gid}:${s.seq}`)), ['gA:0']);
});

test('עמוד שביקשו ואינו שלי — המצב שלו בעיניי (להסבר ולקישור לרשת)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const uid = String(me._id);
  assert.deepEqual(await pageBrief(String(pages[1]._id), uid), { id: String(pages[1]._id), gid: 'gA', page: 1, state: 'open' });
  assert.equal((await pageBrief(String(pages[3]._id), uid)).state, 'taken');
  assert.equal((await pageBrief(String(pages[7]._id), uid)).state, 'done');
  await close(1);
  assert.equal((await pageBrief(String(pages[1]._id), uid)).state, 'closed');
  assert.equal(await pageBrief('64b7f0c2a1b2c3d4e5f6ffff', uid), null);
  assert.equal(await pageBrief('nope', uid), null);
});
