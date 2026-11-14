// בחירה ברשימות הניהול — לוגיקה טהורה (בלי React). ה-hook שמשתמש בה: components/admin/list/useKeyedSelection.js

/**
 * הוספה או הסרה של כמה מזהים מבחירה — עותק חדש, בלי לשנות את המקורי.
 * @template T
 * @param {Set<T>} ids הבחירה הנוכחית
 * @param {Iterable<T>} changed המזהים שמשתנים
 * @param {boolean} checked true — מוסיפים; false — מסירים
 * @returns {Set<T>}
 */
export function toggleIds(ids, changed, checked) {
  const next = new Set(ids)
  for (const id of changed) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return next
}

/**
 * אחרי שפריטים יצאו מהרשימה — לאיזה פריט עובר הפוקוס: הבא אחרי הראשון שיצא, ואם אין — הקודם לו. null — לא נשאר
 * אף פריט (או שאף אחד מ-removed לא היה ברשימה).
 * @param {string[]} order המזהים לפי סדר הרשימה, לפני ההסרה @param {Iterable<string>} removed
 * @returns {string | null}
 */
export function neighborAfterRemove(order, removed) {
  const gone = new Set(removed)
  const first = order.findIndex((id) => gone.has(id))
  if (first < 0) return null
  return order.slice(first).find((id) => !gone.has(id)) ?? order.slice(0, first).reverse().find((id) => !gone.has(id)) ?? null
}
