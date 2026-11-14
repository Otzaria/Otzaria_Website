// ייצוא PDF לעבודה מקומית מול קבצים אמיתיים בתיקייה זמנית.
// images.js קורא את UPLOAD_DIR בזמן הטעינה — לכן ה-env נקבע לפני dynamic import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const JOB = '64b7f0c2a1b2c3d4e5f6000a';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const T = (n) => new Date(Date.UTC(2026, 9, 19, 8, 0, n, 250));

let tmp;
let uploads;
let storage;
let buildJobInput;
let selectPagesForLocal;
let pageMapEntryToContract;
let LocalInputError;
let relToAbs;
const imgs = {};

const solid = (w, h, rgb) => sharp({ create: { width: w, height: h, channels: 3, background: rgb } });

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-local-pdf-'));
  uploads = path.join(tmp, 'uploads');
  storage = path.join(tmp, 'storage');
  process.env.UPLOAD_DIR = uploads;
  process.env.OCR_LOCAL_STORAGE_DIR = storage;
  ({ buildJobInput } = await import('./localPdf.js'));
  ({ selectPagesForLocal, pageMapEntryToContract, LocalInputError } = await import('./localPdf.pure.js'));
  ({ relToAbs } = await import('./localStorage.js'));

  const dir = path.join(uploads, 'books', 'b');
  await fs.mkdir(dir, { recursive: true });
  imgs.j1 = await solid(120, 160, { r: 200, g: 10, b: 10 }).jpeg({ quality: 85 }).toBuffer();
  imgs.j2 = await solid(100, 140, { r: 10, g: 200, b: 10 }).jpeg({ quality: 85, progressive: true }).toBuffer();
  imgs.j3 = await solid(80, 60, { r: 10, g: 10, b: 200 }).jpeg({ quality: 70 }).toBuffer();
  imgs.png = await solid(50, 70, { r: 1, g: 2, b: 3 }).png().toBuffer();
  imgs.webp = await solid(30, 30, { r: 9, g: 9, b: 9 }).webp().toBuffer();
  await fs.writeFile(path.join(dir, 'page.1.jpg'), imgs.j1);
  await fs.writeFile(path.join(dir, 'page.2.jpg'), imgs.j2);
  // סיומת png אבל תוכן JPEG — ההטמעה לפי התוכן
  await fs.writeFile(path.join(dir, 'page.3.png'), imgs.j3);
  await fs.writeFile(path.join(dir, 'page.10.png'), imgs.png);
  await fs.writeFile(path.join(dir, 'page.5.webp'), imgs.webp);
  await fs.writeFile(path.join(dir, 'page.6.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40, 7)]));
});

after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const page = (n, file, extra = {}) => ({
  _id: `id-${n}`,
  pageNumber: n,
  imagePath: `/uploads/books/b/${file}`,
  updatedAt: T(n),
  content: '',
  ...extra,
});

const book = () => [
  page(10, 'page.10.png'),
  page(2, 'page.2.jpg'),
  page(3, 'page.3.png', { content: 'כבר יש טקסט' }),
  page(1, 'page.1.jpg'),
];

test('buildJobInput: PDF בסדר pageNumber, JPEG מוטמע בלי דחיסה מחדש, hashes ו-pageMap נכונים', async () => {
  const pages = selectPagesForLocal(book(), 'overwrite');
  const out = await buildJobInput({ jobId: JOB, pages });

  // pageMap: מבוסס-1, לפי סדר העמודים, עם imageSha256 של בייטי הקובץ
  assert.deepEqual(out.pageMap.map((e) => [e.pdfPageIndex, e.pageNumber, e.page]), [
    [1, 1, 'id-1'], [2, 2, 'id-2'], [3, 3, 'id-3'], [4, 10, 'id-10'],
  ]);
  assert.deepEqual(out.pageMap.map((e) => e.imageSha256), [sha(imgs.j1), sha(imgs.j2), sha(imgs.j3), sha(imgs.png)]);
  assert.deepEqual(out.pageMap.map((e) => e.expectedUpdatedAt), [T(1), T(2), T(3), T(10)]);
  // הצורה של החוזה (job-envelope.schema.json)
  for (const e of out.pageMap.map(pageMapEntryToContract)) {
    assert.match(e.imageSha256, /^[0-9a-f]{64}$/);
    assert.match(e.expectedUpdatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(typeof e.pageId, 'string');
  }

  // הקובץ: נתיב יחסי פרטי, sha ו-bytes תואמים לדיסק, בלי קבצים זמניים
  assert.equal(out.inputPath, `${JOB}/input-${out.inputSha256}.pdf`);
  const abs = relToAbs(out.inputPath);
  assert.ok(abs.startsWith(path.resolve(storage) + path.sep));
  const pdf = await fs.readFile(abs);
  assert.equal(out.inputSha256, sha(pdf));
  assert.equal(out.inputBytes, pdf.length);
  assert.deepEqual(await fs.readdir(path.join(storage, JOB)), [`input-${out.inputSha256}.pdf`]);

  // כל JPEG נמצא בתוך ה-PDF בייט-בבייט — הוכחה שאין דחיסה מחדש
  for (const k of ['j1', 'j2', 'j3']) assert.ok(pdf.indexOf(imgs[k]) > 0, k);

  const doc = await PDFDocument.load(pdf, { updateMetadata: false }); // load רגיל דורס Producer
  assert.equal(doc.getPageCount(), 4);
  // גודל עמוד = פיקסלים*72/300 (הצהרת 300dpi): הפייפליין מסיק בדיוק 300dpi ולא מגדיל
  const sizes = doc.getPages().map((p) => [p.getWidth(), p.getHeight()]);
  const px = [[120, 160], [100, 140], [80, 60], [50, 70]];
  sizes.forEach(([w, h], i) => {
    assert.ok(Math.abs(w - (px[i][0] * 72) / 300) < 1e-6, `width ${i}: ${w}`);
    assert.ok(Math.abs(h - (px[i][1] * 72) / 300) < 1e-6, `height ${i}: ${h}`);
    // ה-DPI כפי שהפייפליין מחשב אותו (פיקסלי התמונה / רוחב העמוד באינצ'ים)
    assert.equal(Math.round(px[i][0] / (w / 72)), 300);
  });
  assert.equal(doc.getProducer(), 'Otzaria');
  assert.equal(doc.getCreationDate(), undefined, 'בלי תאריכים — פלט דטרמיניסטי');
});

test('buildJobInput: אותו קלט → אותו קובץ (ניסיון חוזר לא יוצר עותק ולא מחליף)', async () => {
  const pages = selectPagesForLocal(book(), 'overwrite');
  const a = await buildJobInput({ jobId: JOB, pages });
  const st = await fs.stat(relToAbs(a.inputPath));
  const b = await buildJobInput({ jobId: JOB, pages });
  assert.equal(b.inputSha256, a.inputSha256);
  assert.equal(b.inputPath, a.inputPath);
  assert.equal((await fs.stat(relToAbs(a.inputPath))).mtimeMs, st.mtimeMs);
  assert.equal((await fs.readdir(path.join(storage, JOB))).length, 1);
});

test('buildJobInput: skip שולח רק עמודים בלי טקסט', async () => {
  const out = await buildJobInput({ jobId: '64b7f0c2a1b2c3d4e5f6000b', pages: selectPagesForLocal(book(), 'skip') });
  assert.deepEqual(out.pageMap.map((e) => e.pageNumber), [1, 2, 10]);
  assert.equal((await PDFDocument.load(await fs.readFile(relToAbs(out.inputPath)))).getPageCount(), 3);
});

const rejectsWith = (promise, code, pageNumbers) =>
  assert.rejects(promise, (e) => {
    assert.ok(e instanceof LocalInputError, String(e));
    assert.equal(e.code, code);
    assert.equal(e.permanent, true);
    if (pageNumbers) assert.deepEqual(e.pageNumbers, pageNumbers);
    assert.ok(e.messageHe.length > 0);
    return true;
  });

test('buildJobInput: תמונה חסרה, נתיב מחוץ להעלאות או פגומה → missing_image עם כל מספרי העמודים', async () => {
  const jobId = '64b7f0c2a1b2c3d4e5f6000c';
  await rejectsWith(
    buildJobInput({ jobId, pages: [page(1, 'page.1.jpg'), page(4, 'nope.jpg'), { ...page(7, 'x'), imagePath: '/uploads/../../etc/passwd' }] }),
    'missing_image',
    [4, 7]
  );
  await rejectsWith(buildJobInput({ jobId, pages: [page(1, 'page.1.jpg'), page(6, 'page.6.jpg')] }), 'missing_image', [6]);
  // נתיב פגום שה-fs דוחה דטרמיניסטית (NUL → ERR_INVALID_ARG_VALUE, שם ארוך מדי → ENAMETOOLONG)
  // הוא שגיאת קלט סופית, לא חריגה זמנית שמשאירה את העבודה בהכנה לנצח
  await rejectsWith(
    buildJobInput({ jobId, pages: [page(1, 'page.1.jpg'), page(8, 'bad\0name.jpg'), page(9, `${'x'.repeat(5000)}.jpg`)] }),
    'missing_image',
    [8, 9]
  );
  assert.equal(await fs.stat(path.join(storage, jobId)).catch(() => null), null, 'לא נכתב קובץ');
});

test('buildJobInput: WebP → unsupported_image', async () => {
  await rejectsWith(
    buildJobInput({ jobId: '64b7f0c2a1b2c3d4e5f6000d', pages: [page(1, 'page.1.jpg'), page(5, 'page.5.webp')] }),
    'unsupported_image',
    [5]
  );
});

test('buildJobInput: מגבלות, רשימה ריקה, מועד עדכון חסר ו-jobId לא תקין', async () => {
  const jobId = '64b7f0c2a1b2c3d4e5f6000e';
  const pages = selectPagesForLocal(book(), 'overwrite');
  await rejectsWith(buildJobInput({ jobId, pages, limits: { maxPages: 3, maxBytes: 1e9 } }), 'too_many_pages');
  await rejectsWith(buildJobInput({ jobId, pages, limits: { maxPages: 10, maxBytes: 100 } }), 'input_too_large');
  await rejectsWith(buildJobInput({ jobId, pages: [] }), 'no_pages');
  await rejectsWith(buildJobInput({ jobId, pages: [page(2, 'page.2.jpg', { updatedAt: undefined })] }), 'missing_timestamp', [2]);
  await assert.rejects(buildJobInput({ jobId: '../x', pages }), /invalid_job_id/);
});
