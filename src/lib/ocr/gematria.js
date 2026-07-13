// פענוח וכתיבת מספור עברי (גימטריה) — מקבילו הקטן ב-JS של
// src/hebrew_ocr/gematria.py מפרויקט ה-OCR, לוולידציה חיה של תשובות
// מספר-עמוד בתיוג מבנה-עמוד (לקוח + שרת). אותם כללים בדיוק: אם משנים
// כאן — לעדכן גם שם.

const VALUES = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80,
  צ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
  ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90,
};

// תווים שמנוקים לפני הפענוח: גרש/גרשיים (עברי ו-ASCII), פיסוק, סימני
// כיווניות (RLM/LRM — כ-escapes, לא ליטרלים, בגלל בדיקת trojan-source)
const STRIP = new Set(['׳', '״', "'", '"', '`', '.', ',', ':', ';', '(', ')', '[', ']', '-', ' ', '\u200f', '\u200e']);

// ערך → האות הסטנדרטית (לא-סופית): הרגילות מאוחרות במפה ולכן גוברות על הסופיות
const TO_CHAR = {};
for (const [ch, v] of Object.entries(VALUES).reverse()) TO_CHAR[v] = ch;

/**
 * ממיר טקסט גימטריה לערך מספרי. null אם אינו מספר עברי תקין.
 * כללי שפיות: 1-4 אותיות אחרי ניקוי; ערכים יורדים-או-שווים משמאל לימין
 * (פרט לצירופי ט״ו/ט״ז); טווח 1..1499.
 * @param {string} text
 * @returns {number|null}
 */
export function parseHebrewNumber(text) {
  const s = [...String(text || '').trim()].filter((c) => !STRIP.has(c)).join('');
  if (!s || s.length > 4 || [...s].some((c) => !(c in VALUES))) return null;
  const vals = [...s].map((c) => VALUES[c]);
  for (let i = 1; i < vals.length; i++) {
    const a = vals[i - 1];
    const b = vals[i];
    if (b > a && !(a === 9 && (b === 6 || b === 7))) return null; // ט״ו כתוב טו — 9,6
  }
  let total = vals.reduce((x, y) => x + y, 0);
  if (s === 'טו') total = 15;
  if (s === 'טז') total = 16;
  return total > 0 && total < 1500 ? total : null;
}

/**
 * כותב ערך כגימטריה סטנדרטית (ללא גרשיים): 311→שיא, 15→טו, 551→תקנא.
 * @param {number} n
 * @returns {string}
 */
export function toHebrewNumber(n) {
  if (!Number.isInteger(n) || n <= 0 || n >= 1500) {
    throw new Error(`מחוץ לטווח: ${n}`);
  }
  const out = [];
  for (const unit of [400, 300, 200, 100]) {
    while (n >= unit) {
      out.push(TO_CHAR[unit]);
      n -= unit;
    }
  }
  if (n === 15 || n === 16) { // קדושת השם: טו/טז
    out.push('ט');
    n -= 9;
  }
  for (const unit of [90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    if (n >= unit) {
      out.push(TO_CHAR[unit]);
      n -= unit;
    }
  }
  return out.join('');
}

/**
 * מספר-עמוד: ספרות (251) או גימטריה (שי״א), גם בצורת דף — "קעה ע״א".
 * בצורת-דף מוחזר ערך הדף.
 * @param {string} text
 * @returns {number|null}
 */
export function parsePageNumber(text) {
  const raw = String(text || '').trim();
  let t = raw;
  while (t.length && STRIP.has(t[0])) t = t.slice(1);
  while (t.length && STRIP.has(t[t.length - 1])) t = t.slice(0, -1);
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n > 0 && n < 5000 ? n : null;
  }
  const direct = parseHebrewNumber(raw);
  if (direct !== null) return direct;
  // "קעה עא" / "דף קעה ע״ב" — הטוקן המספרי הראשון שאינו דף/עמוד
  for (const tok of raw.split(/\s+/)) {
    const clean = [...tok].filter((c) => !STRIP.has(c)).join('');
    if (clean === 'דף' || clean === 'עא' || clean === 'עב' || clean === 'ע') continue;
    const v = parseHebrewNumber(tok);
    if (v !== null) return v;
  }
  return null;
}
