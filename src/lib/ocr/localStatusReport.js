// דיווח מצב מהעובד המקומי (POST /api/worker/v1/jobs/{id}/status) — מודול טהור.
// החוזה: HANDOVER סעיף 3 ו-contracts/status.schema.json בריפו השירות; השולח בפועל:
// StatusReporter.cs (reportSeq עולה ונשמר אצלו לפני כל שליחה, message רק ל-needs_attention).
// imports יחסיים בלבד (נבדק ב-node:test).
//
// עקרונות:
// - נשמר רק הדיווח עם ה-reportSeq הגבוה ביותר: העדכון מותנה אטומית ב-reportSeq < הנכנס, כך
//   שדיווח ישן/כפול (גם במרוץ בין שתי בקשות) לעולם לא דורס חדש.
// - דיווח לעבודה סגורה (active:false — הושלמה/נכשלה/בוטלה) לעולם לא פותח אותה מחדש, וגם לא
//   משנה דבר בזמן החלת תוצאה (decision נעול / applying).
// - דיווח לעולם לא קובע סטטוס סופי: completed/failed/cancelled מהעובד נשמרים רק כ-workerState;
//   רק קליטת תוצאה (POST result) סוגרת עבודה.
import { REPORT_STATES, statusFromReport } from './localJobState.js';
import { workerJobFilter } from './localEnvelope.js';

// גוף דיווח תקין הוא כמה מאות בתים; תקרה נדיבה שמונעת קריאת גוף ענק לזיכרון
export const MAX_STATUS_BODY_BYTES = 16 * 1024;

export const MAX_MESSAGE_CHARS = 1000; // מעבר לזה — הדיווח נדחה
export const STORED_MESSAGE_CHARS = 500; // נשמר חתוך לאורך הזה
export const MAX_PHASE_CHARS = 1000; // מעבר לזה — הדיווח נדחה
export const STORED_PHASE_CHARS = 64; // נשמר חתוך לאורך הזה

// הסטטוסים באתר שדיווח מעדכן: הגלויים לעובד חוץ מ-applying (החלת תוצאה בעיצומה)
export const REPORTABLE_STATUSES = Object.freeze([
  'queued',
  'running',
  'pausing',
  'paused_runner',
  'delivery_pending',
  'needs_attention',
]);

// מצבים שאומרים שהעיבוד במחשב המקומי התחיל — קובעים startedAt (פעם אחת)
const STARTED_STATES = new Set(['running', 'pausing', 'paused_runner', 'delivery_pending']);

// message: "<reason>: <fixed text>" — reason בתווי [a-z0-9_] (או "unknown"), והטקסט הקבוע
// באנגלית ב-ASCII מודפס בלבד (בלי תווי בקרה/כיווניות). השירות שולח גם קוד חשוף בלי טקסט
// (קוד לא מוכר שנראה כמו קוד), ודוגמת החוזה status-report.json שולחת "recognizing" — שניהם
// מתקבלים. האורך נבדק בנפרד (MAX_MESSAGE_CHARS).
const REASON_RE = /^[a-z0-9_]{1,64}$/;
const PRINTABLE_ASCII_RE = /^[\x20-\x7e]+$/;

function isValidMessage(msg) {
  const sep = msg.indexOf(': ');
  if (sep === -1) return REASON_RE.test(msg);
  return REASON_RE.test(msg.slice(0, sep)) && PRINTABLE_ASCII_RE.test(msg.slice(sep + 2));
}

// תווי בקרה (C0, DEL, C1, מפרידי שורה/פסקה U+2028/9) וכל תווי הכיווניות (Bidi_Control: ALM,
// LRM/RLM, הטמעות/דריסות ובידודים) — מוסרים מ-phase
const isUnsafeCodePoint = (c) =>
  c < 0x20 ||
  (c >= 0x7f && c <= 0x9f) ||
  c === 0x061c ||
  c === 0x200e ||
  c === 0x200f ||
  c === 0x2028 ||
  c === 0x2029 ||
  (c >= 0x202a && c <= 0x202e) ||
  (c >= 0x2066 && c <= 0x2069);

// מנקה ומקצר לפי נקודות קוד (לא יחידות UTF-16) — קיצור לא חוצה זוג surrogate ולא משאיר חצי תו.
// משמש גם את קליטת התוצאה (localApply.pure.js) לטקסט שגיאה/גרסה מהעובד.
// זיכרון חסום: עוצר אחרי maxChars תווים בטוחים, בלי Array.from על כל הקלט — שדה בתוצאה יכול
// להיות עשרות MB (הגוף עד 100MiB), ומערך של תו-לכל-איבר היה מנפח אותו פי עשרות.
export const stripUnsafe = (s, maxChars) => {
  let out = '';
  let n = 0;
  if (!(maxChars > 0)) return out;
  for (const ch of String(s)) {
    if (isUnsafeCodePoint(ch.codePointAt(0))) continue;
    out += ch;
    if (++n >= maxChars) break;
  }
  return out;
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v, min) => Number.isSafeInteger(v) && v >= min;

const invalid = (field) => ({ ok: false, status: 422, error: 'invalid_report', field });

// body — אחרי JSON.parse. מחזיר { ok:true, report } או { ok:false, status, error, field? }:
// 400 bad_request לגוף שאינו אובייקט JSON; 422 invalid_report (עם שם השדה) להפרת הסכמה.
export function validateStatusReport(body) {
  if (!isPlainObject(body)) return { ok: false, status: 400, error: 'bad_request' };
  const { workerId, state, progress, reportSeq, attempt, message } = body;

  if (typeof workerId !== 'string' || workerId.length === 0 || workerId.length > 256) return invalid('workerId');
  if (typeof state !== 'string' || !REPORT_STATES.includes(state)) return invalid('state');
  if (!isPlainObject(progress)) return invalid('progress');
  if (!isCount(progress.pagesDone, 0)) return invalid('progress.pagesDone');
  if (!isCount(progress.pagesTotal, 0)) return invalid('progress.pagesTotal');
  const phase = progress.phase ?? null; // השירות משמיט null (WhenWritingNull) — null מתקבל כחסר
  if (phase !== null && (typeof phase !== 'string' || phase.length > MAX_PHASE_CHARS)) return invalid('progress.phase');
  if (!isCount(reportSeq, 1)) return invalid('reportSeq');
  if (!isCount(attempt, 0)) return invalid('attempt');
  const msg = message ?? null;
  if (msg !== null && (typeof msg !== 'string' || msg.length > MAX_MESSAGE_CHARS || !isValidMessage(msg))) {
    return invalid('message');
  }

  return {
    ok: true,
    report: {
      workerId,
      state,
      // phase הוא טקסט חופשי של צנרת ה-OCR — לא דוחים דיווח שלם בגללו, רק מנקים ומקצרים
      phase: phase === null ? null : stripUnsafe(phase, STORED_PHASE_CHARS),
      pagesDone: progress.pagesDone,
      pagesTotal: progress.pagesTotal,
      reportSeq,
      attempt,
      message: msg === null ? null : msg.slice(0, STORED_MESSAGE_CHARS),
    },
  };
}

// הפילטר של העדכון המותנה: עבודה של העובד, פעילה, בלי החלטה נעולה, בסטטוס שדיווח מעדכן,
// ו-reportSeq השמור קטן מהנכנס. $not/$gte (ולא $lt) כדי שגם רשומה בלי reportSeq תתעדכן.
// active:true ישירות (לא activeFilter): עבודת local תמיד נוצרת עם השדה, והענף הישן של
// activeFilter (בלי active, ב-running) שייך רק לעבודות gemini/ocrwin.
export function statusUpdateFilter(jobId, workerId, reportSeq) {
  return {
    _id: jobId,
    ...workerJobFilter(workerId),
    active: true,
    decision: null,
    status: { $in: REPORTABLE_STATUSES },
    reportSeq: { $not: { $gte: reportSeq } },
  };
}

// ה-$set של דיווח שהתקבל. status משתנה רק למצב פעיל (statusFromReport מחזיר null ל-completed/
// failed/cancelled); workerMessage מתאפס כשאין message (יציאה מ-needs_attention).
export function statusUpdateSet(report, now) {
  const mapped = statusFromReport(report.state);
  return {
    reportSeq: report.reportSeq,
    workerState: report.state,
    attempt: report.attempt,
    progressPhase: report.phase ?? '',
    processedPages: report.pagesDone,
    progressPagesTotal: report.pagesTotal,
    workerMessage: report.message ?? '',
    lastSeenAt: now,
    ...(mapped ? { status: mapped } : {}),
  };
}

export function marksStarted(state) {
  return STARTED_STATES.has(state);
}
