// עזרי תצוגה לקיצורי מקלדת של העורכים.
// הקיצורים נשמרים בפורמט של event.code עם מקשי החזקה, למשל: "Ctrl+Shift+KeyC".
// הפונקציות כאן ממירות אותם לתצוגה ידידותית (למשל "Ctrl+Shift+C") ומרכיבות טולטיפ.

// המרת אסימון מקש בודד (חלק אחד מתוך הקומבינציה) לתצוגה ידידותית
function formatKeyToken(token) {
  if (!token) return '';
  if (token.startsWith('Key')) return token.slice(3); // KeyB -> B
  if (token.startsWith('Digit')) return token.slice(5); // Digit1 -> 1
  if (token.startsWith('Numpad')) return token.slice(6); // Numpad1 -> 1

  const map = {
    Control: 'Ctrl',
    Ctrl: 'Ctrl',
    Meta: 'Cmd',
    Alt: 'Alt',
    Shift: 'Shift',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Equal: '=',
    Minus: '-',
    Plus: '+',
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Del',
    Backquote: '`',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
  };

  return map[token] || token; // מקשים כמו F11 נשארים כמו שהם
}

// המרת קומבינציה מלאה (למשל "Ctrl+KeyB") לתצוגה ידידותית ("Ctrl+B")
export function formatShortcut(combo) {
  if (!combo) return '';
  return combo.split('+').map(formatKeyToken).join('+');
}

// בניית טקסט טולטיפ: הטקסט הבסיסי + הקיצור בסוגריים, אם קיים קיצור לפעולה.
// shortcuts – מפת { actionId: combo }, actionId – מזהה הפעולה של הכפתור.
export function withShortcut(base, shortcuts, actionId) {
  const combo = shortcuts && shortcuts[actionId];
  if (!combo) return base;
  const formatted = formatShortcut(combo);
  return base ? `${base} (${formatted})` : formatted;
}

// הפעולה האחרת (לא actionId) שכבר משתמשת ב-combo, או null — לבדיקת כפילות בחלון הקיצורים
export function findShortcutConflict(shortcuts, actionId, combo) {
  if (!combo) return null
  return Object.keys(shortcuts || {}).find((id) => id !== actionId && shortcuts[id] === combo) ?? null
}

// צירופים שמוגדרים ליותר מפעולה אחת: [{ combo, actionIds }] (ריק — אין כפילויות)
export function findDuplicateShortcuts(shortcuts) {
  const byCombo = new Map()
  for (const [actionId, combo] of Object.entries(shortcuts || {})) {
    if (!combo) continue
    if (!byCombo.has(combo)) byCombo.set(combo, [])
    byCombo.get(combo).push(actionId)
  }
  return [...byCombo].filter(([, ids]) => ids.length > 1).map(([combo, actionIds]) => ({ combo, actionIds }))
}

// צירופים שמורים — לא ניתנים להקלטה בחלון הקיצורים: עריכה בסיסית (ביטול, העתקה, הדבקה, בחירת
// הכול) ומקשי ניווט ועריכה בלי מקש שינוי. קיצור עליהם היה "בולע" את הפעולה הרגילה בעורך.
// הקומבינציה בפורמט של buildShortcutCombination: מקשי שינוי בסדר Ctrl, Alt, Shift, Meta ואז event.code.
const RESERVED_PLAIN_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'NumpadEnter', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])
const RESERVED_EDIT_KEYS = new Set(['KeyZ', 'KeyY', 'KeyC', 'KeyV', 'KeyX', 'KeyA'])

// האם הצירוף שמור. Ctrl ו-Cmd (Meta) שקולים לפעולות העריכה (⌘Z במק).
export function isReservedShortcut(combo) {
  if (!combo) return false
  const parts = String(combo).split('+')
  const code = parts.pop()
  const mods = new Set(parts)
  if (mods.size === 0) return RESERVED_PLAIN_KEYS.has(code)
  // Shift+Tab — מעבר פוקוס אחורה
  if (code === 'Tab' && mods.size === 1 && mods.has('Shift')) return true
  if (!RESERVED_EDIT_KEYS.has(code) || mods.has('Alt')) return false
  const primary = mods.has('Ctrl') !== mods.has('Meta') // בדיוק אחד מהם
  if (!primary) return false
  const shift = mods.has('Shift')
  // Ctrl+Shift+Z — ביצוע מחדש; שאר האותיות עם Shift — פנויות
  return !shift || code === 'KeyZ'
}

// הודעת השגיאה לצירוף שמור (או null) — לתיבת השגיאה של חלון הקיצורים
export function reservedShortcutMessage(combo) {
  if (!isReservedShortcut(combo)) return null
  return `הצירוף ${formatShortcut(combo)} שמור לפעולות עריכה בסיסיות. בחר צירוף אחר.`
}
