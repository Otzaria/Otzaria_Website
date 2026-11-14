// חלוקת קבוצות הכלים בשורת כלים בין השורה עצמה לתפריט "עוד" — לוגיקה טהורה (toolbarOverflow.test.js).
// השורה לא נגללת לעולם: כשאין מקום, הקבוצות הפחות חשובות עוברות לתפריט, אחת-אחת.

/**
 * @typedef {{ id: string, width: number, priority?: number, pinned?: boolean }} MeasuredGroup
 *  priority — מספר קטן = חשוב יותר (יוצא לתפריט אחרון). בתיקו — הקבוצה המאוחרת בשורה יוצאת קודם.
 *  pinned   — לא יוצאת לתפריט לעולם (למשל "זהה" כשיש אזור מסומן).
 */

/**
 * @param {{
 *   groups: MeasuredGroup[],
 *   available: number,     רוחב פנוי לכלים (בלי שם הפאנל)
 *   gap?: number,          מרווח בין שתי קבוצות סמוכות (כולל קו ההפרדה)
 *   moreWidth?: number,    רוחב כפתור "עוד" (תמיד בסוף השורה)
 *   labelWidth?: number    רוחב שם הפאנל — מוצג רק כשכל הקבוצות נכנסות
 * }} input
 * @returns {{ visible: string[], overflow: string[], showLabel: boolean }}
 *   visible / overflow — לפי סדר השורה המקורי
 */
export function fitToolbarGroups({ groups, available, gap = 0, moreWidth = 0, labelWidth = 0 }) {
  const list = Array.isArray(groups) ? groups : []
  const width = (ids) => {
    let total = moreWidth
    for (const g of list) if (ids.has(g.id)) total += Math.max(0, g.width || 0) + gap
    return total
  }

  const shown = new Set(list.map((g) => g.id))
  // אין מדידה עדיין (רוחב 0 / לא מספר) — מציגים הכול
  if (!(available > 0)) return { visible: [...shown], overflow: [], showLabel: true }

  if (width(shown) + labelWidth <= available) {
    return { visible: [...shown], overflow: [], showLabel: true }
  }

  // סדר היציאה: העדיפות הנמוכה ביותר (המספר הגבוה) קודם; בתיקו — המאוחרת בשורה
  const dropOrder = list
    .map((g, index) => ({ g, index }))
    .filter(({ g }) => !g.pinned)
    .sort((a, b) => (priorityOf(b.g) - priorityOf(a.g)) || (b.index - a.index))
    .map(({ g }) => g.id)

  for (const id of dropOrder) {
    if (width(shown) <= available) break
    shown.delete(id)
  }

  return {
    visible: list.filter((g) => shown.has(g.id)).map((g) => g.id),
    overflow: list.filter((g) => !shown.has(g.id)).map((g) => g.id),
    showLabel: false
  }
}

function priorityOf(group) {
  return Number.isFinite(group.priority) ? group.priority : 0
}
