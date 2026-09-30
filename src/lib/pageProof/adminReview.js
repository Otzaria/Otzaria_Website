// צורות-התשובה של סקירת ההגשות בניהול הגהת-העמודים — משותפות לראוט של הגשה אחת
// (api/admin/page-proof/submissions/[id]) ולרשימת ההגשות של ספר לפי עמוד, עם הפעולות
// (api/admin/page-proof/books/[gid]/submissions — לתצוגת "לפני/אחרי" בתוכנת-הספר).
// טהור (בלי מסד); נתיבים יחסיים — רץ גם ב-node:test.

import { needsRecut } from './ops.js';
import { storedRevision, submissionRevision } from './importRules.js';
import { docRevision } from './textModel.js';

// ההגשה המלאה, עם הפעולות (packed — חוזה-העמוד §3). revision — הגרסה שעליה נעשתה
export function submissionDetail(sub) {
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
    needsRecut: needsRecut(sub.ops),
    revision: submissionRevision(sub),
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
