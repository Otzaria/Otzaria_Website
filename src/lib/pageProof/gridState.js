// בחירת עמודים בהגהת-עמודים "כמו בעריכת הספרים הישנה": רשימת ספרים עם פס
// התקדמות, ורשת-עמודים לכל ספר שבה המתנדב תופס עמוד (או רצף של 5) בעצמו.
// כאן הלוגיקה הטהורה (בלי מסד ובלי DOM): מצב כל עמוד מנקודת המבט של הצופה,
// מונים, צבעים ותוויות, קיבוץ לרצפים והכתובות. צד-השרת — claims.js.

import { hasBookLibraryAccess, hasOcrAccess } from '../roles.js';

// כמה עמודים ברצף (כמו sequences.SEQ_SIZE — כאן כדי לא לגרור את המודול הזה)
export const SEQ_SIZE = 5;

// כמה זמן עמוד שנתפס ברשת נשמר למתנדב, וכמה עמודים אפשר להחזיק בבת אחת
// (רצף אחד) — כאן ולא ב-claims.js, כי גם הממשק מציג אותם
export const CLAIM_HOURS = 48;
export const MAX_HELD = 5;

// כל המצבים האפשריים של עמוד בעיני הצופה
//   open      — פנוי: אפשר לתפוס
//   mine      — בטיפולך: מוחכר לצופה, והוא עוד לא הגיש
//   taken     — תפוס: מוחכר למתנדב אחר, ההחכרה בתוקף
//   submitted — הצופה הגיש, ממתין לאישור מנהל
//   approved  — ההגשה של הצופה אושרה
//   second    — עמוד כפול (required=2) שמתנדב אחר כבר הגיש: דרוש בודק נוסף
//   recut     — ממתין לחיתוך ולזיהוי-מחדש בתוכנת-הספר (לא מוצע למתנדבים)
//   done      — הושלם בידי אחרים (הצופה לא מעורב)
export const STATES = ['open', 'mine', 'taken', 'submitted', 'second', 'approved', 'done', 'recut'];

// מצבים שבהם הצופה יכול לתפוס את העמוד
export const CLAIMABLE = Object.freeze(['open', 'second']);
export const canClaim = (state) => CLAIMABLE.includes(state);

// "העמודים שלי" — מה שהצופה מחזיק או הגיש
export const MY_STATES = Object.freeze(['mine', 'submitted', 'approved']);
export const isMyState = (state) => MY_STATES.includes(state);

const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

const timeOf = (value) => {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
};

// page: {status, required, activeCount, approvedCount, submitters:[ids],
//        leasedBy, leasedUntil, mySubmissionStatus}
// mySubmissionStatus — ההגשה של הצופה לגרסה הנוכחית של העמוד ('submitted' /
// 'approved'; הגשה שנדחתה — כאילו אין). הגשה של הצופה קודמת לכל השאר: מי
// שהגיש רואה "הוגש"/"אושר" גם כשהעמוד כבר הושלם או ממתין לזיהוי-מחדש.
export function pageStateFor(page, viewerId, now = new Date()) {
  const p = page || {};
  const me = viewerId === null || viewerId === undefined || viewerId === '' ? null : String(viewerId);
  const iSubmitted = me !== null && (p.submitters || []).some((s) => sameId(s, me));

  if (p.mySubmissionStatus === 'approved') return 'approved';
  if (p.mySubmissionStatus === 'submitted' || iSubmitted) return 'submitted';
  if (p.status === 'recut') return 'recut';
  if (p.status === 'done') return 'done';

  if (p.leasedBy && timeOf(p.leasedUntil) > now.getTime()) {
    return me !== null && sameId(p.leasedBy, me) ? 'mine' : 'taken';
  }

  const required = p.required || 1;
  const active = p.activeCount || 0;
  // מצב-ביניים (ההגשה האחרונה נכנסה ועוד לא סומן done) — כבר אין מה לעשות בו
  if (active >= required) return 'done';
  if (active >= 1) return 'second';
  return 'open';
}

// התוויות והצבעים לכל מצב — באותו סגנון של pageStatusConfig בדף הספר הישן
// (color / bgColor / borderColor לתווית; short — התווית בתצוגה הצפופה; bar —
// הצבע בפס ההתקדמות ובנקודה שבמקרא). פנוי = ניטרלי, בטיפול/תפוס = info, ממתין = warning-alt,
// אושר/הושלם = success, זיהוי-מחדש = feature.
export const STATE_UI = Object.freeze({
  open: {
    label: 'פנוי',
    short: 'פנוי',
    icon: 'description',
    color: 'text-neutral-700',
    bgColor: 'bg-neutral-100',
    borderColor: 'border-neutral-300',
    bar: 'bg-neutral-300',
  },
  mine: {
    label: 'בטיפולך',
    short: 'בטיפולך',
    icon: 'edit',
    color: 'text-info-700',
    bgColor: 'bg-info-100',
    borderColor: 'border-info-300',
    bar: 'bg-info-500',
  },
  taken: {
    label: 'תפוס',
    short: 'תפוס',
    icon: 'lock',
    color: 'text-info-700',
    bgColor: 'bg-info-50',
    borderColor: 'border-info-200',
    bar: 'bg-info-300',
  },
  submitted: {
    label: 'הוגש',
    short: 'הוגש',
    icon: 'hourglass_top',
    color: 'text-warning-alt-700',
    bgColor: 'bg-warning-alt-100',
    borderColor: 'border-warning-alt-300',
    bar: 'bg-warning-alt-500',
  },
  second: {
    label: 'דרוש בודק נוסף',
    short: 'בודק נוסף',
    icon: 'group',
    color: 'text-warning-alt-800',
    bgColor: 'bg-warning-alt-50',
    borderColor: 'border-warning-alt-300',
    bar: 'bg-warning-alt-300',
  },
  approved: {
    label: 'אושר',
    short: 'אושר',
    icon: 'verified',
    color: 'text-success-700',
    bgColor: 'bg-success-100',
    borderColor: 'border-success-300',
    bar: 'bg-success-600',
  },
  done: {
    label: 'הושלם',
    short: 'הושלם',
    icon: 'check_circle',
    color: 'text-success-700',
    bgColor: 'bg-success-50',
    borderColor: 'border-success-200',
    bar: 'bg-success-400',
  },
  recut: {
    label: 'ממתין לזיהוי-מחדש',
    short: 'זיהוי-מחדש',
    icon: 'cached',
    color: 'text-feature-700',
    bgColor: 'bg-feature-100',
    borderColor: 'border-feature-300',
    bar: 'bg-feature-400',
  },
});

// מונים לפי מצב. items — מצבים (מחרוזות) או אובייקטים {state, n?} (n = משקל,
// למשל קבוצה מצטברת מהמסד). מצב לא מוכר — לא נספר.
//   available — מה שאפשר לתפוס (פנוי + דרוש בודק נוסף)
//   my        — "העמודים שלי" (בטיפולך + הוגשו + אושרו)
export function bookCounts(items) {
  const counts = { total: 0 };
  for (const s of STATES) counts[s] = 0;
  for (const item of items || []) {
    const state = typeof item === 'string' ? item : item?.state;
    if (!STATES.includes(state)) continue;
    const n = typeof item === 'object' && Number.isFinite(item.n) ? Math.max(0, item.n) : 1;
    counts[state] += n;
    counts.total += n;
  }
  counts.available = counts.open + counts.second;
  counts.my = counts.mine + counts.submitted + counts.approved;
  return counts;
}

// הסדר בפס ההתקדמות: מה שנגמר (ירוק) ← ממתין ← בעבודה ← זיהוי-מחדש ← פנוי
export const BAR_ORDER = Object.freeze(['done', 'approved', 'submitted', 'second', 'mine', 'taken', 'recut', 'open']);

// מקטעי פס ההתקדמות ← [{state, n, pct}] רק למצבים שיש בהם עמודים
export function barSegments(counts) {
  const total = counts?.total || 0;
  if (!(total > 0)) return [];
  return BAR_ORDER.filter((s) => (counts[s] || 0) > 0).map((s) => ({ state: s, n: counts[s], pct: (counts[s] / total) * 100 }));
}

// כרטיסי-הסינון בראש רשת העמודים
export const FILTERS = Object.freeze({
  all: () => true,
  available: canClaim,
  mine: (s) => s === 'mine',
  submitted: (s) => s === 'submitted',
  approved: (s) => s === 'approved',
  recut: (s) => s === 'recut',
});

// filter — מפתח ב-FILTERS; ownership — 'all' / 'mine' (העמודים שלי)
export function matchesFilter(state, filter = 'all', ownership = 'all') {
  const byStatus = FILTERS[filter] || FILTERS.all;
  return byStatus(state) && (ownership !== 'mine' || isMyState(state));
}

// הלשוניות ברשימת הספרים (כמו בספרייה הישנה). counts — מ-bookCounts.
//   completed — אין בספר מה לתפוס ואף אחד לא עובד בו (הכול הוגש/הושלם)
export const BOOK_FILTERS = Object.freeze({
  all: () => true,
  available: (c) => c.available > 0,
  mine: (c) => c.my > 0,
  completed: (c) => c.total > 0 && c.available + c.mine + c.taken === 0,
});

// book: {title, counts}; search — חלק משם הספר
export function bookMatches(book, { filter = 'all', search = '' } = {}) {
  const counts = book?.counts || bookCounts([]);
  const byStatus = BOOK_FILTERS[filter] || BOOK_FILTERS.all;
  const q = String(search || '').trim().toLowerCase();
  return byStatus(counts) && (!q || String(book?.title || '').toLowerCase().includes(q));
}

// קיבוץ לרצפים לפי שדה seq של העמוד (הרצף שבמסד — אותו רצף שתופסים ב"תפוס
// את 5 העמודים"). עמוד בלי seq מקובץ לפי מקומו בספר, size בכל קבוצה (אז seq
// של הקבוצה null — אי אפשר לתפוס אותה כרצף). הקבוצות לפי העמוד הראשון שלהן.
export function groupBySequence(pages, size = SEQ_SIZE) {
  const step = Number.isInteger(size) && size > 0 ? size : SEQ_SIZE;
  const list = (pages || [])
    .filter((p) => p && Number.isFinite(p.page))
    .slice()
    .sort((a, b) => a.page - b.page);
  const groups = new Map();
  list.forEach((p, rank) => {
    const real = Number.isFinite(p.seq);
    const key = real ? `s${p.seq}` : `r${Math.floor(rank / step)}`;
    if (!groups.has(key)) groups.set(key, { key, seq: real ? p.seq : null, pages: [] });
    groups.get(key).pages.push(p);
  });
  return [...groups.values()]
    .map((g) => ({ ...g, first: g.pages[0].page, last: g.pages[g.pages.length - 1].page }))
    .sort((a, b) => a.first - b.first);
}

// למה כדאי לקחת רצף שלם (tooltip ליד "הצג ברצפים" ו"תפוס את 5 העמודים")
export const SEQ_HINT =
  'עמודים עוקבים מלמדים את המערכת את מבנה הדף טוב יותר — איך זרם, פסקה או הערה ממשיכים מעמוד לעמוד. לכן כדאי לקחת רצף שלם.';

// הכפתור של רצף: free — כמה עמודים פנויים בו, size — כמה עמודים ברצף
export function seqClaimLabel(free, size) {
  if (free === 1) return 'תפוס את העמוד הפנוי';
  return free === size ? `תפוס את ${free} העמודים` : `תפוס את ${free} העמודים הפנויים`;
}

// למה תפיסה נכשלה, לפי המצב העדכני של העמוד
const REFUSAL_HE = Object.freeze({
  taken: 'העמוד נתפס בינתיים בידי מתנדב אחר',
  submitted: 'כבר הגשתם את העמוד הזה',
  approved: 'כבר הגשתם את העמוד הזה',
  done: 'העמוד כבר הושלם',
  recut: 'העמוד ממתין לחיתוך ולזיהוי-מחדש ואינו פתוח כרגע',
});
export const claimRefusal = (state) => REFUSAL_HE[state] || 'אי אפשר לתפוס את העמוד כרגע';

// מי רשאי להגיה עמודים — כמו requireProofSession בשרת (pool.js)
export function canProof(user) {
  if (!user) return false;
  return !!user.isVerified || hasBookLibraryAccess(user.role) || hasOcrAccess(user.role);
}

// כתב-הספר כפי שהגיע בחבילה ← תווית
const SCRIPT_HE = Object.freeze({ square: 'כתב מרובע', rashi: 'כתב רש"י' });
export const scriptLabel = (script) => SCRIPT_HE[script] || '';

// שגיאה מקריאת-API (api-utils) ← הודעה בעברית: שגיאת-רשת או תשובה שאינה
// JSON מקבלות את ברירת-המחדל; הודעה מהשרת (עברית) — כמו שהיא
export function failMessage(e, fallback) {
  if (!e || e.name === 'TypeError' || e.name === 'SyntaxError') return fallback;
  const msg = String(e.message || '');
  return !msg || /^API Error/.test(msg) ? fallback : msg;
}

// פרמטר מהכתובת (gid): Next כבר מפענח בדרך כלל — פענוח נוסף רק אם נשאר
// מקודד, ובלי לזרוק על '%' בודד
export function decodeParam(raw) {
  const value = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
  if (!/%[0-9a-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// הכתובות. העורך — דף המתנדב עם ?page= (פותח את העמוד הזה).
// התמונות כוללות את גרסת-העמוד (כמו editorPageShape), כדי שעמוד שחזר
// מזיהוי-מחדש לא יוצג מתמונה ישנה שבמטמון הדפדפן.
export const editorHref = (pageId) => `/library/page-proof?page=${encodeURIComponent(String(pageId))}`;
export const bookHref = (gid) => `/library/page-proof/books/${encodeURIComponent(String(gid))}`;
export const thumbUrl = (page) => `/api/page-proof/pages/${page.id}/thumb?v=${page.revision || 1}`;
export const imageUrl = (page) => `/api/page-proof/pages/${page.id}/image?v=${page.revision || 1}`;
