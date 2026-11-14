/**
 * מה שהאתר עושה עם החלטת הבדיקה האוטומטית: התור לשירות, החלת ההחלטה, ו"פתח בכל זאת" מהניהול.
 */
import AppReport from '../../models/AppReport.js';
import { issueHtmlUrl } from './github.js';
import { buildOutboundComment, buildReplyAddress } from './inbound.js';
import { getProduct, productFilter, productOf } from './products.js';
import { ensureReplyToken, githubFor, loadReportFile, loadReportImage, publishReport } from './service.js';
import { UNLINKED, requestRetriage, runTriageFollowUp, triageQuestionsMail, validateTriageDecision } from './triage.js';

export const TRIAGE_QUEUE_LIMIT = 50;
const LATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const AUTOMATED_SENDER = 'בדיקה אוטומטית';

/** הדיווחים שממתינים לבדיקה, מהוותיק לחדש. */
export async function listTriageQueue(now = new Date()) {
  const items = await AppReport.find({ 'triage.state': 'pending' })
    .select('reportId triage.requestedAt triage.deadline triage.runs')
    .sort({ 'triage.requestedAt': 1 }).limit(TRIAGE_QUEUE_LIMIT).lean();
  // נפתחו בלי החלטה (השירות לא ענה בזמן, או ידנית): ההחלטה שתגיע תוסיף פענוח ל-issue
  const late = await AppReport.find({
    'triage.state': { $in: ['timeout', 'forced'] }, 'triage.lateDecidedAt': null,
    'triage.decidedAt': { $gte: new Date(now.getTime() - LATE_WINDOW_MS) }, issueNumber: { $ne: null },
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

/**
 * חומר הבדיקה של דיווח אחד: השדות, ההתכתבות עם המדווח (תשובות רק מכתובתו) ורשימת הקבצים.
 * בלי כתובת המייל: רק אם אפשר לפנות אליו. השירות לא ניגש למסד הנתונים.
 */
export async function getTriageMaterial(reportId) {
  const doc = await AppReport.findOne({ reportId }).lean();
  if (!doc) return null;
  const t = doc.triage || {};
  return {
    reportId: doc.reportId, product: productOf(doc), type: doc.type, trigger: doc.trigger, title: doc.title,
    description: doc.description || '', stepsToReproduce: doc.stepsToReproduce || '', appVersion: doc.appVersion,
    platform: doc.platform, osVersion: doc.osVersion, arch: doc.arch, signature: doc.signature || null,
    createdAt: doc.createdAt, canContact: Boolean(doc.reporterEmail && !doc.unsubscribed),
    triage: { state: t.state ?? null, runs: t.runs || 1, lateDecidedAt: t.lateDecidedAt ?? null },
    issueNumber: t.state === 'held' ? null : doc.issueNumber ?? null,
    contactLog: (doc.contactLog || [])
      .filter((c) => c.direction === 'out' || c.issueComment !== 'held')
      .map((c) => ({ direction: c.direction || 'out', sentAt: c.sentAt, subject: c.subject || '', message: c.message || '' })),
    files: {
      errors: Boolean(doc.fileIds?.errors?.gridfsId),
      diagnostics: Boolean(doc.fileIds?.diagnostics?.gridfsId),
      images: (doc.fileIds?.images || []).length,
    },
  };
}

/** קובץ לבדיקה: errors | diagnostics | image-<n> (מ-0). בלי ה-dump (זיכרון התהליך). */
export async function loadTriageFile(reportId, kind, readFile) {
  if (kind === 'errors' || kind === 'diagnostics') return loadReportFile(reportId, kind, readFile);
  const m = /^image-(\d{1,2})$/.exec(String(kind));
  return m ? loadReportImage(reportId, Number(m[1]), readFile) : null;
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
  if (['timeout', 'forced'].includes(doc.triage?.state) && doc.issueNumber && !doc.triage.lateDecidedAt) {
    return applyLateDecision(doc, d, deps);
  }
  if (doc.triage?.state !== 'pending' || !doc.issuePending) {
    return { status: 409, body: { error: 'not_pending', ...statusOf(doc) } };
  }
  // ממתינים לתשובה רק כשאפשר באמת לשאול ולקבל תשובה; אחרת — בספק פותחים
  if (d.awaitingReply && !canAsk(doc, deps)) Object.assign(d, { action: 'open', awaitingReply: false });

  const decided = {
    ...doc.triage, state: d.action === 'open' ? 'opened' : 'held', decidedAt: now, verdict: d.verdict, confidence: d.confidence,
    summary: d.summary, questions: d.questions.length ? d.questions : undefined, awaitingReply: d.awaitingReply,
    linkedIssue: d.linkIssue, questionsSentAt: null, note: d.note,
    // נפתח: פענוח ושיוך ב-issue, אחרי הפרסום
    followUp: d.action === 'open' ? OPEN_FOLLOW_UP : null,
  };
  // ה-cron אולי כבר התחיל לפרסם (deadline עבר): לא נוגעים בדיווח שבנעילה
  const claim = { reportId, 'triage.state': 'pending', issuePending: true, $or: [{ issueLeaseUntil: null }, { issueLeaseUntil: { $lt: new Date() } }] };

  if (d.action === 'open') {
    const claimed = await AppReport.updateOne(claim, { $set: { triage: decided } });
    if (!claimed.modifiedCount) return { status: 409, body: { error: 'not_pending', ...statusOf(await AppReport.findOne({ reportId }).lean()) } };
    const published = await publishReport(reportId, deps);
    await followUp(published, deps);
    const mail = await sendQuestions(published, d.questions, deps);
    await commentQuestions(published, mail, deps);
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
      $set: { ...UNLINKED, issuePending: true, 'triage.state': 'opened', 'triage.awaitingReply': false, 'triage.followUp': OPEN_FOLLOW_UP },
    });
    const published = await publishReport(reportId, deps);
    await followUp(published, deps);
    return { status: 200, body: { ok: true, ...statusOf(published), questionsSent: false } };
  }
  // המדווח השיב בזמן שהבדיקה רצה (קריאה טרייה, אחרי ההחלטה): בודקים שוב עם התשובה
  const fresh = await AppReport.findOne({ reportId }).select('contactLog').lean();
  const answeredMeanwhile = (fresh?.contactLog || []).some((c) => c.direction === 'in' && c.issueComment === 'triage'
    && c.sentAt && doc.triage.requestedAt && new Date(c.sentAt) > new Date(doc.triage.requestedAt));
  const retriage = answeredMeanwhile && await requestRetriage(reportId, deps);
  return { status: 200, body: { ok: true, ...statusOf(await AppReport.findOne({ reportId }).lean()), questionsSent: mail.sent, retriage } };
}

const OPEN_FOLLOW_UP = Object.freeze({ status: 'pending', assign: true, close: null, duplicateOf: null });

/** הפענוח, השיוך והסגירה ב-GitHub — כשיש כבר issue; אחרת ה-cron ישלים אחרי שייפתח. */
async function followUp(doc, deps) {
  if (!doc?.issueNumber || doc.triage?.followUp?.status !== 'pending') return;
  const github = githubFor(deps, productOf(doc));
  if (github) await runTriageFollowUp(doc.reportId, github, deps);
}

async function commentQuestions(doc, mail, deps) {
  if (!mail.sent || !doc?.issueNumber) return;
  const github = githubFor(deps, productOf(doc));
  await github?.createComment(doc.issueNumber, buildOutboundComment({ reportId: doc.reportId, subject: mail.subject, message: mail.message }))
    .catch((err) => console.error(`App report ${doc.reportId}: triage contact comment failed:`, err?.message));
}

// סגירה לפי ההחלטה, כשהדיווח כבר נפתח בלי החלטה. fix_pending — נשאר פתוח עד שה-PR ימוזג.
const LATE_CLOSE = { fixed: 'completed', external: 'not_planned', no_info: 'not_planned', duplicate: 'duplicate' };

/**
 * החלטה על דיווח שכבר נפתח (השירות לא ענה בזמן, או נפתח ידנית): פענוח ב-issue, ושיוך או סגירה.
 * issue שנפתח ידנית, או משותף לדיווחים אחרים — פענוח בלבד.
 */
async function applyLateDecision(doc, d, deps) {
  const now = deps.now || new Date();
  const shared = doc.triage.state === 'forced' || doc.mergedIntoExisting;
  const close = shared || d.action === 'open' ? null : LATE_CLOSE[d.verdict] || null;
  const plan = {
    status: 'pending',
    assign: !shared && d.action === 'open',
    close: close === 'duplicate' && !d.linkIssue ? null : close,
    duplicateOf: close === 'duplicate' ? d.linkIssue : null,
  };
  const claimed = await AppReport.updateOne(
    { reportId: doc.reportId, 'triage.state': doc.triage.state, 'triage.lateDecidedAt': null },
    { $set: {
      'triage.lateDecidedAt': now, 'triage.verdict': d.verdict, 'triage.confidence': d.confidence, 'triage.summary': d.summary,
      'triage.note': d.note, 'triage.questions': d.questions.length ? d.questions : undefined, 'triage.followUp': plan,
    } },
  );
  if (!claimed.modifiedCount) return { status: 409, body: { error: 'not_pending', ...statusOf(await AppReport.findOne({ reportId: doc.reportId }).lean()) } };
  const current = await AppReport.findOne({ reportId: doc.reportId }).lean();
  await followUp(current, deps);
  const mail = d.action === 'open' ? await sendQuestions(current, d.questions, deps) : { sent: false };
  await commentQuestions(current, mail, deps);
  return { status: 200, body: { ok: true, ...statusOf(await AppReport.findOne({ reportId: doc.reportId }).lean()), late: true, questionsSent: mail.sent } };
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
