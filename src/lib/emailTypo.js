/**
 * זיהוי שגיאת הקלדה בדומיין של כתובת מייל (gmail.cim, gmial.com...) — לוגיקה טהורה.
 * משמש להתרעה בלבד, לא לדחייה: כתובת שנראית שגויה עדיין עשויה להיות אמיתית.
 */

// דומיינים נפוצים אצל המשתמשים. דומיין שמופיע כאן כמות-שהוא לעולם לא מסומן כשגוי.
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'mail.com', 'email.com', 'gmx.com', 'protonmail.com', 'proton.me',
  'walla.co.il', 'walla.com', 'netvision.net.il', '012.net.il', 'bezeqint.net', 'zahav.net.il', 'smile.net.il',
  'hotmail.co.il', 'yahoo.co.il', 'msn.com',
];
const KNOWN = new Set(KNOWN_DOMAINS);

/** מרחק Damerau-Levenshtein (עם החלפת תווים סמוכים) — מספיק לדומיינים קצרים. */
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * הדומיין המתוקן אם הדומיין של הכתובת קרוב מאוד לדומיין נפוץ (ואינו הוא עצמו), אחרת null.
 * @param {string} email
 * @returns {string|null}
 */
export function suggestEmailDomain(email) {
  if (typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || domain.length > 100 || KNOWN.has(domain)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const known of KNOWN_DOMAINS) {
    // דומיין ארוך סובל שתי טעויות; קצר — אחת בלבד, כדי לא "לתקן" דומיינים פרטיים אמיתיים
    const limit = known.length >= 10 ? 2 : 1;
    const dist = editDistance(domain, known);
    if (dist <= limit && dist < bestDist) {
      best = known;
      bestDist = dist;
    }
  }
  return best;
}
