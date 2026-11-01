// גלישת שורות בעורך (לוגיקה טהורה): מתי מותר להציג את הטקסט "שורה מול שורה" בלי גלישה
// (wrap='off'), ומתי חובה לגלוש (wrap='soft').
//
// העדפת "מול הסריקה" מבקשת wrap='off' — אבל זה נכון רק כשהטקסט באמת מחולק לשורות כמו
// הצילום. טקסט של עמוד מגיע בדרך כלל כגוש (כל העמוד או פסקה שלמה בשורה אחת); בלי גלישה
// הוא מוצג כשורה אחת ארוכה מאוד שאי אפשר לקרוא. לכן 'off' רק כשאין שורה "ארוכה מדי".

import { splitLines } from './caretWord.js';
import { shouldUseFlow, visibleMap } from './flowTrack.js';

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);

/** שורה ארוכה פי כמה מהממוצע לשורת צילום נחשבת "גוש" (לא שורה מול שורה) */
export const LONG_LINE_RATIO = 1.5;

/**
 * האם הטקסט שורה-מול-שורה עם הצילום: יש שורות צילום, לא מעקב זורם (shouldUseFlow), ואף
 * שורת טקסט אינה ארוכה מ-LONG_LINE_RATIO × (סך התווים הנראים ÷ מספר שורות הצילום).
 *
 * @param {string} text
 * @param {{ bbox: number[] }[]} scanLines שורות הצילום של הטור הפעיל
 */
export function isLineForLine(text, scanLines) {
  const S = (scanLines || []).filter((l) => isBox(l?.bbox)).length;
  if (S === 0) return false;
  const lens = splitLines(String(text ?? '')).map((l) => visibleMap(l).len);
  const total = lens.reduce((a, b) => a + b, 0);
  if (total === 0) return true;
  if (shouldUseFlow(text, scanLines)) return false;
  const limit = LONG_LINE_RATIO * (total / S);
  return lens.every((n) => n <= limit);
}

/**
 * מצב הגלישה בפועל: 'off' רק כשהתבקש וגם הטקסט שורה-מול-שורה; כל בקשת 'off' אחרת → 'soft'.
 * ערך אחר (undefined/'soft') — כמות שהוא.
 *
 * @param {'off'|'soft'|undefined} requested
 * @param {string} text
 * @param {{ bbox: number[] }[]} scanLines
 * @returns {'off'|'soft'|undefined}
 */
export function effectiveWrap(requested, text, scanLines) {
  if (requested !== 'off') return requested;
  return isLineForLine(text, scanLines) ? 'off' : 'soft';
}
