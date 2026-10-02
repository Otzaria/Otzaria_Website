// בקשת מתנדב לזיהוי-מחדש — הכללים הטהורים (בלי מסד ובלי I/O): אילו פעולות נשלחות, מתי מותר,
// התקרות והנוסחים. הצד שכותב למסד — recutRequests.js; הראוט —
// api/page-proof/pages/[id]/recut-request; הממשק — "שלח לזיהוי-מחדש" בדף המתנדב.
//
// הלולאה: מתנדב שתיקן חיתוך (פיצול / איחוד / שורה חדשה / תיבה) שולח את העמוד בעצמו, בלי לחכות
// להגשה ולאישור מנהל. רק פעולות-החיתוך נשלחות; שאר התיקונים נשארים בטיוטה שלו בדפדפן, להגשה
// הרגילה אחר כך. הבקשה ממתינה באתר (העמוד במצב 'recut') עד שתוכנת-הספר מושכת אותה
// (fixes?pages=recut&mark=1), חותכת ומזהה מחדש ומייבאת גרסה חדשה — ואז העמוד חוזר אל המתנדב
// (התפיסה שלו מתחדשת), והטיוטה שלו עוברת לגרסה החדשה (drafts.cleanupPageDrafts).

import { CUT_KINDS, needsRecut, packOps, sanitizeOps, validateOps } from './ops.js';
import { revisionFilter } from './importRules.js';
import { CLAIM_HOURS } from './gridState.js';

// בקשות ממתינות למתנדב אחד (עמוד שנשלח ועוד לא חזר)
export const MAX_PENDING_RECUT = 5;
// האטה פשוטה: בקשות למשתמש בחלון (lib/rate-limit.checkRateLimit)
export const RECUT_RATE = Object.freeze({ tokens: 10, interval: 'hour' });

// שם "הבודק" של בקשה (היא מאושרת לצורך הזיהוי-מחדש בלבד — אין בודק אנושי)
export const RECUT_REVIEWER = 'בקשת מתנדב לזיהוי-מחדש';
export const RECUT_CANCEL_NOTE = 'הבקשה בוטלה: מנהל שחרר את העמוד מהמתנה לזיהוי-מחדש';

export const RECUT_MSG = Object.freeze({
  noCut: 'אין בטיוטה תיקוני-חיתוך (פיצול, איחוד, שורה חדשה או תיבה) — אין מה לשלוח לזיהוי-מחדש',
  reload: 'העמוד עודכן מאז שנפתח (חזר מזיהוי-מחדש) — טענו אותו מחדש',
  tooMany: `יש לכם כבר ${MAX_PENDING_RECUT} עמודים שממתינים לזיהוי-מחדש — אפשר לשלוח עוד כשאחד מהם יחזור`,
  rate: 'יותר מדי בקשות לזיהוי-מחדש בזמן קצר — נסו שוב מאוחר יותר',
  off: 'שליחה לזיהוי-מחדש כבויה כרגע. הגישו את העמוד כרגיל עם תיקוני-החיתוך: אחרי אישור המנהל הוא ייחתך ויזוהה מחדש ויחזור להגהה.',
});

// ---------- מתג המנהל: האם מתנדבים יכולים לשלוח לזיהוי-מחדש (2026-10-02) ----------
//
// הזיהוי-מחדש רץ בתוכנת-הספר אצל בעל הפרויקט, רק כשהיא פתוחה; כשהיא סגורה הבקשות ממתינות באתר
// בלי סוף. לכן מתג אחד לכל האתר (SystemConfig 'pageProof.runtime' — runtime.js):
//   on   — הכפתור "שלח לזיהוי-מחדש" מופיע למתנדבים (כמו עד היום; ברירת-המחדל);
//   off  — לא מופיע, ובקשה נדחית (409 — RECUT_MSG.off): תיקוני-חיתוך עוברים בהגשה הרגילה;
//   auto — מופיע רק כשתוכנת-הספר נראתה מחוברת ב-autoMinutes הדקות האחרונות (מפתח-גישה עם הרשאת
//          import שהשתמשו בו — tokenAuth מעדכן lastUsedAt, לכל היותר פעם בדקה).
// בקשות שכבר ממתינות נשארות בכל מצב; "החזר את כל הממתינים למתנדבים" — פעולה נפרדת
// (recutRequests.releaseAllRecutRequests).
export const RECUT_MODES = Object.freeze(['on', 'off', 'auto']);
export const AUTO_MINUTES = 15;
const MAX_AUTO_MINUTES = 240;

// ברירות המחדל כשאין מסמך, וגם התיקון לערך פגום
export function normalizeProofRuntime(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const m = Number(v.autoMinutes);
  return {
    recutRequests: RECUT_MODES.includes(v.recutRequests) ? v.recutRequests : 'on',
    autoMinutes: Number.isInteger(m) && m >= 1 && m <= MAX_AUTO_MINUTES ? m : AUTO_MINUTES,
  };
}

// בדיקת קלט של עדכון (PATCH): {patch} או {error} בעברית. רק המפתחות המוכרים
export function proofRuntimePatch(body) {
  const b = body && typeof body === 'object' ? body : {};
  const patch = {};
  if (b.recutRequests !== undefined) {
    if (!RECUT_MODES.includes(b.recutRequests)) return { error: 'מצב לא מוכר — on, off או auto' };
    patch.recutRequests = b.recutRequests;
  }
  if (b.autoMinutes !== undefined) {
    const m = Number(b.autoMinutes);
    if (!Number.isInteger(m) || m < 1 || m > MAX_AUTO_MINUTES) return { error: `מספר הדקות חייב להיות בין 1 ל-${MAX_AUTO_MINUTES}` };
    patch.autoMinutes = m;
  }
  if (!Object.keys(patch).length) return { error: 'אין מה לעדכן' };
  return { patch };
}

export const isCutOp = (op) => CUT_KINDS.includes(op?.kind);

// הפעולות של בקשה: רק פעולות-החיתוך — מנוקות לצורת-החוזה, נארזות ונבדקות מול העמוד השמור
// בדיוק כמו בהגשה (sanitizeOps ← packOps ← validateOps), ו-needsRecut חייב להיות אמת.
// ← {ops} או {error} בעברית
export function recutRequestOps(baseDoc, rawOps) {
  if (!Array.isArray(rawOps)) return { error: 'רשימת תיקונים חסרה' };
  const cut = sanitizeOps(rawOps).filter(isCutOp);
  if (!needsRecut(cut)) return { error: RECUT_MSG.noCut };
  const ops = packOps(baseDoc, cut);
  const invalid = validateOps(baseDoc, ops);
  if (invalid) return { error: invalid };
  if (!needsRecut(ops)) return { error: RECUT_MSG.noCut };
  return { ops };
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const timeOf = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
};

// "תוכנת-הספר נראתה לאחרונה: …" — לכרטיס המנהל
export function seenAgoLabel(seenAt, now = new Date()) {
  const t = timeOf(seenAt);
  if (!Number.isFinite(t)) return 'עוד לא נראתה (אין שימוש במפתח-גישה עם הרשאת ייבוא)';
  const min = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (min < 1) return 'עכשיו';
  if (min === 1) return 'לפני דקה';
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'לפני יום' : `לפני ${d} ימים`;
}

// האם הכפתור פתוח למתנדבים עכשיו: settings — normalizeProofRuntime; seenAt — מתי תוכנת-הספר נראתה
// לאחרונה (runtime.bookSoftwareSeenAt), או null
export function recutEffective(settings, seenAt, now = new Date()) {
  const s = normalizeProofRuntime(settings);
  if (s.recutRequests === 'on') return true;
  if (s.recutRequests === 'off') return false;
  const t = timeOf(seenAt);
  return Number.isFinite(t) && now.getTime() - t <= s.autoMinutes * 60 * 1000;
}

// למה אי אפשר לשלוח את העמוד עכשיו (לפי המצב השמור), או null. page: {status, leasedBy,
// leasedUntil, submitters, activeCount}. הכללים: העמוד פתוח, בטיפול המתנדב (התפיסה בתוקף),
// הוא לא הגיש אותו, ואין לעמוד הגשה פעילה של מתנדב אחר (עמוד כפול) — אחרת הזיהוי-מחדש היה
// מחליף עמוד שמישהו כבר הגיש, בלי מנהל.
export function recutRefusal(page, userId, now = new Date()) {
  if (!page) return 'העמוד לא נמצא';
  if (page.status === 'recut') return 'העמוד כבר ממתין לזיהוי-מחדש';
  if (page.status !== 'open') return 'העמוד כבר הושלם';
  if ((page.submitters || []).some((s) => sameId(s, userId))) return 'כבר הגשתם את העמוד הזה';
  const mine = sameId(page.leasedBy, userId) && timeOf(page.leasedUntil) > now.getTime();
  if (!mine) return 'העמוד אינו בטיפולכם — שולחים לזיהוי-מחדש רק עמוד שתפסתם (התפיסה פגה? תפסו אותו שוב ברשת-העמודים)';
  if ((page.activeCount || 0) > 0) {
    return 'לעמוד הזה כבר יש הגשה של מתנדב אחר, ולכן אי אפשר לשלוח אותו לזיהוי-מחדש — הגישו אותו עם תיקוני-החיתוך, והמנהל יחליט';
  }
  return null;
}

// מסנן-Mongo תואם ל-recutRefusal (לעדכון האטומי open ← recut): אם בינתיים מישהו הגיש, התפיסה
// פגה או העמוד הוחלף — העדכון לא חל
export function recutEligibleFilter(userId, revision, now = new Date()) {
  return {
    status: 'open',
    ...revisionFilter(revision),
    leasedBy: userId,
    leasedUntil: { $gt: now },
    submitters: { $ne: userId },
    activeCount: { $not: { $gt: 0 } },
  };
}

// התפיסה שהמתנדב מקבל בחזרה (העמוד חזר מהזיהוי-מחדש, או שהמנהל ביטל את הבקשה): כמו פתיחה
// בעורך — CLAIM_HOURS שעות מלאות מעכשיו
export const CLAIM_BACK_MS = CLAIM_HOURS * 60 * 60 * 1000;
export function claimBack(userId, now = new Date()) {
  return userId ? { leasedBy: userId, leasedUntil: new Date(now.getTime() + CLAIM_BACK_MS) } : {};
}

// הבקשה שקובעת למי העמוד חוזר: הבקשה הממתינה האחרונה (בגרסה הזו), או null
export function requesterOf(requests) {
  const list = (requests || []).filter((r) => r && r.status === 'approved' && r.recutRequest && !r.recutDoneAt);
  if (!list.length) return null;
  list.sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt) || String(b._id).localeCompare(String(a._id)));
  return list[0].user ?? null;
}
