// אוצר-המילים של "הגהה לאימון המודלים" — חוזה ה-ZIP tp/1 בין תחנת-האימון לאתר
// (docs/76 בפרויקט ה-OCR). מקור-אמת אחד לשלושת חלקי הדף (זיהוי · נתב · גלאי),
// לממשק הניהול ולבדיקות. שינוי של ערך כאן = גרסה חדשה של החוזה (tp/2).
//
// טהור לגמרי: בלי מסד, בלי next — כדי שירוץ גם ב-node:test וגם בדפדפן.

export const CONTRACT = 'tp/1';
export const DIR_TO_SITE = 'to-site';
export const DIR_TO_STATION = 'to-station';

// שלושת החלקים. קובץ ZIP אחד = חלק אחד
export const SECTIONS = ['ocr', 'router', 'frames'];
export const SECTION_LABELS = {
  ocr: 'זיהוי טקסט',
  router: 'נתב הכתב',
  frames: 'גלאי אזורים',
};
// היחידה שמגיהים בכל חלק — ל"ההגהות שלי" (ה-3)
export const SECTION_UNITS = {
  ocr: 'שורות זיהוי',
  router: 'שורות נתב',
  frames: 'עמודי גלאי',
};
// הטבלה בתחנה שממנה בא הפריט — החלק השני של ה-uid
export const SECTION_TABLES = { ocr: 'lines', router: 'rlines', frames: 'fpages' };

// כתב של שורה ושל מילה (§2)
export const LINE_SCRIPTS = ['square', 'rashi', 'latin', 'mixed'];
export const WORD_SCRIPTS = ['square', 'rashi', 'latin', 'neutral'];
export const SCRIPT_LABELS = {
  square: 'מרובע',
  rashi: 'רש"י',
  latin: 'לועזית',
  mixed: 'מעורבת',
  neutral: 'ניטרלי',
};

// ocr — מקור הטקסט (§4.1)
export const OCR_SOURCES = ['ocr', 'synth'];

// ocr — מה המתנדב עשה (§5.1). skip = "דלג": לא יוצא לתחנה, הפריט חוזר למאגר
export const OCR_ACTIONS = ['ok', 'fixed', 'seg', 'skip', 'bad', 'router'];
export const OCR_RETURN_ACTIONS = ['ok', 'fixed', 'seg', 'bad', 'router'];
// המקשים 1–6 כמו בתחנה (docs/75 "ברירות-מחדל"): 1 נכון · 2 תקן · 3 חיתוך גרוע · 4 דלג · 5 לא קריא · 6 הכתב שגוי
export const OCR_KEYS = { 1: 'ok', 2: 'fixed', 3: 'seg', 4: 'skip', 5: 'bad', 6: 'router' };
export const OCR_ACTION_LABELS = {
  ok: 'נכון',
  fixed: 'תוקן',
  seg: 'חיתוך גרוע',
  skip: 'דלג',
  bad: 'לא קריא',
  router: 'הכתב שגוי',
};

// router — כתב-שורה במקשים 1–4 (0 = פסול)
export const ROUTER_KEYS = { 1: 'square', 2: 'rashi', 3: 'latin', 4: 'mixed' };
// מקשי כתב-המילה בשורה מעורבת: אותם 1–3, ו-4 = ניטרלי
export const ROUTER_WORD_KEYS = { 1: 'square', 2: 'rashi', 3: 'latin', 4: 'neutral' };
export const WORDS_SRC = ['station', 'site'];

// frames — תפקידי-מסגרת (התחנה, frames.js ROLE_KEYS) וסוגי-אובייקט (§4.3)
export const FRAME_KINDS = ['text', 'object'];
export const FRAME_ROLES = ['body', 'commentary', 'notes', 'margin', 'heading', 'caption', 'box', 'furniture', 'object'];
export const FRAME_ROLE_LABELS = {
  body: 'פנים',
  commentary: 'פירוש',
  notes: 'הערות',
  margin: 'הערת-צד',
  heading: 'כותרת',
  caption: 'כיתוב',
  box: 'תיבה',
  furniture: 'ריהוט',
  object: 'אובייקט',
};
export const OBJECT_KINDS = ['figure', 'table', 'ornament', 'formula', 'handwriting', 'other'];
export const FRAME_SRC = ['auto', 'human'];
export const PAGE_TYPES = ['scan', 'digital'];
export const FRAMES_PAGE_STATUS_IN = ['proposed', 'marked'];
export const FRAMES_PAGE_STATUS_OUT = ['marked', 'skip'];

// מצבי פריט באתר (§8.1)
export const ITEM_STATUSES = ['available', 'held', 'submitted', 'approved', 'rejected'];
// מצבי מתנדב (§8.1)
export const VOLUNTEER_STATUSES = ['pending', 'approved', 'denied', 'revoked'];

// גבולות (§2)
export const MAX_ITEMS_PER_FILE = 3000;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_FRAMES_PAGES = 40;

// הסבב והדופק (§8.2, ה-4, ה-5)
export const ROUND_SIZE = 30;
export const HEARTBEAT_MS = 60 * 1000;
export const HOLD_MS = 3 * 60 * 1000;
// ספר בגלאי (§8.2)
export const BOOK_CLAIM_MS = 48 * 60 * 60 * 1000;

// תבניות מזהים (§2–§3)
export const SIG_RE = /^[0-9a-f]{16}$/;
export const BOOK_RE = /^b-[0-9a-f]{10}$/;
export const PACKAGE_ID_RE = /^tp-[0-9]{8}-[0-9a-f]{8}$/;
export const STATION_ID_RE = /^st-[0-9a-f]{8}$/;
export const EXPORT_ID_RE = /^tpx-[0-9]{8}-[0-9a-f]{6}$/;
export const VOL_RE = /^v-[0-9a-f]{8}$/;
const UID_RE = /^(ocr|router|frames):([a-z_]+):([A-Za-z0-9_-]{1,64})$/;
// נתיב קובץ בתוך ה-ZIP: ASCII בלבד, יחסי, בלי ".."
export const ZIP_PATH_RE = /^[A-Za-z0-9._\-/]{1,200}$/;
export const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;

// מפרק uid ל-{section, table, id} או null
export function parseUid(uid) {
  const m = UID_RE.exec(String(uid || ''));
  if (!m) return null;
  return { section: m[1], table: m[2], id: m[3] };
}

// uid ששייך לחלק (ocr:lines:… רק ל-ocr וכו')
export function uidFitsSection(uid, section) {
  const p = parseUid(uid);
  return !!p && p.section === section && p.table === SECTION_TABLES[section];
}

// נתיב יחסי בטוח בתוך ה-ZIP
export function safeZipPath(p) {
  const s = String(p || '');
  if (!ZIP_PATH_RE.test(s)) return false;
  if (s.startsWith('/') || s.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return true;
}

export const isSection = (s) => SECTIONS.includes(s);

// תיבה [x0,y0,x1,y1] בפיקסלים של התמונה; w/h — אם ידועים, התיבה בתוכם (עם סובלנות של פיקסל)
export function validBox(box, w = null, h = null) {
  if (!Array.isArray(box) || box.length !== 4) return false;
  if (!box.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const [x0, y0, x1, y1] = box;
  if (x1 <= x0 || y1 <= y0 || x0 < -1 || y0 < -1) return false;
  if (w != null && x1 > w + 1) return false;
  if (h != null && y1 > h + 1) return false;
  return true;
}
