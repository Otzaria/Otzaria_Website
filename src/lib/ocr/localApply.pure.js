// פונקציות טהורות של קליטת תוצאה מהעובד המקומי (localApply.js) — בלי DB/fs.
// imports יחסיים בלבד (נבדק ב-node:test).
import { buildPageUpdate } from './runOcrJob.pure.js';
import { stripUnsafe } from './localStatusReport.js';
import { terminalStatusForOutcome } from './localJobState.js';
import {
  normalizePageLayout,
  normalizeWarnings,
  pageMetadataJson,
  textSha256Hex,
} from './localResultLayout.pure.js';

export const ACK_KINDS = Object.freeze(['accepted', 'already_received', 'cancelled']);
export const ACK_OUTCOMES = Object.freeze(['success', 'partial', 'failed', 'cancelled']);
const ACK_KEYS = Object.freeze(['ack', 'jobId', 'resultSha256', 'outcome']);
const JOB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export const STORED_ERROR_CHARS = 500;

// גוף ה-ack (ack.schema.json): בדיוק ארבעה שדות, בסדר הזה
export function ackBody(ack, jobId, resultSha256, outcome) {
  return { ack, jobId: String(jobId), resultSha256, outcome };
}

// בדיקת ack מול ack.schema.json (מפתחות, enum, תבניות, ו-cancelled ⇒ outcome cancelled) —
// הגנה לפני שמירה/החזרה ובטסטים, בלי ספריית JSON-Schema
export function isValidAck(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (keys.length !== ACK_KEYS.length || !ACK_KEYS.every((k) => keys.includes(k))) return false;
  if (!ACK_KINDS.includes(body.ack) || !ACK_OUTCOMES.includes(body.outcome)) return false;
  if (typeof body.jobId !== 'string' || !JOB_ID_RE.test(body.jobId)) return false;
  if (typeof body.resultSha256 !== 'string' || !SHA_RE.test(body.resultSha256)) return false;
  return body.ack !== 'cancelled' || body.outcome === 'cancelled';
}

// ה-ack השמור (job.ack) → התשובה לשליחה חוזרת: ack=cancelled נשאר cancelled (outcome cancelled);
// accepted → already_received עם אותו outcome שנרשם בקליטה הראשונה. null אם אין ack שמור.
export function storedAckAnswer(stored) {
  if (!stored || typeof stored.ack !== 'string') return null;
  if (stored.ack === 'cancelled') return ackBody('cancelled', stored.jobId, stored.resultSha256, 'cancelled');
  return ackBody('already_received', stored.jobId, stored.resultSha256, stored.outcome);
}

// "ריק" כמו pageHasText (String.prototype.trim): ריק, רק תווי רווח/שורה — כולל NBSP, BOM ורווחי
// Unicode (Zs) — null או חסר. לא /\S/: ב-MongoDB (PCRE) \s הוא ASCII בלבד, ולכן עמוד שתוכנו NBSP
// בלבד נכנס ל-PDF במצב skip (ריק לפי pageHasText) אבל לא היה מתעדכן בהחלה ונרשם כהתנגשות שווא.
// תבנית PCRE כמחרוזת ($regex) בתחביר \x{…}: אובייקט RegExp של JS לא מתאים כאן — ה-source שלו
// ממיר את U+2028/U+2029 לרצף בסגנון backslash-u, ו-PCRE של MongoDB דוחה את התחביר הזה.
export const NON_TRIM_CHAR_PCRE =
  '[^\\t\\n\\x{0b}\\f\\r \\x{a0}\\x{1680}\\x{2000}-\\x{200a}\\x{2028}\\x{2029}\\x{202f}\\x{205f}\\x{3000}\\x{feff}]';
const SKIP_EMPTY = { $not: { $regex: NON_TRIM_CHAR_PCRE } };

// פילטר העדכון המותנה של עמוד אחד (מפרט סעיף 4ב): העמוד שייך לספר, לא השתנה מאז יצירת
// העבודה (updatedAt = expectedUpdatedAt מה-pageMap), ולא נכתב כבר ע"י העבודה הזו. במצב skip —
// גם ריק מטקסט (כמו pageHasText ב-runOcrJob, שהיה ריק בעת היצירה).
export function pageApplyFilter(job, entry) {
  const filter = {
    _id: entry.page,
    book: job.book,
    updatedAt: entry.expectedUpdatedAt ?? null,
    lastOcrJobId: { $ne: job._id },
  };
  if (job.existingTextMode !== 'overwrite') {
    filter.content = SKIP_EMPTY;
    filter.rightColumn = SKIP_EMPTY;
    filter.leftColumn = SKIP_EMPTY;
  }
  return filter;
}

// ה-$set לעמוד: בדיוק כמו gemini/ocrwin (buildPageUpdate — content, טורים מתאפסים) + שדות
// המעקב באותה פעולה. סטטוס העמוד לא משתנה (כמו ב-runOcrJob).
export function pageApplySet(text, jobId, sha, now) {
  return {
    ...buildPageUpdate(text),
    lastOcrJobId: jobId,
    lastOcrResultSha256: sha,
    lastOcrAt: now,
  };
}

const clean = (s) => stripUnsafe(String(s ?? ''), STORED_ERROR_CHARS).trim();

// pipelineVersion נשמר ב-OcrJob. הסכמה (result.schema.json) לא מגבילה את אורכו, ולכן לא דוחים
// (422) אלא מקצרים בשמירה: ערך ענק היה חורג ממגבלת 16MB של מסמך → 500 → העובד שולח שוב לנצח.
export const STORED_PIPELINE_VERSION_CHARS = 200;
export function storedPipelineVersion(v) {
  return typeof v === 'string' ? stripUnsafe(v, STORED_PIPELINE_VERSION_CHARS).trim() : '';
}

export const NO_PAGES_SUCCEEDED_CODE = 'no_pages_succeeded';
export const NO_PAGES_SUCCEEDED_MESSAGE = 'אף עמוד לא נקלט: כל העמודים נכשלו בעיבוד במחשב המקומי או נמחקו מהספר';

/**
 * שדות הסטטוס בסגירה. outcome=partial שבו שום עמוד לא נקלט ואין התנגשות שממתינה להחלטה
 * (successPages=0, conflictPages=0) נסגר כ-failed עם errorCode — אחרת היה מוצג "הסתיים" בלי שום
 * טקסט. ה-ack לא מושפע (outcome נשאר partial כפי שנשלח — חוזה). partial עם התנגשויות נשאר completed
 * (יש טקסט OCR שממתין להחלטת מנהל), כמו success שכל עמודיו התנגשו.
 * @param {string} outcome
 * @param {{successPages:number, conflictPages:number}} counters
 */
export function closingStatusFields(outcome, counters) {
  const status = terminalStatusForOutcome(outcome);
  if (outcome === 'partial' && counters.successPages === 0 && counters.conflictPages === 0) {
    return { status: 'failed', errorCode: NO_PAGES_SUCCEEDED_CODE, error: NO_PAGES_SUCCEEDED_MESSAGE };
  }
  return { status };
}

// שגיאת עמוד מהעובד → הודעה בעברית לתצוגה (טקסט רגיל, מנוקה ומקוצר)
export function pageErrorMessage(err) {
  const code = clean(err?.code);
  const message = clean(err?.message);
  const text = `שגיאת OCR במחשב המקומי (${code || 'unknown'})${message ? `: ${message}` : ''}`;
  return Array.from(text).slice(0, STORED_ERROR_CHARS).join('');
}

export const MISSING_PAGE_MESSAGE = 'העמוד לא נמצא בספר (נמחק אחרי יצירת העבודה)';
export const MISSING_PAGE_CODE = 'page_missing';

// קוד שגיאת העמוד כשדה נפרד (pageErrors[].code) — מנוקה ומקוצר כמו ההודעה
export function pageErrorCode(err) {
  return clean(err?.code) || 'unknown';
}

/**
 * error העליון של התוצאה (לכל outcome, גם partial/cancelled) → {code, message} לשמירה ב-
 * OcrJob.resultError, מנוקה ומקוצר ל-500. null אם אין error עם code.
 */
export function storedResultError(doc) {
  const e = doc?.error;
  if (e == null || typeof e !== 'object' || typeof e.code !== 'string' || !e.code.trim()) return null;
  return { code: clean(e.code), message: clean(e.message) };
}

// ---------- רשומת OcrPageResult לעמוד (נתוני פריסה, עזר ואזהרות) ----------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * האם לעמוד בתוצאה נכתבת רשומת OcrPageResult: יש לו טקסט (בלי error), או layout, או metadata.
 * עמוד שאין בו אף אחד מהם (למשל not_processed בלי metadata) — אין מה לשמור.
 */
export function pageResultQualifies(p) {
  if (!isPlainObject(p)) return false;
  return (p.error == null && typeof p.text === 'string') || p.layout != null || p.metadata != null;
}

/**
 * הרשומה לעמוד אחד (ל-$setOnInsert; בלי job/page, שהם מפתח ה-upsert). דטרמיניסטית לחלוטין
 * מאותה תוצאה (השלמה מהקובץ השמור נותנת בדיוק אותה רשומה). null אם העמוד לא עומד בתנאי.
 * @param {any} job lean: _id, book
 * @param {any} entry איבר ה-pageMap: page, pageNumber, pdfPageIndex, imageSha256
 * @param {any} page pages[i] מהתוצאה
 * @param {string} sha resultSha256
 * @param {any} doc התוצאה (outcome, pipelineVersion)
 * @param {Date} now
 */
export function pageResultRecord(job, entry, page, sha, doc, now) {
  if (!pageResultQualifies(page)) return null;
  const hasTextField = page.error == null && typeof page.text === 'string';
  const layout = normalizePageLayout(page.layout, entry);
  const metadata = pageMetadataJson(page.metadata);
  const warnings = [
    ...normalizeWarnings(page.warnings),
    ...layout.warnings,
    ...(metadata.warning ? [metadata.warning] : []),
  ];
  return {
    book: job.book,
    pageNumber: entry.pageNumber,
    pdfPageIndex: entry.pdfPageIndex,
    resultSha256: sha,
    outcome: doc.outcome,
    pipelineVersion: storedPipelineVersion(doc.pipelineVersion),
    imageSha256: typeof entry.imageSha256 === 'string' ? entry.imageSha256 : null,
    textSha256: hasTextField ? textSha256Hex(page.text) : null,
    hasText: hasTextField && page.text.trim() !== '',
    receivedAt: now,
    metadataJson: metadata.json,
    warnings,
    layoutStatus: layout.status,
    layoutVersion: layout.version,
    layoutJson: layout.layoutJson,
    layoutBytes: layout.bytes,
    layoutErrors: layout.errors,
    layoutRejectedJson: layout.rejectedJson,
  };
}

/** מה שמחלקת הסיווג נושאת על ה-layout של העמוד (ל-layoutSummary) — מתוך הרשומה, או null */
export function classLayout(record) {
  if (!record) return null;
  return {
    layoutStatus: record.layoutStatus,
    // העובד השמיט את ה-layout עם אזהרה (layout_too_large, layout_geometry_unknown וכו')
    workerDroppedLayout: (record.warnings || []).some((w) => w.source === 'worker' && w.code.startsWith('layout_')),
  };
}

/**
 * layoutSummary בסגירה, מהמחלקות שנושאות layoutStatus (עמודים שנכתבה להם רשומה): ok — נשמר layout;
 * dropped — נפסל באתר (כל מה שאינו ok/absent) או שהעובד השמיט אותו (absent עם אזהרת layout_*);
 * absent — אין layout ואין אזהרה.
 */
export function layoutSummaryOf(classes) {
  const out = { ok: 0, absent: 0, dropped: 0 };
  for (const c of classes || []) {
    if (!c?.layoutStatus) continue;
    if (c.layoutStatus === 'ok') out.ok++;
    else if (c.layoutStatus === 'absent' && !c.workerDroppedLayout) out.absent++;
    else out.dropped++;
  }
  return out;
}

// שגיאה כללית של העבודה לפי התוצאה: failed → "<code>: <message>" (או הודעה כשכל העמודים נכשלו)
export function jobErrorText(doc) {
  if (doc?.outcome !== 'failed') return '';
  if (doc.error && typeof doc.error.code === 'string' && doc.error.code.trim()) {
    const code = clean(doc.error.code);
    const message = clean(doc.error.message);
    return Array.from(message ? `${code}: ${message}` : code).slice(0, STORED_ERROR_CHARS).join('');
  }
  return 'כל העמודים נכשלו בעיבוד במחשב המקומי';
}

/**
 * סיכום ההחלה → שדות המונים לשמירה ב-$set (לא $inc — שליחה חוזרת מחשבת מחדש ולא מגדילה).
 * @param {any} doc — התוצאה
 * @param {any[]} pageMap
 * @param {{entry:any, kind:'applied'|'failed'|'missing'|'conflict'|'recorded', message?:string, code?:string,
 *          layoutStatus?:string, workerDroppedLayout?:boolean}[]} classes
 *   recorded — עמוד שנשמרה לו רשומת OcrPageResult בלי החלה (בתוצאת failed); נספר רק ב-layoutSummary.
 */
export function summarizeApply(doc, pageMap, classes) {
  const count = (kind) => classes.filter((c) => c.kind === kind).length;
  const pageErrors = classes
    .filter((c) => c.kind === 'failed' || c.kind === 'missing')
    .map((c) => ({
      pageNumber: c.entry.pageNumber,
      code: c.code || (c.kind === 'missing' ? MISSING_PAGE_CODE : 'unknown'),
      message: c.message || '',
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const total = (pageMap || []).length;
  const layoutSummary = layoutSummaryOf(classes);
  if (doc.outcome === 'cancelled') {
    return { successPages: 0, failedPages: 0, conflictPages: 0, missingPages: 0, pageErrors: [], error: '', layoutSummary };
  }
  if (doc.outcome === 'failed') {
    return {
      successPages: 0,
      failedPages: total,
      conflictPages: 0,
      missingPages: 0,
      processedPages: total,
      pageErrors,
      error: jobErrorText(doc),
      layoutSummary,
    };
  }
  return {
    successPages: count('applied'),
    failedPages: count('failed'),
    conflictPages: count('conflict'),
    missingPages: count('missing'),
    processedPages: total,
    pageErrors,
    error: '',
    layoutSummary,
  };
}

// בתוצאת failed — אילו עמודים נכשלו ועם איזו הודעה (לתיעוד בלבד; שום עמוד לא נכתב)
export function failedOutcomeClasses(doc, pageMap) {
  const byIndex = new Map((doc.pages || []).map((p) => [p.pdfPageIndex, p]));
  return (pageMap || [])
    .filter((entry) => byIndex.get(entry.pdfPageIndex)?.error)
    .map((entry) => {
      const err = byIndex.get(entry.pdfPageIndex).error;
      return { entry, kind: 'failed', code: pageErrorCode(err), message: pageErrorMessage(err) };
    });
}

// השלמת קליטה תקועה מהקובץ השמור (resumeStalledApplies) שנכשלה — למשל קובץ התוצאה חסר/פגום
// (result_unavailable / result_corrupt / result_invalid): העבודה לא נסגרת ולא נמחקת, אלא נדחית
// לניסיון הבא (resumeRetryAt) בהמתנה מוכפלת — שעה, שעתיים, 4, 8, 16, ואז פעם ביממה לעד (אולי הקובץ
// ישוחזר מגיבוי). בלי זה אותן 20 עבודות פגומות נבחרות בכל ריצה וחוסמות את כל מה שאחריהן (סקירה W02).
// כשל שאינו מצב קבוע של העבודה (חריגה: Mongo/אחסון לא זמינים רגעית, וכו') — המתנה קצרה: 5 דקות
// ומוכפל (בפועל: הריצה השעתית הבאה), עד יממה רק אחרי כשלונות חוזרים רבים. גם כך העבודה ממוינת אחרי
// עבודות שטרם נכשלו, ולכן אינה חוסמת אותן; ההמתנה הארוכה נשמרת לקובץ חסר/פגום, שלא יתוקן מעצמו.
export const RESUME_RETRY_BASE_MS = 60 * 60 * 1000;
export const RESUME_TRANSIENT_RETRY_BASE_MS = 5 * 60 * 1000;
export const RESUME_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
/**
 * @param {number} failures — מספר הכשלונות כולל הנוכחי (1 ומעלה)
 * @param {{transient?: boolean}} [opts] — transient: כשל שאינו קבוע (resumeFailureTransient)
 */
export function resumeRetryDelayMs(failures, { transient = false } = {}) {
  const n = Math.max(1, Math.floor(Number(failures) || 1));
  const base = transient ? RESUME_TRANSIENT_RETRY_BASE_MS : RESUME_RETRY_BASE_MS;
  return Math.min(RESUME_RETRY_MAX_MS, base * 2 ** Math.min(n - 1, 30));
}

// מצבים קבועים של העבודה/הקובץ (לא ישתנו בלי התערבות או שליחה חוזרת) — המתנה ארוכה; כל השאר
// (חריגות, internal_error) — קצרה
const RESUME_PERMANENT = new Set(['result_unavailable', 'result_corrupt', 'result_invalid', 'job_closed']);
export function resumeFailureTransient(code) {
  return !RESUME_PERMANENT.has(code);
}

// תוצאות שאינן כשל של העבודה עצמה — לא דוחים בגללן: החלה חיה מקבילה, עבודה שכבר נסגרה/אינה תקועה
const RESUME_NO_BACKOFF = new Set(['applied', 'cancelled', 'already_closed', 'not_stalled', 'not_found', 'apply_in_progress']);
export function resumeFailureBacksOff(code) {
  return !RESUME_NO_BACKOFF.has(code);
}
