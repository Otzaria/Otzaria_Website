// לוגיקה טהורה של התאמת קיצור מקלדת גלובלי בדף עריכת עמוד: בניית מחרוזת
// הקומבינציה מתוך אירוע מקלדת, ואיתור מזהה הפעולה התואם מתוך מפת קיצורי
// המשתמש. ללא כל תלות ב-DOM (מקבלת אובייקט "אירוע" פשוט עם השדות הרלוונטיים
// בלבד), כדי לאפשר בדיקה ישירה של החישוב.

// בונה את מחרוזת הקומבינציה (למשל "Ctrl+Alt+KeyS") מתוך אירוע מקלדת.
// event: אובייקט עם ctrlKey/altKey/shiftKey/metaKey/code (כמו KeyboardEvent).
export function buildShortcutCombination(event) {
  const modifiers = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Meta')

  return [...modifiers, event.code].join('+')
}

// מאתר את מזהה הפעולה (actionId) שהקומבינציה שלו במפת userShortcuts תואמת
// לקומבינציה הנתונה, או null אם לא נמצאה התאמה.
export function findMatchingActionId(userShortcuts, combination) {
  const foundActionId = Object.keys(userShortcuts).find(
    (actionId) => userShortcuts[actionId] === combination
  )
  return foundActionId ?? null
}
