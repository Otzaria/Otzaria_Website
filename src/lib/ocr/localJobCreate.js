// יצירה (או השלמה) של עבודת OCR מקומית (method=local) בבקשת start של הניהול.
//
// עקרונות (מפרט סעיף 3, "יצירה באתר" ו"אספקת PDF"):
// - requestId קבוע לכל ניסיונות אותה לחיצה. אותו requestId + אותו קלט → אותה עבודה;
//   קלט אחר → 409 request_conflict.
// - 202 מוחזר **רק** אחרי שה-PDF נכתב עמיד והרשומה עברה ל-queued (עם inputPath, sha,
//   pageMap והגדרות) בכתיבה מותנית עם j:true. אין 202 לעבודה שחסר לה קלט.
// - הכנה שנקטעה (קריסה, timeout, I/O זמני) ממשיכה בניסיון חוזר עם אותו requestId: הרשומה
//   נשארת preparing, ומי שמחזיק lease בתוקף בונה את ה-PDF. בלי טרנזקציות (Mongo standalone) —
//   כל ההגנות הן עדכון מותנה של מסמך יחיד.
// - בעלות על ההכנה = ערך prepLeaseUntil שהניסיון כתב. כל הכרעה (מעבר ל-queued, כישלון קבוע,
//   שחרור בתקלה זמנית) מותנית בערך הזה — ניסיון ישן שעדיין רץ אחרי שה-lease שלו פג ונלקח ע"י
//   ניסיון חדש לא כותב כלום (סקירה W04). הערך ייחודי לניסיון: לקיחה מותנית ב-lease ישן ≤ now
//   וכותבת now+PREP_LEASE_MS, ולכן תמיד גדול מכל lease קודם.
// - עבודה פעילה אחרת לאותו ספר חוסמת (אינדקס book_active_unique).
// - לא קוראים ל-runOcrJob — העיבוד נעשה במחשב המקומי, שמושך את העבודה דרך /api/worker/v1.
//
// על OcrJob: רק lean/updateOne/findOneAndUpdate מותנים — אף פעם doc.save() (ראו OcrJob.js).
// imports יחסיים בלבד.
import OcrJob from '../../models/OcrJob.js';
import Page from '../../models/Page.js';
import { buildJobInput } from './localPdf.js';
import { LocalInputError, selectPagesForLocal } from './localPdf.pure.js';
import { pageHasText } from './runOcrJob.pure.js';
import { activeFilter } from './localJobState.js';
import { relToAbs, removeQuiet } from './localStorage.js';
import {
  PREP_LEASE_MS,
  duplicateKeyTarget,
  httpStatusForPrepError,
  isAbandonedPreparation,
  noPagesMessage,
  prepLeaseExpired,
  replayExistingJob,
  requestFingerprint,
} from './localJobCreate.pure.js';

// כתיבות קריטיות (מעבר ל-queued, סגירה) — מאושרות רק אחרי שנכתבו ליומן
const DURABLE = { writeConcern: { w: 1, j: true } };
// בלי pageMap (עד 2,000 רשומות) בקריאות הבקרה
const LIGHT = { pageMap: 0, resultConflicts: 0 };
const MAX_ROUNDS = 5;

const ACTIVE_CONFLICT = (jobId) => ({
  status: 409,
  body: { error: 'כבר קיימת עבודת OCR פעילה לספר הזה', code: 'active_job', ...(jobId ? { jobId: String(jobId) } : {}) },
});

const isPermanentInputError = (err) => err instanceof LocalInputError || (err?.name === 'LocalInputError' && err?.permanent === true);

/**
 * @param {object} args
 * @param {{_id:any,name?:string,slug?:string}} args.book
 * @param {{requestId:string,existingTextMode:string,options:{lm:string,defaultScript:string}}} args.req
 *   הבקשה אחרי normalizeLocalRequest
 * @param {object} args.session session של NextAuth (לשם ולמזהה המתחיל)
 * @param {{workerId:string}} args.config readWorkerConfig() תקין
 * @param {Date} [args.now]
 * @returns {Promise<{status:number, body:object}>}
 */
export async function createOrResumeLocalJob({ book, req, session, config, now = new Date() }) {
  const fingerprint = requestFingerprint({
    bookId: book._id,
    existingTextMode: req.existingTextMode,
    options: req.options,
  });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const found = await OcrJob.findOne({ requestId: req.requestId }).select(LIGHT).lean();
    if (found) {
      if (found.requestFingerprint !== fingerprint) {
        return {
          status: 409,
          body: { error: 'מזהה הבקשה כבר שימש לבקשה אחרת', code: 'request_conflict' },
        };
      }
      if (found.status !== 'preparing') return replayExistingJob(found);
      if (!prepLeaseExpired(found, now)) {
        return {
          status: 409,
          body: { error: 'הבקשה עדיין בהכנה, נסו שוב בעוד רגע', code: 'preparing', jobId: String(found._id) },
        };
      }
      // ה-lease פג (הכנה קודמת נקטעה) — לוקחים אותו בעדכון מותנה וממשיכים את ההכנה
      const lease = new Date(now.getTime() + PREP_LEASE_MS);
      const taken = await OcrJob.findOneAndUpdate(
        {
          _id: found._id,
          status: 'preparing',
          $or: [{ prepLeaseUntil: { $lte: now } }, { prepLeaseUntil: null }],
        },
        { $set: { prepLeaseUntil: lease } },
        { returnDocument: 'after', lean: true, projection: LIGHT }
      );
      if (!taken) continue; // בקשה מקבילה לקחה את ה-lease או סיימה — קוראים שוב
      return prepare(taken, lease, req);
    }

    // אין עבודה ל-requestId הזה — האם יש עבודה פעילה אחרת לספר?
    const other = await OcrJob.findOne({ book: book._id, ...activeFilter() })
      .select('_id method status prepLeaseUntil requestId')
      .lean();
    if (other) {
      // בקשה מקבילה עם אותו requestId יצרה את העבודה בין שתי הקריאות — זו העבודה שלנו
      if (other.requestId === req.requestId) continue;
      if (!isAbandonedPreparation(other, now)) return ACTIVE_CONFLICT(other._id);
      // הכנה נטושה — סוגרים ומפנים את הספר (אם נכשל, ה-create ייכשל ב-11000 → 409)
      await closeAbandonedPreparation(other, now);
    }

    const lease = new Date(now.getTime() + PREP_LEASE_MS);
    let created;
    try {
      created = await OcrJob.create({
        book: book._id,
        bookName: book.name || '',
        bookSlug: book.slug || '',
        method: 'local',
        model: '',
        taskType: 'ocr',
        existingTextMode: req.existingTextMode,
        splitColumns: false,
        options: req.options,
        status: 'preparing',
        active: true,
        requestId: req.requestId,
        requestFingerprint: fingerprint,
        workerId: config.workerId,
        prepLeaseUntil: lease,
        totalPages: 0,
        startedBy: session?.user?._id || session?.user?.id,
        startedByName: session?.user?.name || '',
      });
    } catch (err) {
      const target = duplicateKeyTarget(err);
      // בקשה מקבילה יצרה ראשונה: עם אותו requestId (ואז זו העבודה שלנו), או עבודה פעילה
      // אחרת לספר. בשני המקרים קוראים שוב — הסבב הבא מחזיר את התשובה הנכונה (202/409).
      // גם 'book' חוזר לסבב: כשאותו requestId נוצר במקביל, המפר הראשון עשוי להיות האינדקס של הספר.
      if (target === 'requestId' || target === 'book') continue;
      throw err;
    }
    return prepare(created.toObject(), lease, req);
  }

  // לא אמור לקרות (מרוץ חוזר שוב ושוב) — זמני, אפשר לנסות שוב
  return {
    status: 503,
    body: { error: 'השרת עמוס כרגע, נסו שוב בעוד רגע', code: 'busy' },
  };
}

/**
 * סוגר הכנת local נטושה (ה-lease פג לפני יותר מ-15 דקות, החלטה פתוחה 14) ומשחרר את הספר —
 * בכל בקשת start לספר, גם של gemini/ocrwin, כדי שהכנה שנקטעה לא תחסום את הספר לעד.
 * מותנה ב-lease שנקרא: אם מישהו חידש אותו בינתיים, לא נוגעים. מחזיר true אם נסגרה.
 * @param {{_id:any,method?:string,status?:string,prepLeaseUntil?:Date|null}} job
 * @param {Date} [now]
 */
export async function closeAbandonedPreparation(job, now = new Date()) {
  if (!isAbandonedPreparation(job, now)) return false;
  const res = await OcrJob.updateOne(
    { _id: job._id, status: 'preparing', prepLeaseUntil: job.prepLeaseUntil ?? null },
    {
      $set: {
        status: 'failed',
        active: false,
        error: 'הכנת הקלט נקטעה',
        errorCode: 'prep_abandoned',
        finishedAt: now,
        prepLeaseUntil: null,
      },
    },
    DURABLE
  );
  return res.matchedCount > 0;
}

// סוגר עבודה בהכנה ככישלון קבוע (active:false משחרר את הספר) — רק אם ה-lease עדיין של
// הניסיון הזה. מחזיר true אם נסגרה.
async function failPreparation(jobId, lease, code, message, extra = {}) {
  const res = await OcrJob.updateOne(
    { _id: jobId, status: 'preparing', prepLeaseUntil: lease },
    {
      $set: {
        ...extra,
        status: 'failed',
        active: false,
        error: message,
        errorCode: code,
        finishedAt: new Date(),
        prepLeaseUntil: null,
      },
    },
    DURABLE
  );
  return res.matchedCount > 0;
}

// מצב העבודה כפי שהוא עכשיו (אחרי שהפסדנו במרוץ) → אותה תשובה שבקשה חוזרת הייתה מקבלת
async function replayCurrent(jobId) {
  const current = await OcrJob.findById(jobId).select(LIGHT).lean();
  if (!current) throw new Error('local_job_vanished');
  if (current.status === 'preparing') {
    return {
      status: 409,
      body: { error: 'הבקשה עדיין בהכנה, נסו שוב בעוד רגע', code: 'preparing', jobId: String(jobId) },
    };
  }
  return replayExistingJob(current);
}

// בחירת העמודים, בניית ה-PDF ומעבר ל-queued. נקרא רק כשהבקשה הזו מחזיקה את ה-lease.
async function prepare(job, lease, req) {
  const jobId = String(job._id);
  const mode = job.existingTextMode || req.existingTextMode;

  const pages = await Page.find({ book: job.book })
    .sort({ pageNumber: 1 })
    .select('_id pageNumber imagePath content rightColumn leftColumn updatedAt')
    .lean();
  const editedPagesCount = pages.filter(pageHasText).length;
  const selected = selectPagesForLocal(pages, mode);

  let input;
  try {
    if (selected.length === 0) throw new LocalInputError('no_pages', { messageHe: noPagesMessage(mode) });
    input = await buildJobInput({ jobId, pages: selected });
  } catch (err) {
    if (isPermanentInputError(err)) {
      // קלט פגום קבוע — ניסיון חוזר לא יעזור. סוגרים את העבודה ומשחררים את הספר.
      const closed = await failPreparation(job._id, lease, err.code, err.messageHe, { editedPagesCount });
      // לא נסגרה: בוטלה בינתיים, או שה-lease פג וניסיון חדש לקח אותו (ייתכן שהקלט שלו תקין) —
      // לא מכריעים בשמו, מחזירים את המצב הנוכחי (preparing → 409 שהממשק מנסה שוב).
      if (!closed) return replayCurrent(job._id);
      return {
        status: httpStatusForPrepError(err.code),
        body: { error: err.messageHe, code: err.code, pageNumbers: err.pageNumbers || [], jobId },
      };
    }
    // תקלה זמנית (I/O, זיכרון...) — העבודה נשארת preparing. משחררים את ה-lease שלנו מיד
    // (רק אם הוא עדיין שלנו), כדי שניסיון חוזר עם אותו requestId ימשיך בלי להמתין לפקיעתו.
    console.error(
      `[ocr-local] input preparation failed job=${jobId} name=${String(err?.name ?? 'unknown')} code=${String(err?.code ?? '-')}`
    );
    await OcrJob.updateOne(
      { _id: job._id, status: 'preparing', prepLeaseUntil: lease },
      { $set: { prepLeaseUntil: new Date() } }
    ).catch(() => {});
    return {
      status: 500,
      body: {
        error: 'הכנת קובץ הקלט נכשלה בשל תקלה זמנית. אפשר לנסות שוב',
        code: 'preparation_retry',
        jobId,
      },
    };
  }

  // הקובץ כבר עמיד בדיסק — רק עכשיו הרשומה מפנה אליו (מותנה: עדיין preparing, פעילה,
  // וה-lease עדיין של הניסיון הזה)
  const committed = await OcrJob.findOneAndUpdate(
    { _id: job._id, status: 'preparing', active: true, prepLeaseUntil: lease },
    {
      $set: {
        status: 'queued',
        inputPath: input.inputPath,
        inputSha256: input.inputSha256,
        inputBytes: input.inputBytes,
        pageMap: input.pageMap,
        totalPages: input.pageMap.length,
        editedPagesCount,
        preparedAt: new Date(),
        prepLeaseUntil: null,
      },
    },
    { returnDocument: 'after', lean: true, projection: LIGHT, ...DURABLE }
  );
  if (committed) {
    return {
      status: 202,
      body: { success: true, jobId, status: 'queued', totalPages: committed.totalPages },
    };
  }

  // הפסדנו: בקשה מקבילה ניצחה, העבודה בוטלה/נסגרה, או שה-lease שלנו נלקח ע"י ניסיון חדש.
  // שם הקובץ נגזר מה-hash (input-<sha>.pdf), כך שניסיון אחר שבנה אותו תוכן כותב לאותו נתיב.
  // לכן מוחקים רק כשההכנה הוכרעה (לא preparing — אף אחד כבר לא יפנה לקובץ חדש) והקובץ שלנו
  // אינו הקובץ שנבחר. כשהעבודה עדיין preparing בידי ניסיון אחר — לא נוגעים: ייתכן שזה בדיוק
  // הקובץ שהוא עומד לפרסם. קובץ יתום כזה נמחק ע"י ה-cron אחרי סגירת העבודה (localCleanup).
  const winner = await OcrJob.findById(job._id).select('status inputPath').lean();
  if (!winner || (winner.status !== 'preparing' && winner.inputPath !== input.inputPath)) {
    try {
      await removeQuiet(relToAbs(input.inputPath));
    } catch {
      // נתיב לא תקין לא אמור לקרות — לא מפיל את התשובה
    }
  }
  return replayCurrent(job._id);
}
