/** משלוח שאלות שנשמר בתור לפני ההחלטה; ה-cron משחזר גם משלוח שנקטע באמצע. */
import AppReport from '../../models/AppReport.js';
import { buildReplyAddress, newReplyToken } from './inbound.js';
import { productOf } from './products.js';
import { UNLINKED, triageQuestionsMail } from './triage.js';

const QUESTIONS_LEASE_MS = 10 * 60 * 1000;
export const canAskTriageReporter = (doc, deps) => Boolean(doc.reporterEmail && !doc.unsubscribed && deps.config?.replyDomain && deps.sendContactMail);

/** הטוקן נוצר פעם אחת, גם כששתי פניות רצות במקביל. */
export async function ensureReplyToken(reportId) {
  const created = await AppReport.findOneAndUpdate(
    { reportId, replyToken: { $exists: false } },
    { $set: { replyToken: newReplyToken() } },
    { returnDocument: 'after' },
  ).select('replyToken').lean();
  if (created?.replyToken) return created.replyToken;
  const doc = await AppReport.findOne({ reportId }).select('replyToken').lean();
  return doc?.replyToken ?? null;
}

export async function deliverTriageQuestions(reportId, deps) {
  const leaseNow = new Date();
  const doc = await AppReport.findOneAndUpdate({
    reportId, 'triage.questionsPending': true,
    $or: [{ 'triage.questionsLeaseUntil': null }, { 'triage.questionsLeaseUntil': { $lt: leaseNow } }],
  }, { $set: { 'triage.questionsLeaseUntil': new Date(leaseNow.getTime() + QUESTIONS_LEASE_MS) } }, { returnDocument: 'after' }).lean();
  if (!doc) return { sent: false };
  const guard = { reportId, 'triage.runs': doc.triage.runs, 'triage.decidedAt': doc.triage.decidedAt };
  const { subject, message } = triageQuestionsMail(doc.triage.questions || []);
  let sent = Boolean(doc.triage.questionsSentAt);
  try {
    if (!sent && canAskTriageReporter(doc, deps) && doc.triage.questions?.length) {
      const replyTo = buildReplyAddress(doc.replyToken || await ensureReplyToken(reportId), deps.config.replyDomain);
      if (!replyTo) throw new Error('כתובת המענה אינה זמינה');
      const result = await deps.sendContactMail({
        to: doc.reporterEmail, subject, message, reportTitle: doc.title, issueUrl: doc.issueUrl || null, replyTo, product: productOf(doc),
      });
      if (!result?.sent) throw new Error(result?.reason || 'משלוח השאלות נכשל');
      const now = deps.now || new Date();
      await AppReport.updateOne(guard, {
        $push: { contactLog: { direction: 'out', byUserId: null, byName: 'בדיקה אוטומטית', subject, message, sentAt: now } },
        $set: { 'triage.questionsSentAt': now },
      });
      sent = true;
    }
  } catch (error) {
    console.error(`App report ${reportId}: triage questions failed:`, error?.message);
  }
  // גם יצירת טוקן או שמירת ההיסטוריה עלולות להיכשל. לא משאירים דיווח מחכה למייל שלא הושלם.
  await AppReport.updateOne(guard, { $set: {
    'triage.questionsPending': false, 'triage.questionsLeaseUntil': null,
    ...(!sent && doc.triage.awaitingReply && doc.triage.state === 'held' ? {
      ...UNLINKED, issuePending: true, 'triage.state': 'opened', 'triage.awaitingReply': false,
      'triage.followUp': { status: 'pending', assign: true, close: null, duplicateOf: null },
    } : {}),
  } });
  return { sent, subject, message, issueNumber: doc.issueNumber };
}
