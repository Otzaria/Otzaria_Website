// אימות שורות אימון — מקור אמת יחיד המשותף להשלמה ולייצוא,
// כדי שעמוד "מושלם" יניב בדיוק את החיתוכים התקינים שהמערכת דורשת.

import { isValidTrainingText } from './textStandard';

// דרישת הפרויקט: בדיוק 10 שורות לכל עמוד.
export const LINES_PER_PAGE = 10;

const MIN_PX = 4; // גודל תיבה מינימלי בפיקסלים

/**
 * בודק אם שורה בודדת תקינה לאימון (תיבה תקינה בתוך גבולות התמונה + טקסט תקין).
 * imgW/imgH באפס => מידות לא ידועות, מדלגים על בדיקת הגבולות (רק גודל חיובי).
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateLine(line, imgW = 0, imgH = 0) {
  if (!line) return { ok: false, reason: 'empty' };
  const x = Number(line.x);
  const y = Number(line.y);
  const w = Number(line.width);
  const h = Number(line.height);
  if (![x, y, w, h].every(Number.isFinite)) return { ok: false, reason: 'bad_coords' };
  if (w < MIN_PX || h < MIN_PX) return { ok: false, reason: 'too_small' };
  if (x < 0 || y < 0) return { ok: false, reason: 'negative' };
  if (imgW > 0 && x + w > imgW + 1) return { ok: false, reason: 'out_of_bounds_x' };
  if (imgH > 0 && y + h > imgH + 1) return { ok: false, reason: 'out_of_bounds_y' };
  if (!isValidTrainingText(line.text)) return { ok: false, reason: 'bad_text' };
  return { ok: true };
}

/**
 * מונה כמה שורות תקינות יש בעמוד.
 */
export function countValidLines(lines, imgW = 0, imgH = 0) {
  return (lines || []).reduce((n, l) => n + (validateLine(l, imgW, imgH).ok ? 1 : 0), 0);
}
