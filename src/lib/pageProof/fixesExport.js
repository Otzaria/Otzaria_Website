// בניית תיקונים.json (חוזה-העמוד §3) מהגשות שאושרו. טהור — מקבל את
// ההגשות כאובייקטים פשוטים.
//
// who לכל פעולה (החוזה מתיר גם ברמת-הפעולה): קובץ אחד מאגד מתייגים רבים,
// ובעל הפרויקט שומר את ה-who ליד כל תווית-אמת כדי שאפשר יהיה לפסול מתייג
// שלם. זהו מזהה יציב ולא שם (לא חושפים שמות מתנדבים מחוץ לאתר).
//
// set: 'primary' — הגשה אחת לכל עמוד (הראשונה שאושרה); 'double' — ההגשות
// הנוספות של עמודים כפולים, בקובץ נפרד, למדידת הסכמה. כך קובץ-הקליטה הראשי
// לא מכיל שתי גרסאות סותרות לאותה שורה.

import { CONTRACT_VERSION } from './vocab.js';

export const SITE_WHO = 'otzaria-site';

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 19) : null);

// submissions: [{_id, page, who, approvedAt, ops:[...] }] — כולן מאושרות, של ספר אחד
export function splitPrimary(submissions) {
  const byPage = new Map();
  const sorted = submissions
    .slice()
    .sort((a, b) => new Date(a.approvedAt) - new Date(b.approvedAt) || String(a._id).localeCompare(String(b._id)));
  const primary = [];
  const double = [];
  for (const s of sorted) {
    if (byPage.has(s.page)) double.push(s);
    else {
      byPage.set(s.page, s);
      primary.push(s);
    }
  }
  return { primary, double };
}

export function buildFixesFile(gid, submissions, now = new Date()) {
  const ops = [];
  const sorted = submissions
    .slice()
    .sort((a, b) => a.page - b.page || new Date(a.approvedAt) - new Date(b.approvedAt));
  for (const s of sorted) {
    const when = iso(s.submittedAt || s.approvedAt);
    for (const op of s.ops || []) {
      const out = { kind: op.kind, page: op.page };
      if (Array.isArray(op.ids) && op.ids.length) out.ids = op.ids;
      if (op.value !== undefined) out.value = op.value;
      out.who = s.who;
      out.when = op.when || when;
      ops.push(out);
    }
  }
  return {
    contract: CONTRACT_VERSION,
    gid,
    who: SITE_WHO,
    when: iso(now),
    ops,
  };
}
