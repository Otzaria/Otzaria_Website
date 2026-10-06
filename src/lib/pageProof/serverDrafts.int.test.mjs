/**
 * בדיקות אינטגרציה לטיוטה בשרת (serverDrafts.js, docs/63 §2) מול MongoDB אמיתי: כתיבה רק בידי מי שמחזיק עכשיו
 * בעמוד (403 לאחר, 409 לגרסה שהוחלפה), מעבר לגרסה החדשה (חזר מזיהוי-מחדש), מעבר למתנדב הבא (handover — מה שהקודם
 * עשה מסומן), קריאה למנהל, "התחל מאפס", מחיקה בהגשה, ו"אפשר לשלוח לזיהוי-מחדש עכשיו". הרצה: npm run test:node
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import PageProofDraft from '../../models/PageProofDraft.js';
import { dropDraft, editorContext, editorDraft, isHolder, markRecutSent, saveDraft } from './serverDrafts.js';
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
const TEXT = { kind: 'text', page: 7, ids: [1], value: 'שורה 1 מתוקנת' };
const SPLIT = { kind: 'line_split', page: 7, ids: [2], value: { x: 500 } };
const OK3 = { kind: 'line_ok', page: 7, ids: [3] };

let a;
let b;
let admin;
let book;
let page;

const reload = () => PageProofPage.findById(page._id).lean();
const draftOf = () => PageProofDraft.findOne({ page: page._id }).lean();

beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  a = await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isVerified: true });
  b = await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isVerified: true });
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', isVerified: true, role: 'admin_ocr' });
  book = await PageProofBook.create({ gid: 'gDraft1', title: 'ספר', script: 'square' });
  page = await PageProofPage.create({
    book: book._id,
    gid: book.gid,
    page: 7,
    seq: 1,
    doc: DOC,
    lineCount: 3,
    imagePath: '/uploads/page-proof/gDraft1/p0007.jpg',
    leasedBy: a._id,
    leasedUntil: inHours(40),
  });
});

test('כתיבה: רק המחזיק, בגרסה הנוכחית — 403 לאחר / לתפיסה שפגה / למי שהגיש, 409 לגרסה אחרת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const r = await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, SPLIT, { kind: 'bogus', page: 7 }], stage: 'structure' }, 'מתנדב א');
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  assert.equal(r.dropped, 1);
  assert.equal(r.stage, 'structure');
  let d = await draftOf();
  assert.deepEqual(d.ops, [TEXT, SPLIT]);
  assert.equal(String(d.by), String(a._id));
  assert.equal(d.byName, 'מתנדב א');
  assert.equal(d.revision, 1);

  const other = await saveDraft(page._id, b._id, { revision: 1, ops: [OK3] }, 'מתנדב ב');
  assert.deepEqual([other.ok, other.status, other.code], [false, 403, 'not_holder']);
  const stale = await saveDraft(page._id, a._id, { revision: 2, ops: [OK3] }, 'מתנדב א');
  assert.deepEqual([stale.ok, stale.status, stale.code], [false, 409, 'reload']);
  const noRev = await saveDraft(page._id, a._id, { ops: [OK3] }, 'מתנדב א');
  assert.equal(noRev.status, 409);
  d = await draftOf();
  assert.deepEqual(d.ops, [TEXT, SPLIT], 'שום כתיבה שנדחתה לא שינתה את הטיוטה');

  await PageProofPage.updateOne({ _id: page._id }, { $set: { leasedUntil: inHours(-1) } });
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [OK3] })).status, 403, 'התפיסה פגה');
  await PageProofPage.updateOne({ _id: page._id }, { $set: { leasedUntil: inHours(5), submitters: [a._id] } });
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [OK3] })).status, 403, 'כבר הגיש');
  assert.equal((await saveDraft('64b7f0c2a1b2c3d4e5f60999', a._id, { revision: 1, ops: [] })).status, 404);
  assert.equal(isHolder(await reload(), a._id), false);
});

test('שמירה חוזרת דורסת (טיוטה אחת לעמוד), השלב נשמר כשנשלח, ובלעדיו — נשאר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT], stage: 'structure' });
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, OK3] });
  const d = await draftOf();
  assert.equal(await PageProofDraft.countDocuments({}), 1);
  assert.deepEqual(d.ops, [TEXT, OK3]);
  assert.equal(d.stage, 'structure');
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, OK3], stage: 'text' });
  assert.equal((await draftOf()).stage, 'text');
});

test('העמוד עבר למתנדב הבא: הטיוטה עוברת אליו, ומה שהקודם עשה מסומן (inherited); הקודם כבר אינו כותב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, { kind: 'seg_ok', page: 7, ids: [3], value: 1, _local: true }], stage: 'text' }, 'מתנדב א');
  // התפיסה של א' פגה, ב' תפס את העמוד
  await PageProofPage.updateOne({ _id: page._id }, { $set: { leasedBy: b._id, leasedUntil: inHours(48) } });
  const p = await reload();
  const got = await editorDraft(p, b._id, { edit: true, userName: 'מתנדב ב' });
  assert.equal(got.handover, true);
  assert.equal(got.mine, true);
  assert.equal(got.stage, 'text', 'השלב עובר עם הטיוטה');
  assert.equal(got.inherited.source, 'draft');
  assert.equal(got.inherited.count, 1);
  assert.deepEqual(got.inherited.ops, [TEXT], 'בלי חצאי-האישור המקומיים');
  assert.equal(JSON.stringify(got).includes(String(a._id)), false, 'מזהה המתנדב הקודם אינו נחשף');
  const d = await draftOf();
  assert.equal(String(d.by), String(b._id));
  // פתיחה שנייה — אין handover נוסף
  assert.equal((await editorDraft(p, b._id, { edit: true, userName: 'מתנדב ב' })).handover, false);
  // א' (בלשונית ישנה) מנסה לשמור — 403; ב' שומר — ה-inherited נשאר
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [] })).status, 403);
  await saveDraft(page._id, b._id, { revision: 1, ops: [TEXT, OK3] }, 'מתנדב ב');
  assert.deepEqual((await draftOf()).inherited.ops, [TEXT]);
  // "התחל מאפס" — גם מה שהתקבל נמחק, והשלב חוזר ל"מבנה"
  const r = await saveDraft(page._id, b._id, { revision: 1, ops: [], reset: true }, 'מתנדב ב');
  assert.equal(r.ok, true);
  const z = await draftOf();
  assert.deepEqual([z.ops, z.inherited, z.stage], [[], null, 'structure']);
});

test('טיוטה ריקה שעוברת למתנדב אחר — בלי הודעה ובלי inherited', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [] }, 'מתנדב א');
  await PageProofPage.updateOne({ _id: page._id }, { $set: { leasedBy: b._id, leasedUntil: inHours(48) } });
  const got = await editorDraft(await reload(), b._id, { edit: true, userName: 'מתנדב ב' });
  assert.deepEqual([got.handover, got.inherited], [false, null]);
});

test('העמוד חזר מזיהוי-מחדש (גרסה 2): הטיוטה עוברת בכלל של הדפדפן — בלי החיתוך ובלי מה שאינו חל — לשלב "טקסט"', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, SPLIT, { kind: 'text', page: 7, ids: [2], value: 'על השורה שנחתכה' }], stage: 'structure' }, 'מתנדב א');
  assert.equal(await markRecutSent(page._id, a._id), 1);
  assert.equal((await draftOf()).stage, 'text');
  assert.ok((await draftOf()).recut.sentAt);
  // הגרסה החדשה: שורה 2 נחתכה ל-21/22
  await PageProofPage.updateOne(
    { _id: page._id },
    { $set: { revision: 2, doc: { ...DOC, revision: 2, lines: [line(1), line(21, { recheck: true }), line(22, { recheck: true }), line(3)] } } }
  );
  const got = await editorDraft(await reload(), a._id, { edit: true, userName: 'מתנדב א' });
  assert.equal(got.revision, 2);
  assert.deepEqual(got.ops, [TEXT]);
  assert.deepEqual(got.carried, { from: 1, kept: 1, cut: 1, dropped: ['טקסט: «על השורה שנחתכה»'] });
  assert.equal(got.stage, 'text');
  assert.ok(got.recut.sentAt && got.recut.backAt);
  // השמירה הבאה בגרסה 2 — ההודעה "עברה" כבר אינה רלוונטית
  await saveDraft(page._id, a._id, { revision: 2, ops: [TEXT] });
  assert.equal((await draftOf()).carried, null);
});

test('קריאה: מנהל רואה את הטיוטה (לקריאה, בלי להעביר אותה אליו); מי שאינו מחזיק ואינו מנהל — כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT] }, 'מתנדב א');
  const p = await reload();
  const r = await editorContext(p, admin._id, { edit: false, admin: true });
  assert.equal(r.draft.mine, false);
  assert.equal(r.draft.byName, 'מתנדב א');
  assert.deepEqual(r.draft.ops, [TEXT]);
  assert.equal(String((await draftOf()).by), String(a._id), 'לא עברה למנהל');
  assert.equal((await editorContext(p, b._id, { edit: false, admin: false })).draft, null);
});

test('הגשה מוחקת את הטיוטה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT] });
  assert.equal(await dropDraft(page._id), 1);
  assert.equal(await draftOf(), null);
  assert.equal(await dropDraft(page._id), 0);
});

test('canRecut: מתג דולק, העמוד בטיפולי, אין הגשה של אחר, ומתחת לתקרת הבקשות הממתינות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const p = await reload();
  assert.equal((await editorContext(p, a._id, { edit: true, recutOn: true })).canRecut, true);
  assert.equal((await editorContext(p, a._id, { edit: true, recutOn: false })).canRecut, false, 'המתג כבוי');
  assert.equal((await editorContext({ ...p, activeCount: 1 }, a._id, { edit: true, recutOn: true })).canRecut, false, 'יש הגשה של אחר');
  for (let i = 0; i < 5; i++) {
    await PageProofSubmission.create({ page: p._id, book: book._id, gid: book.gid, pageNo: 7, user: a._id, who: 'w', status: 'approved', recutRequest: true });
  }
  assert.equal((await editorContext(p, a._id, { edit: true, recutOn: true })).canRecut, false, 'תקרת הבקשות הממתינות');
});

test('שתי לשוניות / שני מחשבים: baseUpdatedAt שאינו הטיוטה שבשרת ← 409 stale ושום דבר לא נכתב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  // אין טיוטה עדיין: הלשונית הראשונה יוצרת (בסיס null)
  const first = await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT], baseUpdatedAt: null }, 'מתנדב א');
  assert.equal(first.ok, true);
  // הלשונית השנייה, שגם היא חשבה שאין טיוטה — stale
  const second = await saveDraft(page._id, a._id, { revision: 1, ops: [OK3], baseUpdatedAt: null }, 'מתנדב א');
  assert.deepEqual([second.ok, second.status, second.code], [false, 409, 'stale']);
  // הלשונית הראשונה ממשיכה מהבסיס שקיבלה
  const next = await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, OK3], baseUpdatedAt: new Date(first.updatedAt).toISOString() }, 'מתנדב א');
  assert.equal(next.ok, true);
  // מחשב אחר עם הבסיס הישן — stale, והטיוטה לא השתנתה
  const old = await saveDraft(page._id, a._id, { revision: 1, ops: [], baseUpdatedAt: new Date(first.updatedAt).toISOString() }, 'מתנדב א');
  assert.equal(old.code, 'stale');
  assert.deepEqual((await draftOf()).ops, [TEXT, OK3]);
  // "התחל מאפס" עם הבסיס העדכני — עובר; בסיס שאינו תאריך — stale; בלי השדה (לקוח ישן) — בלי בדיקה
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [], reset: true, baseUpdatedAt: new Date(next.updatedAt).toISOString() })).ok, true);
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT], baseUpdatedAt: 'לא-תאריך' })).code, 'stale');
  assert.equal((await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT] })).ok, true);
});

test('עדכון-עמוד מתוכנת-הספר באותה גרסה ובמזהים אחרים (חתימה אחרת): הטיוטה עוברת לעמוד כפי שהוא, השלב נשאר', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT, { kind: 'text', page: 7, ids: [2], value: 'על שורה שתוחלף' }], stage: 'structure' }, 'מתנדב א');
  assert.ok((await draftOf()).sig, 'החתימה נשמרת');
  await PageProofPage.updateOne({ _id: page._id }, { $set: { doc: { ...DOC, lines: [line(1), line(31), line(3)] } } });
  const got = await editorDraft(await reload(), a._id, { edit: true, userName: 'מתנדב א' });
  assert.deepEqual(got.ops, [TEXT]);
  assert.deepEqual(got.carried, { from: 1, kept: 1, cut: 0, dropped: ['טקסט: «על שורה שתוחלף»'], update: true });
  assert.equal(got.stage, 'structure', 'אין "חזר מזיהוי-מחדש" — השלב נשאר');
  assert.equal(got.recut, null);
  // פתיחה נוספת — כבר באותה חתימה, בלי מעבר נוסף
  const again = await editorDraft(await reload(), a._id, { edit: true, userName: 'מתנדב א' });
  assert.deepEqual(again.carried, got.carried);
  assert.deepEqual(again.ops, [TEXT]);
});

test('המתנדב הבא אינו רואה את שם הקודם; מנהל — כן', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await saveDraft(page._id, a._id, { revision: 1, ops: [TEXT] }, 'מתנדב א');
  await PageProofPage.updateOne({ _id: page._id }, { $set: { leasedBy: b._id, leasedUntil: inHours(48) } });
  const got = await editorDraft(await reload(), b._id, { edit: true, userName: 'מתנדב ב' });
  assert.equal(got.inherited.byName, '');
  assert.equal(JSON.stringify(got).includes('מתנדב א'), false);
  const adm = await editorContext(await reload(), admin._id, { edit: false, admin: true });
  assert.equal(adm.draft.inherited.byName, 'מתנדב א');
});
