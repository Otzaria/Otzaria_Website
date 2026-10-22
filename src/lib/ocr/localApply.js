// קליטת תוצאה מהעובד המקומי והחלתה על עמודי הספר — המנוע של POST /api/worker/v1/jobs/{id}/result
// (שלב 8). הסדר בדיוק כמו במפרט סעיף 4 ("סדר הקליטה באתר" א–ג) וסעיף 7 ("ביטול מול קליטה"):
//
//   א. (לפני הקריאה לכאן — localResultIntake.js) אימות סוד/מזהים/hash/גבולות/מיפוי, ושמירת
//      הקובץ עמידה (result-<sha>.json). כאן: נעילת resultSha256 בעדכון מותנה (j:true) — תוצאה
//      אחרת לא תתקבל במקומה (409 result_conflict, נשמרת כ-rejected-<sha>.json לבירור).
//   ב. נעילת החלטה: decision:null → 'apply' (status 'applying'). ביטול שכבר נרשם גובר — נשמר
//      ack=cancelled ושום טקסט לא מוחל. הנעילה לא מותנית בסטטוס הדיווח (דיווח מצב יכול לשנות
//      status בין נעילת ה-hash לנעילת ההחלטה). אחר כך lease נגד שתי החלות במקביל, והחלה לכל עמוד
//      בפעולת DB אחת מותנית (pageApplyFilter): כולל lastOcrJobId+lastOcrResultSha256; עמוד שכבר
//      נכתב ע"י אותה תוצאה — מדולג; עמוד שהשתנה (updatedAt ≠ expectedUpdatedAt) — התנגשות נשמרת
//      ב-OcrConflict עם טקסט ה-OCR ולא נדרס.
//   ג. סגירה: מונים מחושבים מחדש ($set, לא $inc), ack נשמר, active:false — בעדכון מותנה אחד (j:true).
//
// נתוני פריסה/עזר (layout, metadata, warnings): לכל עמוד שיש לו טקסט, layout או metadata נכתבת
// רשומת OcrPageResult (upsert עם $setOnInsert) — **לפני** כתיבת העמוד או ההתנגשות שלו, בכל outcome.
// בעיה ב-layout לעולם לא דוחה את התוצאה (localResultLayout.pure.js). ביטול (באתר, או outcome
// cancelled מהעובד) לא כותב לעמודים; העמודים שזוהו לפני הביטול נשמרים כ-OcrConflict עם
// reason:'job_cancelled' (salvageCancelled), כדי שמנהל יוכל לאמץ אותם.
//
// קריסה בכל נקודה → שליחה חוזרת של אותה תוצאה ממשיכה מאותה נקודה (ה-hash נעול, ההחלטה נעולה,
// עמודים שהוחלו מזוהים לפי lastOcrJobId). עבודה שנתקעה ב-applying כשהמחשב המקומי כבוי —
// resumeStalledApply משלים מהקובץ השמור (ל-cron בשלב 9), כך שמחיקה/מיזוג של הספר לא נחסמים לנצח.
//
// בלי טרנזקציות (Mongo standalone): רק עדכונים מותנים של מסמך יחיד. על OcrJob — רק lean/updateOne,
// אף פעם doc.save() (ראו OcrJob.js). imports יחסיים בלבד (נבדק ב-node:test).
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import OcrJob from '../../models/OcrJob.js';
import Page from '../../models/Page.js';
import OcrConflict from '../../models/OcrConflict.js';
import OcrPageResult from '../../models/OcrPageResult.js';
import { jobDir, jobFileName, relToAbs, absToRel } from './localStorage.js';
import { parseResultBytes, validateResult } from './localResultValidate.js';
import {
  ackBody,
  classLayout,
  closingStatusFields,
  failedOutcomeClasses,
  MISSING_PAGE_CODE,
  MISSING_PAGE_MESSAGE,
  pageErrorCode,
  pageResultRecord,
  pageApplyFilter,
  pageApplySet,
  pageErrorMessage,
  resumeFailureBacksOff,
  resumeFailureTransient,
  resumeRetryDelayMs,
  storedAckAnswer,
  storedPipelineVersion,
  storedResultError,
  summarizeApply,
} from './localApply.pure.js';
import { bookMetadataJson } from './localResultLayout.pure.js';

const DURABLE = { writeConcern: { w: 1, j: true } };

export const APPLY_LEASE_MS = 5 * 60 * 1000;
export const APPLY_RETRY_AFTER_SEC = 30;
export const APPLY_CONCURRENCY = 16;
// תקרת בטיחות לתוצאות מתנגשות שטרם סומנו "נבדק" (כל אחת עד 100MiB בדיסק). רשומה לא נדחקת לעולם
// מהרשימה (הניקוי מוחק קובץ מתנגש רק אחרי reviewedAt); מעל התקרה תוצאה מתנגשת חדשה נדחית באותו
// 409 result_conflict בלי לשמור את הקובץ — "סמן כנבדק" מפנה מקום. היסטוריה שנבדקה לא נספרת.
export const MAX_RESULT_CONFLICTS = 20;

const ok = (body) => ({ status: 200, body });
const err = (status, error, headers) => ({ status, body: { error }, ...(headers ? { headers } : {}) });

const loadJob = (jobId) => OcrJob.findById(jobId).lean();
const hasAck = (job) => typeof job?.ack?.ack === 'string';
const isCancelled = (job) => job?.decision === 'cancel' || job?.status === 'cancelled';
// תוצאה מתקבלת לעבודה פעילה, או לעבודה שבוטלה במפורש (→ ack=cancelled). עבודה שנסגרה אחרת בלי
// ack (למשל נכשלה בהכנה) — לא נפתחת מחדש (410 job_closed).
const acceptsResult = (job) => job?.active === true || isCancelled(job);

const rejectedTarget = (jobId, sha, env) =>
  path.join(/*turbopackIgnore: true*/ jobDir(String(jobId), env), jobFileName('rejected', sha));

// result-<sha>.json → rejected-<sha>.json באותה תיקייה (קובץ שנדחה נשמר לבירור). חסר — בשקט.
export async function moveToRejected(jobId, sha, absPath, env = process.env) {
  if (!absPath) return null;
  const target = rejectedTarget(jobId, sha, env);
  try {
    await fs.rename(/*turbopackIgnore: true*/ absPath, target);
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
  }
  return absToRel(target, env);
}

/**
 * רישום קובץ תוצאה שנדחה (field: 'resultConflicts' / 'resultRejections') ואחריו העברתו ל-rejected.
 * הסדר מכוון: קודם הרשומה (j:true), אחר כך ה-rename — קריסה ביניהם משאירה result-<sha>.json *רשום*,
 * שהניקוי מטפל בו לפי הרשומה (localCleanup.pure.js), ולא קובץ "לא רשום". רשומה קיימת לא נדחקת
 * (אין $slice); limitExpr — תנאי התקרה ($expr), ומעליה הקובץ נמחק בלי רישום.
 * file: { absPath, bytes } או null (הקובץ נשאר במקומו — למשל ה-hash הנעול; entry.path מגיע מבחוץ).
 * @returns {Promise<boolean>} האם ה-hash רשום בעבודה (חדש או מקודם)
 */
export async function recordRejectedFile({ job, sha, file, field, entry, limitExpr, env = process.env }) {
  const rel = file?.absPath ? absToRel(rejectedTarget(job._id, sha, env), env) : (entry.path ?? null);
  const res = await OcrJob.updateOne(
    { _id: job._id, [`${field}.sha256`]: { $ne: sha }, $expr: limitExpr },
    { $push: { [field]: { ...entry, sha256: sha, path: rel } } },
    DURABLE
  );
  let listed = res.matchedCount > 0;
  let lockedNow = job.resultSha256 === sha;
  if (!listed) {
    const fresh = await OcrJob.findById(job._id).select(`${field}.sha256 resultSha256`).lean();
    listed = (fresh?.[field] || []).some((x) => x?.sha256 === sha);
    lockedNow ||= fresh?.resultSha256 === sha;
  }
  if (!file?.absPath || lockedNow) return listed; // הקובץ הנעול לעולם לא מוזז/נמחק
  if (listed) {
    await moveToRejected(job._id, sha, file.absPath, env);
  } else {
    // מעל התקרה: לא שומרים קובץ שאין רשומה שתאפשר לבדוק ולסמן אותו
    console.warn(`[ocr-worker] ${field} limit reached job=${String(job._id)} — result file not kept`);
    await fs.unlink(/*turbopackIgnore: true*/ file.absPath).catch((e) => {
      if (e?.code !== 'ENOENT') console.error(`[ocr-worker] discard failed code=${String(e?.code)}`);
    });
  }
  return listed;
}

// מספר התוצאות המתנגשות שטרם סומנו "נבדק" קטן מהתקרה
const unreviewedConflictsBelowLimit = {
  $lt: [
    {
      $size: {
        $filter: {
          input: { $ifNull: ['$resultConflicts', []] },
          cond: { $eq: [{ $ifNull: ['$$this.reviewedAt', null] }, null] },
        },
      },
    },
    MAX_RESULT_CONFLICTS,
  ],
};

// תוצאה עם hash שונה מהנעול: נשמרת לבירור (פעם אחת לכל hash, עד שתסומן "נבדק"; מעל התקרה של
// התנגשויות פתוחות — לא נשמרת), העבודה וה-ack לא משתנים. התשובה תמיד 409 result_conflict.
async function rejectConflict(job, sha, file, now, env) {
  await recordRejectedFile({
    job,
    sha,
    file,
    field: 'resultConflicts',
    entry: { receivedAt: now, bytes: file?.bytes ?? null },
    limitExpr: unreviewedConflictsBelowLimit,
    env,
  });
  return err(409, 'result_conflict');
}

// ביטול גובר: שומרים ack=cancelled (פעם אחת — מותנה ב-ack:null) ולא מחילים טקסט
async function storeCancelAck(job, sha, now) {
  const ack = ackBody('cancelled', job._id, sha, 'cancelled');
  const res = await OcrJob.updateOne(
    { _id: job._id, resultSha256: sha, ack: null },
    { $set: { ack, ackAt: now, active: false } },
    DURABLE
  );
  if (res.matchedCount > 0) return ok(ack);
  const fresh = await loadJob(job._id);
  const stored = storedAckAnswer(fresh?.ack);
  return stored ? ok(stored) : err(500, 'internal_error');
}

// מאגר עם מקביליות מוגבלת; חריגה ראשונה עוצרת לקיחת משימות חדשות ונזרקת אחרי שהרצות בתנועה מסתיימות
async function runPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (failure === null && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        failure ??= { e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure.e;
  return results;
}

async function recordConflict(job, entry, text, sha, page, reason = 'page_changed') {
  try {
    await OcrConflict.updateOne(
      { job: job._id, page: entry.page },
      {
        $setOnInsert: {
          book: job.book,
          pageNumber: entry.pageNumber,
          pdfPageIndex: entry.pdfPageIndex,
          reason,
          ocrText: text,
          resultSha256: sha,
          expectedUpdatedAt: entry.expectedUpdatedAt ?? null,
          foundUpdatedAt: page?.updatedAt ?? null,
          status: 'open',
        },
      },
      { upsert: true }
    );
  } catch (e) {
    if (e?.code !== 11000) throw e; // upsert מקביל של אותה התנגשות — כבר נשמרה
  }
}

/**
 * רשומת OcrPageResult לעמוד (אם הוא עומד בתנאי — pageResultQualifies). פעם אחת בלבד לכל
 * (עבודה, עמוד): upsert עם $setOnInsert — שליחה חוזרת / השלמה מהקובץ לא משנות רשומה קיימת.
 * @returns {Promise<{layoutStatus:string, workerDroppedLayout:boolean}|null>}
 */
async function recordPageResult(job, entry, p, sha, doc, now, hooks) {
  const record = pageResultRecord(job, entry, p, sha, doc, now);
  if (!record) return null;
  try {
    await OcrPageResult.updateOne({ job: job._id, page: entry.page }, { $setOnInsert: record }, { upsert: true });
  } catch (e) {
    if (e?.code !== 11000) throw e; // upsert מקביל של אותה רשומה — כבר נשמרה
  }
  await hooks?.afterPageRecord?.(entry);
  return classLayout(record);
}

// עמוד אחד: עדכון מותנה יחיד; אם לא תפס — סיווג (כבר הוחל / חסר / התנגשות)
async function applyOne(job, entry, text, sha, now, hooks) {
  const res = await Page.updateOne(pageApplyFilter(job, entry), { $set: pageApplySet(text, job._id, sha, now) });
  if (res.matchedCount > 0) {
    await hooks?.afterPageWrite?.(entry);
    return { entry, kind: 'applied' };
  }
  const page = await Page.findById(entry.page).select('book updatedAt lastOcrJobId lastOcrResultSha256').lean();
  if (!page || String(page.book) !== String(job.book)) {
    return { entry, kind: 'missing', code: MISSING_PAGE_CODE, message: MISSING_PAGE_MESSAGE };
  }
  if (String(page.lastOcrJobId) === String(job._id) && page.lastOcrResultSha256 === sha) {
    return { entry, kind: 'applied' }; // שליחה חוזרת / המשך אחרי קריסה — בלי כתיבה כפולה
  }
  await recordConflict(job, entry, text, sha, page);
  return { entry, kind: 'conflict' };
}

const sortedPageMap = (job) => [...(job.pageMap || [])].sort((a, b) => a.pdfPageIndex - b.pdfPageIndex);
const pagesByIndex = (doc) => new Map((doc.pages || []).map((p) => [p.pdfPageIndex, p]));

/**
 * עבודה שבוטלה (באתר — isCancelled — בכל outcome, או outcome cancelled מהעובד): שום עמוד לא נכתב
 * (סמנטיקת הביטול נשמרת). לכל עמוד שעומד בתנאי נכתבת רשומת OcrPageResult, ועמוד עם טקסט לא ריק
 * (בלי error) נשמר גם כהתנגשות reason:'job_cancelled' — מנהל יכול לאמץ אותו. עמוד שנמחק מהספר
 * (או הועבר לספר אחר) מדולג. אידמפוטנטית (upsert עם $setOnInsert) — שליחה חוזרת לא יוצרת כפילויות.
 */
async function salvageCancelled(job, sha, doc, now, hooks) {
  const byIndex = pagesByIndex(doc);
  await runPool(sortedPageMap(job), APPLY_CONCURRENCY, async (entry) => {
    const p = byIndex.get(entry.pdfPageIndex);
    if (!p) return;
    const page = await Page.findById(entry.page).select('book updatedAt').lean();
    if (!page || String(page.book) !== String(job.book)) return;
    await recordPageResult(job, entry, p, sha, doc, now, hooks);
    if (p.error == null && typeof p.text === 'string' && p.text.trim() !== '') {
      await recordConflict(job, entry, p.text, sha, page, 'job_cancelled');
    }
  });
}

// ביטול גובר: קודם הצלת העמודים (התנגשויות job_cancelled), אחר כך ack=cancelled
async function cancelWithSalvage(job, sha, doc, now, hooks) {
  await salvageCancelled(job, sha, doc, now, hooks);
  return storeCancelAck(job, sha, now);
}

// סיווג כל העמודים המבוקשים. רק success/partial כותבים לעמודים; failed — רק רשומות OcrPageResult;
// cancelled (מהעובד, בלי ביטול באתר) — הצלה כהתנגשויות job_cancelled, בלי מחלקות.
// לכל עמוד: רשומת OcrPageResult **לפני** כתיבת העמוד/ההתנגשות שלו.
async function applyPages(job, doc, sha, now, hooks) {
  const pageMap = sortedPageMap(job);
  const byIndex = pagesByIndex(doc);
  if (doc.outcome === 'cancelled') {
    await salvageCancelled(job, sha, doc, now, hooks);
    return [];
  }
  if (doc.outcome === 'failed') {
    const layouts = await runPool(pageMap, APPLY_CONCURRENCY, async (entry) => {
      const p = byIndex.get(entry.pdfPageIndex);
      return p ? recordPageResult(job, entry, p, sha, doc, now, hooks) : null;
    });
    const failedByIndex = new Map(failedOutcomeClasses(doc, pageMap).map((c) => [c.entry.pdfPageIndex, c]));
    return pageMap
      .map((entry, i) => {
        const base = failedByIndex.get(entry.pdfPageIndex) || (layouts[i] ? { entry, kind: 'recorded' } : null);
        return base ? { ...base, ...(layouts[i] || {}) } : null;
      })
      .filter(Boolean);
  }
  if (doc.outcome !== 'success' && doc.outcome !== 'partial') return [];
  return runPool(pageMap, APPLY_CONCURRENCY, async (entry) => {
    const p = byIndex.get(entry.pdfPageIndex);
    if (!p) return { entry, kind: 'missing', code: MISSING_PAGE_CODE, message: MISSING_PAGE_MESSAGE }; // לא אמור לקרות אחרי ולידציה
    const layout = await recordPageResult(job, entry, p, sha, doc, now, hooks);
    const cls = p.error != null
      ? { entry, kind: 'failed', code: pageErrorCode(p.error), message: pageErrorMessage(p.error) }
      : await applyOne(job, entry, p.text, sha, now, hooks);
    return layout ? { ...cls, ...layout } : cls;
  });
}

// lease → החלה → סגירה. job: אחרי נעילת decision='apply' עם resultSha256 === sha.
async function runApply(job, sha, doc, now, hooks) {
  const lease = await OcrJob.updateOne(
    {
      _id: job._id,
      resultSha256: sha,
      decision: 'apply',
      status: 'applying',
      ack: null,
      $or: [{ applyLeaseUntil: null }, { applyLeaseUntil: { $lte: now } }],
    },
    { $set: { applyLeaseUntil: new Date(now.getTime() + APPLY_LEASE_MS) } }
  );
  if (lease.matchedCount === 0) {
    const fresh = await loadJob(job._id);
    const stored = storedAckAnswer(fresh?.ack);
    if (stored) return ok(stored);
    return err(503, 'apply_in_progress', { 'Retry-After': String(APPLY_RETRY_AFTER_SEC) });
  }

  try {
    const classes = await applyPages(job, doc, sha, now, hooks);
    const counters = summarizeApply(doc, job.pageMap, classes);
    const ack = ackBody('accepted', job._id, sha, doc.outcome);
    const close = await OcrJob.updateOne(
      { _id: job._id, resultSha256: sha, status: 'applying', ack: null },
      {
        $set: {
          ...counters,
          ...closingStatusFields(doc.outcome, counters),
          active: false,
          finishedAt: now,
          ack,
          ackAt: now,
          applyLeaseUntil: null,
        },
      },
      DURABLE
    );
    if (close.matchedCount > 0) return ok(ack);
    // החלה מקבילה (lease שפג) סגרה ראשונה — אותה תוצאה, אותן החלטות
    const fresh = await loadJob(job._id);
    const stored = storedAckAnswer(fresh?.ack);
    return stored ? ok(stored) : err(500, 'internal_error');
  } catch (e) {
    // שחרור ה-lease (best-effort) כדי ששליחה חוזרת תמשיך מיד ולא תחכה 5 דקות
    await OcrJob.updateOne(
      { _id: job._id, resultSha256: sha, status: 'applying', ack: null },
      { $set: { applyLeaseUntil: null } }
    ).catch(() => {});
    throw e;
  }
}

// מנקודה שבה resultSha256 === sha נעול: ack שמור / ביטול גובר / נעילת החלטה / החלה
async function continueReceive(job, sha, doc, now, hooks) {
  const stored = storedAckAnswer(job.ack);
  if (stored) return ok(stored);
  if (isCancelled(job)) return cancelWithSalvage(job, sha, doc, now, hooks);

  let current = job;
  if (current.decision !== 'apply') {
    const res = await OcrJob.updateOne(
      { _id: job._id, resultSha256: sha, decision: null, active: true, ack: null },
      { $set: { decision: 'apply', status: 'applying', applyStartedAt: now } },
      DURABLE
    );
    current = await loadJob(job._id);
    if (res.matchedCount === 0) {
      const again = storedAckAnswer(current?.ack);
      if (again) return ok(again);
      if (isCancelled(current)) return cancelWithSalvage(current, sha, doc, now, hooks);
      if (current?.decision !== 'apply') return err(410, 'job_closed');
    }
  }
  return runApply(current, sha, doc, now, hooks);
}

// שדות נוספים שנשמרים בנעילת ה-hash (לכל outcome): metadata הספר ו-error העליון של התוצאה
function lockedResultFields(doc) {
  const meta = bookMetadataJson(doc.metadata);
  const resultError = storedResultError(doc);
  return {
    resultMetadataJson: meta.json,
    resultMetadataTruncated: meta.truncated,
    ...(resultError ? { resultError } : {}),
  };
}

/**
 * קליטת תוצאה שכבר אומתה ונשמרה עמידה (localResultIntake.js).
 * @param {{jobId:any, sha:string, doc:any, file?:{relPath:string, absPath:string, bytes:number}|null,
 *          now?:Date, env?:any, hooks?:{afterPageWrite?:(entry:any)=>any, afterPageRecord?:(entry:any)=>any}}} args
 *   hooks — לטסטים בלבד (סימולציית קריסה אחרי k עדכוני עמוד / אחרי רשומת OcrPageResult ולפני העמוד).
 * @returns {Promise<{status:number, body:any, headers?:Record<string,string>}>}
 */
export async function receiveResult({ jobId, sha, doc, file = null, now = new Date(), env = process.env, hooks }) {
  let job = await loadJob(jobId);
  if (!job) return err(404, 'not_found');

  // נעילת resultSha256 (לכל היותר שני סבבים: אם מישהו אחר נעל בינתיים — מעריכים מחדש)
  for (let round = 0; round < 2 && job.resultSha256 !== sha; round++) {
    if (job.resultSha256) return rejectConflict(job, sha, file, now, env);
    if (!acceptsResult(job)) return err(410, 'job_closed');
    await OcrJob.updateOne(
      { _id: job._id, resultSha256: null },
      {
        $set: {
          resultSha256: sha,
          resultOutcome: doc.outcome,
          resultPath: file?.relPath ?? null,
          resultBytes: file?.bytes ?? null,
          resultReceivedAt: now,
          pipelineVersion: storedPipelineVersion(doc.pipelineVersion),
          ...lockedResultFields(doc),
        },
      },
      DURABLE
    );
    job = await loadJob(jobId);
    if (!job) return err(404, 'not_found');
  }
  if (job.resultSha256 !== sha) return rejectConflict(job, sha, file, now, env);
  return continueReceive(job, sha, doc, now, hooks);
}

/**
 * תשובה לשליחה חוזרת של תוצאה שכבר אושרה, בלי לקרוא/לשמור את הגוף שוב (אחרי ניקוי הקבצים
 * — "גם ימים אחר כך"). null אם אין ack שמור לאותו hash.
 */
export function storedAnswerFor(job, sha) {
  if (!hasAck(job) || job.resultSha256 !== sha) return null;
  return ok(storedAckAnswer(job.ack));
}

// עבודות "תקועות": תוצאה נעולה בלי ack, ואין החלה חיה — ה-lease פג, או שלא נלקח מעולם והנעילה ישנה
export function stalledApplyFilter(now) {
  const stale = new Date(now.getTime() - APPLY_LEASE_MS);
  return {
    method: 'local',
    resultSha256: { $type: 'string' },
    ack: null,
    resultReceivedAt: { $lt: stale },
    $or: [{ applyLeaseUntil: { $lt: now } }, { applyLeaseUntil: null }],
  };
}

async function readStoredResult(job, env) {
  let bytes;
  try {
    bytes = await fs.readFile(/*turbopackIgnore: true*/ relToAbs(job.resultPath, env));
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.message === 'invalid_storage_path') return { ok: false, code: 'result_unavailable' };
    throw e;
  }
  if (createHash('sha256').update(bytes).digest('hex') !== job.resultSha256) return { ok: false, code: 'result_corrupt' };
  const parsed = parseResultBytes(bytes);
  if (!parsed.ok || !validateResult(parsed.doc, job, bytes.length).ok) return { ok: false, code: 'result_invalid' };
  return { ok: true, doc: parsed.doc };
}

/**
 * השלמת קליטה שנתקעה (קריסת שרת באמצע + המחשב המקומי כבוי/לא שולח שוב) מהקובץ השמור — בצד
 * השרת בלבד, בלי העובד. ל-cron (שלב 9). כשהעובד ישלח שוב — יקבל already_received (או cancelled).
 * לא נוגעת בעבודה שה-lease שלה חי או שהתוצאה ננעלה לפני פחות מ-APPLY_LEASE_MS.
 * @returns {Promise<{ok:boolean, code:string, ack?:any}>} code: applied | cancelled | already_closed |
 *   not_stalled | not_found | apply_in_progress | result_unavailable | result_corrupt | result_invalid | job_closed
 */
export async function resumeStalledApply(jobId, { now = new Date(), env = process.env } = {}) {
  const job = await OcrJob.findOne({ _id: jobId, method: 'local' }).lean();
  if (!job) return { ok: false, code: 'not_found' };
  if (hasAck(job)) return { ok: true, code: 'already_closed', ack: job.ack };
  const stalled = await OcrJob.exists({ _id: job._id, ...stalledApplyFilter(now) });
  if (!stalled) return { ok: false, code: 'not_stalled' };

  let r;
  if (isCancelled(job)) {
    // הביטול גובר ואסור לחסום את הסגירה: אם הקובץ השמור קריא — קודם מצילים ממנו את העמודים
    // (התנגשויות job_cancelled); אם לא (חסר/פגום/שגיאת קריאה) — ack בלבד, עם רישום.
    let read;
    try {
      read = await readStoredResult(job, env);
    } catch (e) {
      read = { ok: false, code: String(e?.code ?? e?.name ?? 'error') };
    }
    if (read.ok) {
      r = await cancelWithSalvage(job, job.resultSha256, read.doc, now);
    } else {
      console.warn(`[ocr-local-resume] cancelled job=${String(job._id)}: stored result not salvaged (${read.code})`);
      r = await storeCancelAck(job, job.resultSha256, now);
    }
  } else {
    const read = await readStoredResult(job, env);
    if (!read.ok) return { ok: false, code: read.code };
    r = await continueReceive(job, job.resultSha256, read.doc, now);
  }
  if (r.status !== 200) return { ok: false, code: r.body.error };
  return { ok: true, code: r.body.ack === 'cancelled' ? 'cancelled' : 'applied', ack: r.body };
}

// כשל השלמה: העבודה נשארת כמו שהיא (תוצאה, החלטה, היסטוריה), רק נרשמים הקוד ומועד הניסיון הבא.
// מותנה ב-ack:null ובאותו resultSha256 — לא נוגעים בעבודה שנסגרה/השתנתה בינתיים. best-effort.
async function recordResumeFailure(job, code, now) {
  const failures = (Number(job.resumeFailures) || 0) + 1;
  await OcrJob.updateOne(
    { _id: job._id, method: 'local', ack: null, resultSha256: job.resultSha256 },
    {
      $set: {
        resumeErrorCode: code,
        resumeFailedAt: now,
        resumeRetryAt: new Date(now.getTime() + resumeRetryDelayMs(failures, { transient: resumeFailureTransient(code) })),
      },
      $inc: { resumeFailures: 1 },
    }
  ).catch((e) => {
    console.error(`[ocr-local-resume] recording failure for ${job._id} failed: ${String(e?.code ?? e?.name ?? 'error')}`);
  });
}

/**
 * העבודות התקועות (עד limit) — resumeStalledApply לכל אחת. לא זורקת על עבודה בודדת.
 * עבודה שנכשלה (קובץ חסר/פגום וכו') נדחית עד resumeRetryAt, והבחירה מעדיפה עבודות שטרם נכשלו
 * (resumeRetryAt null ממוין ראשון) — כך עבודות פגומות לא חוסמות את שאחריהן (סקירה W02).
 * @returns {Promise<{jobId:string, ok:boolean, code:string}[]>}
 */
export async function resumeStalledApplies({ now = new Date(), env = process.env, limit = 20 } = {}) {
  const jobs = await OcrJob.find({
    ...stalledApplyFilter(now),
    $and: [{ $or: [{ resumeRetryAt: null }, { resumeRetryAt: { $lte: now } }] }],
  })
    .select('_id resultSha256 resumeFailures')
    .sort({ resumeRetryAt: 1, _id: 1 })
    .limit(limit)
    .lean();
  const out = [];
  for (const job of jobs) {
    let code;
    let okFlag = false;
    try {
      const r = await resumeStalledApply(job._id, { now, env });
      code = r.code;
      okFlag = r.ok;
    } catch (e) {
      code = String(e?.code ?? e?.name ?? 'error');
    }
    if (!okFlag && resumeFailureBacksOff(code)) await recordResumeFailure(job, code, now);
    out.push({ jobId: String(job._id), ok: okFlag, code });
  }
  return out;
}
