/**
 * הבדיקה האוטומטית של תקיעות וקריסות לפני פתיחת issue (docs/app-reports/TRIAGE.md): מי נבדק,
 * הערת השירות, ובדיקת ההחלטה שהוא מחזיר. בלי תלות ב-service.js, שמייבא מכאן.
 */
import AppReport from '../../models/AppReport.js';
import { isCrashReport, isHangReport } from './issue-text.js';
import { DEFAULT_PRODUCT, productOf } from './products.js';

const DISPATCH_TIMEOUT_MS = 5000;
export const MAX_TRIAGE_RUNS = 5;

export const TRIAGE_VERDICTS = Object.freeze([
  'fixed', 'fix_pending', 'duplicate', 'external', 'no_info', 'ask_reporter', 'needs_human', 'needs_instrumentation',
]);
const CONFIDENCE = ['high', 'medium', 'low'];
const MAX_SUMMARY = 20000;
const MAX_QUESTIONS = 5;
const MAX_QUESTION = 500;

/** רק תקיעות וקריסות של אוצריא, ורק כשהשירות מוגדר. */
export function needsTriage(report, config) {
  return Boolean(config?.triageSecret) && productOf(report) === DEFAULT_PRODUCT
    && (isHangReport(report) || isCrashReport(report));
}

/** מצב "ממתין לבדיקה" חדש: הפרסום מחכה עד ההחלטה או עד deadline. */
export function pendingTriage(now, config, runs = 1) {
  return {
    state: 'pending', requestedAt: now, deadline: new Date(now.getTime() + config.triageWaitMs),
    decidedAt: null, runs, awaitingReply: false,
  };
}

/** מעיר את השירות מיד. כשל אינו מעכב דבר: השירות מושך את התור גם בעצמו. */
export async function dispatchTriage(reportId, { config, fetchImpl = fetch }) {
  if (!config?.triageDispatchToken) return { sent: false, reason: 'not_configured' };
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${config.triageDispatchRepo}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.triageDispatchToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'otzaria-app-reports',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'app-report', client_payload: { report: reportId } }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`App report ${reportId}: triage dispatch → ${res.status}`);
      return { sent: false, reason: `status_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error(`App report ${reportId}: triage dispatch failed:`, err?.message);
    return { sent: false, reason: 'network' };
  }
}

const fail = (field, error) => ({ ok: false, field, error });

export const TRIAGE_MARKER = '<!-- app-report-triage -->';
const reportMarker = (reportId) => `<!-- app-report-triage-report: ${reportId} -->`;
const VERDICT_HE = {
  fixed: 'תוקן ב-dev', fix_pending: 'תיקון ב-PR פתוח', duplicate: 'כפול', external: 'סיבה חיצונית',
  no_info: 'אין מידע לפעול לפיו', ask_reporter: 'נדרש מידע מהמדווח', needs_human: 'דורש בדיקה',
  needs_instrumentation: 'צריך להוסיף מידע לדוחות',
};
const CONFIDENCE_HE = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' };

/** תגובת הפענוח ב-issue. בלי תיוג משתמשים ובלי סימונים שמתחזים למרקרים. */
export function triageComment(reportId, t) {
  const summary = String(t.summary || '').replace(/<!--/g, '&lt;!--').replace(/@(?=[A-Za-z0-9])/g, '@\u200b');
  const footer = [`בדיקה אוטומטית · ${VERDICT_HE[t.verdict] || t.verdict} · ודאות ${CONFIDENCE_HE[t.confidence] || t.confidence}`,
    t.note ? String(t.note).replace(/<|>/g, '') : ''].filter(Boolean).join(' · ');
  return `${TRIAGE_MARKER}\n${summary}\n\n---\n<sub>${footer}</sub>\n\n${reportMarker(reportId)}`;
}

/**
 * ההמשך ב-GitHub אחרי החלטה על דיווח שיש לו issue: תגובת פענוח (פעם אחת), שיוך או סגירה.
 * נקרא מיד אחרי ההחלטה, וה-cron משלים מה שנכשל.
 * @returns {Promise<'done'|'failed'|'skipped'>}
 */
export async function runTriageFollowUp(reportId, github, deps) {
  const now = new Date();
  const doc = await AppReport.findOneAndUpdate(
    {
      reportId, issueNumber: { $ne: null },
      $or: [{ 'triage.followUp.status': 'pending' }, { 'triage.followUp.status': 'running', 'triage.followUp.attemptAt': { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }],
    },
    { $set: { 'triage.followUp.status': 'running', 'triage.followUp.attemptAt': now } },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return 'skipped';
  const f = doc.triage.followUp;
  try {
    const comments = await github.listComments(doc.issueNumber);
    if (!comments.some((c) => c.body.includes(reportMarker(reportId)))) {
      await github.createComment(doc.issueNumber, triageComment(reportId, doc.triage));
    }
    if (f.assign) await github.addAssignees(doc.issueNumber, [deps.config.triageAssignee]);
    if (f.close === 'duplicate' && f.duplicateOf) await github.closeAsDuplicate(doc.issueNumber, f.duplicateOf);
    else if (f.close === 'completed' || f.close === 'not_planned') await github.closeIssue(doc.issueNumber, f.close);
    await AppReport.updateOne({ reportId }, { $set: { 'triage.followUp.status': 'done', 'triage.followUp.error': null } });
    return 'done';
  } catch (err) {
    console.error(`App report ${reportId}: triage follow-up failed:`, err?.message);
    await AppReport.updateOne({ reportId }, { $set: { 'triage.followUp.status': 'pending', 'triage.followUp.error': String(err?.message || err).slice(0, 500) } });
    return 'failed';
  }
}

/**
 * ההחלטה של השירות. open = לפתוח (או לצרף ל-issue פתוח עם אותה חתימה); hold = לא לפתוח.
 * @returns {{ok:true, value:{action:string, verdict:string, confidence:string, summary:string, questions:string[], linkIssue:number|null, awaitingReply:boolean}}|{ok:false, field:string, error:string}}
 */
export function validateTriageDecision(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('body', 'object expected');
  const { action, verdict, confidence, summary, questions = [], linkIssue = null, awaitingReply = false, note = '' } = raw;
  if (action !== 'open' && action !== 'hold') return fail('action', 'open|hold');
  if (!TRIAGE_VERDICTS.includes(verdict)) return fail('verdict', 'unknown');
  if (!CONFIDENCE.includes(confidence)) return fail('confidence', 'high|medium|low');
  if (typeof summary !== 'string' || !summary.trim() || summary.length > MAX_SUMMARY) return fail('summary', `1..${MAX_SUMMARY} chars`);
  if (!Array.isArray(questions) || questions.length > MAX_QUESTIONS
    || !questions.every((q) => typeof q === 'string' && q.trim() && q.length <= MAX_QUESTION)) {
    return fail('questions', `up to ${MAX_QUESTIONS} strings of 1..${MAX_QUESTION} chars`);
  }
  if (linkIssue !== null && !(Number.isSafeInteger(linkIssue) && linkIssue > 0)) return fail('linkIssue', 'positive integer');
  if (typeof awaitingReply !== 'boolean') return fail('awaitingReply', 'boolean');
  if (typeof note !== 'string' || note.length > 500) return fail('note', 'up to 500 chars');
  if (action === 'open' && (linkIssue !== null || awaitingReply)) return fail('action', 'linkIssue/awaitingReply only with hold');
  if (awaitingReply && !questions.length) return fail('awaitingReply', 'requires questions');
  return {
    ok: true,
    value: { action, verdict, confidence, summary: summary.trim(), questions: questions.map((q) => q.trim()), linkIssue, awaitingReply, note: note.trim() },
  };
}

/** מייל השאלות למדווח, בלשון פשוטה. */
export function triageQuestionsMail(questions) {
  return {
    subject: 'שאלה קצרה על הדיווח ששלחת',
    message: [
      'שלום,',
      'תודה על הדיווח. כדי שנוכל לטפל בבעיה, נשמח לתשובה על השאלות הבאות:',
      ...questions.map((q, i) => `${i + 1}. ${q}`),
      'אפשר פשוט להשיב למייל הזה.',
    ].join('\n\n'),
  };
}

// קישור לכפילות שנשמר בדיווח שלא נפתח; בבדיקה חוזרת הוא מתבטל, וההחלטה החדשה קובעת מחדש
export const UNLINKED = Object.freeze({
  issueNumber: null, issueUrl: null, issueState: null, issueStateReason: null, issueClosedAt: null,
  mergedIntoExisting: false, suppressedAfterClose: false, notifiedClosedAt: null,
});

/**
 * בדיקה חוזרת של דיווח שלא נפתח (המדווח השיב). ממתין שוב לפרסום, כך שגם אם השירות לא יענה — ייפתח.
 * @returns {Promise<boolean>} האם הבקשה נרשמה
 */
export async function requestRetriage(reportId, deps) {
  const now = deps.now || new Date();
  const doc = await AppReport.findOne({ reportId, 'triage.state': 'held' }).select('triage').lean();
  if (!doc) return false;
  const runs = (doc.triage.runs || 0) + 1;
  const next = pendingTriage(now, deps.config, runs);
  // המדווח השיב שוב ושוב: לא בודקים בלי סוף — נפתח ב-cron הבא
  if (runs > MAX_TRIAGE_RUNS) next.deadline = now;
  const upd = await AppReport.updateOne(
    { reportId, 'triage.state': 'held', 'triage.decidedAt': doc.triage.decidedAt },
    { $set: { ...UNLINKED, issuePending: true, issueError: null, triage: { ...doc.triage, ...next } } },
  );
  if (!upd.modifiedCount) return false;
  if (runs <= MAX_TRIAGE_RUNS) dispatchTriage(reportId, deps);
  return true;
}
