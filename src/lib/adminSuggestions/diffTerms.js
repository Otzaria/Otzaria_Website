// ניסוח של תצוגת ההבדלים (library/DiffPreview) — משותף ל"הצעות עריכה" ול"התנגשויות בסנכרון".
// לוגיקה טהורה (נבדק ב-diffTerms.test.mjs).

import { formatNumber } from '../adminTerms.js'
import { KEEP_LABELS, SIDE_LABELS } from './conflictTerms.js'

/** "חלק 2 מתוך 5"; כשאין סך ידוע (או שהוא 1) — "חלק 2" */
export function partTitle(number, total) {
  return total > 1 ? `חלק ${formatNumber(number)} מתוך ${formatNumber(total)}` : `חלק ${formatNumber(number)}`
}

/**
 * הכיתוב הקטן מעל כל נוסח בהצעת עריכה: מה כרגע בספר ומה מוצע. חלק שרק מוסיף טקסט — אין "כרגע בספר";
 * חלק שרק מוחק — אין "מוצע".
 * @param {{ before?: string, after?: string }} change
 * @returns {{ before: string | null, after: string | null }}
 */
export function suggestionCaptions(change) {
  const hasBefore = Boolean(change?.before)
  const hasAfter = Boolean(change?.after)
  if (!hasBefore && hasAfter) return { before: null, after: 'מוצע להוסיף' }
  if (hasBefore && !hasAfter) return { before: 'מוצע למחוק', after: null }
  return { before: 'כרגע בספר', after: 'מוצע' }
}

/**
 * הכיתוב מעל הצעה שמוצגת כטקסט אחד (lib/adminSuggestions/inlineDiff): "השינוי המוצע"; חלק שרק מוסיף או רק
 * מוחק — כמו בשתי תיבות, "מוצע להוסיף" / "מוצע למחוק".
 * @param {{ before?: string, after?: string }} change
 */
export function inlineCaption(change) {
  const { before, after } = suggestionCaptions(change)
  return before && after ? 'השינוי המוצע' : before || after
}

/** בהתנגשות: נוסח ריק — מה יקרה אם בוחרים בו */
export const EMPTY_SIDE_TEXT = 'אין כאן טקסט'

/** בהתנגשות: הכפתור של כל נוסח. נוסח ריק — "השאר בלי טקסט (מחק את החלק)" */
export function keepLabel(side, empty) {
  return empty ? 'השאר בלי טקסט (מחק את החלק)' : KEEP_LABELS[side]
}

/**
 * בהתנגשות, אחרי בחירה: מה מצב החלק. waiting — עוד לא נשלח (אפשר לבטל); saving — נשלח; saved — נשמר.
 * @param {'theirs' | 'ours'} side
 * @param {'waiting' | 'saving' | 'saved'} state
 */
export function decisionText(side, state) {
  const name = SIDE_LABELS[side]
  if (state === 'saved') return `נשמר: נשאר ${name}`
  if (state === 'saving') return `שומר: ${name}…`
  return `נבחר: ${name}`
}
