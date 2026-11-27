/**
 * סגירה אוטומטית של "כבר הוחל" (בלי מתנדב ובלי שירות). הכלל שמרני בכוונה: סגירה שגויה מסתירה
 * טעות שלא תוקנה, ולכן כל ספק נשאר אצל מתנדב (already_fixed_unverified, כמו קודם). הדיווח נסגר רק
 * כשמתקיימים כל התנאים:
 *  1. בשורה המדווחת במקור נמצאת בדיוק השורה המלאה המוצעת (resolver: already_applied).
 *  2. השורה המקורית (השגויה) אינה מופיעה בשום מקום בקובץ — טעות שזזה (שורות נוספו לפניה) לא
 *     תיחשב מתוקנת רק משום שבאינדקס הישן יש עכשיו שורה אחרת.
 *  3. השורה המוצעת ייחודית מספיק: לא ריקה, לא כותרת ולא תגיות בלבד, ולפחות 15 תווים נראים.
 *  4. השורה המוצעת מופיעה בקובץ פעם אחת בלבד — שורה שחוזרת (כותרת סעיף) אינה ראיה לתיקון.
 *  5. הפסקה המדווחת עצמה מאותרת כמתוקנת (locate-edit.js, אותו כלל כמו "נקלט"): כל הדומים לה בקובץ מתוקנים,
 *     היא מזוהה בביטחון, והאזור שזוהה כולל את המקום המדווח. פסקה שזזה ונערכה ליד הטעות (ולכן אינה מופיעה
 *     בדיוק) עדיין נושאת את הטעות — גם כשבמקום הישן עומדת עכשיו שורה אחרת שזהה להצעה. שורה קצרה (פחות
 *     מ-4 אסימונים מחוץ לעריכה) אינה מזוהה בלי שכנים מהבסיס, ולכן לעולם אינה נסגרת כאן.
 *  6. גם שינוי התגיות שאושר נקלט (located.rawHeld === false; absorption.js, rawPartHeld — כמו במפרסם וב"נקלט"): האיתור
 *     מנורמל בלי תגיות, ולכן עותק של הפסקה (למשל פסקה שפוצלה) שבו המילה תוקנה והתגיות לא נראה בו מתוקן, ושורה זהה
 *     להצעה במקום המדווח הייתה סוגרת את הדיווח בלי שינוי ה-HTML. מקור שנשמר לפני התנאי (בלי rawHeld) — ידני.
 * התנאים 1–4 נשארים כשומרים נוספים.
 */
import { computeNewLine } from './payload.js';
import { committedNewLine } from './unified-diff.js';
import { LOCATE } from './locate-edit.js';

export const AUTO_CLOSE_MIN_VISIBLE_CHARS = 15;

const HEADING_RE = /^\s*<h[1-6]\b/i;
const INVISIBLE_RE = /^[\s\p{M}]$/u;

/**
 * תווים נראים: בלי תגיות HTML, רווחים וסימני ניקוד/טעמים (תווים מצטרפים). מחזירה מספר בלבד: התגיות
 * מדולגות בספירה ולא נבנית מחרוזת "מנוקה", כך שאין כאן סינון HTML שתוצאתו מוצגת או נשמרת. אותו כלל כמו
 * /<[^>]*>/g — מ-'<' עד ה-'>' הראשון אחריו; '<' בלי '>' אחריו נספר כתו רגיל.
 * @returns {number}
 */
export function visibleLength(line) {
  if (typeof line !== 'string') return 0;
  let count = 0;
  for (let i = 0; i < line.length;) {
    const close = line[i] === '<' ? line.indexOf('>', i + 1) : -1;
    if (close !== -1) {
      i = close + 1;
      continue;
    }
    const ch = String.fromCodePoint(line.codePointAt(i));
    if (!INVISIBLE_RE.test(ch)) count += 1;
    i += ch.length;
  }
  return count;
}

/** שורה שהופעתה במקום המדווח היא ראיה לתיקון: לא ריקה, לא כותרת, לא תגיות בלבד, ולא קצרה מדי. */
export function isDistinctiveLine(line) {
  if (typeof line !== 'string' || !line.trim() || HEADING_RE.test(line)) return false;
  return visibleLength(line) >= AUTO_CLOSE_MIN_VISIBLE_CHARS;
}

/**
/** האיתור (matchLine → located) מצא את הפסקה המדווחת מתוקנת, באזור שכולל את המקום המדווח. */
export function isLocatedFixed(source) {
  const loc = source?.located;
  if (loc?.status !== LOCATE.FIXED || !Array.isArray(loc.lines) || !Number.isSafeInteger(source.lineIndex)) return false;
  return loc.lines[0] <= source.lineIndex && source.lineIndex <= loc.lines[1];
}

/**
 * @param {{status:string, currentLine:string, lineIndex:number, bomAdjusted?:boolean, occurrences?:{original:number, proposed:number}|null,
 *   located?:{status:string, reason:string, lines:([number,number]|null)}|null}} source
 *   תוצאת resolveSource (occurrences ו-located — מ-matchLine); מקור שנשמר לפני שנוספו — אינו ראיה (ידני)
 * @param {object} rev גרסת ההצעה הנוכחית
 */
export function isExactlyApplied(source, rev) {
  if (source?.status !== 'already_applied' || typeof source.currentLine !== 'string') return false;
  if (source.currentLine !== committedNewLine(source, computeNewLine(rev))) return false;
  const occ = source.occurrences;
  return occ?.original === 0 && occ?.proposed === 1 && isDistinctiveLine(source.currentLine) && isLocatedFixed(source) && source.located.rawHeld === false;
}
