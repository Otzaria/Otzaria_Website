// צורות-התשובה של סקירת ההגשות בניהול הגהת-העמודים — משותפות לראוט של הגשה אחת
// (api/admin/page-proof/submissions/[id]) ולרשימת ההגשות של ספר לפי עמוד, עם הפעולות
// (api/admin/page-proof/books/[gid]/submissions — לתצוגת "לפני/אחרי" בתוכנת-הספר).
// טהור (בלי מסד); נתיבים יחסיים — רץ גם ב-node:test.

import { needsRecut } from './ops.js';
import { storedRevision, submissionRevision } from './importRules.js';
import { docRevision } from './textModel.js';

// ההגשה המלאה, עם הפעולות (packed — חוזה-העמוד §3). revision — הגרסה שעליה נעשתה.
// based (רשות — basedOn.basedOnOf): ההגשה מבוססת על הגשה קודמת לעמוד (הבודק השני, עמוד שנפתח מחדש — docs/63 §4–§5) ←
// basedOn: {id, userName, status, createdAt, kind, added, removed} ("מבוססת על הגשה X", ומה השתנה מעבר לה) ו-sameAs (לכל
// פעולה — "<מזהה-הקודמת>:<מקום>" לפעולה זהה, אחרת null). בלעדיו — null.
export function submissionDetail(sub, based = null) {
  return {
    id: String(sub._id),
    status: sub.status,
    userName: sub.userName,
    who: sub.who,
    ops: sub.ops,
    note: sub.note,
    createdAt: sub.createdAt,
    reviewedByName: sub.reviewedByName,
    reviewedAt: sub.reviewedAt,
    reviewNote: sub.reviewNote,
    reviewerEdited: sub.reviewerEdited,
    exportedAt: sub.exportedAt,
    // מה שנקבע בהגשה (גם מסגרות ששונו — ops.framesChanged); הגשה ישנה בלי השדה — לפי פעולות-החיתוך
    needsRecut: sub.needsRecut ?? needsRecut(sub.ops),
    revision: submissionRevision(sub),
    // בקשת מתנדב לזיהוי-מחדש (recutRequests.js): רק פעולות-חיתוך, "מאושרת" לצורך הזיהוי-מחדש
    // בלבד; מבטלים אותה ב"שחרור מהמתנה" (release_recut), לא בדחייה
    recutRequest: !!sub.recutRequest,
    basedOn: based ? { ...based.base, added: based.added, removed: based.removed } : null,
    sameAs: based?.sameAs || null,
  };
}

// חתימת העמוד השמור בגרסה שלו — אותה חתימה (sig) שבקובץ-התיקונים (fixesExport)
export function pageSig(page) {
  return docRevision({ revision: storedRevision(page), lines: page?.doc?.lines || [], size: page?.doc?.size });
}

// מספרי-העמודים של הגשות (distinct) ← חלון אחד לפי הסדר: after (מספר-עמוד, בלעדי) ו-limit.
// ← {pages: [...], next: מספר-העמוד האחרון בחלון כשיש עוד, אחרת null}
export function pageWindow(pageNos, { after = null, limit = 10 } = {}) {
  const sorted = [...new Set((pageNos || []).filter(Number.isFinite))].sort((a, b) => a - b);
  const rest = Number.isFinite(after) ? sorted.filter((n) => n > after) : sorted;
  const pages = rest.slice(0, limit);
  return { pages, total: sorted.length, next: rest.length > limit ? pages[pages.length - 1] : null };
}
