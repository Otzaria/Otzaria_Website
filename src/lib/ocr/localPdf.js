// ייצוא PDF הקלט של עבודת OCR מקומית מתמונות העמודים הקיימות, עם pageMap ו-sha256.
// Uploads/storage are supplied by the live installation, not bundled build assets.
//
// - JPEG מוטמע כמו שהוא (embedJpg → DCTDecode על הבייטים המקוריים), בלי דחיסה מחדש.
//   PNG מוטמע lossless (embedPng). כל פורמט אחר → unsupported_image (לפי תוכן הקובץ, לא סיומת).
// - pdfPageIndex מבוסס-1 לפי סדר pageNumber; גודל כל עמוד = פיקסלים*72/300 (הצהרת 300dpi —
//   ראו DECLARED_DPI ב-localPdf.pure.js), כדי שהפייפליין ירנדר ברזולוציה המקורית.
// - imageSha256 לכל עמוד = sha256 של בייטי קובץ התמונה; inputSha256 = sha256 של קובץ ה-PDF.
// - תמונה חסרה או פגומה: אין דילוג שקט (בניגוד ל-export-pdf) — מיפוי חסר שובר את החוזה.
// - הקובץ נכתב עמיד (זמני → fsync → rename) לשם input-<sha>.pdf לפני שה-DB מפנה אליו.
// - פלט דטרמיניסטי: בלי תאריכי יצירה/שינוי במטא-דאטה, כך שאותו קלט נותן אותו sha
//   (ניסיון חוזר עם אותו requestId מגיע לאותו קובץ ולא יוצר עותק נוסף).
//
// זיכרון: pdf-lib בונה את כל הקובץ בזיכרון — בשיא בערך פעמיים נפח התמונות (בייטי ה-JPEG
// המוחזקים עד save + הפלט). לכן נבדקת תקרת נפח לפי גודל הקבצים **לפני** קריאתם, ו-PNG
// מוטמע מיד (img.embed) כדי שהפיקסלים המפוענחים ישתחררו לפני העמוד הבא.
// imports יחסיים בלבד (נבדק ב-node:test).
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { resolveImageFsPath } from './images.js';
import { writeJobFileDurable, JOB_ID_RE } from './localStorage.js';
import {
  LocalInputError,
  buildPageMap,
  checkLimits,
  pageSizeForImage,
  readLocalLimits,
  sniffImageKind,
  standaloneBytes,
} from './localPdf.pure.js';

// שגיאות fs שנובעות מהנתיב עצמו (לא מתקלת I/O רגעית) — ניסיון חוזר לא יעזור, ולכן
// מסווגות כתמונה חסרה (סופי): קובץ/תיקייה לא קיימים, נתיב ארוך מדי, לולאת קישורים,
// או נתיב עם תו NUL (Node זורק ERR_INVALID_ARG_VALUE). EACCES/EIO וכד' — זמניים.
const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR', 'ENAMETOOLONG', 'ELOOP', 'ERR_INVALID_ARG_VALUE']);

// שלב 1 (זול, בלי לקרוא תוכן): נתיב חוקי וקיים לכל עמוד, ומועד עדכון. מחזיר את הנתיבים
// ואת סכום הגדלים לבדיקת התקרה. כל הבעיות נאספות ומדווחות יחד.
async function statPages(pages) {
  const missing = [];
  const missingTs = [];
  const fsPaths = [];
  let totalBytes = 0;
  for (const p of pages) {
    if (!(p.updatedAt instanceof Date) || Number.isNaN(p.updatedAt.getTime())) missingTs.push(p.pageNumber);
    let fsPath = null;
    try {
      fsPath = resolveImageFsPath(p.imagePath);
      const st = await fs.stat(/*turbopackIgnore: true*/ fsPath);
      if (!st.isFile()) throw Object.assign(new Error('not a file'), { code: 'EISDIR' });
      totalBytes += st.size;
    } catch (err) {
      // נתיב מחוץ לתיקיית ההעלאות (resolveImageFsPath זורק בלי code) או קובץ שאינו קיים
      if (err?.code && !MISSING_CODES.has(err.code)) throw err; // I/O זמני — ניתן לנסות שוב
      missing.push(p.pageNumber);
    }
    fsPaths.push(fsPath);
  }
  if (missing.length) throw new LocalInputError('missing_image', { pageNumbers: missing });
  if (missingTs.length) throw new LocalInputError('missing_timestamp', { pageNumbers: missingTs });
  return { fsPaths, totalBytes };
}

/**
 * בונה את קובץ ה-PDF של עבודה מקומית ושומר אותו באחסון הפרטי.
 * @param {object} args
 * @param {string} args.jobId מזהה העבודה (24 hex)
 * @param {Array<{_id:any,pageNumber:number,imagePath:string,updatedAt:Date}>} args.pages
 *   העמודים לעיבוד, כבר נבחרים וממוינים (selectPagesForLocal)
 * @param {{maxPages:number,maxBytes:number}} [args.limits]
 * @returns {Promise<{inputPath:string,inputSha256:string,inputBytes:number,pageMap:object[]}>}
 *   inputPath יחסי לשורש האחסון; pageMap בצורת PageMapEntrySchema (pageMapEntryToContract לחוזה).
 * @throws {LocalInputError} בשגיאת קלט סופית (no_pages, missing_image, unsupported_image,
 *   missing_timestamp, invalid_page_number, too_many_pages, input_too_large). כל חריגה אחרת — זמנית.
 */
export async function buildJobInput({ jobId, pages, limits = readLocalLimits(), env = process.env }) {
  if (typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) throw new Error('invalid_job_id');
  if (!Array.isArray(pages) || pages.length === 0) throw new LocalInputError('no_pages');

  const countErr = checkLimits({ count: pages.length, totalBytes: 0 }, limits);
  if (countErr) throw new LocalInputError(countErr.code, { messageHe: countErr.messageHe });

  const { fsPaths, totalBytes } = await statPages(pages);
  const sizeErr = checkLimits({ count: pages.length, totalBytes }, limits);
  if (sizeErr) throw new LocalInputError(sizeErr.code, { messageHe: sizeErr.messageHe });

  // updateMetadata:false — בלי CreationDate/ModDate/Creator אוטומטיים (פלט דטרמיניסטי)
  const pdfDoc = await PDFDocument.create({ updateMetadata: false });
  pdfDoc.setProducer('Otzaria');

  const unsupported = [];
  const broken = [];
  const withHashes = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let buf;
    try {
      buf = await fs.readFile(/*turbopackIgnore: true*/ fsPaths[i]);
    } catch (err) {
      if (!MISSING_CODES.has(err?.code)) throw err;
      broken.push(p.pageNumber); // נמחק בין stat לקריאה
      continue;
    }
    const imageSha256 = createHash('sha256').update(buf).digest('hex');
    withHashes.push({ _id: p._id, pageNumber: p.pageNumber, updatedAt: p.updatedAt, imageSha256 });

    const kind = sniffImageKind(buf);
    if (kind !== 'jpg' && kind !== 'png') {
      unsupported.push(p.pageNumber);
      continue;
    }
    if (unsupported.length || broken.length) continue; // ממילא ייכשל — רק אוספים את כל הבעיות

    let image;
    try {
      const bytes = standaloneBytes(buf);
      image = kind === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
      // הטמעה מיידית: ב-PNG משחררת את הפיקסלים המפוענחים (נדחסים ל-Flate); ב-JPEG — כלום.
      await image.embed();
    } catch {
      broken.push(p.pageNumber);
      continue;
    }
    // גודל העמוד בנקודות = פיקסלים*72/300 (DECLARED_DPI) — כך הפייפליין מרנדר ברזולוציה המקורית
    const [width, height] = pageSizeForImage(image.width, image.height);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  if (unsupported.length) throw new LocalInputError('unsupported_image', { pageNumbers: unsupported });
  if (broken.length) throw new LocalInputError('missing_image', { pageNumbers: broken });

  const pageMap = buildPageMap(withHashes);
  if (pdfDoc.getPageCount() !== pageMap.length) throw new Error('page_count_mismatch');

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
  const outErr = checkLimits({ count: pageMap.length, totalBytes: pdfBytes.byteLength }, limits);
  if (outErr) throw new LocalInputError(outErr.code, { messageHe: outErr.messageHe });

  const written = await writeJobFileDurable(jobId, 'input', pdfBytes, env);
  return {
    inputPath: written.relPath,
    inputSha256: written.sha256,
    inputBytes: written.bytes,
    pageMap,
  };
}
