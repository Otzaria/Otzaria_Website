// נרמול ואימות טקסט לתקן פרויקט ה-OCR (מקור אמת: src/hebrew_ocr/alphabet.py + normalize.py).
// מיושם כאן ב-JS כדי שהייצוא יפיק manifest שעובר את validate_manifest.py ללא שגיאות.
//
// שלבי הנרמול (בסדר): איחוד גרש/גרשיים לצורה העברית -> הסרת ניקוד/טעמים (כל סימן משולב) ->
// NFC -> כיווץ רווחים לרווח יחיד -> חיתוך רווחי קצה.

const GERESH = '׳'; // ׳
const GERSHAYIM = '״'; // ״

// מיפוי וריאנטים לצורה הקנונית — זהה ל-VARIANT_MAP ב-alphabet.py
const VARIANT_MAP = {
  "'": GERESH,
  '‘': GERESH, // '
  '’': GERESH, // '
  'ʼ': GERESH, // modifier apostrophe
  '"': GERSHAYIM,
  '“': GERSHAYIM, // "
  '”': GERSHAYIM, // "
  '‟': GERSHAYIM, // double high-reversed
};

// ===== האלפבית המאושר (זהה ל-alphabet.py) =====
const LETTERS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת'; // 22 + 5 סופיות
const DIGITS = '0123456789';
// פיסוק: . , : ; ! ? ( ) [ ] מקף עברי ־, קווים – —, גרשיים ״, גרש ׳
const PUNCTUATION = '.,:;!?()[]' + '־' + '–—' + '״׳';
const SPACE = ' ';

const ALPHABET = new Set([...LETTERS, ...DIGITS, ...PUNCTUATION, SPACE]);

/**
 * מנרמל מחרוזת יחידה לתקן הפרויקט.
 * @param {string} input
 * @returns {string}
 */
export function normalizeLineText(input) {
  if (!input) return '';
  let s = String(input);

  // 1. איחוד וריאנטים של גרש/גרשיים
  s = s.replace(/['"‘’ʼ“”‟]/g, (ch) => VARIANT_MAP[ch] || ch);

  // 2. הסרת כל סימן משולב (ניקוד/טעמים) — קטגוריית Unicode M
  s = s.replace(/\p{M}/gu, '');

  // 3. NFC (לאחר הסרת הניקוד)
  s = s.normalize('NFC');

  // 4. כיווץ רווחים (כולל טאב/שורה) לרווח יחיד
  s = s.replace(/\s+/g, ' ');

  // 5. חיתוך רווחי קצה
  return s.trim();
}

/**
 * מחזיר את רשימת התווים הייחודיים שאינם באלפבית המאושר, לאחר נרמול.
 * זהה בסמנטיקה ל-find_forbidden ב-normalize.py.
 * @param {string} input
 * @returns {string[]}
 */
export function findForbidden(input) {
  const norm = normalizeLineText(input);
  const bad = new Set();
  for (const ch of norm) {
    if (!ALPHABET.has(ch)) bad.add(ch);
  }
  return [...bad];
}

/**
 * האם הטקסט תקין לאימון: לא ריק לאחר נרמול, וכל תוויו באלפבית.
 * @param {string} input
 * @returns {boolean}
 */
export function isValidTrainingText(input) {
  const norm = normalizeLineText(input);
  if (!norm) return false;
  return findForbidden(input).length === 0;
}
