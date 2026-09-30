// קיצורי-המקלדת של עורך הגהת-העמודים — לפי המקש, בכל פריסת-מקלדת. בפריסה
// עברית Ctrl+Z נותן e.key === 'ז' (ולא 'z'), ולכן האות של הקיצור נקבעת כך:
//   1. e.key כשהוא אות לטינית — האות שעל המקש (QWERTY, וגם AZERTY / Dvorak, שבהן
//      המקש הפיזי של Z אחר: שם e.code לבדו היה מפעיל את הקיצור הלא-נכון);
//   2. אחרת — המקש הפיזי, e.code ('KeyZ'): עברית, רוסית וכל פריסה לא-לטינית;
//   3. בלי e.code שימושי (מקלדת וירטואלית, שולחן-עבודה מרוחק, אירוע סינתטי) —
//      האות העברית ← האות הלטינית שבאותו מקום בפריסה העברית התקנית ('ז' ← 'z').
// מקשים שאינם אותיות (Enter, רווח, F8, חיצים, Delete) — e.key, ואם אין — e.code.
// לוגיקה טהורה (בלי DOM): מקבלת כל אובייקט עם key / code / ctrlKey וכו'.

// הפריסה העברית התקנית (SI-1452): האות העברית ← האות הלטינית שעל אותו מקש
const HEBREW_TO_LATIN = Object.freeze({
  ק: 'e',
  ר: 'r',
  א: 't',
  ט: 'y',
  ו: 'u',
  ן: 'i',
  ם: 'o',
  פ: 'p',
  ש: 'a',
  ד: 's',
  ג: 'd',
  כ: 'f',
  ע: 'g',
  י: 'h',
  ח: 'j',
  ל: 'k',
  ך: 'l',
  ז: 'z',
  ס: 'x',
  ב: 'c',
  ה: 'v',
  נ: 'b',
  מ: 'n',
  צ: 'm',
});

const str = (v) => (typeof v === 'string' ? v : '');

// האות הלטינית (קטנה) של המקש שנלחץ — 'z' גם כש-e.key הוא 'ז'; null למקש שאינו אות
export function shortcutLetter(e) {
  const key = str(e?.key);
  if (/^[a-z]$/i.test(key)) return key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(str(e?.code));
  if (m) return m[1].toLowerCase();
  return HEBREW_TO_LATIN[key] || null;
}

// Ctrl (או Cmd במק) — בלי Alt: Ctrl+Alt הוא AltGr במקלדות אירופיות, ואינו קיצור של העורך
export const isCtrl = (e) => !!(e?.ctrlKey || e?.metaKey) && !e?.altKey;

// Ctrl+<אות> — shift: true (חובה), false (אסור) או null (לא משנה)
export function isShortcut(e, letter, { shift = false } = {}) {
  if (!isCtrl(e)) return false;
  if (shift !== null && !!e.shiftKey !== shift) return false;
  return shortcutLetter(e) === letter;
}

// מקש שאינו אות: 'Enter' (גם Enter שבמקלדת המספרים), 'Space', 'F8', 'ArrowDown', 'Delete'…
export function isKey(e, name) {
  const key = str(e?.key);
  const code = str(e?.code);
  if (name === 'Enter') return key === 'Enter' || code === 'Enter' || code === 'NumpadEnter';
  if (name === 'Space') return key === ' ' || key === 'Spacebar' || code === 'Space';
  return key === name || (!key && code === name) || (key === 'Unidentified' && code === name);
}
