// היסטוריית הביטול לכל שדה *לוגי* של העורך ('content' / 'right' / 'left') — מחוץ לרכיב השדה.
// במעבר בין התצוגה המעוצבת (richController) לתצוגת הקוד (textareaHistory) נוצר אלמנט חדש, אבל
// השדה הלוגי אותו שדה: המחסנית ממשיכה. הצעדים הם מחרוזת המקור (עם התגים) + היסטים בה — זהים
// בשתי התצוגות, כך שאפשר לבטל מכל אחת מהן צעד שנעשה בשנייה.
//
// value — הערך האחרון שהשדה הלוגי ידוע בו (null — עוד לא נעקב). שדה שעולה או מקבל ערך מבחוץ:
// אם הערך זהה — ממשיכים (מעבר תצוגה); אם שונה — עריכה מבחוץ (טעינה, החלפה בקוד): המחסנית מתאפסת.
// במעבר עמוד — resetFieldHistories (גם שני עמודים עם אותו טקסט לא חולקים היסטוריה).
//
// צעד מבני (restore): ביטול שלא מחזיר ערך לשדה אלא משחזר מבנה (איחוד טורים → שני הטורים).

import { createRichHistory } from './richHistory'

/** @typedef {{ history: ReturnType<typeof createRichHistory>, value: string|null }} FieldHistoryEntry */

/** @type {Map<string, FieldHistoryEntry>} */
const entries = new Map()

/** @param {string|null|undefined} column @returns {string} */
export function fieldKey(column) {
  return column === 'right' || column === 'left' ? column : 'content'
}

/** @param {string|null|undefined} column @returns {FieldHistoryEntry} */
export function fieldHistoryEntry(column) {
  const key = fieldKey(column)
  let e = entries.get(key)
  if (!e) {
    e = { history: createRichHistory(), value: null }
    entries.set(key, e)
  }
  return e
}

/**
 * הערך של השדה כפי שנראה עכשיו (בהתקנה, בערך מבחוץ): שונה מהידוע — המחסנית כבר לא תואמת.
 * @param {FieldHistoryEntry} entry @param {string} value
 * @returns {boolean} האם המחסנית אופסה
 */
export function syncFieldValue(entry, value) {
  if (entry.value === value) return false
  const had = entry.value !== null
  entry.history.clear()
  entry.value = value
  return had
}

/** מעבר עמוד / יציאה מהעורך — כל השדות מתחילים מחדש (במקום: בקרים קיימים מחזיקים את הרשומה) */
export function resetFieldHistories() {
  for (const e of entries.values()) {
    e.history.clear()
    e.value = null
  }
}

/**
 * צעד ביטול מבני: השדה column עומד לקבל את value (למשל הטור המאוחד), והביטול הראשון בו
 * יקרא ל-restore במקום להחזיר ערך. המחסנית הקודמת של השדה לא רלוונטית — מתאפסת.
 * @param {string|null|undefined} column @param {string} value @param {() => void} restore
 */
export function pushStructuralUndo(column, value, restore) {
  const e = fieldHistoryEntry(column)
  e.history.clear()
  e.value = value
  e.history.record({ value, start: 0, end: 0, restore }, 'other', Date.now())
  e.history.breakGroup()
}

/**
 * אם הצעד שיצא מהמחסנית מבני — מפעיל אותו (והשדה מתחיל מחדש: הוא עומד להיעלם). מחזיר האם טופל.
 * @param {FieldHistoryEntry} entry @param {{ restore?: () => void } | null} snap
 */
export function runStructural(entry, snap) {
  if (!snap || typeof snap.restore !== 'function') return false
  entry.history.clear()
  entry.value = null
  snap.restore()
  return true
}
