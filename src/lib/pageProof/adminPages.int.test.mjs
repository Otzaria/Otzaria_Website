/**
 * בדיקות אינטגרציה לרשת-העמודים בניהול (adminPages.js) מול MongoDB אמיתי:
 * המצב של כל עמוד בעיני המנהל (מי מחזיק ועד מתי), המתג "פתוח למתנדבים"
 * (לעמוד, לטווח, "וסגור את כל השאר") והשפעתו על המתנדב, ושחרור תפיסה בידי מנהל.
 * הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import { adminBookPages, setVolunteer, releaseClaims } from './adminPages.js';
import { bookPages, claimPage } from './claims.js';
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

let vol;
let other;
let book;
let bookB;
let pages;

function mkPage(b, page, extra = {}) {
  return PageProofPage.create({
    book: b._id,
    gid: b.gid,
    page,
    seq: Math.floor((page - 1) / 5),
    doc: { page, size: [10, 10], lines: [] },
    lineCount: 3,
    imagePath: `/uploads/page-proof/${b.gid}/p${page}.jpg`,
    ...extra,
  });
}

// ספר: 1 פנוי · 2 תפוס (vol, בתוקף) · 3 תפיסה של other שפגה · 4 בודק נוסף
// (ממתינה אחת) · 5 הוגש, ממתין לאישור · 6 אושר · 7 ממתין לזיהוי-מחדש · 8–12 פנויים
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  vol = await User.create({ name: 'ראובן', email: 'r@example.org', password: 'x', isVerified: true });
  other = await User.create({ name: 'שמעון', email: 's@example.org', password: 'x', isVerified: true });
  book = await PageProofBook.create({ gid: 'gAdmin01', title: 'ספר', script: 'square' });
  bookB = await PageProofBook.create({ gid: 'gOther02', title: 'ספר ב', script: 'square' });
  pages = {};
  pages[1] = await mkPage(book, 1);
  pages[2] = await mkPage(book, 2, { leasedBy: vol._id, leasedUntil: inHours(30) });
  pages[3] = await mkPage(book, 3, { leasedBy: other._id, leasedUntil: inHours(-2) });
  pages[4] = await mkPage(book, 4, { required: 2, activeCount: 1, submitters: [other._id] });
  pages[5] = await mkPage(book, 5, { status: 'done', activeCount: 1, submitters: [other._id] });
  pages[6] = await mkPage(book, 6, { status: 'done', activeCount: 1, approvedCount: 1, submitters: [other._id] });
  pages[7] = await mkPage(book, 7, { status: 'recut', activeCount: 1, approvedCount: 1 });
  for (let n = 8; n <= 12; n++) pages[n] = await mkPage(book, n);
  await mkPage(bookB, 1, { leasedBy: other._id, leasedUntil: inHours(5) });
});

const volunteerOf = async (n) => (await PageProofPage.findById(pages[n]._id).lean()).volunteer;

test('רשת המנהל: המצב של כל עמוד, מי מחזיק ועד מתי, תפיסה שפגה, ממתינות ומונים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await adminBookPages('gAdmin01');
  assert.deepEqual(res.book, { gid: 'gAdmin01', title: 'ספר', script: 'square', active: true });
  const byNo = Object.fromEntries(res.pages.map((p) => [p.page, p]));
  assert.deepEqual(
    res.pages.map((p) => p.state),
    ['open', 'taken', 'open', 'second', 'submitted', 'approved', 'recut', 'open', 'open', 'open', 'open', 'open']
  );
  assert.equal(byNo[2].holder, 'ראובן');
  assert.equal(byNo[2].lease, 'active');
  assert.ok(new Date(byNo[2].leasedUntil) > new Date());
  assert.equal(byNo[3].holder, 'שמעון', 'גם כשהתפיסה פגה — מי רשום עליו');
  assert.equal(byNo[3].lease, 'expired');
  assert.equal(byNo[1].holder, null);
  assert.equal(byNo[1].leasedUntil, null);
  assert.equal(byNo[4].pending, 1);
  assert.equal(byNo[5].pending, 1);
  assert.equal(byNo[6].pending, 0);
  assert.ok(res.pages.every((p) => p.volunteer === true), 'ברירת-המחדל: פתוח');
  // פנויים: 1, 3 (התפיסה פגה), 8–12
  assert.deepEqual(res.counts, { total: 12, closed: 0, leased: 1, expired: 1, open: 7, second: 1, taken: 1, submitted: 1, approved: 1, recut: 1 });
  // בלי מזהי-משתמשים ובלי רשימת המגישים
  for (const p of res.pages) {
    assert.equal('leasedBy' in p, false);
    assert.equal('submitters' in p, false);
  }
  assert.equal(await adminBookPages('no-such-book'), null);
});

test('"עמודים 1–5 פתוחים, וסגור את כל השאר" — ובעיני המתנדב נשארים רק הם (ומה שבידיו)', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await setVolunteer('gAdmin01', { volunteer: true, from: 1, to: 5, others: false });
  assert.equal(res.ok, true);
  assert.deepEqual([res.open, res.closed], [5, 7]);
  assert.equal(res.changed, 7, 'הפתוחים כבר היו פתוחים — רק השאר השתנו');
  assert.equal(await volunteerOf(5), true);
  assert.equal(await volunteerOf(6), false);
  // הספר האחר לא נגע
  assert.equal((await PageProofPage.findOne({ gid: 'gOther02' }).lean()).volunteer, true);
  // בעיני מתנדב שלישי: רק 1–5 (בלי 2 — תפוס בידי ראובן, והוא פתוח ולכן נראה כ"תפוס")
  const third = await User.create({ name: 'לוי', email: 'l@example.org', password: 'x', isVerified: true });
  const grid = await bookPages('gAdmin01', String(third._id));
  assert.deepEqual(grid.pages.map((p) => p.page), [1, 2, 3, 4, 5]);
  assert.equal(grid.hidden, 7);
  // תפיסה של עמוד סגור נדחית; של פתוח — מצליחה
  assert.equal((await claimPage(String(pages[9]._id), String(third._id))).error, 'העמוד אינו פתוח להגהה כרגע');
  assert.equal((await claimPage(String(pages[1]._id), String(third._id))).ok, true);
});

test('המתג לעמוד אחד, לטווח ולכל הספר; סגירה אינה לוקחת עמוד ממי שמחזיק בו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const one = await setVolunteer('gAdmin01', { volunteer: false, ids: [String(pages[2]._id)] });
  assert.deepEqual([one.ok, one.changed, one.closed], [true, 1, 1]);
  assert.equal(await volunteerOf(2), false);
  // ראובן ממשיך בעמוד 2
  const grid = await bookPages('gAdmin01', String(vol._id));
  assert.equal(grid.pages.find((p) => p.page === 2).state, 'mine');
  assert.equal(String((await PageProofPage.findById(pages[2]._id).lean()).leasedBy), String(vol._id));

  const range = await setVolunteer('gAdmin01', { volunteer: false, from: 8, to: 10 });
  assert.deepEqual([range.changed, range.closed], [3, 4]);
  assert.equal(await volunteerOf(11), true, 'בלי others — השאר לא משתנים');
  const single = await setVolunteer('gAdmin01', { volunteer: false, from: 12 });
  assert.equal(single.changed, 1, 'בלי "עד" — עמוד אחד');

  const all = await setVolunteer('gAdmin01', { volunteer: true });
  assert.deepEqual([all.ok, all.open, all.closed], [true, 12, 0]);
});

test('המתג: קלט לא תקין ← 400, ספר חסר ← 404, ושום דבר לא משתנה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const bad = [
    {},
    { volunteer: 'no' },
    { volunteer: true, others: 'x' },
    { volunteer: true, ids: [] },
    { volunteer: true, ids: ['nope'] },
    { volunteer: true, from: 0, to: 3 },
    { volunteer: true, from: 5, to: 2 },
    { volunteer: true, from: 1.5 },
  ];
  for (const body of bad) assert.equal((await setVolunteer('gAdmin01', body)).status, 400, JSON.stringify(body));
  assert.deepEqual(await setVolunteer('nope', { volunteer: false }), { ok: false, status: 404, error: 'הספר לא נמצא' });
  assert.equal(await PageProofPage.countDocuments({ volunteer: false }), 0);
});

test('שחרור בידי מנהל — גם כשהמתנדב עוד מחזיק בעמוד; אחר-כך אחר יכול לתפוס אותו', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const res = await releaseClaims('gAdmin01', { ids: [String(pages[2]._id)] });
  assert.deepEqual(res, { ok: true, released: 1 });
  const p2 = await PageProofPage.findById(pages[2]._id).lean();
  assert.equal(p2.leasedBy, null);
  assert.equal(p2.leasedUntil, null);
  assert.equal((await claimPage(String(pages[2]._id), String(other._id))).ok, true);
  // עמוד פנוי — אין מה לשחרר
  assert.deepEqual(await releaseClaims('gAdmin01', { ids: [String(pages[1]._id)] }), { ok: true, released: 0 });
});

test('שחרור בבת אחת: רק התפיסות שפגו, או כל התפיסות בספר — בלי לגעת בספר אחר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const expired = await releaseClaims('gAdmin01', { scope: 'expired' });
  assert.deepEqual(expired, { ok: true, released: 1 });
  assert.equal((await PageProofPage.findById(pages[3]._id).lean()).leasedBy, null);
  assert.equal(String((await PageProofPage.findById(pages[2]._id).lean()).leasedBy), String(vol._id), 'תפיסה בתוקף נשארת');

  await PageProofPage.updateOne({ _id: pages[8]._id }, { $set: { leasedBy: other._id, leasedUntil: inHours(40) } });
  const all = await releaseClaims('gAdmin01', { scope: 'all' });
  assert.deepEqual(all, { ok: true, released: 2 });
  assert.equal(await PageProofPage.countDocuments({ book: book._id, leasedBy: { $ne: null } }), 0);
  assert.equal(await PageProofPage.countDocuments({ book: bookB._id, leasedBy: { $ne: null } }), 1, 'הספר האחר לא נגע');
});

test('שחרור: קלט לא תקין ← 400, ספר חסר ← 404', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const body of [{}, { scope: 'mine' }, { ids: [] }, { ids: ['x'] }]) {
    assert.equal((await releaseClaims('gAdmin01', body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(await releaseClaims('nope', { scope: 'all' }), { ok: false, status: 404, error: 'הספר לא נמצא' });
  assert.equal(await PageProofPage.countDocuments({ leasedBy: { $ne: null } }), 3, 'שום דבר לא שוחרר');
});
