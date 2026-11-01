// לוגיקה טהורה של התאמת קיצור מקלדת גלובלי בדף עריכת עמוד: בניית מחרוזת
// הקומבינציה מתוך אירוע מקלדת, ואיתור מזהה הפעולה התואם מתוך מפת קיצורי
// המשתמש. ללא כל תלות ב-DOM (מקבלת אובייקט "אירוע" פשוט עם השדות הרלוונטיים
// בלבד), כדי לאפשר בדיקה ישירה של החישוב.

import { findShortcutConflict } from '@/lib/shortcuts'

export { findShortcutConflict, findDuplicateShortcuts } from '@/lib/shortcuts'

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

// ברירת המחדל של הקיצורים, לפי מקשים פיזיים (KeyboardEvent.code).
// Ctrl+S שומר מיד; Ctrl+Enter פותח את חלונית סיום העמוד.
export const DEFAULT_SHORTCUTS = Object.freeze({
  save: 'Ctrl+KeyS',
  bold: 'Ctrl+KeyB',
  italic: 'Ctrl+KeyI',
  underline: 'Ctrl+KeyU',
  zoomIn: 'Ctrl+Equal',
  zoomOut: 'Ctrl+Minus',
  split: 'Alt+KeyS',
  layout: 'Alt+KeyL',
  togglePanel: 'Alt+KeyP',
  fullScreen: 'F11',
  shortcuts: 'Alt+KeyK',
  finish: 'Ctrl+Enter',
  // לא Ctrl+Shift+I / Ctrl+Shift+M: בדפדפנים הם כלי המפתחים / תפריט הפרופיל / תצוגה רספונסיבית,
  // וחסימתם (preventDefault) לא אמינה בכל דפדפן (בגרסה 7 הוחלפו — ראו ACTIONS_REBOUND_IN_VERSION)
  imageToText: 'Alt+KeyI',
  commandPalette: 'Ctrl+KeyK',
  toggleTextView: 'Alt+Shift+KeyM',
  clearFormatting: 'Ctrl+Backslash',
})

// גרסת מבנה הקיצורים שנשמרים ב-localStorage. גרסה 1 (או בלי מספר) — לפני שנוסף
// קיצור ברירת מחדל ל-layout; גרסה 2 — לפני חלון הפקודות (Ctrl+K); גרסה 3 — לפני הסרת
// זיהוי הטקסט (OCR) מהעורך; גרסה 4 — לפני המעבר בין תצוגה מעוצבת לקוד (Ctrl+Shift+M);
// גרסה 5 — לפני "נקה עיצוב" (Ctrl+\); גרסה 6 — לפני החלפת ברירות המחדל שמתנגשות בדפדפן;
// גרסה 7 — לפני הסרת סיבוב הצילום (Alt+R).
export const SHORTCUTS_VERSION = 8

// פעולות שקיבלו קיצור ברירת מחדל בכל גרסה. בהעברה מגרסה ישנה הן נוספות רק אם
// המשתמש לא הגדיר להן קיצור, ורק אם הצירוף לא תפוס אצלו בפעולה אחרת.
const ACTIONS_ADDED_IN_VERSION = {
  2: ['layout'],
  3: ['commandPalette'],
  5: ['toggleTextView'],
  6: ['clearFormatting'],
}

// פעולות שהוסרו בכל גרסה (זיהוי הטקסט והגדרות Gemini; סיבוב הצילום). בהעברה מגרסה ישנה הקיצור שלהן
// נמחק — כדי שהצירוף ישוחרר ולא יישאר "תקוע" על פעולה שלא קיימת.
const ACTIONS_REMOVED_IN_VERSION = {
  4: ['ocr', 'selectionMode', 'settings'],
  8: ['rotateR', 'rotateL', 'rotateFineR', 'rotateFineL'],
}

// ברירות מחדל שהוחלפו בכל גרסה: { actionId: [הישן, החדש] }. בהעברה — רק אם אצל המשתמש עדיין
// הקיצור הישן (לא התאים אותו בעצמו) והחדש פנוי; קיצור שהמשתמש בחר נשאר כמו שהוא.
const ACTIONS_REBOUND_IN_VERSION = {
  7: {
    imageToText: ['Ctrl+Shift+KeyI', 'Alt+KeyI'],
    toggleTextView: ['Ctrl+Shift+KeyM', 'Alt+Shift+KeyM'],
  },
}


// מעביר מפת קיצורים שמורה (כפי שנקראה מ-localStorage, אחרי JSON.parse) לגרסה הנוכחית.
// קיצורים שהמשתמש התאים נשמרים כמו שהם; פעולה שהמשתמש מחק לא חוזרת. מחזיר
// { shortcuts, changed } — changed=true אם יש מה לשמור בחזרה.
export function migrateUserShortcuts(stored, storedVersion) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { shortcuts: { ...DEFAULT_SHORTCUTS }, changed: stored != null, unbound: [] }
  }

  const shortcuts = {}
  /** @type {{ actionId: string, from: string, to: string, conflictWith: string }[]} */
  const unbound = []
  let changed = false
  for (const [actionId, combo] of Object.entries(stored)) {
    if (typeof combo === 'string' && combo) shortcuts[actionId] = combo
    else changed = true
  }

  const fromVersion = Number.isInteger(storedVersion) ? storedVersion : 1
  // קודם כל ההסרות (מכל הגרסאות) — כדי שצירוף שהתפנה (למשל Ctrl+K של ocr שהוסר בגרסה 4)
  // יהיה פנוי כשמוסיפים פעולות (חלון הפקודות, שנוסף בגרסה 3), ואז החלפות והוספות לפי הסדר
  for (let v = fromVersion + 1; v <= SHORTCUTS_VERSION; v++) {
    for (const actionId of ACTIONS_REMOVED_IN_VERSION[v] || []) delete shortcuts[actionId]
  }
  for (let v = fromVersion + 1; v <= SHORTCUTS_VERSION; v++) {
    for (const [actionId, [from, to]] of Object.entries(ACTIONS_REBOUND_IN_VERSION[v] || {})) {
      if (shortcuts[actionId] !== from) continue
      const conflictWith = findShortcutConflict(shortcuts, actionId, to)
      if (conflictWith) {
        // הצירוף החדש תפוס — לא משאירים את הישן (הוא פותח את כלי המפתחים / נבלע בדפדפן): הפעולה
        // נשארת בלי קיצור, ומדווחים בחלון הקיצורים
        delete shortcuts[actionId]
        unbound.push({ actionId, from, to, conflictWith })
        continue
      }
      shortcuts[actionId] = to
    }
    for (const actionId of ACTIONS_ADDED_IN_VERSION[v] || []) {
      const combo = DEFAULT_SHORTCUTS[actionId]
      if (shortcuts[actionId] || !combo) continue
      if (findMatchingActionId(shortcuts, combo)) continue
      shortcuts[actionId] = combo
    }
  }
  if (fromVersion !== SHORTCUTS_VERSION) changed = true

  return { shortcuts, changed, unbound }
}
