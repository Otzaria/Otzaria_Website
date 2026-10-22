// inspectPageImage מול קבצים אמיתיים בתיקייה זמנית: מטמון ה-sha256 לפי חתימת stat — פגיעה כשהקובץ
// לא השתנה, ופסילה בכל שינוי (תוכן באותו גודל, mtime שהוחזר ב-utimes, החלפה ב-rename, מחיקה).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// images.js קורא את UPLOAD_DIR בטעינה — לפני ה-import הדינמי
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-inspect-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
const { inspectPageImage, IMAGE_CHECK_MAX_BYTES } = await import('./ocrPageData.js');
const { ImageInspectCache } = await import('./imageInspectCache.pure.js');

const dir = path.join(tmp, 'uploads', 'books', 'b');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const jpeg = (r) =>
  sharp({ create: { width: 30, height: 40, channels: 3, background: { r, g: 10, b: 10 } } }).jpeg({ quality: 90 }).toBuffer();
// "עתיד" — הקובץ נחשב מיושב (מחוץ לחלון המרוץ)
const later = () => Date.now() + 60_000;
const pause = () => new Promise((r) => setTimeout(r, 60));

function counted() {
  const calls = { n: 0 };
  return { calls, readFile: (p) => { calls.n++; return fs.readFile(p); } };
}

before(async () => {
  await fs.mkdir(dir, { recursive: true });
});
after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test('קובץ שלא השתנה — נקרא פעם אחת; התוצאה זהה', async () => {
  const buf = await jpeg(10);
  await fs.writeFile(path.join(dir, 'a.jpg'), buf);
  const cache = new ImageInspectCache(10);
  const { calls, readFile } = counted();
  const first = await inspectPageImage('/uploads/books/b/a.jpg', { cache, now: later, readFile });
  assert.deepEqual(first, { sha256: sha(buf), width: 30, height: 40, orientation: 1 });
  const second = await inspectPageImage('/uploads/books/b/a.jpg', { cache, now: later, readFile });
  assert.deepEqual(second, first);
  assert.equal(calls.n, 1);
});

test('תוכן שונה באותו גודל + mtime שהוחזר ב-utimes → נקרא מחדש, ה-hash החדש', async () => {
  const file = path.join(dir, 'same.bin.jpg');
  const a = Buffer.alloc(4096, 1);
  const b = Buffer.alloc(4096, 2);
  await fs.writeFile(file, a);
  const old = new Date(Date.now() - 3600_000);
  await fs.utimes(file, old, old);
  const cache = new ImageInspectCache(10);
  const { calls, readFile } = counted();
  assert.equal((await inspectPageImage('/uploads/books/b/same.bin.jpg', { cache, now: later, readFile })).sha256, sha(a));
  await pause();
  await fs.writeFile(file, b);
  await fs.utimes(file, old, old); // אותו גודל ואותו mtime — רק ctime משתנה
  const r = await inspectPageImage('/uploads/books/b/same.bin.jpg', { cache, now: later, readFile });
  assert.equal(r.sha256, sha(b));
  assert.equal(r.width, null, 'לא תמונה — מידות null, ה-hash עדיין נבדק');
  assert.equal(calls.n, 2);
});

test('mtime שונה / החלפה ב-rename / מחיקה → לא מוחזר ה-hash הישן', async () => {
  const file = path.join(dir, 'r.jpg');
  const a = await jpeg(20);
  const b = await jpeg(200);
  await fs.writeFile(file, a);
  const cache = new ImageInspectCache(10);
  const opts = { cache, now: later };
  assert.equal((await inspectPageImage('/uploads/books/b/r.jpg', opts)).sha256, sha(a));
  // החלפה אטומית (rename) — ino חדש
  await pause();
  await fs.writeFile(path.join(dir, 'r.tmp'), b);
  await fs.rename(path.join(dir, 'r.tmp'), file);
  assert.equal((await inspectPageImage('/uploads/books/b/r.jpg', opts)).sha256, sha(b));
  // חזרה לתוכן הראשון עם mtime חדש
  await pause();
  await fs.writeFile(file, a);
  await fs.utimes(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  assert.equal((await inspectPageImage('/uploads/books/b/r.jpg', opts)).sha256, sha(a));
  await fs.rm(file);
  assert.equal(await inspectPageImage('/uploads/books/b/r.jpg', opts), null);
});

test('קובץ "טרי" (בתוך חלון המרוץ) — לא נשמר במטמון, נקרא בכל פעם', async () => {
  await fs.writeFile(path.join(dir, 'fresh.jpg'), await jpeg(30));
  const cache = new ImageInspectCache(10);
  const { calls, readFile } = counted();
  await inspectPageImage('/uploads/books/b/fresh.jpg', { cache, readFile }); // now אמיתי
  await inspectPageImage('/uploads/books/b/fresh.jpg', { cache, readFile });
  assert.equal(calls.n, 2);
  assert.equal(cache.size, 0);
});

test('קובץ שהשתנה בזמן הקריאה — התוצאה מוחזרת אבל לא נשמרת', async () => {
  const file = path.join(dir, 'race.jpg');
  await fs.writeFile(file, await jpeg(40));
  const cache = new ImageInspectCache(10);
  const readFile = async (p) => {
    const buf = await fs.readFile(p);
    await fs.appendFile(p, Buffer.from('x')); // כתיבה מקבילה אחרי הקריאה
    return buf;
  };
  const r = await inspectPageImage('/uploads/books/b/race.jpg', { cache, now: later, readFile });
  assert.equal(typeof r.sha256, 'string');
  assert.equal(cache.size, 0);
});

test('בלי מטמון (cache:null), נתיב מחוץ לתיקייה וקובץ ענק → null/בלי חריגה', async () => {
  const { calls, readFile } = counted();
  await fs.writeFile(path.join(dir, 'n.jpg'), await jpeg(50));
  await inspectPageImage('/uploads/books/b/n.jpg', { cache: null, now: later, readFile });
  await inspectPageImage('/uploads/books/b/n.jpg', { cache: null, now: later, readFile });
  assert.equal(calls.n, 2);
  assert.equal(await inspectPageImage('/uploads/../../etc/passwd'), null);
  const big = path.join(dir, 'big.jpg');
  const fh = await fs.open(big, 'w');
  await fh.truncate(IMAGE_CHECK_MAX_BYTES + 1); // דליל — לא כותב 64MB בפועל
  await fh.close();
  const cache = new ImageInspectCache(10);
  assert.equal(await inspectPageImage('/uploads/books/b/big.jpg', { cache, now: later, readFile }), null);
  assert.equal(calls.n, 2, 'קובץ מעל המגבלה לא נקרא');
});
