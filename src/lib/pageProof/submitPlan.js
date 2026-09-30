// החלטת ההגשה בדף המתנדב: מה נשלח בכל אחת מהבחירות של חלון ההגשה.
// המתנדב מאשר את הטקסט פסקה-פסקה (line_ok לשורות הפסקה); בהגשה:
//   * אושרו כל הפסקאות  ← "הגש" — הפעולות כמות-שהן.
//   * לא כולן           ← "אשר גם את כל השאר והגש" (רק אחרי "קראתי את כל
//     הטקסט בעמוד": line_ok לשורות-התוכן שלא נגעו בהן), או "הגש רק את מה
//     שאישרתי" (הפעולות כמות-שהן, בלי line_ok נוסף).
// הגשה ריקה אינה מותרת. לוגיקה טהורה — הדף והחלון רק מציגים ושולחים.

import { packOps, needsRecut, recutLineIds, validateOps, sanitizeOp, MAX_IDS_PER_OP } from './ops.js';

export const SUBMIT_CHOICE = Object.freeze({
  // "אשר גם את כל השאר והגש"
  APPROVE_REST: 'approve_rest',
  // "הגש רק את מה שאישרתי"
  ONLY_APPROVED: 'only_approved',
  // "הגש" — כשכל הפסקאות אושרו
  SUBMIT: 'submit',
});

// מספר השורות המרבי בפעולה אחת (ops.validateOp)
export { MAX_IDS_PER_OP };

export const SUBMIT_ERRORS = Object.freeze({
  readAll: 'כדי לאשר את כל השאר צריך לסמן קודם "קראתי את כל הטקסט בעמוד".',
  emptyOnly:
    'עוד לא אישרתם אף פסקה ולא תיקנתם דבר, ולכן אין מה להגיש. אשרו כל פסקה שקראתם (✓ ליד הפסקה או Ctrl+Enter), או בחרו "אשר גם את כל השאר והגש" אחרי שקראתם את כל העמוד.',
  empty: 'לא נעשה בעמוד שום תיקון או אישור, ואין בו שורות לאישור — אין מה להגיש.',
  choice: 'בחירת-הגשה לא מוכרת',
});

// צורת-החוזה בלבד ({kind, page, ids?, value?}) — בלי שדות פנימיים של העורך
// (_g קבוצת-Undo, _c/_t צבירת-הקלדה ועוד) ובלי שדות-ערך שהחוזה אינו מכיר
// (ops.sanitizeOp). אותו ניקוי שהשרת עושה בהגשה.
export function cleanOps(ops) {
  return (ops || []).map(sanitizeOp);
}

// שורות שחזרו מזיהוי-מחדש (מעבר שני) — recheck:true, בלי שורות שהוסרו
export function recheckLineIds(doc) {
  return (doc?.lines || []).filter((l) => l?.recheck === true && l.status !== 'removed').map((l) => l.id);
}

// השורות ש"אשר גם את כל השאר" יסמן כנכונות: שורות-התוכן שלא נגעו בהן
// (untouchedLineIds של התצוגה), בלי שורות שפעולת-חיתוך נגעה בהן — הן
// ייקראו מחדש, ואישור הטקסט הישן שלהן חסר-משמעות.
export function restLineIds({ baseDoc, ops, untouched }) {
  const locked = new Set(recutLineIds(baseDoc, cleanOps(ops)));
  const out = [];
  const seen = new Set();
  for (const id of untouched || []) {
    if (!Number.isInteger(id) || id <= 0 || locked.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// line_ok לרשימת שורות, בחלקים של עד MAX_IDS_PER_OP
export function lineOkOps(page, ids, size = MAX_IDS_PER_OP) {
  const out = [];
  for (let i = 0; i < (ids || []).length; i += size) out.push({ kind: 'line_ok', page, ids: ids.slice(i, i + size) });
  return out;
}

function normApproval(a) {
  if (!a || typeof a !== 'object') return null;
  const approved = Number(a.approved);
  const total = Number(a.total);
  if (!Number.isFinite(approved) || !Number.isFinite(total) || total < 0 || approved < 0) return null;
  return { approved: Math.min(Math.trunc(approved), Math.trunc(total)), total: Math.trunc(total) };
}

// מה חלון ההגשה מציג ואילו בחירות הוא מציע.
//   approval — {approved, total}: פסקאות שאושרו מכלל פסקאות-התוכן בעמוד
//   (כל הלשוניות, בלי ריהוט), כפי שהעורך מחשב; null = לא ידוע.
// "הכול אושר" כשאין שורה שנשארה לאישור, או כשהעורך מדווח שכל הפסקאות אושרו.
export function submitSummary({ baseDoc, ops, untouched, approval = null }) {
  const clean = cleanOps(ops);
  const restIds = restLineIds({ baseDoc, ops: clean, untouched });
  const appr = normApproval(approval);
  const allApproved = restIds.length === 0 || (appr != null && appr.total > 0 && appr.approved >= appr.total);
  return {
    opCount: packOps(baseDoc, clean).length,
    restCount: restIds.length,
    approval: appr,
    allApproved,
    choices: allApproved ? [SUBMIT_CHOICE.SUBMIT] : [SUBMIT_CHOICE.APPROVE_REST, SUBMIT_CHOICE.ONLY_APPROVED],
    recut: needsRecut(clean),
    recheckCount: recheckLineIds(baseDoc).length,
  };
}

// הפעולות שיישלחו לבחירה שנבחרה: {ok:true, ops} (נקיות ודחוסות — כמו שהשרת
// ישמור) או {ok:false, error} בעברית.
export function planSubmission({ baseDoc, ops, untouched, choice, readAll = false }) {
  const clean = cleanOps(ops);
  let toSend = clean;
  if (choice === SUBMIT_CHOICE.APPROVE_REST) {
    if (!readAll) return { ok: false, error: SUBMIT_ERRORS.readAll };
    toSend = [...clean, ...lineOkOps(baseDoc?.page, restLineIds({ baseDoc, ops: clean, untouched }))];
  } else if (choice !== SUBMIT_CHOICE.ONLY_APPROVED && choice !== SUBMIT_CHOICE.SUBMIT) {
    return { ok: false, error: SUBMIT_ERRORS.choice };
  }
  const compacted = packOps(baseDoc, toSend);
  if (!compacted.length) {
    return { ok: false, error: choice === SUBMIT_CHOICE.ONLY_APPROVED ? SUBMIT_ERRORS.emptyOnly : SUBMIT_ERRORS.empty };
  }
  const invalid = validateOps(baseDoc, compacted);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, ops: compacted };
}
