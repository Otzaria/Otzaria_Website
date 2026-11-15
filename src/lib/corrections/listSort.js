/**
 * מיון רשימת הדיווחים. "לפי גרסת ספרייה" (ברירת המחדל) מקדים דיווחים מגרסה חדשה —
 * שהם ודאי רלוונטיים — לפני דיווחים מגרסה ישנה, שייתכן שכבר תוקנו מזמן (issue #283).
 * בתוך אותה גרסה: החדש קודם. דיווח בלי גרסה מזוהה — בסוף.
 *
 * הגרסה נלקחת מ-location.libraryBuildId (דיווחי תיקון חדשים) ואם אין — מ-libraryVersion,
 * בדיוק כמו התצוגה בדף הדיווח. המפתח הוא המספר הראשון במחרוזת ("27" → 27, "1.2.3" → 1.2),
 * כדי ש-"100" ימוין אחרי "27" ולא לפי סדר מילוני. (גרסה מנוקדת היא מפתח שבר יחיד: "1.10" < "1.9" —
 * לא משנה לגרסאות בנייה כמו "27".)
 *
 * libraryVersion מגיע מקלט ציבורי בלי הגבלת אורך: הספרות בביטוי מוגבלות ($toDouble על מספר ענק
 * זורק שגיאה ומפיל את כל הרשימה), והמרה עם onError=null — דיווח חריג לא יכול לשבור את התור.
 */

export const LIST_SORTS = ['version', 'newest', 'oldest'];
export const DEFAULT_LIST_SORT = 'version';

export function parseListSort(raw) {
  return LIST_SORTS.includes(raw) ? raw : DEFAULT_LIST_SORT;
}

const VERSION_NUMBER_RE = /\d{1,15}(?:\.\d{1,15})?/;

/** הגרסה המוצגת של דיווח (מחרוזת) או null. */
export function reportLibraryVersion(r) {
  const build = typeof r?.location?.libraryBuildId === 'string' ? r.location.libraryBuildId.trim() : '';
  if (build) return build;
  const v = typeof r?.libraryVersion === 'string' ? r.libraryVersion.trim() : '';
  return v && v !== 'unknown' ? v : null;
}

/** מקבילת-JS של libraryVersionKeyExpr — לטסטים ולתיעוד ההתנהגות. */
export function libraryVersionKey(r) {
  const build = String(r?.location?.libraryBuildId ?? '').trim();
  const src = build.length > 0 ? build : String(r?.libraryVersion ?? '');
  const m = src.match(VERSION_NUMBER_RE);
  return m ? Number(m[0]) : null;
}

/** ביטוי aggregation שמחשב את מפתח הגרסה המספרי (או null) — זהה ל-libraryVersionKey. */
export function libraryVersionKeyExpr() {
  const build = { $trim: { input: { $toString: { $ifNull: ['$location.libraryBuildId', ''] } } } };
  const src = { $cond: [{ $gt: [{ $strLenCP: build }, 0] }, build, { $toString: { $ifNull: ['$libraryVersion', ''] } }] };
  return {
    $let: {
      vars: { m: { $regexFind: { input: src, regex: VERSION_NUMBER_RE.source } } },
      in: { $cond: [{ $eq: ['$$m', null] }, null, { $convert: { input: '$$m.match', to: 'double', onError: null, onNull: null } }] },
    },
  };
}

/** סדר המיון של שלב $sort / של find().sort() לכל אפשרות. */
export function sortSpec(sort) {
  if (sort === 'oldest') return { createdAt: 1, _id: 1 };
  if (sort === 'version') return { _versionKey: -1, createdAt: -1, _id: -1 };
  return { createdAt: -1, _id: -1 };
}

/** השוואת-JS תואמת ל-sortSpec('version') (null בסוף) — לטסטים. */
export function compareByVersion(a, b) {
  const ka = libraryVersionKey(a);
  const kb = libraryVersionKey(b);
  if (ka !== kb) {
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka;
  }
  return new Date(b.createdAt) - new Date(a.createdAt);
}
