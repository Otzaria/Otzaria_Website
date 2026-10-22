// מטמון תוצאת בדיקת תמונת העמוד (sha256 + מידות + EXIF) ל-GET /api/page-content/ocr-data —
// לוגיקה טהורה (בלי imports). בלי מטמון כל GET קורא עד 64MB מהדיסק, מגבב ומריץ sharp.
//
// למה מטמון בזיכרון התהליך ולא שדה על Page/OcrPageResult: ה-hash הוא תכונה של *הקובץ שעל הדיסק*,
// לא של הרשומה — הקובץ מוחלף מחוץ ל-DB (העלאה מחדש, העתקה ידנית, מיזוג), ושדה שמור היה נשאר
// "תואם" אחרי החלפה. כאן כל קריאה עושה fs.stat טרי, והתוצאה השמורה מוחזרת רק אם חתימת ה-stat
// זהה לחלוטין לזו שבזמן החישוב.
//
// חתימת ה-stat (imageStatKey): גודל + mtime + ctime בננו-שניות (stat עם bigint:true) + ino + dev.
// כתיבה לקובץ משנה mtime/ctime, החלפה ב-rename משנה ino, ו-utimes (החזרת mtime ידנית) משנה ctime.
//
// "חלון מרוץ" (isStatSettled, כמו racy-git): לחותמות הזמן יש רזולוציה גסה בפועל (שעון מערכת של
// ~1–16ms, ו-2 שניות ב-FAT), ולכן כתיבה שנייה באותו "טיק" עם אותו גודל עלולה להשאיר חתימה זהה.
// לכן שומרים במטמון רק קובץ שה-mtime וה-ctime שלו ישנים מ-RACY_WINDOW_MS ביחס לזמן הבדיקה: כל
// שינוי עתידי יקבל חותמת זמן חדשה בהכרח (≥ זמן הבדיקה), כלומר חתימה שונה. קובץ "טרי" נבדק מחדש
// בכל קריאה עד שיתיישן.
//
// מגבלה מתועדת: שינוי תוכן ששומר גודל, mtime, ctime, ino ו-dev זהים (כתיבה ישירה לדיסק הגולמי
// או הזזת שעון המערכת אחורה) לא יזוהה עד שהרשומה תיפלט מהמטמון או שהתהליך יופעל מחדש.

export const IMAGE_INSPECT_CACHE_MAX_ENTRIES = 2000;
export const RACY_WINDOW_MS = 5000;

const NS_PER_MS = 1000000n;

/**
 * חתימת stat לקובץ (fs.Stats עם bigint:true).
 * @param {{size:bigint, mtimeNs:bigint, ctimeNs:bigint, ino:bigint, dev:bigint}} st
 * @returns {string}
 */
export function imageStatKey(st) {
  return [st.size, st.mtimeNs, st.ctimeNs, st.ino, st.dev].map(String).join(':');
}

/**
 * האם הקובץ "התיישב" — ה-mtime וה-ctime ישנים מ-windowMs לפני nowMs (ראו הערת הקובץ).
 * חותמת זמן בעתיד (סטיית שעון) → false.
 * @param {{mtimeNs:bigint, ctimeNs:bigint}} st
 * @param {number} nowMs
 * @param {number} [windowMs]
 */
export function isStatSettled(st, nowMs, windowMs = RACY_WINDOW_MS) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs)) return false;
  const newest = st.mtimeNs > st.ctimeNs ? st.mtimeNs : st.ctimeNs;
  const nowNs = BigInt(Math.floor(nowMs)) * NS_PER_MS;
  return nowNs - newest >= BigInt(Math.max(0, Math.ceil(windowMs))) * NS_PER_MS;
}

/**
 * LRU מוגבל במספר רשומות, רשומה אחת לכל נתיב קובץ (נתיב מוחלט). get מחזיר את התוצאה רק אם
 * חתימת ה-stat זהה; חתימה שונה מוחקת את הרשומה הישנה מיד (לא נשארות רשומות מתות לאותו קובץ).
 */
export class ImageInspectCache {
  constructor(maxEntries = IMAGE_INSPECT_CACHE_MAX_ENTRIES) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    /** @type {Map<string, {statKey:string, value:any}>} */
    this.map = new Map();
  }

  /** @returns {any|undefined} עותק של התוצאה, או undefined */
  get(fsPath, statKey) {
    const entry = this.map.get(fsPath);
    if (!entry) return undefined;
    this.map.delete(fsPath);
    if (entry.statKey !== statKey) return undefined;
    this.map.set(fsPath, entry);
    return { ...entry.value };
  }

  set(fsPath, statKey, value) {
    this.map.delete(fsPath);
    this.map.set(fsPath, { statKey, value: { ...value } });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  delete(fsPath) {
    this.map.delete(fsPath);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}
