import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectPagesForLocal,
  checkLimits,
  readLocalLimits,
  buildPageMap,
  pageMapEntryToContract,
  imageKind,
  pageSizeForImage,
  DECLARED_DPI,
  sniffImageKind,
  standaloneBytes,
  formatPageList,
  LocalInputError,
  HARD_MAX_PAGES,
  HARD_MAX_INPUT_BYTES,
  DEFAULT_MAX_INPUT_BYTES,
} from './localPdf.pure.js';

const SHA = 'a'.repeat(64);
const T = new Date('2026-10-19T08:00:00.123Z');

const pages = [
  { _id: 'p3', pageNumber: 3, imagePath: '/uploads/books/b/page.3.jpg', content: '' },
  { _id: 'p1', pageNumber: 1, imagePath: '/uploads/books/b/page.1.jpg', content: 'טקסט' },
  { _id: 'p2', pageNumber: 2, imagePath: '/uploads/books/b/page.2.jpg', rightColumn: '  ', leftColumn: 'שמאל' },
  { _id: 'p4', pageNumber: 4, imagePath: '', content: '' },
  { _id: 'p5', pageNumber: 5, content: '' },
  { _id: 'p0', pageNumber: 10, imagePath: '/uploads/books/b/page.10.jpg', content: '   ' },
];

test('selectPagesForLocal: overwrite — כל העמודים עם תמונה, ממוינים לפי pageNumber', () => {
  const sel = selectPagesForLocal(pages, 'overwrite');
  assert.deepEqual(sel.map((p) => p.pageNumber), [1, 2, 3, 10]);
  assert.equal(pages[0].pageNumber, 3, 'המערך המקורי לא השתנה');
});

test('selectPagesForLocal: skip — רק עמודים בלי טקסט (גם לא בטורים)', () => {
  assert.deepEqual(selectPagesForLocal(pages, 'skip').map((p) => p.pageNumber), [3, 10]);
  assert.deepEqual(selectPagesForLocal(null, 'skip'), []);
});

test('checkLimits', () => {
  const lim = { maxPages: 3, maxBytes: 1000 };
  assert.equal(checkLimits({ count: 3, totalBytes: 1000 }, lim), null);
  const pagesErr = checkLimits({ count: 4, totalBytes: 0 }, lim);
  assert.equal(pagesErr.code, 'too_many_pages');
  assert.match(pagesErr.messageHe, /4/);
  assert.equal(checkLimits({ count: 1, totalBytes: 1001 }, lim).code, 'input_too_large');
});

test('readLocalLimits: ברירות מחדל, הנמכה מה-env ותקרת החוזה', () => {
  assert.deepEqual(readLocalLimits({}), { maxPages: HARD_MAX_PAGES, maxBytes: DEFAULT_MAX_INPUT_BYTES });
  assert.deepEqual(readLocalLimits({ OCR_LOCAL_MAX_PAGES: '50', OCR_LOCAL_MAX_INPUT_BYTES: '1000' }), { maxPages: 50, maxBytes: 1000 });
  assert.deepEqual(
    readLocalLimits({ OCR_LOCAL_MAX_PAGES: '999999', OCR_LOCAL_MAX_INPUT_BYTES: String(HARD_MAX_INPUT_BYTES * 4) }),
    { maxPages: HARD_MAX_PAGES, maxBytes: HARD_MAX_INPUT_BYTES }
  );
  for (const bad of ['', '0', '-5', '1e3', 'abc', ' 12x']) {
    assert.equal(readLocalLimits({ OCR_LOCAL_MAX_PAGES: bad }).maxPages, HARD_MAX_PAGES, bad);
  }
});

test('buildPageMap: pdfPageIndex מבוסס-1 לפי סדר הרשימה, expectedUpdatedAt = updatedAt', () => {
  const map = buildPageMap([
    { _id: 'x1', pageNumber: 2, updatedAt: T, imageSha256: SHA },
    { _id: 'x2', pageNumber: 7, updatedAt: T, imageSha256: 'b'.repeat(64) },
  ]);
  assert.deepEqual(map, [
    { pdfPageIndex: 1, page: 'x1', pageNumber: 2, expectedUpdatedAt: T, imageSha256: SHA },
    { pdfPageIndex: 2, page: 'x2', pageNumber: 7, expectedUpdatedAt: T, imageSha256: 'b'.repeat(64) },
  ]);
});

test('buildPageMap: מאמת את דרישות החוזה', () => {
  const ok = { _id: 'x1', pageNumber: 1, updatedAt: T, imageSha256: SHA };
  assert.throws(() => buildPageMap([ok, { ...ok }]), /invalid_page_id/);
  // מספר עמוד לא תקין — שגיאת קלט סופית (LocalInputError), לא חריגה זמנית
  for (const bad of [0, -3, 1.5, null]) {
    assert.throws(
      () => buildPageMap([{ ...ok, pageNumber: bad }]),
      (e) => e instanceof LocalInputError && e.code === 'invalid_page_number' && e.permanent === true && e.messageHe.length > 0
    );
  }
  assert.throws(() => buildPageMap([{ ...ok, imageSha256: SHA.toUpperCase() }]), /invalid_image_sha256/);
  assert.throws(
    () => buildPageMap([{ ...ok, updatedAt: undefined }, { ...ok, _id: 'x2', pageNumber: 5, updatedAt: new Date('x') }]),
    (e) => e instanceof LocalInputError && e.code === 'missing_timestamp' && e.pageNumbers.join() === '1,5'
  );
});

test('pageMapEntryToContract: בדיוק שדות job-envelope.schema.json, ISO UTC ו-pageId מחרוזת', () => {
  const objectIdLike = { toString: () => '64b7f0c2a1b2c3d4e5f60001' };
  const c = pageMapEntryToContract({ pdfPageIndex: 1, page: objectIdLike, pageNumber: 4, expectedUpdatedAt: T, imageSha256: SHA });
  assert.deepEqual(Object.keys(c), ['pdfPageIndex', 'pageId', 'pageNumber', 'expectedUpdatedAt', 'imageSha256']);
  assert.deepEqual(c, {
    pdfPageIndex: 1,
    pageId: '64b7f0c2a1b2c3d4e5f60001',
    pageNumber: 4,
    expectedUpdatedAt: '2026-10-19T08:00:00.123Z',
    imageSha256: SHA,
  });
  assert.match(c.imageSha256, /^[0-9a-f]{64}$/);
  // אחרי lean() התאריך עשוי להגיע כ-Date; ממחרוזת — אותה תוצאה
  assert.equal(pageMapEntryToContract({ ...c, page: 'p', expectedUpdatedAt: T.toISOString() }).expectedUpdatedAt, c.expectedUpdatedAt);
});

test('pageSizeForImage: הצהרת 300dpi — px*72/300 נקודות', () => {
  assert.equal(DECLARED_DPI, 300);
  assert.deepEqual(pageSizeForImage(300, 600), [72, 144]);
  // 1200×1600 (התמונות באתר) → 288×384 נקודות = 4×5.33 אינץ' ב-300dpi
  assert.deepEqual(pageSizeForImage(1200, 1600), [288, 384]);
  const [w] = pageSizeForImage(1123, 10);
  assert.equal(Math.round(1123 / (w / 72)), 300);
});

test('imageKind / sniffImageKind', () => {
  assert.equal(imageKind('.JPG'), 'jpg');
  assert.equal(imageKind('jpeg'), 'jpg');
  assert.equal(imageKind('.png'), 'png');
  assert.equal(imageKind('.webp'), null);
  assert.equal(imageKind(undefined), null);
  const pad = (arr) => Uint8Array.from([...arr, ...new Array(16).fill(0)]);
  assert.equal(sniffImageKind(pad([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(sniffImageKind(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(sniffImageKind(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'webp');
  assert.equal(sniffImageKind(pad([0x49, 0x49, 0x2a, 0])), 'tiff');
  assert.equal(sniffImageKind(pad([0x47, 0x49, 0x46, 0x38])), 'gif');
  assert.equal(sniffImageKind(pad([1, 2, 3])), null);
  assert.equal(sniffImageKind(Uint8Array.from([0xff, 0xd8])), null);
});

test('standaloneBytes: Buffer מתוך pool מועתק כך ש-.buffer מתחיל בתוכן', () => {
  const big = Buffer.from('xxxxABCD');
  const slice = big.subarray(4);
  const out = standaloneBytes(slice);
  assert.equal(out.byteOffset, 0);
  assert.equal(out.buffer.byteLength, 4);
  assert.equal(new DataView(out.buffer).getUint8(0), 'A'.charCodeAt(0));
  const own = new Uint8Array([1, 2, 3]);
  assert.equal(standaloneBytes(own).buffer, own.buffer, 'בלי העתקה כשאין צורך');
});

test('formatPageList ו-LocalInputError', () => {
  assert.equal(formatPageList([3, 1, 3, 2]), '1, 2, 3');
  assert.equal(formatPageList(Array.from({ length: 25 }, (_, i) => i + 1)), `${Array.from({ length: 20 }, (_, i) => i + 1).join(', ')} ועוד 5`);
  const e = new LocalInputError('missing_image', { pageNumbers: [9, 2] });
  assert.equal(e.code, 'missing_image');
  assert.equal(e.permanent, true);
  assert.deepEqual(e.pageNumbers, [2, 9]);
  assert.match(e.messageHe, /2, 9/);
  assert.equal(e.message, 'missing_image');
  assert.equal(new LocalInputError('too_many_pages', { messageHe: 'הודעה' }).messageHe, 'הודעה');
});
