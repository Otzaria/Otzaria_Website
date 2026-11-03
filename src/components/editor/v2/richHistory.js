// היסטוריית הביטול של התצוגה המעוצבת (RichTextArea) — לוגיקה טהורה (richHistory.test.js).
// השדה המעוצב מבטל את כל העריכות המובנות של הדפדפן (beforeinput → preventDefault), ולכן
// להיסטוריה המובנית אין מה לבטל — כאן מחסנית משלו: תמונת מצב (ערך + בחירה) לפני כל עריכה.
// הקלדה רצופה (או מחיקה רצופה) מתאחדת לצעד אחד, כמו ב-textarea: עד שעוברים לסוג עריכה אחר,
// עד הפסקה של coalesceMs, או עד רווח (צעד חדש לכל מילה).

/** @typedef {{ value: string, start: number, end: number, restore?: () => void }} RichSnapshot */

/**
 * @param {{ limit?: number, coalesceMs?: number }} [opts]
 */
export function createRichHistory({ limit = 300, coalesceMs = 1500 } = {}) {
  /** @type {RichSnapshot[]} */
  let undo = []
  /** @type {RichSnapshot[]} */
  let redo = []
  /** @type {{ kind: string, time: number } | null} */
  let last = null

  return {
    /**
     * לפני עריכה: before — המצב שלפניה; kind — 'type' (תו מוקלד), 'del' (מחיקת תו), אחר — צעד נפרד.
     * @param {RichSnapshot} before
     * @param {string} kind
     * @param {number} now
     */
    record(before, kind, now) {
      redo = []
      const merge = last && (kind === 'type' || kind === 'del') && last.kind === kind && now - last.time < coalesceMs
      if (merge && last) {
        last.time = now
        return
      }
      undo.push(before)
      if (undo.length > limit) undo.shift()
      last = { kind, time: now }
    },
    /** סוף צעד (רווח, תזוזת סמן) — ההקלדה הבאה מתחילה צעד חדש */
    breakGroup() {
      last = null
    },
    /** @param {RichSnapshot} current @returns {RichSnapshot|null} */
    undo(current) {
      if (!undo.length) return null
      redo.push(current)
      last = null
      return undo.pop() || null
    },
    /** @param {RichSnapshot} current @returns {RichSnapshot|null} */
    redo(current) {
      if (!redo.length) return null
      undo.push(current)
      last = null
      return redo.pop() || null
    },
    clear() {
      undo = []
      redo = []
      last = null
    },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0
  }
}
