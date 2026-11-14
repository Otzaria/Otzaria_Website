// צורת התשובות של נתיבי הקריאה ב-API העובד (/api/worker/v1/jobs...) — מודול טהור.
// החוזה: HANDOVER סעיף 3 ו-contracts/job-envelope.schema.json בריפו השירות.
// imports יחסיים בלבד (נבדק ב-node:test).
//
// המעטפה **immutable**: השירות שומר אותה בקבלה הראשונה ומשווה אליה בכל סבב סנכרון (גם
// options ו-pageMap). כל שינוי בערך/בפורמט של שדה אחרי queued ייתפס אצלו כ-manifest_conflict
// ויעצור את העבודה — לכן הפורמט כאן דטרמיניסטי (תאריכים ב-toISOString, מפתחות בסדר קבוע).
import { WORKER_VISIBLE_STATUSES, activeFilter, siteStateOf } from './localJobState.js';
import { pageMapEntryToContract } from './localPdf.pure.js';

export const MAX_LIST_LIMIT = 100;
const CURSOR_RE = /^[a-f0-9]{24}$/;

// השדות שהמעטפה ופריט הרשימה צריכים — בלי טקסטים/תוצאות/התנגשויות
export const ENVELOPE_PROJECTION = Object.freeze({
  _id: 1,
  taskType: 1,
  workerId: 1,
  createdAt: 1,
  inputSha256: 1,
  options: 1,
  pageMap: 1,
  cancelRequested: 1,
  status: 1,
});

// עבודה "של העובד": local, ה-workerId המוגדר, ועברה את ההכנה (יש לה מעטפה וקלט).
// עבודה שנשארה ב-preparing / נכשלה או בוטלה בהכנה מעולם לא נמסרה לעובד → לא קיימת מבחינתו.
export function workerJobFilter(workerId) {
  return { method: 'local', workerId, inputSha256: { $type: 'string' } };
}

// רשימת העבודות הלא-סגורות של העובד, מהישנה לחדשה, אחרי ה-cursor (מזהה העבודה האחרונה בעמוד
// הקודם). דפדוף לפי _id: עבודה חדשה תמיד מקבלת _id גדול יותר, ועבודה שנסגרה בין עמודים פשוט
// לא מופיעה — אין דילוג על עבודה שנשארה פתוחה ואין כפילות.
export function listFilter(workerId, cursor) {
  return {
    ...workerJobFilter(workerId),
    ...activeFilter(),
    status: { $in: WORKER_VISIBLE_STATUSES },
    ...(cursor ? { _id: { $gt: cursor } } : {}),
  };
}

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

// options — רק מפתחות שהוגדרו, בסדר קבוע (lm, defaultScript); ריק → {}
function optionsOf(options) {
  const out = {};
  if (typeof options?.lm === 'string') out.lm = options.lm;
  if (typeof options?.defaultScript === 'string') out.defaultScript = options.defaultScript;
  return out;
}

// רשומת OcrJob (lean) → המעטפה (job-envelope.schema.json), בסדר המפתחות של הדוגמה בחוזה
export function toEnvelope(job) {
  return {
    schemaVersion: 1,
    jobId: String(job._id),
    taskType: job.taskType || 'ocr',
    workerId: job.workerId,
    createdAt: iso(job.createdAt),
    inputSha256: job.inputSha256,
    options: optionsOf(job.options),
    pageMap: (job.pageMap || []).map(pageMapEntryToContract),
  };
}

// פריט ב-GET /jobs: המעטפה + cancelRequested + siteState
export function toListItem(job) {
  return { ...toEnvelope(job), cancelRequested: job.cancelRequested === true, siteState: siteStateOf(job) };
}

// "פעילה" בדיוק כמו activeFilter() (כולל רשומה ישנה בלי השדה ב-running) — closed הוא ההפך
export function isJobActive(job) {
  if (job?.active === true) return true;
  return job?.active === undefined && job?.status === 'running';
}

// ?limit=&cursor= → { limit, cursor } או { error:'bad_request' }.
// limit חסר → 100; מעל 100 → 100 (החוזה: "לכל היותר limit, עד 100"); לא שלם/קטן מ-1 → שגיאה.
// cursor חסר/ריק → null; אחרת חייב להיות מזהה עבודה (מה ש-nextCursor החזיר).
export function parseListQuery(searchParams) {
  const rawLimit = searchParams.get('limit');
  let limit = MAX_LIST_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d{1,6}$/.test(rawLimit)) return { error: 'bad_request' };
    const n = Number(rawLimit);
    if (n < 1) return { error: 'bad_request' };
    limit = Math.min(n, MAX_LIST_LIMIT);
  }
  const rawCursor = searchParams.get('cursor');
  if (rawCursor === null || rawCursor === '') return { limit, cursor: null };
  if (!CURSOR_RE.test(rawCursor)) return { error: 'bad_request' };
  return { limit, cursor: rawCursor };
}

// רישום מינימלי של פריט שדולג: מזהה העבודה ושם/קוד החריגה בלבד — לא message/stack ולא
// תוכן הרשומה (עלולים להכיל נתיבים או נתונים פנימיים).
function logSkippedItem(job, err) {
  const jobId = String(job?._id ?? '?');
  const code = String(err?.code ?? err?.name ?? 'unknown');
  console.error(`[ocr-worker] list item skipped: jobId=${jobId} code=${code}`);
}

// jobs — עד limit+1 רשומות ממוינות לפי _id. nextCursor תמיד קיים: null בעמוד האחרון,
// אחרת מזהה האחרונה **שנסרקה** בעמוד (גדול ממש מה-cursor שנשלח — הדפדוף תמיד מתקדם).
// רשומה שהסריאליזציה שלה נכשלת (למשל תאריך לא תקין → toISOString זורק) מדולגת לבדה ונרשמת
// בלוג — אחרת עבודה פגומה אחת הייתה מפילה את כל הרשימה ב-500 בכל סבב, לנצח. ה-cursor עדיין
// לפי הרשומה האחרונה שנסרקה (גם אם דולגה), כך שהעמוד הבא לא חוזר עליה. העובד רואה את
// היעלמותה מהרשימה ושואל עליה ב-GET /jobs/{id}, שלא תלוי בתאריכים ועונה כרגיל.
export function pageOf(jobs, limit, onSkip = logSkippedItem) {
  const hasMore = jobs.length > limit;
  const page = hasMore ? jobs.slice(0, limit) : jobs;
  const items = [];
  for (const job of page) {
    try {
      items.push(toListItem(job));
    } catch (err) {
      onSkip(job, err);
    }
  }
  return {
    items,
    nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
  };
}

// GET /jobs/{id}: { jobId, state, cancelRequested, closed, ack? } — ack רק כשנשמר (אותו גוף
// שהוחזר לעובד בקליטת התוצאה). jobId זהה בדיוק למזהה שבבקשה (השירות משווה ordinal).
export function jobInfo(job) {
  const ack = job.ack && typeof job.ack.ack === 'string'
    ? { ack: job.ack.ack, jobId: job.ack.jobId, resultSha256: job.ack.resultSha256, outcome: job.ack.outcome }
    : null;
  return {
    jobId: String(job._id),
    state: siteStateOf(job),
    cancelRequested: job.cancelRequested === true,
    closed: !isJobActive(job),
    ...(ack ? { ack } : {}),
  };
}
