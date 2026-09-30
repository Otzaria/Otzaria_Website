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
});

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
