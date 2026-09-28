// יחידות-העבודה: רצף של עד 5 עמודים עוקבים מספר אחד (הכרעה ד-7 בפרויקט
// ה-OCR). חלק מהרצפים "כפולים" — מתויגים בידי שני אנשים שונים, כדי שבעל
// הפרויקט ימדוד הסכמה בין מתייגים. הבחירה דטרמיניסטית (גיבוב gid+רצף), כך
// שייבוא-חוזר של אותה חבילה לא מגריל מחדש.

export const SEQ_SIZE = 5;
export const DEFAULT_DOUBLE_PCT = 10;

// מספרי-העמודים (בכל סדר) ← מפה page→seq לפי הסדר העולה
export function assignSequences(pageNumbers, size = SEQ_SIZE) {
  const sorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
  const map = new Map();
  sorted.forEach((p, i) => map.set(p, Math.floor(i / size)));
  return map;
}

// FNV-1a 32 ביט — יציב בין ריצות ובין לקוח/שרת
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// האם הרצף כפול. pct בין 0 ל-100.
export function isDoubleSequence(gid, seq, pct = DEFAULT_DOUBLE_PCT) {
  if (!(pct > 0)) return false;
  if (pct >= 100) return true;
  return hash32(`${gid}:${seq}`) % 100 < pct;
}

// כמה הגשות נדרשות לעמוד ברצף
export function requiredFor(gid, seq, pct = DEFAULT_DOUBLE_PCT) {
  return isDoubleSequence(gid, seq, pct) ? 2 : 1;
}
