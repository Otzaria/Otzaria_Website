// חלונית ההצעות על המילה החשודה עצמה (OcrWordPopup) — החלק הטהור: איזו מילה חשודה תחת הסמן,
// מה הבאה/הקודמת (F8 / Shift+F8), ואיפה למקם את החלונית כך שלא תכסה את המילה ולא תצא מהמסך.
// הנתונים עצמם — אותה תוצאת בדיקה חיה של buildPageWordReview (ocrWordReview.js) שמשמשת את
// ההדגשה, את החלונית "מילים חשודות" ואת המונה. בלי DOM.

import { placePopup } from '../pageProof/wordPopup.js';

/** מזהה מופע של מילה חשודה — אותו מזהה כמו בחלונית "מילים חשודות" */
export const suspectId = (s) => `${s.column}:${s.start}:${s.text}`;

const COLUMN_ORDER = { right: 0, content: 0, left: 1 };
const rank = (s) => [COLUMN_ORDER[s.column] ?? 0, s.start];
const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * המילה החשודה שהסמן בתוכה (גם בקצה המילה), בטור column. null אם אין.
 * @param {Array<{column: string, start: number, end: number}>} suspects
 */
export function suspectAt(suspects, column, offset) {
  if (!Number.isFinite(offset)) return null;
  return (suspects || []).find((s) => s.column === column && s.start <= offset && offset <= s.end) || null;
}

/**
 * המילה החשודה הבאה (dir=1) או הקודמת (dir=-1) בכל העמוד (ימין ואז שמאל), עם חזרה להתחלה.
 * from = {column, offset} של הסמן, או {suspect} כשהחלונית כבר פתוחה על מילה. בלי חלונית — F8
 * פותח קודם את המילה שהסמן בתוכה (או הראשונה אחריו).
 */
export function adjacentSuspect(suspects, from, dir = 1) {
  const list = [...(suspects || [])].sort((a, b) => (before(rank(a), rank(b)) ? -1 : before(rank(b), rank(a)) ? 1 : 0));
  if (!list.length) return null;
  if (from?.suspect) {
    const i = list.findIndex((s) => suspectId(s) === suspectId(from.suspect));
    if (i >= 0) return list[(i + (dir < 0 ? -1 : 1) + list.length) % list.length];
  }
  const col = COLUMN_ORDER[from?.column] ?? 0;
  const at = Number.isFinite(from?.offset) ? from.offset : 0;
  if (dir < 0) {
    // הקודמת: שמתחילה לפני הסמן (ולא זו שהסמן בתוכה)
    const prev = list.filter((s) => before(rank(s), [col, at]) && !(s.column === from?.column && s.end >= at));
    return prev.at(-1) || list.at(-1);
  }
  return list.find((s) => !before([COLUMN_ORDER[s.column] ?? 0, s.end], [col, at])) || list[0];
}

/**
 * מיקום החלונית (position: fixed) ליד המילה: מתחת, או מעל כשאין מקום מתחת ויש יותר מעל —
 * לעולם לא על המילה. גובה החלונית מוגבל לצד שנבחר (maxHeight; השאר נגלל בתוכה), ולכן גם
 * חלונית גבוהה לא נדחפת על המילה. אופקית — הקצה הימני מול הקצה הימני של המילה, בתוך המסך.
 * @returns {{ top: number, left: number, above: boolean, maxHeight: number }}
 */
export function placeSuspectPopup(anchor, size, viewport, { gap = 6, margin = 8 } = {}) {
  const vh = Math.max(0, Number(viewport?.height) || 0);
  const top = Number(anchor?.top) || 0;
  const bottom = Number.isFinite(Number(anchor?.bottom)) ? Number(anchor.bottom) : top;
  const below = Math.max(0, vh - margin - (bottom + gap));
  const above = Math.max(0, top - gap - margin);
  const want = Math.max(0, Number(size?.height) || 0);
  const useAbove = want > below && above > below;
  const maxHeight = Math.floor(useAbove ? above : below);
  const height = Math.min(want, maxHeight);
  const p = placePopup(anchor, { width: size?.width, height }, viewport, { gap, margin });
  // placePopup מצמיד לתחום המסך; כאן הגובה כבר חסום בצד שנבחר, אז הצד נשמר
  const t = useAbove ? Math.round(top - gap - height) : Math.round(bottom + gap);
  return { top: t, left: p.left, above: useAbove, maxHeight };
}
