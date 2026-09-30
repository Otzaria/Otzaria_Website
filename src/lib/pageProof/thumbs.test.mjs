import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

// תיקיית-העלאות זמנית — images.js קורא את UPLOAD_DIR בטעינה, ולכן הייבוא דינמי
let root;
let pageThumb;
let removeThumbs;
let THUMB_WIDTH;

const ID = '64b7f0c2a1b2c3d4e5f60009';
const SRC = '/uploads/page-proof/g1/p0001.jpg';

const scan = (width, height, extra = {}) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 }, ...extra } }).jpeg().toBuffer();

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'page-proof-thumbs-'));
  process.env.UPLOAD_DIR = root;
  ({ pageThumb, removeThumbs, THUMB_WIDTH } = await import('./thumbs.js'));
  await fs.mkdir(path.join(root, 'page-proof', 'g1'), { recursive: true });
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

test('ממוזערת ברוחב קבוע, JPEG, ונשמרת בדיסק מתחת ל-page-proof/thumbs', async () => {
  await fs.writeFile(path.join(root, 'page-proof', 'g1', 'p0001.jpg'), await scan(1000, 1400));
  const buf = await pageThumb(ID, SRC);
  const meta = await sharp(buf).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, THUMB_WIDTH);
  assert.equal(meta.height, 504);
  const cached = await fs.readFile(path.join(root, 'page-proof', 'thumbs', `${ID}.jpg`));
  assert.ok(cached.equals(buf));
});

test('קריאה חוזרת מגישה מהדיסק בלי ליצור מחדש', async () => {
  const file = path.join(root, 'page-proof', 'thumbs', `${ID}.jpg`);
  const before = (await fs.stat(file)).mtimeMs;
  const buf = await pageThumb(ID, SRC);
  assert.equal((await fs.stat(file)).mtimeMs, before);
  assert.ok(buf.equals(await fs.readFile(file)));
});

test('תמונת-עמוד חדשה מהממוזערת (ייבוא-חוזר) ← נוצרת מחדש', async () => {
  const src = path.join(root, 'page-proof', 'g1', 'p0001.jpg');
  await fs.writeFile(src, await scan(800, 800));
  const future = new Date(Date.now() + 60_000);
  await fs.utimes(src, future, future);
  const meta = await sharp(await pageThumb(ID, SRC)).metadata();
  assert.equal(meta.width, THUMB_WIDTH);
  assert.equal(meta.height, THUMB_WIDTH);
});

test('תמונה צרה מהרוחב אינה מוגדלת; שקיפות הופכת לרקע לבן', async () => {
  const png = await sharp({ create: { width: 200, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(root, 'page-proof', 'g1', 'p0002.png'), png);
  const buf = await pageThumb('64b7f0c2a1b2c3d4e5f6000a', '/uploads/page-proof/g1/p0002.png');
  const img = sharp(buf);
  const meta = await img.metadata();
  assert.equal(meta.width, 200);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240, 'הרקע לבן ולא שחור');
});

test('תמונה חסרה ← שגיאה (הראוט מחזיר 500), בלי ממוזערת', async () => {
  await assert.rejects(pageThumb('64b7f0c2a1b2c3d4e5f6000b', '/uploads/page-proof/g1/missing.jpg'));
  await assert.rejects(fs.stat(path.join(root, 'page-proof', 'thumbs', '64b7f0c2a1b2c3d4e5f6000b.jpg')));
});

test('נתיב מחוץ לתיקיית ההעלאות נדחה', async () => {
  await assert.rejects(pageThumb(ID, '/uploads/../../etc/passwd'));
});

test('מחיקת ממוזערות (במחיקת ספר): קיימות נמחקות, חסרות מדולגות', async () => {
  const file = path.join(root, 'page-proof', 'thumbs', `${ID}.jpg`);
  await fs.stat(file);
  assert.equal(await removeThumbs([ID, '64b7f0c2a1b2c3d4e5f6ffff']), 1);
  await assert.rejects(fs.stat(file));
  assert.equal(await removeThumbs([]), 0);
  // מקור-התמונה נשאר
  await fs.stat(path.join(root, 'page-proof', 'g1', 'p0001.jpg'));
});
