// הכרעה בהתנגשות OCR מקומי (OcrConflict): "אמץ את טקסט ה-OCR" מול "שמור את הטקסט הקיים".
//
// בלי טרנזקציות (Mongo standalone) — ההכרעה נתפסת בעדכון מותנה של ההתנגשות *לפני* כתיבת העמוד:
//   dismiss: open → dismissed (מותנה ב-status:'open' בלבד).
//   apply:   open → applying (עם applyToken, applyStartedAt, applyLeaseUntil) → כתיבת העמוד, מותנית
//            ב-updatedAt שהמנהל ראה → applying → applied. העמוד השתנה/נמחק → חזרה ל-open.
// כך דחייה שמגיעה בזמן שהאימוץ בתהליך נכשלת (409 apply_in_progress) ולא "מנצחת" אימוץ שבכל זאת
// מחליף את העמוד.
// קריסה בין התפיסה לסיום משאירה applying. אחרי שה-lease פג, הפעולה הבאה על ההתנגשות (או טעינת
// הרשימה) מכריעה לפי העמוד: נושא את סימון האימוץ (lastOcrJobId+sha+lastOcrAt === applyStartedAt,
// נכתבים באותו $set עם הטקסט) → applied; אחרת → open.
// לפני הקריאה ההכרעה "חוסמת" את העמוד: מקדמת את updatedAt שלו אם הוא עדיין בדיוק זה שהאימוץ
// תפס (applyExpectedUpdatedAt). כך כתיבה של הבקשה המקורית שעדיין "בדרך" (תהליך מושהה, תור
// חיבורים, ניסיון חוזר של הדרייבר) כבר לא תתפוס את התנאי — ולא תחליף את העמוד אחרי שההתנגשות
// הוחזרה ל-open ואולי נדחתה. אחרי חסימה מוצלחת ברור שהכתיבה לא קרתה ולא תקרה.
// imports יחסיים בלבד (נבדק ב-node:test).
import { randomUUID } from 'node:crypto';
import Page from '../../models/Page.js';
import OcrConflict from '../../models/OcrConflict.js';
import { pageApplySet } from './localApply.pure.js';
import { CONFLICT_APPLY_LEASE_MS, conflictApplyLanded, conflictApplyStale } from './ocrConflictView.js';

// תקרה לזמן כתיבת העמוד בשרת ה-DB — קצרה בהרבה מה-lease. אינה מבטיחה לבדה שכתיבה מאוחרת לא
// תנחת (הזמן נמדד רק משהשרת התחיל לבצע); את זה מבטיחה החסימה ב-settleStaleConflictApply.
const PAGE_WRITE_MAX_TIME_MS = 15 * 1000;

const CLEAR_APPLY = {
  applyToken: '', applyStartedAt: '', applyLeaseUntil: '', applyByName: '', applyExpectedUpdatedAt: '',
};
const AFTER = { returnDocument: 'after', lean: true };

/**
 * מכריע אימוץ שנתקע ב-applying (ה-lease פג) לפי מצב העמוד. מותנה ב-applyToken — אם בינתיים
 * מישהו אחר הכריע, מחזיר את המצב הנוכחי.
 * @returns {Promise<any|null>} ההתנגשות אחרי ההכרעה (lean)
 */
export async function settleStaleConflictApply(conflict) {
  const expected = conflict.applyExpectedUpdatedAt ? new Date(conflict.applyExpectedUpdatedAt) : null;
  if (expected) {
    // חסימה: העמוד עדיין במצב שהאימוץ תפס → הכתיבה לא קרתה; מקדמים את updatedAt באלפית שנייה
    // אחת (בלי timestamps אוטומטי — תוכן ו"עודכן לאחרונה" כמעט ללא שינוי) כדי שגם לא תקרה
    const fence = await Page.updateOne(
      { _id: conflict.page, book: conflict.book, updatedAt: expected },
      { $set: { updatedAt: new Date(expected.getTime() + 1) } },
      { timestamps: false }
    );
    if (fence.matchedCount > 0) return finishStale(conflict, false);
  }
  const page = await Page.findOne({ _id: conflict.page, book: conflict.book })
    .select('lastOcrJobId lastOcrResultSha256 lastOcrAt')
    .lean();
  return finishStale(conflict, conflictApplyLanded(page, conflict));
}

async function finishStale(conflict, landed) {
  const update = landed
    ? {
      $set: { status: 'applied', resolvedAt: conflict.applyStartedAt, resolvedByName: conflict.applyByName || '' },
      $unset: CLEAR_APPLY,
    }
    : { $set: { status: 'open' }, $unset: CLEAR_APPLY };
  const settled = await OcrConflict.findOneAndUpdate(
    { _id: conflict._id, status: 'applying', applyToken: conflict.applyToken },
    update,
    AFTER
  );
  return settled || OcrConflict.findById(conflict._id).lean();
}

/**
 * מכריע אימוצים תקועים בתחום (job/book) — לפני הצגת רשימה וספירה.
 * @param {Record<string, any>} scope למשל { job } או { book }
 */
export async function settleStaleConflictApplies(scope, now = new Date(), limit = 100) {
  const stale = await OcrConflict.find({ ...scope, status: 'applying', applyLeaseUntil: { $not: { $gt: now } } })
    .select('_id job book page resultSha256 status applyToken applyStartedAt applyLeaseUntil applyByName applyExpectedUpdatedAt')
    .limit(limit)
    .lean();
  for (const c of stale) await settleStaleConflictApply(c);
  return stale.length;
}

// תפיסה/סגירה נכשלה (מישהו הקדים) — מה המצב עכשיו
async function lostRace(id) {
  const current = await OcrConflict.findById(id).select('status').lean();
  if (!current) return { ok: false, code: 'not_found' };
  return { ok: false, code: current.status === 'applying' ? 'apply_in_progress' : 'already_resolved' };
}

/**
 * @param {{
 *   id: any,
 *   action: 'apply'|'dismiss',
 *   expected?: Date|null,   // updatedAt של העמוד כפי שהמנהל ראה (חובה ב-apply)
 *   byName?: string,
 *   now?: Date,
 *   hooks?: { beforePageWrite?: () => Promise<void>|void },  // לבדיקות בלבד
 * }} args
 * @returns {Promise<{ok:true, conflict:any} | {ok:false, code:'not_found'|'page_missing'|'page_changed'|'already_resolved'|'apply_in_progress'}>}
 */
export async function resolveConflict({ id, action, expected = null, byName = '', now = new Date(), hooks }) {
  let conflict = await OcrConflict.findById(id).lean();
  if (!conflict) return { ok: false, code: 'not_found' };
  if (conflictApplyStale(conflict, now)) conflict = await settleStaleConflictApply(conflict);
  if (!conflict) return { ok: false, code: 'not_found' };
  if (conflict.status === 'applying') return { ok: false, code: 'apply_in_progress' };
  if (conflict.status !== 'open') return { ok: false, code: 'already_resolved' };

  if (action === 'dismiss') {
    const updated = await OcrConflict.findOneAndUpdate(
      { _id: conflict._id, status: 'open' },
      { $set: { status: 'dismissed', resolvedAt: now, resolvedByName: byName } },
      AFTER
    );
    return updated ? { ok: true, conflict: updated } : lostRace(conflict._id);
  }

  // apply — קודם תופסים את ההכרעה, ורק אז כותבים לעמוד
  const token = randomUUID();
  const claimed = await OcrConflict.findOneAndUpdate(
    { _id: conflict._id, status: 'open' },
    {
      $set: {
        status: 'applying',
        applyToken: token,
        applyStartedAt: now,
        applyLeaseUntil: new Date(now.getTime() + CONFLICT_APPLY_LEASE_MS),
        applyByName: byName,
        applyExpectedUpdatedAt: expected,
      },
    },
    AFTER
  );
  if (!claimed) return lostRace(conflict._id);

  await hooks?.beforePageWrite?.();
  // חריגה כאן (timeout וכו') — לא ידוע אם הכתיבה נחתה; נשאר applying, ואחרי ה-lease מוכרע לפי העמוד
  const res = await Page.updateOne(
    { _id: claimed.page, book: claimed.book, updatedAt: expected },
    { $set: pageApplySet(claimed.ocrText || '', claimed.job, claimed.resultSha256 || '', now) },
    { maxTimeMS: PAGE_WRITE_MAX_TIME_MS }
  );

  const mine = { _id: claimed._id, status: 'applying', applyToken: token };
  if (res.matchedCount === 0) {
    await OcrConflict.updateOne(mine, { $set: { status: 'open' }, $unset: CLEAR_APPLY });
    const exists = await Page.exists({ _id: claimed.page, book: claimed.book });
    return { ok: false, code: exists ? 'page_changed' : 'page_missing' };
  }

  const done = await OcrConflict.findOneAndUpdate(
    mine,
    { $set: { status: 'applied', resolvedAt: now, resolvedByName: byName }, $unset: CLEAR_APPLY },
    AFTER
  );
  if (done) return { ok: true, conflict: done };

  // הבקשה הזו התעכבה מעבר ל-lease ובקשה אחרת כבר הכריעה. הכתיבה שלנו נחתה, ולכן ההכרעה ראתה את
  // הסימון (applied) — החסימה מונעת הכרעת open שאחריה הכתיבה נוחתת. הגנה נוספת לרשומה בלי
  // applyExpectedUpdatedAt: אם הוחזרה ל-open — הטקסט כבר בעמוד, ולכן מסמנים applied.
  const fixed = await OcrConflict.findOneAndUpdate(
    { _id: claimed._id, status: 'open' },
    { $set: { status: 'applied', resolvedAt: now, resolvedByName: byName } },
    AFTER
  );
  const current = fixed || (await OcrConflict.findById(claimed._id).lean());
  if (current?.status !== 'applied') {
    console.error('OCR conflict: late apply landed after the conflict was resolved otherwise', String(claimed._id));
  }
  return { ok: true, conflict: current };
}
