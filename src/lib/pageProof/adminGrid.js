// רשת-העמודים של ספר בניהול הגהת-העמודים (/library/admin/page-proof): המצב של
// כל עמוד בעיני המנהל, מונים, טווח-עמודים ונוסחי האזהרה. לוגיקה טהורה (בלי מסד
// ובלי DOM); צד-השרת — adminPages.js, הרכיב — components/pageProof/admin/AdminBookPages.

import { STATE_UI, CLAIM_HOURS } from './gridState.js';

// המצבים בעיני המנהל (לא תלויים בצופה, כמו pageStateFor של המתנדב):
//   open      — פנוי: אין תפיסה בתוקף ואין הגשות
//   second    — דרוש בודק נוסף: עמוד כפול שהוגש פעם אחת
//   taken     — תפוס: מתנדב מחזיק בו, והתפיסה בתוקף
//   submitted — הוגש, ממתין לאישור מנהל (כל ההגשות הנדרשות הגיעו, לא כולן אושרו)
//   approved  — אושר
//   recut     — ממתין לחיתוך ולזיהוי-מחדש בתוכנת-הספר
//   recut_ask — מתנדב תיקן חיתוך, והעמוד ממתין לאישור המנהל לזיהוי-מחדש (נעול; recutRequests.decideRecutAsk)
// "סגור למתנדבים" אינו מצב אלא מתג (volunteer) — עמוד סגור יכול להיות בכל מצב.
export const ADMIN_STATES = Object.freeze(['open', 'second', 'taken', 'submitted', 'approved', 'recut', 'recut_ask']);

const timeOf = (value) => {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
};

// page: {status, required, activeCount, approvedCount, leasedBy, leasedUntil}
export function adminPageState(page, now = new Date()) {
  const p = page || {};
  if (p.status === 'recut') return 'recut';
  if (p.status === 'recut_ask') return 'recut_ask';
  const required = p.required || 1;
  const active = p.activeCount || 0;
  const approved = p.approvedCount || 0;
  if (p.status === 'done' || active >= required) return approved >= required ? 'approved' : 'submitted';
  if (p.leasedBy && timeOf(p.leasedUntil) > now.getTime()) return 'taken';
  return active >= 1 ? 'second' : 'open';
}

// מצב התפיסה: 'active' (בתוקף) / 'expired' (פגה, והמחזיק עוד רשום) / null
export function leaseOf(page, now = new Date()) {
  if (!page?.leasedBy) return null;
  return timeOf(page.leasedUntil) > now.getTime() ? 'active' : 'expired';
}

// התוויות: כמו אצל המתנדב, חוץ מ"הוגש" (אצל המנהל — ממתין לאישורו)
export const ADMIN_STATE_UI = Object.freeze({
  open: STATE_UI.open,
  second: STATE_UI.second,
  taken: STATE_UI.taken,
  submitted: { ...STATE_UI.submitted, label: 'ממתין לאישור', short: 'לאישור' },
  approved: STATE_UI.approved,
  recut: STATE_UI.recut,
  recut_ask: {
    ...STATE_UI.recut,
    label: 'ממתין לאישורך לזיהוי-מחדש',
    short: 'לאישור חיתוך',
    icon: 'pending_actions',
    color: 'text-warning-alt-800',
    bgColor: 'bg-warning-alt-100',
    borderColor: 'border-warning-alt-400',
    bar: 'bg-warning-alt-400',
  },
});

// מונים לרשת: לכל מצב, ועוד closed (סגורים למתנדבים), leased (תפיסות בתוקף),
// expired (תפיסות שפגו ועוד רשומות) ו-total. pages: [{state, volunteer, lease}]
export function adminCounts(pages) {
  const counts = { total: 0, closed: 0, leased: 0, expired: 0 };
  for (const s of ADMIN_STATES) counts[s] = 0;
  for (const p of pages || []) {
    if (!p || !ADMIN_STATES.includes(p.state)) continue;
    counts.total++;
    counts[p.state]++;
    if (p.volunteer === false) counts.closed++;
    if (p.lease === 'active') counts.leased++;
    if (p.lease === 'expired') counts.expired++;
  }
  return counts;
}

// המסננים מעל הרשת (מפתח ← תנאי על עמוד)
export const ADMIN_FILTERS = Object.freeze({
  all: () => true,
  open: (p) => p.state === 'open' || p.state === 'second',
  taken: (p) => p.state === 'taken',
  submitted: (p) => p.state === 'submitted',
  approved: (p) => p.state === 'approved',
  recut: (p) => p.state === 'recut',
  recut_ask: (p) => p.state === 'recut_ask',
  closed: (p) => p.volunteer === false,
  expired: (p) => p.lease === 'expired',
});
export const adminMatches = (page, filter = 'all') => (ADMIN_FILTERS[filter] || ADMIN_FILTERS.all)(page);

// טווח עמודים מהטופס ("מעמוד" / "עד עמוד") ← {from, to} או {error}. "עד" ריק ←
// עמוד אחד. מספרים שלמים חיוביים בלבד, והראשון לא אחרי האחרון.
export function parsePageRange(fromRaw, toRaw) {
  const num = (v) => {
    const s = String(v ?? '').trim();
    return /^\d{1,6}$/.test(s) ? Number(s) : Number.NaN;
  };
  const from = num(fromRaw);
  const toText = String(toRaw ?? '').trim();
  const to = toText === '' ? from : num(toRaw);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) return { error: 'כתבו מספרי עמודים שלמים (למשל 1 עד 20)' };
  if (from > to) return { error: 'עמוד ההתחלה אחרי עמוד הסוף' };
  return { from, to };
}

export const rangeLabel = ({ from, to }) => (from === to ? `עמוד ${from}` : `עמודים ${from}–${to}`);

// עמוד שהתפיסה שלו פגה (בכרטיס-העמוד של המנהל): חוזר למתנדבים מעצמו — בלי כפתור "שחרור"
export const EXPIRED_NOTE = 'פנוי שוב לכל מתנדב, בלי צורך לשחרר. מה שעשה ולא הגיש נשמר, ומי שיתפוס את העמוד ימשיך ממנו.';

// האזהרה בשחרור בידי מנהל: הטיוטה של המתנדב שמורה באתר ועוברת עם העמוד (docs/63 §2 — serverDrafts.js)
export const DRAFT_WARNING =
  'העבודה שהמתנדב עוד לא הגיש שמורה באתר כטיוטה של העמוד ועוברת איתו: מי שיתפוס אותו — גם מתנדב אחר — ימשיך ממנה, והשינויים שקיבל מסומנים אצלו.';

// נוסח חלון-האישור לשחרור עמוד אחד
export function releaseMessage(page) {
  const who = page?.holder ? ` (בידי ${page.holder}${page.lease === 'expired' ? ', התפיסה כבר פגה' : ''})` : '';
  return `לשחרר את עמוד ${page?.page}${who}?\nהעמוד יחזור למאגר ויהיה פנוי לכל מתנדב.\n${DRAFT_WARNING}`;
}

// נוסח חלון-האישור לשחרור בבת אחת: scope 'expired' (תפיסות שפגו) / 'all'
export function bulkReleaseMessage(scope, n) {
  const what =
    scope === 'expired'
      ? `לנקות ${n === 1 ? 'תפיסה אחת שפגה' : `${n} תפיסות שפגו`} בספר?\nהעמודים האלה כבר פנויים לכולם; הניקוי רק מוחק את שם המתנדב מהם.`
      : `לשחרר ${n === 1 ? 'את העמוד התפוס' : `את כל ${n} העמודים התפוסים`} בספר?\nהעמודים יחזרו למאגר ויהיו פנויים לכל מתנדב.`;
  return `${what}\n${DRAFT_WARNING}`;
}

// נוסח חלון-האישור לביטול בקשת מתנדב לזיהוי-מחדש (release_recut על הבקשה). page — מהרשת,
// עם recutRequest: {by, picked}
export function cancelRecutMessage(page) {
  const r = page?.recutRequest || {};
  const who = r.by || 'המתנדב';
  const picked = r.picked ? '\nתוכנת-הספר כבר משכה את הבקשה; אם תחזיר גרסה חדשה של העמוד, הייבוא יעדכן אותו כל עוד איש לא הגיש אותו.' : '';
  return `לבטל את הבקשה לזיהוי-מחדש של עמוד ${page?.page}?\nהעמוד יחזור אל ${who} (שמור לו ${CLAIM_HOURS} שעות) בלי זיהוי-מחדש, עם התיקונים שבטיוטה שלו.${picked}`;
}

// בקשה לזיהוי-מחדש שממתינה לאישור המנהל (recut_ask) — הנוסחים של חלון-האישור. reason — recutRules.ASK_REASONS
const ASK_WHY = Object.freeze({ off: 'השליחה בלי מנהל כבויה', cap: 'למתנדב כבר יש 5 עמודים שממתינים לזיהוי-מחדש', other: 'לעמוד יש הגשה של מתנדב אחר' });
export function askDecideMessage(page, decision) {
  const a = page?.recutAsk || {};
  const who = a.by || 'המתנדב';
  const why = ASK_WHY[a.reason] ? ` (${ASK_WHY[a.reason]})` : '';
  if (decision === 'approve') {
    const other = a.reason === 'other' ? '\nלעמוד יש הגשה של מתנדב אחר — היא נעשתה על החיתוך הקודם, ותישאר לבדיקתך.' : '';
    return `לאשר זיהוי-מחדש לעמוד ${page?.page}${why}?\nהעמוד ימתין לתוכנת-הספר ויחזור אל ${who} לשלב הטקסט אחרי הזיהוי-מחדש.${other}`;
  }
  return `לא לאשר זיהוי-מחדש לעמוד ${page?.page}?\nהעמוד יחזור אל ${who} (שמור לו ${CLAIM_HOURS} שעות) לשלב הטקסט, ותיקוני-החיתוך שלו ייצאו עם ההגשה — ואז תחליט עליהם.`;
}

// כמה זמן תפיסה נמשכת (להסבר בניהול)
export const CLAIM_NOTE = `כל עמוד שמתנדב תופס שמור לו ${CLAIM_HOURS} שעות (לכל עמוד לחוד; שבת וחג אינם נספרים), וכל פתיחה של העמוד בעורך מחדשת את הזמן ל-${CLAIM_HOURS} שעות מלאות. תפיסה שפגה — העמוד שוב פנוי לכולם מעצמו, בלי צורך לשחרר, והעבודה שהמתנדב לא הגיש עוברת עם העמוד למי שיתפוס אותו.`;
