// ביטול עבודות OCR — נעילת החלטה מול החלת תוצאה, וביטול מתועד לפני מחיקה/מיזוג של ספר.
//
// local (עובד מקומי) — ביטול סוגר את העבודה **מיד** (החלטה פתוחה 2 בתוכנית):
//   status=cancelled, active=false (הספר משתחרר), cancelRequested=true, decision='cancel'.
//   העובד רואה את הביטול ב-GET /jobs/{id} (siteState=cancelled). הרשומה נשמרת כמו שהיא
//   (inputSha256, pageMap, workerId) — כך שתוצאה שתגיע אחר כך תאומת ותקבל ack=cancelled
//   בלי שטקסט יוחל (שלב 8, receiveResult: "ביטול גובר").
//   נעילת ההחלטה (מפרט סעיף 7, "ביטול מול קליטה"): הביטול מותנה ב-decision:null. אם החלת
//   התוצאה כבר נעלה decision='apply' — הביטול נדחה (apply_started, "הקליטה כבר החלה"),
//   ואין סגירה כ-cancelled לצד טקסט שכבר נכתב חלקית. ביטול שנרשם קודם — גובר על ההחלה.
//   עבודה ב-preparing: הביטול מותנה בסטטוס פעיל; היוצר (localJobCreate) מעביר ל-queued רק
//   בעדכון מותנה ב-status:'preparing', ולכן לא יחיה עבודה שבוטלה, ומוחק את הקובץ שבנה.
//
// gemini / ocrwin — ההתנהגות הקיימת: cancelRequested=true על עבודה ב-running, ו-runOcrJob
//   עוצר בבדיקה הבאה וסוגר כ-cancelled. נוספים רק שדות תיעוד (סיבה, זמן, מי).
//
// בלי טרנזקציות (Mongo standalone): כל ההגנות הן עדכון מותנה של מסמך יחיד. על OcrJob —
// רק lean/updateOne מותנים, אף פעם doc.save() (ראו OcrJob.js). imports יחסיים בלבד.
import OcrJob from '../../models/OcrJob.js';
import { ACTIVE_STATUSES, activeFilter } from './localJobState.js';

const DURABLE = { writeConcern: { w: 1, j: true } };

export const CANCEL_REASONS = Object.freeze(['admin', 'book_deleted', 'book_merged']);

export const OCR_APPLY_IN_PROGRESS = 'OCR_APPLY_IN_PROGRESS';

// הודעות למשתמש (ראוט הביטול / מחיקה ומיזוג של ספר)
export const APPLY_STARTED_MESSAGE_HE = 'הקליטה כבר החלה — לא ניתן לבטל';
export const BOOK_APPLY_IN_PROGRESS_MESSAGE_HE = 'קליטת תוצאות OCR לספר זה בעיצומה — נסו שוב בעוד דקה';

// נזרקת כשאי אפשר לבטל כי החלת תוצאת OCR לספר כבר התחילה (decision='apply')
export class OcrApplyInProgressError extends Error {
  constructor(jobId) {
    super('OCR result apply already in progress');
    this.name = 'OcrApplyInProgressError';
    this.code = OCR_APPLY_IN_PROGRESS;
    this.jobId = jobId == null ? null : String(jobId);
  }
}

export function isOcrApplyInProgress(err) {
  return err?.code === OCR_APPLY_IN_PROGRESS;
}

function cancelDocFields({ reason = 'admin', byName = '', now = new Date() } = {}) {
  if (!CANCEL_REASONS.includes(reason)) throw new TypeError(`invalid cancel reason: ${reason}`);
  return { cancelReason: reason, cancelledByName: String(byName || ''), cancelledAt: now };
}

/**
 * ביטול עבודת local — סגירה מיידית בעדכון מותנה (j:true).
 * @param {any} jobId
 * @param {{reason?:'admin'|'book_deleted'|'book_merged', byName?:string, now?:Date}} [opts]
 * @returns {Promise<{ok:true} | {ok:false, code:'apply_started'|'not_active'}>}
 */
export async function cancelLocalJob(jobId, opts = {}) {
  const doc = cancelDocFields(opts);
  const res = await OcrJob.updateOne(
    {
      _id: jobId,
      method: 'local',
      active: true,
      status: { $in: ACTIVE_STATUSES },
      decision: null,
    },
    {
      $set: {
        ...doc,
        decision: 'cancel',
        cancelRequested: true,
        status: 'cancelled',
        active: false,
        finishedAt: doc.cancelledAt,
        prepLeaseUntil: null,
      },
    },
    DURABLE
  );
  if (res.matchedCount > 0) return { ok: true };

  // לא תפס — למה? החלה שכבר ננעלה ועדיין פעילה → "הקליטה כבר החלה"; כל השאר → לא פעילה
  const current = await OcrJob.findById(jobId).select('method active decision').lean();
  if (current?.method === 'local' && current.decision === 'apply' && current.active === true) {
    return { ok: false, code: 'apply_started' };
  }
  return { ok: false, code: 'not_active' };
}

/**
 * בקשת ביטול לעבודת gemini/ocrwin (ההתנהגות הקיימת — runOcrJob עוצר בבדיקה הבאה).
 * @returns {Promise<{ok:boolean}>}
 */
export async function requestServerJobCancel(jobId, opts = {}) {
  const doc = cancelDocFields(opts);
  const res = await OcrJob.updateOne(
    { _id: jobId, method: { $ne: 'local' }, status: 'running' },
    { $set: { ...doc, cancelRequested: true } }
  );
  return { ok: res.matchedCount > 0 };
}

/**
 * ביטול מתועד של כל עבודות ה-OCR הפעילות של ספרים (לפני מחיקה/מיזוג — לא העלמה שקטה).
 * אם לאחד הספרים יש עבודת local שהחלת התוצאה שלה כבר התחילה — זורקת
 * OcrApplyInProgressError **לפני** שמבטלת דבר (ככל שהמצב ידוע בקריאה). מרוץ נדיר שבו ההחלה
 * ננעלה בין הקריאה לביטול — גם הוא זורק; עבודות שכבר בוטלו נשארות מבוטלות ומתועדות.
 * רשומות OcrJob לעולם לא נמחקות כאן — הן נשמרות כהיסטוריה.
 * @param {any[]} bookIds
 * @param {{reason:'admin'|'book_deleted'|'book_merged', byName?:string, now?:Date}} opts
 * @returns {Promise<{cancelled:{jobId:string, method:string}[]}>}
 */
export async function cancelActiveOcrForBooks(bookIds, opts) {
  const ids = (bookIds || []).filter((id) => id != null);
  if (ids.length === 0) return { cancelled: [] };
  cancelDocFields(opts); // ולידציה של הסיבה לפני כל קריאה ל-DB
  const now = opts?.now || new Date();
  const withNow = { ...opts, now };

  const jobs = await OcrJob.find({ book: { $in: ids }, ...activeFilter() })
    .select('_id method decision')
    .lean();
  const applying = jobs.find((j) => j.method === 'local' && j.decision === 'apply');
  if (applying) throw new OcrApplyInProgressError(applying._id);

  const cancelled = [];
  for (const job of jobs) {
    if (job.method === 'local') {
      const r = await cancelLocalJob(job._id, withNow);
      if (r.ok) cancelled.push({ jobId: String(job._id), method: job.method });
      else if (r.code === 'apply_started') throw new OcrApplyInProgressError(job._id);
    } else {
      const r = await requestServerJobCancel(job._id, withNow);
      if (r.ok) cancelled.push({ jobId: String(job._id), method: job.method });
    }
  }
  return { cancelled };
}

/** ספר יחיד — ראו cancelActiveOcrForBooks. */
export function cancelActiveOcrForBook(bookId, opts) {
  return cancelActiveOcrForBooks([bookId], opts);
}

/**
 * סבב שני אחרי מחיקת הספרים: עבודה שהתחילה בחלון שבין הביטול למחיקת רשומת הספר (start
 * דורש ספר קיים, כך שאחרי המחיקה לא ייווצרו חדשות) — מבוטלת ומתועדת גם היא.
 * לא זורקת: הספר כבר נמחק, וכשל כאן נרשם ללוג בלבד.
 */
export async function cancelLateOcrJobsQuiet(bookIds, opts) {
  try {
    return await cancelActiveOcrForBooks(bookIds, opts);
  } catch (err) {
    console.error(
      `[ocr-cancel] post-delete sweep failed name=${String(err?.name ?? 'unknown')} code=${String(err?.code ?? '-')}`
    );
    return { cancelled: [] };
  }
}
