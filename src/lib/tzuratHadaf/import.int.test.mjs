/**
 * בדיקות אינטגרציה לייבוא חבילה (uploads.js + importPackage.js) מול MongoDB אמיתי ודיסק זמני: העלאה בחלקים,
 * הרכבה, פריסה זורמת של ZIP שנבנה כאן (התמונות לפני pages.jsonl — סדר שאינו מובטח), עמודים, החלטות,
 * תרגול ותמונות; הרצה חוזרת idempotent; ייבוא שני (full) — פתוחות שאינן בחבילה ← obsolete, שנענו — לא נוגעים,
 * עמוד שהשתנה ← סבב חדש; חבילה פגומה ← failed.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import sharp from 'sharp';

// התיקיות — לפני טעינת המודולים (images.js קורא את UPLOAD_DIR בטעינה)
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tzurat-import-'));
process.env.UPLOAD_DIR = path.join(tmpRoot, 'public-uploads');
process.env.TZURAT_STORAGE_DIR = path.join(tmpRoot, 'storage');

const { default: User } = await import('../../models/User.js');
const { default: TzuratItem } = await import('../../models/TzuratItem.js');
const { default: TzuratPage } = await import('../../models/TzuratPage.js');
const { default: TzuratBatch } = await import('../../models/TzuratBatch.js');
const { default: TzuratUpload } = await import('../../models/TzuratUpload.js');
const { startMongo } = await import('../corrections/testing/mongo.js');
const { createUpload, writeChunk, completeUpload, requeueUpload, cleanupOldUploads } = await import('./uploads.js');
const { processUpload, PRACTICE_PREFIX } = await import('./importPackage.js');
const { addAnswer, answerChoice, fastItemFor } = await import('./items.js');
const { itemCrop, pageImage } = await import('./imageServe.js');
const { packagePath } = await import('./storage.js');

let db;
before(async () => {
  db = await startMongo();
});
after(async () => {
  if (!db.skip) await db.stop();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

let admin;
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  admin = await User.create({ name: 'מנהל', email: 'm@x.test', role: 'admin' });
});

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 240, g: 240, b: 230 } } }).png().toBuffer();
const jsonl = (rows) => strToU8(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const model = { blocks: [{ id: 'g', kind: 'g', label: 'גמרא', auto: 'ok', lines: [{ i: 0, ours: [0.1, 0.1, 0.8, 0.02], scan: [0.1, 0.1, 0.8, 0.02], words: [{ t: 'מאימתי', ref: 'R', wi: 0 }], print: ['מאימתי'], auto: true, flag: null }] }] };

function pageRec(dafKey, extra = {}) {
  return {
    dafKey,
    daf: dafKey === '002a' ? 'ב.' : 'ב:',
    order: dafKey === '002a' ? 0 : 1,
    pdf: { file: 'ברכות.pdf', page: 11 },
    scan: { file: `images/${dafKey}.scan.png`, w: 400, h: 600 },
    ours: { file: `images/${dafKey}.ours.png`, w: 400, h: 600 },
    nonVilna: false,
    changed: false,
    model,
    ...extra,
  };
}
const itemRec = (k, dafKey, extra = {}) => ({
  sourceKey: `berakhot|g|R|${k}|rep`,
  dafKey,
  kind: 'g',
  cls: 'c_substitution',
  question: 'replace',
  ref: 'R',
  wi: k,
  n: 1,
  otz: ['קורין'],
  print: ['קורים'],
  ctxBefore: ['מאימתי'],
  ctxAfter: ['את'],
  box: { x: 0.3, y: 0.2, w: 0.1, h: 0.03 },
  score: k,
  hints: { te: 'print' },
  ...extra,
});

async function buildZip({ buildId = 'b1', full = true, pages, items, practice = [], extraFiles = {} }) {
  const img = await png(400, 600);
  const files = {};
  // תמונות קודם — הייבוא חייב להסתדר עם כל סדר
  for (const p of pages) {
    files[`images/${p.dafKey}.scan.png`] = [new Uint8Array(img), { level: 0 }];
    files[`images/${p.dafKey}.ours.png`] = [new Uint8Array(img), { level: 0 }];
  }
  files['items.jsonl'] = jsonl(items);
  files['pages.jsonl'] = jsonl(pages);
  if (practice.length) files['practice.jsonl'] = jsonl(practice);
  files['manifest.json'] = strToU8(JSON.stringify({ format: 'tzurat-review/1', slug: 'berakhot', masechet: 'ברכות', order: 1, buildId, created: '2026-10-25T21:00:00Z', pages: pages.length, items: items.length, full }));
  Object.assign(files, extraFiles);
  return Buffer.from(zipSync(files));
}

async function* asStream(buf, step = 64 * 1024) {
  for (let i = 0; i < buf.length; i += step) yield new Uint8Array(buf.subarray(i, i + step));
}

async function upload(buf) {
  const c = await createUpload({ name: 'berakhot.zip', size: buf.length }, { id: String(admin._id), name: 'מנהל' });
  assert.ok(c.ok);
  const id = String(c.upload._id);
  assert.equal(c.upload.chunks, 1);
  // גוף קצר מהצפוי — נדחה; גדול מהצפוי — 413
  assert.equal((await writeChunk(id, '0', asStream(buf.subarray(0, 10)))).status, 400);
  assert.equal((await writeChunk(id, '0', asStream(Buffer.concat([buf, Buffer.from('xx')])))).status, 413);
  assert.equal((await writeChunk(id, '1', asStream(buf))).status, 400);
  assert.equal((await completeUpload(id)).code, 'missing_chunks');
  const w = await writeChunk(id, '0', asStream(buf), { contentLength: buf.length });
  assert.deepEqual(w.received, [0]);
  // שליחה חוזרת של אותו חלק — בסדר
  assert.ok((await writeChunk(id, '0', asStream(buf))).ok);
  const done = await completeUpload(id);
  assert.equal(done.upload.status, 'queued');
  return id;
}

test('ייבוא מלא: עמודים, החלטות, תרגול, תמונות; הרצה חוזרת idempotent', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const buf = await buildZip({
    pages: [pageRec('002a'), pageRec('002b')],
    items: [itemRec(1, '002a'), itemRec(2, '002a'), itemRec(3, '002b', { box: null }), { sourceKey: 'bad' }],
    practice: [{ ...itemRec(9, '002a'), expected: 'print', explain: 'כך נדפס' }],
    extraFiles: { 'README.txt': strToU8('x'), 'images/../evil.png': strToU8('x') },
  });
  const id = await upload(buf);
  const s = await processUpload(id);
  const up = await TzuratUpload.findById(id).lean();
  assert.equal(up.status, 'done', JSON.stringify(up.errorList));
  assert.deepEqual(s.pages, { created: 2, updated: 0, reopened: 0 });
  assert.equal(s.items.created, 3);
  assert.equal(s.practice, 1);
  assert.equal(s.images, 4);
  assert.equal(s.ignored, 2);
  assert.equal(up.errorList.length, 1);
  assert.match(up.errorList[0], /^items\.jsonl שורה 4:/);
  assert.ok(up.sha256.length === 64);

  const p = await TzuratPage.findOne({ slug: 'berakhot', dafKey: '002a' }).lean();
  assert.equal(p.scan.path, '/uploads/tzurat-hadaf/berakhot/002a.scan.png');
  assert.equal(p.pendingCount, 2);
  assert.ok([1, 2].includes(p.required));
  await fs.access(path.join(process.env.UPLOAD_DIR, 'tzurat-hadaf', 'berakhot', '002a.ours.png'));
  const batch = await TzuratBatch.findOne({ slug: 'berakhot' }).lean();
  assert.deepEqual([batch.pages, batch.items, batch.buildId, batch.status], [2, 3, 'b1', 'active']);
  const pr = await TzuratItem.findOne({ sourceKey: `${PRACTICE_PREFIX}berakhot|g|R|9|rep` }).lean();
  assert.equal(pr.practice, true);
  assert.equal(pr.expected, 'print');
  // staging נמחק, package.zip נשאר (להרצה חוזרת)
  await fs.access(packagePath(id));
  // staging של הריצה (staging-<runToken>) נמחק
  assert.deepEqual((await fs.readdir(path.join(process.env.TZURAT_STORAGE_DIR, 'uploads', id))).filter((n) => n.startsWith('staging')), []);

  // תמונות: חיתוך סביב התיבה, ותמונת עמוד חתוכה
  const it = await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|1|rep' }).lean();
  const crop = await itemCrop(it, p);
  const meta = await sharp(crop.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(meta.width <= 400 && meta.height < 600);
  const again = await itemCrop(it, p);
  assert.equal(Buffer.compare(again.buffer, crop.buffer), 0);
  const part = await pageImage(p, 'scan', new URLSearchParams('x=0&y=0&w=0.5&h=0.5'));
  assert.equal((await sharp(part.buffer).metadata()).width, 200);

  // הרצה חוזרת — אותו מצב
  assert.ok((await requeueUpload(id)).ok);
  const s2 = await processUpload(id);
  assert.deepEqual(s2.pages, { created: 0, updated: 2, reopened: 0 });
  assert.equal(s2.items.created, 0);
  assert.equal(await TzuratItem.countDocuments({}), 4);
  assert.equal((await TzuratPage.findOne({ dafKey: '002a' }).lean()).round, 1);
});

test('ייבוא שני (full): obsolete, נענה לא נדרס, עמוד שהשתנה ← סבב חדש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const id1 = await upload(
    await buildZip({ pages: [pageRec('002a'), pageRec('002b')], items: [itemRec(1, '002a'), itemRec(2, '002a'), itemRec(3, '002b'), itemRec(5, '002a')] })
  );
  await processUpload(id1);
  const answered = await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|1|rep' }).lean();
  const u = await User.create({ name: 'א', email: 'a@x.test', isVerified: true });
  await addAnswer(answered._id, { id: String(u._id), name: 'א' }, { verdict: 'print' });
  // פריט 5 נענה וחסר בחבילה הבאה — נשאר פתוח (keptAnswered)
  const i5 = await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|5|rep' }).lean();
  await addAnswer(i5._id, { id: String(u._id), name: 'א' }, { verdict: 'otz' });
  await TzuratPage.updateOne({ dafKey: '002b' }, { $set: { status: 'done', activeCount: 1, approvedCount: 1 } });

  // החבילה החדשה: פריט 1 עם מילים אחרות (נענה — המילים לא משתנות), פריט 2 חסר (← obsolete), 002b השתנה
  const id2 = await upload(
    await buildZip({
      buildId: 'b2',
      pages: [pageRec('002a'), pageRec('002b', { changed: true })],
      items: [itemRec(1, '002a', { otz: ['אחר'], score: 50 }), itemRec(3, '002b'), itemRec(4, '002b')],
    })
  );
  const s = await processUpload(id2);
  assert.equal(s.items.obsoleted, 1);
  assert.equal(s.items.keptAnswered, 1);
  assert.equal((await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|5|rep' }).lean()).status, 'open');
  assert.equal(s.pages.reopened, 1);
  const i1 = await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|1|rep' }).lean();
  // נענה: המילים, המקום וההקשר לא משתנים; הדירוג כן
  assert.deepEqual(i1.otz, ['קורין']);
  assert.equal(i1.score, 50);
  assert.equal(i1.answers.length, 1);
  assert.equal((await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|2|rep' }).lean()).status, 'obsolete');
  const p2 = await TzuratPage.findOne({ dafKey: '002b' }).lean();
  assert.deepEqual([p2.round, p2.status, p2.activeCount, p2.buildId], [2, 'open', 0, 'b2']);
  // הרצה חוזרת של אותה חבילה — לא מעלה סבב שוב
  await requeueUpload(id2);
  await processUpload(id2);
  assert.equal((await TzuratPage.findOne({ dafKey: '002b' }).lean()).round, 2);

  // החייאה: פריט obsolete (עם תשובות ישנות) שחוזר בחבילה — שאלה נקייה
  await TzuratItem.updateOne({ sourceKey: 'berakhot|g|R|2|rep' }, { $set: { answers: [{ user: u._id, verdict: 'print', at: new Date() }], pointsAwarded: true } });
  const id3 = await upload(await buildZip({ buildId: 'b3', full: false, pages: [pageRec('002a')], items: [itemRec(2, '002a', { otz: ['חדש'] })] }));
  const s3 = await processUpload(id3);
  assert.equal(s3.items.revived, 1);
  const i2 = await TzuratItem.findOne({ sourceKey: 'berakhot|g|R|2|rep' }).lean();
  assert.deepEqual([i2.status, i2.answers.length, i2.pointsAwarded, i2.otz[0]], ['open', 0, false, 'חדש']);
});

test('חבילה פגומה ← failed עם הודעה; ניקוי העלאות ישנות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const bad = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'other/9', slug: 'x' })) }));
  const id = await upload(bad);
  await processUpload(id);
  const up = await TzuratUpload.findById(id).lean();
  assert.equal(up.status, 'failed');
  assert.match(up.errorList[0], /פורמט לא נתמך/);
  // ניקוי: שבוע אחרי — התיקייה נמחקת
  const r = await cleanupOldUploads(new Date(Date.now() + 8 * 24 * 3600 * 1000));
  // גם התיקיות היתומות של הבדיקות הקודמות (הרשומות שלהן נמחקו באיפוס)
  assert.ok(r.removed >= 1);
  await assert.rejects(fs.access(packagePath(id)));
  assert.equal((await requeueUpload(id)).code, 'gone');
});

test('missing or truncated required files fail before any page/image mutation; malformed full imports cannot retire questions', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await processUpload(await upload(await buildZip({ pages: [pageRec('002a')], items: [itemRec(1, '002a')] })));
  const original = await TzuratPage.findOne().lean();
  const changed = await buildZip({ buildId: 'b2', pages: [pageRec('002a', { changed: true })], items: [itemRec(2, '002a')] });
  for (const missing of ['items.jsonl', 'pages.jsonl']) {
    const files = unzipSync(changed);
    delete files[missing];
    const id = await upload(Buffer.from(zipSync(files)));
    await processUpload(id);
    assert.equal((await TzuratUpload.findById(id).lean()).status, 'failed');
    assert.equal((await TzuratPage.findById(original._id).lean()).buildId, 'b1');
    assert.equal((await TzuratItem.findOne().lean()).status, 'open');
  }
  const truncated = unzipSync(changed);
  truncated['items.jsonl'] = strToU8(''); // manifest still promises one item
  const badCount = await upload(Buffer.from(zipSync(truncated)));
  await processUpload(badCount);
  assert.equal((await TzuratUpload.findById(badCount).lean()).status, 'failed');
  assert.equal((await TzuratPage.findById(original._id).lean()).round, 1);
  const malformed = unzipSync(changed);
  malformed['items.jsonl'] = strToU8('{invalid json');
  const badRecord = await upload(Buffer.from(zipSync(malformed)));
  await processUpload(badRecord);
  assert.ok((await TzuratUpload.findById(badRecord).lean()).errorList.length);
  assert.equal((await TzuratItem.findOne().lean()).status, 'open');
  // An explicitly empty, valid full package is still allowed to retire all unanswered questions.
  const empty = await upload(await buildZip({ buildId: 'b3', pages: [pageRec('002a')], items: [] }));
  await processUpload(empty);
  assert.equal((await TzuratUpload.findById(empty).lean()).status, 'done');
  assert.equal((await TzuratItem.findOne().lean()).status, 'obsolete');
});

test('reimporting a legacy unanswered question invalidates the displayed revision before accepting a vote', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await processUpload(await upload(await buildZip({ pages: [pageRec('002a')], items: [itemRec(1, '002a')] })));
  await TzuratItem.updateOne({}, { $unset: { revision: 1 } });
  const old = await TzuratItem.findOne().lean();
  const u = await User.create({ name: 'א', email: 'legacy@x.test' });
  const shown = await fastItemFor(old, String(u._id));
  await processUpload(await upload(await buildZip({ buildId: 'b2', pages: [pageRec('002a')], items: [itemRec(1, '002a', { print: ['ה'] })] })));
  const r = await answerChoice(old._id, { id: String(u._id), name: 'א' }, { choice: 'a', revision: shown.revision });
  assert.equal(r.code, 'stale');
  assert.equal((await TzuratItem.findById(old._id).lean()).answers.length, 0);
});

test('a database write failure marks the upload failed and a retry completes it explicitly', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const first = await upload(await buildZip({ pages: [pageRec('002a')], items: [itemRec(1, '002a')] }));
  await processUpload(first);
  const second = await upload(await buildZip({ buildId: 'b2', pages: [pageRec('002a', { changed: true })], items: [itemRec(1, '002a'), itemRec(2, '002a')] }));
  const bulkWrite = TzuratItem.bulkWrite;
  let failOnce = true;
  t.mock.method(TzuratItem, 'bulkWrite', async function (...args) {
    if (failOnce) { failOnce = false; throw new Error('simulated partial bulk failure'); }
    return bulkWrite.apply(this, args);
  });
  await processUpload(second);
  let state = await TzuratUpload.findById(second).lean();
  assert.equal(state.status, 'failed');
  assert.match(state.errorList.join('\n'), /שמירת החלטות נכשלה/);
  assert.equal((await TzuratBatch.findOne({ slug: 'berakhot' }).lean()).buildId, 'b1');
  assert.ok((await requeueUpload(second)).ok);
  await processUpload(second);
  state = await TzuratUpload.findById(second).lean();
  assert.equal(state.status, 'done', JSON.stringify(state.errorList));
  assert.equal((await TzuratBatch.findOne({ slug: 'berakhot' }).lean()).buildId, 'b2');
  assert.equal(await TzuratItem.countDocuments({ status: { $ne: 'obsolete' } }), 2);
  assert.equal((await TzuratPage.findOne({ dafKey: '002a' }).lean()).round, 2);
});
