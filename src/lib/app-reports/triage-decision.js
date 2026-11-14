/**
 * מה שהאתר עושה עם החלטת הבדיקה האוטומטית: התור לשירות, החלת ההחלטה, ו"פתח בכל זאת" מהניהול.
 */
import AppReport from '../../models/AppReport.js';
import { issueHtmlUrl } from './github.js';
import { buildOutboundComment, buildReplyAddress } from './inbound.js';
import { getProduct, productFilter, productOf } from './products.js';
import { ensureReplyToken, githubFor, publishReport } from './service.js';
import { UNLINKED, requestRetriage, triageQuestionsMail, validateTriageDecision } from './triage.js';

export const TRIAGE_QUEUE_LIMIT = 50;
const LATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const AUTOMATED_SENDER = 'בדיקה אוטומטית';

/** הדיווחים שממתינים לבדיקה, מהוותיק לחדש. */
export async function listTriageQueue(now = new Date()) {
  const items = await AppReport.find({ 'triage.state': 'pending' })
    .select('reportId triage.requestedAt triage.deadline triage.runs')
    .sort({ 'triage.requestedAt': 1 }).limit(TRIAGE_QUEUE_LIMIT).lean();
  // נפתחו בלי החלטה (השירות לא ענה בזמן): השירות מוסיף פענוח ל-issue, ומדלג על מה שכבר טיפל בו
  const late = await AppReport.find({
    'triage.state': 'timeout', 'triage.decidedAt': { $gte: new Date(now.getTime() - LATE_WINDOW_MS) }, issueNumber: { $ne: null },
  }).select('reportId issueNumber mergedIntoExisting').sort({ 'triage.decidedAt': 1 }).limit(TRIAGE_QUEUE_LIMIT).lean();
  return {
    items: items.map((d) => ({
      reportId: d.reportId, requestedAt: d.triage.requestedAt, deadline: d.triage.deadline, runs: d.triage.runs || 1,
    })),
    late: late.map((d) => ({ reportId: d.reportId, issueNumber: d.issueNumber, merged: Boolean(d.mergedIntoExisting) })),
  };
}

function statusOf(doc) {
  return {
    reportId: doc.reportId,
    state: doc.triage?.state ?? null,
    issuePending: Boolean(doc.issuePending),
    issueNumber: doc.triage?.state === 'held' ? null : doc.issueNumber ?? null,
    issueUrl: doc.triage?.state === 'held' ? null : doc.issueUrl ?? null,
    merged: Boolean(doc.mergedIntoExisting),
  };
}

/** מצב הדיווח מבחינת השירות: issue שנפתח (גם בלי החלטתו, אחרי deadline) או "לא נפתח". */
export async function getTriageStatus(reportId) {
  const doc = await AppReport.findOne({ reportId }).select('reportId triage issuePending issueNumber issueUrl mergedIntoExisting').lean();
  return doc ? statusOf(doc) : null;
}

const canAsk = (doc, deps) => Boolean(doc.reporterEmail && !doc.unsubscribed && deps.config?.replyDomain && deps.sendContactMail);

async function sendQuestions(doc, questions, deps) {
  if (!questions.length || !canAsk(doc, deps)) return { sent: false };
  const { subject, message } = triageQuestionsMail(questions);
  const replyDomain = deps.config?.replyDomain;
  const replyTo = replyDomain ? buildReplyAddress(doc.replyToken || await ensureReplyToken(doc.reportId), replyDomain) : null;
  let result;
  try {
    result = await deps.sendContactMail({
      to: doc.reporterEmail, subject, message, reportTitle: doc.title, issueUrl: doc.issueUrl || null, replyTo, product: productOf(doc),
    });
  } catch (err) {
    result = { sent: false, reason: err?.message };
  }
  if (!result?.sent) {
    console.error(`App report ${doc.reportId}: triage questions mail failed:`, result?.reason);
    return { sent: false };
  }
  const now = deps.now || new Date();
  await AppReport.updateOne({ reportId: doc.reportId }, {
    $push: { contactLog: { direction: 'out', byUserId: null, byName: AUTOMATED_SENDER, subject, message, sentAt: now } },
    $set: { 'triage.questionsSentAt': now },
  });
  return { sent: true, subject, message };
}

/**
 * מחיל החלטה אחת של השירות. מחזיר {status, body}.
 * 409 = הדיווח כבר לא ממתין (נפתח אחרי deadline, נפתח ידנית או הוחלט) — השירות מטפל אז ב-issue עצמו.
 * @param {{config:object, sendContactMail?:Function, githubFor?:Function, fetchImpl?:Function, now?:Date}} deps
 */
export async function applyTriageDecision(reportId, raw, deps) {
  const v = validateTriageDecision(raw);
  if (!v.ok) return { status: 422, body: { error: v.error, field: v.field } };
  const d = v.value;
  const now = deps.now || new Date();

  const doc = await AppReport.findOne({ reportId }).lean();
  if (!doc) return { status: 404, body: { error: 'Report not found' } };
  if (doc.triage?.state !== 'pending' || !doc.issuePending) {
    return { status: 409, body: { error: 'not_pending', ...statusOf(doc) } };
  }
  // ממתינים לתשובה רק כשאפשר באמת לשאול ולקבל תשובה; אחרת — בספק פותחים
  if (d.awaitingReply && !canAsk(doc, deps)) Object.assign(d, { action: 'open', awaitingReply: false });

  const decided = {
    ...doc.triage, state: d.action === 'open' ? 'opened' : 'held', decidedAt: now, verdict: d.verdict, confidence: d.confidence,
    summary: d.summary, questions: d.questions.length ? d.questions : undefined, awaitingReply: d.awaitingReply,
    linkedIssue: d.linkIssue, questionsSentAt: null,
  };
  // ה-cron אולי כבר התחיל לפרסם (deadline עבר): לא נוגעים בדיווח שבנעילה
  const claim = { reportId, 'triage.state': 'pending', issuePending: true, $or: [{ issueLeaseUntil: null }, { issueLeaseUntil: { $lt: new Date() } }] };

  if (d.action === 'open') {
    const claimed = await AppReport.updateOne(claim, { $set: { triage: decided } });
    if (!claimed.modifiedCount) return { status: 409, body: { error: 'not_pending', ...statusOf(await AppReport.findOne({ reportId }).lean()) } };
    const published = await publishReport(reportId, deps);
    const mail = await sendQuestions(published, d.questions, deps);
    if (mail.sent && published?.issueNumber) {
      const github = githubFor(deps, productOf(published));
      await github?.createComment(published.issueNumber, buildOutboundComment({ reportId, subject: mail.subject, message: mail.message }))
        .catch((err) => console.error(`App report ${reportId}: triage contact comment failed:`, err?.message));
    }
    return { status: 200, body: { ok: true, ...statusOf(published), questionsSent: mail.sent } };
  }

  const link = d.linkIssue
    ? {
      issueNumber: d.linkIssue, issueUrl: issueHtmlUrl(getProduct(productOf(doc)).repo, d.linkIssue), mergedIntoExisting: true,
      // בדיקת המצב הבאה (null קודם בתור) מעדכנת את מצב הכפילות ושולחת מייל סגירה אם היא סגורה
      issueCheckedAt: null,
    }
    : {};
  // המדווח כבר קיבל מייל סגירה על הכפילות הזו (מדיווח אחר): לא שולחים שוב
  const notified = d.linkIssue && doc.reporterEmail && await AppReport.exists({
    ...productFilter(productOf(doc)), issueNumber: d.linkIssue, reporterEmail: doc.reporterEmail, notifiedClosedAt: { $ne: null },
  });
  const claimed = await AppReport.updateOne(claim, {
    $set: { ...UNLINKED, ...link, ...(notified ? { notifiedClosedAt: now } : {}), issuePending: false, issueError: null, triage: decided },
  });
  if (!claimed.modifiedCount) return { status: 409, body: { error: 'not_pending', ...statusOf(await AppReport.findOne({ reportId }).lean()) } };
  const mail = await sendQuestions(doc, d.questions, deps);
  if (d.awaitingReply && !mail.sent) {
    // לא הצלחנו לשאול: אין ממה להמתין, ולכן נפתח
    await AppReport.updateOne({ reportId, 'triage.state': 'held' }, {
      $set: { ...UNLINKED, issuePending: true, 'triage.state': 'opened', 'triage.awaitingReply': false },
    });
    const published = await publishReport(reportId, deps);
    return { status: 200, body: { ok: true, ...statusOf(published), questionsSent: false } };
  }
  // המדווח השיב בזמן שהבדיקה רצה (קריאה טרייה, אחרי ההחלטה): בודקים שוב עם התשובה
  const fresh = await AppReport.findOne({ reportId }).select('contactLog').lean();
  const answeredMeanwhile = (fresh?.contactLog || []).some((c) => c.direction === 'in' && c.issueComment === 'triage'
    && c.sentAt && doc.triage.requestedAt && new Date(c.sentAt) > new Date(doc.triage.requestedAt));
  const retriage = answeredMeanwhile && await requestRetriage(reportId, deps);
  return { status: 200, body: { ok: true, ...statusOf(await AppReport.findOne({ reportId }).lean()), questionsSent: mail.sent, retriage } };
}

/** "פתח בכל זאת" מדף הדיווח: דיווח שלא נפתח, או שעוד ממתין לבדיקה. */
export async function forcePublishReport(reportId, deps) {
  const now = deps.now || new Date();
  const doc = await AppReport.findOne({ reportId }).select('triage').lean();
  if (!doc) return { status: 404, body: { error: 'Report not found' } };
  if (!['held', 'pending'].includes(doc.triage?.state)) return { status: 409, body: { error: 'not_held' } };
  const upd = await AppReport.updateOne(
    { reportId, 'triage.state': doc.triage.state, $or: [{ issueLeaseUntil: null }, { issueLeaseUntil: { $lt: now } }] },
    { $set: { ...UNLINKED, issuePending: true, issueError: null, 'triage.state': 'forced', 'triage.decidedAt': now, 'triage.awaitingReply': false } },
  );
  if (!upd.modifiedCount) return { status: 409, body: { error: 'not_held' } };
  const published = await publishReport(reportId, deps);
  return { status: 200, body: { ok: true, ...statusOf(published) } };
}
