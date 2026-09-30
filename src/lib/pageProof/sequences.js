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

// FNV-1a 32 ביט — יציב בין ריצות ובין לקוח/שרת (משמש גם את docRevision)
export function hash32(s) {
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

// חלוקה-מחדש לרצפים של כל עמודי הספר (אחרי ייבוא — גם ייבוא בכמה חלקים, כמו
// עמודים מקושרים ולא-מקושרים, או מהדורה חדשה של עמוד שחזר מזיהוי-מחדש).
// pages: [{_id, page, seq, started}] — started = כבר חולק/הוגש (החכרה פעילה,
// הגשה פעילה או מאושרת). מחזיר Map(_id → seq) לעמודים שלא התחילו בלבד:
// הרצף-היעד = floor(מקום-העמוד בכל הספר / size), כך שהרצפים עוקבים לאורך
// הספר כולו. עמוד שהתחיל שומר את הרצף שלו ואינו במפה.
//
// הגנה מהתנגשות: אם מספר-הרצף של קבוצת-יעד כבר תפוס בידי עמוד שהתחיל
// *מחוץ* לקבוצה (למשל עמודים שנוספו לפני עמודים שכבר חולקו), עמודי הקבוצה
// מקבלים מספר חדש שמעל כל המספרים בשימוש — אחרת "רצף" אחד היה מערבב עמודים
// לא-עוקבים. עמוד שהתחיל *בתוך* הקבוצה (למשל שאר הרצף של עמוד שחזר מזיהוי-
// מחדש) אינו התנגשות — העמוד החדש מצטרף לרצף של שכניו.
export function resequence(pages, size = SEQ_SIZE) {
  const sorted = (pages || [])
    .filter((p) => p && Number.isFinite(p.page))
    .slice()
    .sort((a, b) => a.page - b.page || String(a._id).localeCompare(String(b._id)));
  const target = sorted.map((_, rank) => Math.floor(rank / size));

  const takenOutside = new Set();
  let top = target.length ? target[target.length - 1] : -1;
  sorted.forEach((p, k) => {
    if (!p.started || !Number.isFinite(p.seq)) return;
    top = Math.max(top, p.seq);
    if (p.seq !== target[k]) takenOutside.add(p.seq);
  });

  const fresh = new Map();
  const out = new Map();
  sorted.forEach((p, k) => {
    if (p.started) return;
    const g = target[k];
    if (!takenOutside.has(g)) {
      out.set(p._id, g);
      return;
    }
    if (!fresh.has(g)) fresh.set(g, ++top);
    out.set(p._id, fresh.get(g));
  });
  return out;
}
