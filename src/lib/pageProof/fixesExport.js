// בניית תיקונים.json (חוזה-העמוד §3) מהגשות שאושרו. טהור — מקבל את
// ההגשות כאובייקטים פשוטים.
//
// who לכל פעולה (החוזה מתיר גם ברמת-הפעולה): קובץ אחד מאגד מתייגים רבים,
// ובעל הפרויקט שומר את ה-who ליד כל תווית-אמת כדי שאפשר יהיה לפסול מתייג
// שלם. זהו מזהה יציב ולא שם (לא חושפים שמות מתנדבים מחוץ לאתר).
//
// set: 'primary' — הגשה אחת לכל עמוד; 'double' — ההגשות הנוספות של עמודים
// כפולים, בקובץ נפרד, למדידת הסכמה. כך קובץ-הקליטה הראשי לא מכיל שתי
// גרסאות סותרות לאותה שורה. מי הראשית — pickPrimary (אותו כלל שקובע אם
// העמוד עובר לזיהוי-מחדש — ראוטי האישור וההגשה).
//
// גרסת-העמוד (revision): עמוד שחזר מזיהוי-מחדש מוגה שוב (מעבר שני). ההגשה
// למעבר השני אינה "כפולה" של הגשת המעבר הראשון — היא ממשיכה אותה — ולכן
// הראשית נקבעת לכל (עמוד, גרסה), ובקובץ הפעולות של גרסה קודמת באות קודם.
//
// לכל פעולה בקובץ גם revision (הגרסה שעליה נעשתה), op_id ("<מזהה-ההגשה>:<מקום>")
// ו-sig (חתימת העמוד באותה גרסה — מזהי-השורות והגודל, textModel.docRevision,
// כשידועה): כך תוכנת-הספר יכולה לדלג על פעולה של גרסה אחרת, על עמוד שהועלה
// מחדש עם מזהים אחרים, ועל פעולה שכבר הוחלה (הורדה חוזרת של "הכול").
// צרכן שאינו מכיר את השדות מתעלם מהם (החוזה).

import { CONTRACT_VERSION } from './vocab.js';

export const SITE_WHO = 'otzaria-site';
// תקרת הפעולות בקובץ-תיקונים אחד אצלם (book/fixes.py MAX_OPS)
export const MAX_FILE_OPS = 5000;

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 19) : null);
const revOf = (s) => (Number.isInteger(s?.revision) && s.revision >= 1 ? s.revision : 1);
const timeOf = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};
const byApproval = (a, b) => timeOf(a.approvedAt) - timeOf(b.approvedAt) || String(a._id).localeCompare(String(b._id));

// הראשית מבין ההגשות המאושרות של עמוד אחד באותה גרסה:
//   1. הגשה שכבר יצאה בקובץ-תיקונים ראשי (exportedAt — רק "תיקונים חדשים" מסמן,
//      ורק בקובץ הראשי) — היא כבר אצלם; אחרת שני הקבצים הראשיים היו סותרים;
//   2. אחרת — הראשונה שמשנה את החיתוך (needsRecut): העמוד ממתין לזיהוי-מחדש
//      בגללה, ובלעדיה בקובץ הראשי הוא לא היה חוזר לעולם;
//   3. אחרת — הראשונה שאושרה.
export function pickPrimary(subs) {
  const sorted = (subs || []).filter(Boolean).slice().sort(byApproval);
  return sorted.find((s) => s.exportedAt) || sorted.find((s) => s.needsRecut) || sorted[0] || null;
}

// submissions: [{_id, page, revision?, who, approvedAt, needsRecut?, exportedAt?, ops:[...] }]
// — כולן מאושרות, של ספר אחד
export function splitPrimary(submissions) {
  const groups = new Map();
  for (const s of submissions || []) {
    const key = `${s.page}:${revOf(s)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const chosen = new Set([...groups.values()].map(pickPrimary));
  const sorted = (submissions || []).slice().sort(byApproval);
  return { primary: sorted.filter((s) => chosen.has(s)), double: sorted.filter((s) => !chosen.has(s)) };
}

// sigs: Map(`${page}:${revision}` → חתימת-העמוד) — רשות
export function buildFixesFile(gid, submissions, now = new Date(), sigs = null) {
  const ops = [];
  const sorted = submissions
    .slice()
    .sort((a, b) => a.page - b.page || revOf(a) - revOf(b) || timeOf(a.approvedAt) - timeOf(b.approvedAt));
  for (const s of sorted) {
    const when = iso(s.submittedAt || s.approvedAt);
    const rev = revOf(s);
    const sig = sigs?.get?.(`${s.page}:${rev}`) || null;
    (s.ops || []).forEach((op, i) => {
      const out = { kind: op.kind, page: op.page };
      if (Array.isArray(op.ids) && op.ids.length) out.ids = op.ids;
      if (op.value !== undefined) out.value = op.value;
      out.who = s.who;
      out.when = op.when || when;
      out.revision = rev;
      if (s._id != null) out.op_id = `${s._id}:${i}`;
      if (sig) out.sig = sig;
      ops.push(out);
    });
  }
  return {
    contract: CONTRACT_VERSION,
    gid,
    who: SITE_WHO,
    when: iso(now),
    ops,
  };
}

// קובץ שעובר את התקרה שלהם — כמה קבצים, בלי לפצל עמוד (כל פעולות העמוד
// באותו קובץ, לפי הסדר). עמוד שלבדו עובר את התקרה — בקובץ משלו.
export function splitFixesFile(file, max = MAX_FILE_OPS) {
  const ops = file?.ops || [];
  if (ops.length <= max) return [file];
  const parts = [];
  let cur = [];
  let i = 0;
  while (i < ops.length) {
    let j = i;
    while (j < ops.length && ops[j].page === ops[i].page) j++;
    const pageOps = ops.slice(i, j);
    if (cur.length && cur.length + pageOps.length > max) {
      parts.push(cur);
      cur = [];
    }
    cur = cur.concat(pageOps);
    i = j;
  }
  if (cur.length) parts.push(cur);
  return parts.map((p) => ({ ...file, ops: p }));
}
