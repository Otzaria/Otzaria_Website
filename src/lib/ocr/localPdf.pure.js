// פונקציות טהורות לייצוא PDF הקלט של עבודת OCR מקומית — בלי DB/fs/network.
// imports יחסיים בלבד (נבדק ב-node:test).
import { pageHasText } from './runOcrJob.pure.js';

const MiB = 1024 * 1024;
// תקרות החוזה בצד השירות (מפרט: PDF עד 1GiB ו-2,000 עמודים) — ה-env יכול רק להנמיך.
export const HARD_MAX_PAGES = 2000;
export const HARD_MAX_INPUT_BYTES = 1024 * MiB;
// ברירת מחדל שמרנית: pdf-lib בונה את כל הקובץ בזיכרון של תהליך Next (ראו localPdf.js).
export const DEFAULT_MAX_INPUT_BYTES = 512 * MiB;

const positiveInt = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// { maxPages, maxBytes } מתוך OCR_LOCAL_MAX_PAGES / OCR_LOCAL_MAX_INPUT_BYTES.
// ערך חסר/לא תקין → ברירת מחדל; ערך מעל תקרת החוזה → התקרה.
export function readLocalLimits(env = process.env) {
  const pages = positiveInt(env.OCR_LOCAL_MAX_PAGES) ?? HARD_MAX_PAGES;
  const bytes = positiveInt(env.OCR_LOCAL_MAX_INPUT_BYTES) ?? DEFAULT_MAX_INPUT_BYTES;
  return { maxPages: Math.min(pages, HARD_MAX_PAGES), maxBytes: Math.min(bytes, HARD_MAX_INPUT_BYTES) };
}

const byPageNumber = (a, b) => a.pageNumber - b.pageNumber || String(a._id).localeCompare(String(b._id));

// העמודים שנכנסים ל-PDF: רק עמודים עם תמונה; במצב skip רק עמודים בלי טקסט ברגע היצירה.
// ממוינים לפי pageNumber (pdfPageIndex = המיקום ברשימה + 1). לא משנה את המערך המקורי.
export function selectPagesForLocal(pages, mode) {
  return (pages || [])
    .filter((p) => typeof p?.imagePath === 'string' && p.imagePath.trim() !== '')
    .filter((p) => mode !== 'skip' || !pageHasText(p))
    .sort(byPageNumber);
}

const formatMiB = (bytes) => (bytes / MiB).toFixed(bytes < 10 * MiB ? 1 : 0);

// null אם בגבולות, אחרת { code, messageHe }
export function checkLimits({ count, totalBytes }, { maxPages, maxBytes }) {
  if (count > maxPages) {
    return {
      code: 'too_many_pages',
      messageHe: `יש ${count} עמודים לעיבוד — יותר מהמותר לעבודה מקומית אחת (${maxPages})`,
    };
  }
  if (totalBytes > maxBytes) {
    return {
      code: 'input_too_large',
      messageHe: `נפח הקלט (${formatMiB(totalBytes)}MB) חורג מהמותר לעבודה מקומית אחת (${formatMiB(maxBytes)}MB)`,
    };
  }
  return null;
}

// הרזולוציה ה"מוצהרת" של כל עמוד ב-PDF הקלט. הבייטים של התמונה לא משתנים — רק גודל העמוד
// בנקודות (1pt = 1/72 אינץ'): px*72/300. הסיבה: הפייפליין (ocr_torani/render.py, page_dpi)
// מסיק את ה-DPI של הסריקה מיחס פיקסלי התמונה לרוחב העמוד, מעגל לכפולת 50 בטווח 200–400,
// ומרנדר בו. בגודל פיקסל=נקודה הוא היה מסיק 72dpi, מעגל למינימום 200 ומרנדר בהגדלה פי ~2.78
// בכל ציר (אינטרפולציה בלי מידע חדש, זיכרון וזמן מיותרים). בהצהרה על 300dpi הוא מרנדר בדיוק
// ברזולוציה המקורית — פיקסל תמונה אחד לפיקסל רינדור אחד.
export const DECLARED_DPI = 300;

// גודל עמוד בנקודות לתמונה בגודל נתון בפיקסלים (ראו DECLARED_DPI)
export function pageSizeForImage(widthPx, heightPx) {
  return [(widthPx * 72) / DECLARED_DPI, (heightPx * 72) / DECLARED_DPI];
}

// סוג התמונה לפי סיומת: 'jpg' | 'png' | null
export function imageKind(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (e === 'jpg' || e === 'jpeg') return 'jpg';
  if (e === 'png') return 'png';
  return null;
}

// סוג התמונה לפי התוכן (magic bytes) — מקור האמת להטמעה, כי סיומת עלולה לשקר.
// 'jpg' | 'png' | 'webp' | 'gif' | 'tiff' | 'bmp' | null
export function sniffImageKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  return null;
}

// pdf-lib (JpegEmbedder) קורא את הבייטים דרך new DataView(bytes.buffer) — בלי byteOffset.
// Buffer שהוא חלון בתוך ArrayBuffer גדול יותר (pool) ייקרא מהמקום הלא נכון, לכן מעבירים
// תמיד Uint8Array שמחזיק ArrayBuffer משלו בדיוק (העתקה רק כשצריך).
export function standaloneBytes(buf) {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return new Uint8Array(buf.buffer, 0, buf.byteLength);
  }
  return new Uint8Array(buf); // העתקה
}

const ERROR_MESSAGES_HE = {
  no_pages: () => 'אין עמודים לעיבוד',
  missing_image: (list) => `חסרות או פגומות תמונות בעמודים: ${list}`,
  unsupported_image: (list) => `פורמט תמונה שאינו נתמך (רק JPEG ו-PNG) בעמודים: ${list}`,
  missing_timestamp: (list) => `חסר מועד עדכון לעמודים: ${list}`,
  invalid_page_number: (list) => `מספר עמוד לא תקין (חייב להיות שלם וחיובי): ${list}`,
};

// "1, 2, 3 ועוד 17" — עד 20 מספרים ברשימה
export function formatPageList(pageNumbers, max = 20) {
  const nums = [...new Set(pageNumbers)].sort((a, b) => a - b);
  const head = nums.slice(0, max).join(', ');
  return nums.length > max ? `${head} ועוד ${nums.length - max}` : head;
}

// שגיאת קלט מסווגת וסופית (ניסיון חוזר לא יעזור): code + pageNumbers + messageHe.
// כל חריגה אחרת מ-buildJobInput (I/O זמני וכו') — לא מסווגת, וניתן לנסות שוב.
export class LocalInputError extends Error {
  constructor(code, { pageNumbers = [], messageHe } = {}) {
    const list = formatPageList(pageNumbers);
    super(code);
    this.name = 'LocalInputError';
    this.code = code;
    this.pageNumbers = [...new Set(pageNumbers)].sort((a, b) => a - b);
    this.messageHe = messageHe || ERROR_MESSAGES_HE[code]?.(list) || 'קלט לא תקין לעבודה מקומית';
    this.permanent = true;
  }
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

// pageMap לשמירה ב-OcrJob (PageMapEntrySchema): pdfPageIndex מ-1 לפי סדר הרשימה.
// הקלט: עמודים ממוינים עם { _id, pageNumber, updatedAt, imageSha256 }.
// expectedUpdatedAt = updatedAt של העמוד ברגע היצירה — ההחלה מותנית בו.
// מאמת את כל מה שהחוזה דורש, כדי שהמעטפה לא תידחה בצד השירות.
export function buildPageMap(pagesWithHashes) {
  const missingTs = pagesWithHashes.filter((p) => !isValidDate(p.updatedAt)).map((p) => p.pageNumber);
  if (missingTs.length) throw new LocalInputError('missing_timestamp', { pageNumbers: missingTs });
  // החוזה דורש pageNumber שלם >= 1, וסכמת Page לא אוכפת זאת — נתון פגום ב-DB הוא שגיאת קלט
  // סופית (ניסיון חוזר ייכשל שוב), לא חריגה זמנית.
  const badNumbers = pagesWithHashes.filter((p) => !Number.isInteger(p.pageNumber) || p.pageNumber < 1).map((p) => p.pageNumber);
  if (badNumbers.length) throw new LocalInputError('invalid_page_number', { pageNumbers: badNumbers });
  const seenIds = new Set();
  return pagesWithHashes.map((p, i) => {
    const id = String(p._id ?? '');
    if (!id || seenIds.has(id)) throw new Error('invalid_page_id');
    seenIds.add(id);
    if (typeof p.imageSha256 !== 'string' || !SHA256_RE.test(p.imageSha256)) throw new Error('invalid_image_sha256');
    return {
      pdfPageIndex: i + 1,
      page: p._id,
      pageNumber: p.pageNumber,
      expectedUpdatedAt: p.updatedAt,
      imageSha256: p.imageSha256,
    };
  });
}

// רשומת pageMap (כפי שנשמרה ב-DB) → הצורה של job-envelope.schema.json בחוזה השירות:
// { pdfPageIndex, pageId (מחרוזת), pageNumber, expectedUpdatedAt (ISO 8601 UTC עם מילישניות,
// דטרמיניסטי — השירות משווה בין סבבים ומזהה manifest_conflict), imageSha256 (hex קטן) }.
export function pageMapEntryToContract(e) {
  const at = e.expectedUpdatedAt instanceof Date ? e.expectedUpdatedAt : new Date(e.expectedUpdatedAt);
  return {
    pdfPageIndex: e.pdfPageIndex,
    pageId: String(e.page),
    pageNumber: e.pageNumber,
    expectedUpdatedAt: at.toISOString(),
    imageSha256: e.imageSha256,
  };
}
