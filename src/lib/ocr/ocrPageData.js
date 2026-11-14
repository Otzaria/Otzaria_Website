// נתוני OCR מקומי לעמוד (GET /api/page-content/ocr-data): בחירת רשומת OcrPageResult, מצבה ביחס
// לעמוד, ובדיקה שהתמונה הנוכחית של העמוד היא עדיין זו שנשלחה לעיבוד (עם מטמון לפי חתימת stat —
// imageInspectCache.pure.js). הצורה — ocrPageDataView.js.
// imports יחסיים בלבד (נבדק ב-node:test).
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import OcrPageResult from '../../models/OcrPageResult.js';
import OcrConflict from '../../models/OcrConflict.js';
import { resolveImageFsPath } from './images.js';
import { textSha256Hex } from './localResultLayout.pure.js';
import { isCurrentRecord, ocrPageDataState, serializeOcrPageData } from './ocrPageDataView.js';
import { ImageInspectCache, imageStatKey, isStatSettled } from './imageInspectCache.pure.js';

// קובץ תמונה גדול מזה לא נקרא לזיכרון לבדיקת ה-hash (matches: null)
export const IMAGE_CHECK_MAX_BYTES = 64 * 1024 * 1024;

// שדות העמוד שהבדיקה צריכה (לשליפה בראוט)
export const OCR_DATA_PAGE_FIELDS =
  '_id book pageNumber status claimedBy content isTwoColumns imagePath lastOcrJobId lastOcrResultSha256';

// מטמון התוצאה לפי (נתיב מוחלט + חתימת stat) — מדיניות ההתאמה והפסילה: imageInspectCache.pure.js
export const imageInspectCache = new ImageInspectCache();

/**
 * תמונת העמוד הנוכחית: sha256 של הקובץ, ומידות + EXIF orientation (sharp, בכיוון האחסון).
 * כל כשל (קובץ חסר, נתיב לא חוקי, גדול מ-64MB) → null; כשל בפענוח בלבד → מידות null.
 * תוצאה מוצלחת נשמרת במטמון רק כשהקובץ "התיישב" (isStatSettled) ולא השתנה בזמן הקריאה (stat
 * לפני ואחרי זהים), ומוחזרת ממנו רק כשחתימת ה-stat הטרי זהה — קובץ שהוחלף לעולם לא יחזיר
 * את ה-hash הישן.
 * @param {string} imagePath
 * @param {{ cache?: ImageInspectCache|null, now?: () => number, readFile?: (p:string) => Promise<Buffer> }} [opts]
 *   לטסטים: cache:null מבטל את המטמון; now/readFile מוזרקים.
 * @returns {Promise<{sha256:string, width:number|null, height:number|null, orientation:number|null}|null>}
 */
export async function inspectPageImage(imagePath, { cache = imageInspectCache, now = Date.now, readFile = fs.readFile } = {}) {
  try {
    const fsPath = resolveImageFsPath(imagePath);
    const st = await fs.stat(/*turbopackIgnore: true*/ fsPath, { bigint: true });
    if (!st.isFile() || st.size > BigInt(IMAGE_CHECK_MAX_BYTES)) {
      cache?.delete(fsPath);
      return null;
    }
    const statKey = imageStatKey(st);
    const hit = cache?.get(fsPath, statKey);
    if (hit) return hit;

    const buffer = await readFile(/*turbopackIgnore: true*/ fsPath);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    let meta = null;
    try {
      meta = await sharp(buffer).metadata();
    } catch {
      meta = null;
    }
    const result = {
      sha256,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
      // בלי תג EXIF — כיוון רגיל (1)
      orientation: meta ? (meta.orientation ?? 1) : null,
    };
    if (cache) {
      // הקובץ לא השתנה בזמן הקריאה, והבתים שנקראו הם כל הקובץ — אחרת לא שומרים (התוצאה עדיין מוחזרת)
      const after = await fs.stat(/*turbopackIgnore: true*/ fsPath, { bigint: true }).catch(() => null);
      const unchanged = after && imageStatKey(after) === statKey && BigInt(buffer.length) === st.size;
      if (unchanged && isStatSettled(st, now())) cache.set(fsPath, statKey, result);
      else cache.delete(fsPath);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * @param {{ page: any, jobId?: any, inspectImage?: (imagePath:string) => Promise<any> }} args
 *   page — Page (lean, OCR_DATA_PAGE_FIELDS). jobId — רשומה של עבודה מסוימת (היסטוריה/ממתינה);
 *   בלעדיו — הרשומה הנוכחית (Page.lastOcrJobId + Page.lastOcrResultSha256).
 * @returns {Promise<any|null>} הנתונים לתשובה, או null אם אין רשומה מתאימה
 */
export async function loadOcrPageData({ page, jobId = null, inspectImage = inspectPageImage }) {
  let record;
  if (jobId) {
    record = await OcrPageResult.findOne({ page: page._id, job: jobId }).lean();
  } else {
    if (!page.lastOcrJobId || typeof page.lastOcrResultSha256 !== 'string') return null;
    record = await OcrPageResult.findOne({
      page: page._id,
      job: page.lastOcrJobId,
      resultSha256: page.lastOcrResultSha256,
    }).lean();
  }
  if (!record) return null;

  const conflict = isCurrentRecord(record, page)
    ? null
    : await OcrConflict.findOne({ job: record.job, page: page._id }).select('status reason').lean();
  const image = await inspectImage(page.imagePath);
  return serializeOcrPageData({
    page,
    record,
    state: ocrPageDataState(record, page, conflict),
    contentSha256: textSha256Hex(page.content || ''),
    image,
  });
}
