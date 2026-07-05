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
