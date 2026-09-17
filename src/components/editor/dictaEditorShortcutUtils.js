// פונקציות טהורות שחולצו מלוגיקת מאזין קיצורי המקלדת הגלובלי ב-DictaEditorCore.jsx
// (ה-useEffect שרושם 'keydown' על window). מופרדות מה-DOM/refs כדי שניתן יהיה
// לבדוק אותן ישירות ב-vitest.

/**
 * בונה את מחרוזת הקומבינציה (למשל "Ctrl+Shift+KeyC") מתוך אירוע מקלדת -
 * או ערך דומה לו (keydown event / plain object עם אותם שדות).
 * מחזירה null כאשר המקש הלחוץ הוא עצמו מקש modifier (Control/Alt/Shift/Meta
 * בלבד, בלי מקש נוסף) - במקרה כזה עדיין אין קומבינציה שלמה לבדוק.
 */
export function buildShortcutCombination(e) {
  if (!e) return null
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null

  const modifiers = []
  if (e.ctrlKey) modifiers.push('Ctrl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')
  if (e.metaKey) modifiers.push('Meta')

  return [...modifiers, e.code].join('+')
}

/**
 * מוצאת את מזהה הפעולה (actionId) ששויכה לקומבינציה נתונה במפת הקיצורים
 * של המשתמש. מחזירה undefined אם אין התאמה.
 */
export function findShortcutActionId(combination, shortcuts) {
  if (!combination || !shortcuts) return undefined
  return Object.keys(shortcuts).find(actionId => shortcuts[actionId] === combination)
}
