// שמירה מפני מסגרות "בטוחות" שגויות (לוגיקה טהורה): פרופיל ההקרנה (מקור 'profile') מנחש
// שורות ומילים מהתמונה בלבד, ובעמודים מורכבים — פירוש סביב הטקסט, טורים שלא הופרדו, טקסט
// שהוא רק חלק מהעמוד, צילום כהה — הניחוש שגוי, והמסגרת על "המילה" מטעה יותר מכלום. כאן
// בודקים אם התוצאה סבירה, ואם לא — מורידים רמה: 'line' (פס שורה בלי מסגרת מילה) או 'off'.
// עדיף לא לסמן משהו נכון מאשר לסמן משהו שגוי בביטחון. גם זיהוי מקומי (מקור 'local',
// tesseract בדפדפן) נבדק: הוא מזהה מילים באמת, אבל בעמוד מורכב סדר השורות שלו (טורים, גושים)
// לא בהכרח סדר הטקסט. layout/proof — מאומתים, לא נבדקים כאן.

import { lineWords, splitLines } from './caretWord.js';
import { alignmentAgreement } from './caretTrack.js';

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const TAG = /<[^>]*>/g;

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

/** סיבות להורדת הרמה (לשורת המצב ולטסטים) */
export const REASONS = Object.freeze({
  fewLines: 'few-lines', // כמעט אין שורות (צילום כהה / תמונה שאינה דף טקסט)
  tallLine: 'tall-line', // "שורה" שתופסת חלק גדול מהעמוד
  outliers: 'line-outliers', // כמה שורות גבוהות בהרבה מהרגיל (פירוש סביב, ציורים, שורות שהתמזגו)
  unsplit: 'columns-unsplit', // שורות רחבות עם הרבה מילים — כנראה שני טורים שלא הופרדו
  textMismatch: 'text-mismatch', // מספר המילים בטקסט רחוק ממספר המילים שזוהו בצילום
  inconsistent: 'alignment-inconsistent', // אחרי היישור, בשורות רבות מספר המילים לא מתאים (סדר קריאה שגוי)
});

/** המקורות שעוברים את הבדיקה */
const GUARDED = new Set(['profile', 'local']);
const isGuarded = (source) => !!source && GUARDED.has(source.source) && source.level !== 'off';

const RANK = { off: 0, ruler: 1, line: 2, word: 3 };
const lower = (a, b) => (RANK[a] <= RANK[b] ? a : b);

/**
 * בדיקת סבירות של הפרופיל עצמו (בלי הטקסט).
 * @param {{ size?: [number, number]|null, lines?: { bbox: number[], stream?: string, words?: unknown[] }[] }} source
 * @param {{ minLines?: number, tallRatio?: number, outlierRatio?: number, maxOutliers?: number, maxWordsPerLine?: number, wideRatio?: number }} [o]
 * @returns {{ level: 'word'|'line'|'off', reasons: string[] }}
 */
export function assessProfile(source, { minLines = 4, tallRatio = 0.2, outlierRatio = 2.2, maxOutliers = 3, maxWordsPerLine = 16, wideRatio = 0.6 } = {}) {
  const lines = (source?.lines || []).filter((l) => isBox(l?.bbox));
  const reasons = [];
  let level = /** @type {'word'|'line'|'off'} */ ('word');
  if (lines.length < minLines) return { level: 'off', reasons: [REASONS.fewLines] };
  const heights = lines.map((l) => l.bbox[3] - l.bbox[1]);
  const top = Math.min(...lines.map((l) => l.bbox[1]));
  const bottom = Math.max(...lines.map((l) => l.bbox[3]));
  const H = Array.isArray(source?.size) && source.size[1] > 0 ? source.size[1] : bottom - top;
  const W = Array.isArray(source?.size) && source.size[0] > 0 ? source.size[0] : Math.max(...lines.map((l) => l.bbox[2])) - Math.min(...lines.map((l) => l.bbox[0]));
  if (H > 0 && heights.some((h) => h > tallRatio * H)) return { level: 'off', reasons: [REASONS.tallLine] };
  const mh = median(heights);
  const big = heights.filter((h) => h > outlierRatio * mh).length;
  if (mh > 0 && big >= maxOutliers && big >= 0.03 * lines.length) {
    reasons.push(REASONS.outliers);
    level = 'line';
  }
  // בלי טורים (אין זרמי right/left) אבל השורות רחבות ועמוסות מילים — כנראה שני טורים
  // צמודים שהתעלה ביניהם לא נמצאה; מילה i בשורה כבר לא המילה i בשורת הטקסט
  const cols = lines.some((l) => l.stream === 'right' || l.stream === 'left');
  if (!cols && W > 0) {
    const wpl = median(lines.map((l) => (Array.isArray(l.words) && l.words.length ? l.words.length : NaN)));
    const wide = median(lines.map((l) => (l.bbox[2] - l.bbox[0]) / W));
    if (wpl > maxWordsPerLine && wide > wideRatio) {
      reasons.push(REASONS.unsplit);
      level = 'line';
    }
  }
  return { level, reasons };
}

/** מספר המילים הנראות בטקסט (בלי תגיות HTML) */
export function textWordCount(text) {
  let n = 0;
  for (const l of splitLines(String(text ?? ''))) n += lineWords(l.replace(TAG, ' ')).length;
  return n;
}

/**
 * בדיקה מול הטקסט: היחס בין מספר המילים בטקסט של הטור לבין מספר המילים שזוהו בשורות הצילום
 * שמולו. טקסט שהוא רק חלק מהעמוד (או עמוד שהזיהוי חילק אחרת) — היחס רחוק מ-1.
 * @param {string} text
 * @param {{ words?: unknown[] }[]} lines שורות הצילום של הטור
 * @param {{ soft?: number, hard?: number }} [o] soft — מעבר ליחס הזה: 'line'; hard — 'off'
 * @returns {{ level: 'word'|'line'|'off', reasons: string[], ratio: number|null }}
 */
export function assessText(text, lines, { soft = 1.5, hard = 2.5 } = {}) {
  const tw = textWordCount(text);
  const sw = (lines || []).reduce((a, l) => a + (Array.isArray(l?.words) ? l.words.length : 0), 0);
  if (!tw || !sw) return { level: 'word', reasons: [], ratio: null };
  const r = Math.max(tw / sw, sw / tw);
  if (r > hard) return { level: 'off', reasons: [REASONS.textMismatch], ratio: tw / sw };
  if (r > soft) return { level: 'line', reasons: [REASONS.textMismatch], ratio: tw / sw };
  return { level: 'word', reasons: [], ratio: tw / sw };
}

/**
 * בדיקת עקביות אחרי היישור (alignmentAgreement): החלק משורות הצילום שבהן מספר המילים
 * שיושרו מהטקסט מתאים למספר המילים שזוהו. פריסה שנקראה בסדר שגוי (עמוד דו-טורי עם גושים
 * נפרדים, טור שבתוכו טקסט ראשי ומתחתיו הערות) מסכימה בסך הכול אבל לא שורה-שורה.
 * @param {{ agree: number, total: number }|null} agreement
 * @param {{ soft?: number, hard?: number, minLines?: number }} [o] מתחת ל-soft — 'line'; מתחת ל-hard — 'off'
 * @returns {{ level: 'word'|'line'|'off', reasons: string[], ratio: number|null }}
 */
export function assessAlignment(agreement, { soft = 0.7, hard = 0.5, minLines = 4 } = {}) {
  const total = agreement?.total || 0;
  if (total < minLines) return { level: 'word', reasons: [], ratio: null };
  const ratio = (agreement?.agree || 0) / total;
  if (ratio < hard) return { level: 'off', reasons: [REASONS.inconsistent], ratio };
  if (ratio < soft) return { level: 'line', reasons: [REASONS.inconsistent], ratio };
  return { level: 'word', reasons: [], ratio };
}

/** בדיקת העקביות עוד לא רצה לשורות האלה: עד אז פס שורה בלי מסגרת מילה (לא נחשב "הורדה") */
export const PENDING_ALIGNMENT = Object.freeze({ level: 'line', reasons: Object.freeze([]), pending: true });

/**
 * הרמה האפקטיבית של המעקב לטור הנוכחי. נבדקים מקורות 'profile' ו-'local'; לאחרים — רמת
 * המקור כמו שהיא.
 * @param {{ source: import('./trackingSource.js').TrackSource, lines?: any[], text?: string, alignment?: any }} p
 *   alignment — יישור מוכן (lineAlignmentFor) לאותו טקסט ושורות, אם כבר חושב
 * @returns {{ level: import('./trackingSource.js').TrackLevel, reasons: string[], downgraded: boolean }}
 */
export function assessTracking({ source, lines = [], text = '', alignment = null }) {
  const guarded = isGuarded(source);
  const hasText = guarded && !!String(text ?? '').trim();
  const img = guarded ? assessProfile(source) : null;
  const txt = hasText ? assessText(text, lines) : null;
  const aln = hasText ? assessAlignment(alignmentAgreement(text, lines, alignment)) : null;
  return combineAssessments(source, img, txt, aln);
}

/**
 * צירוף בדיקת הפרופיל (assessProfile — תלויה רק במקור), בדיקת הטקסט (assessText — משתנה
 * בכל הקלדה) ובדיקת העקביות (assessAlignment — אחרי היישור, יקרה יותר) לרמה אחת; כך ה-hook
 * מחשב כל אחת רק כשהקלט שלה משתנה.
 * @param {import('./trackingSource.js').TrackSource|null|undefined} source
 * @param {{ level: string, reasons: string[] }|null} img
 * @param {{ level: string, reasons: string[] }|null} txt
 * @param {{ level: string, reasons: readonly string[], pending?: boolean }|null} [aln] (PENDING_ALIGNMENT — עוד לא חושבה)
 * @returns {{ level: import('./trackingSource.js').TrackLevel, reasons: string[], downgraded: boolean }}
 */
export function combineAssessments(source, img, txt, aln = null) {
  const base = /** @type {import('./trackingSource.js').TrackLevel} */ (source?.level || 'off');
  if (!isGuarded(source)) return { level: base, reasons: [], downgraded: false };
  const all = [img, txt, aln];
  const down = (xs) => xs.reduce((lv, a) => /** @type {any} */ (lower(lv, a?.level || 'word')), base);
  const level = /** @type {import('./trackingSource.js').TrackLevel} */ (down(all));
  // בדיקה שעוד ממתינה (pending) מורידה את הרמה בינתיים, אבל זו לא "הורדה" שמסבירים למשתמש
  const settled = down(all.filter((a) => !a?.pending));
  const reasons = [...(img?.reasons || []), ...(txt?.reasons || []), ...(aln?.reasons || [])];
  return { level, reasons, downgraded: RANK[settled] < RANK[base] };
}
