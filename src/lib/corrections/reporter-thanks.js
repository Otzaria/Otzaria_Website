/**
 * מייל תודה למדווח כשמתנדב אישר את התיקון שהציע, או מצא שהוא כבר תוקן במקור.
 * התראה בלבד — כשל כאן אינו נוגע באישור.
 */
import ErrorReport from '../../models/ErrorReport.js';
import { validateEmail } from '../validation-utils.js';
import { DEFAULT_SENDER_EMAIL } from '../errorReportLogic.js';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../app-reports/unsubscribe.js';

export const THANKS_UNSUBSCRIBE_PURPOSE = 'corrections-thanks-unsubscribe';
const PUBLIC_SITE_URL = 'https://otzaria.org';

export function getThanksConfig(env = process.env) {
  return {
    siteUrl: (env.NEXTAUTH_URL || PUBLIC_SITE_URL).replace(/\/+$/, ''),
    unsubscribeSecret: env.NEXTAUTH_SECRET || null,
  };
}

/** כתובת המדווח, או null כשאין למי לשלוח (כתובת ברירת המחדל של דיווח בלי מייל). */
export function thanksRecipient(report) {
  const email = typeof report?.senderEmail === 'string' ? report.senderEmail.trim() : '';
  if (!email || email.toLowerCase() === DEFAULT_SENDER_EMAIL) return null;
  return validateEmail(email).isValid ? email : null;
}

export function buildThanksUnsubscribeUrl(siteUrl, reportId, secret) {
  const token = createUnsubscribeToken(reportId, secret, THANKS_UNSUBSCRIBE_PURPOSE);
  return `${String(siteUrl).replace(/\/+$/, '')}/api/corrections/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * שולח את מייל התודה פעם אחת לדיווח. התפיסה האטומית של reporterThanks.sentAt לפני השליחה
 * מונעת מייל כפול; כשל שליחה משחרר אותה כדי שאישור חוזר ינסה שוב.
 * @param {{id:string, kind?:'approved'|'already_fixed', sendMail:Function, config?:object, now?:Date}} args
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
export async function sendApprovalThanks({ id, kind = 'approved', sendMail, config = getThanksConfig(), now = new Date() }) {
  const report = await ErrorReport.findById(id).select('reportId senderEmail bookTitle currentRef reporterThanks').lean();
  if (!report) return { sent: false, reason: 'not_found' };
  if (report.reporterThanks?.sentAt) return { sent: false, reason: 'already_sent' };
  const to = thanksRecipient(report);
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (await ErrorReport.exists({ senderEmail: report.senderEmail, reporterUnsubscribed: true })) return { sent: false, reason: 'unsubscribed' };

  const claimed = await ErrorReport.findOneAndUpdate(
    { _id: report._id, 'reporterThanks.sentAt': null },
    { $set: { 'reporterThanks.sentAt': now } },
  ).lean();
  if (!claimed) return { sent: false, reason: 'already_sent' };

  const release = () => ErrorReport.updateOne({ _id: report._id, 'reporterThanks.sentAt': now }, { $set: { 'reporterThanks.sentAt': null } });
  let result;
  try {
    const unsubscribeUrl = config.unsubscribeSecret ? buildThanksUnsubscribeUrl(config.siteUrl, report.reportId, config.unsubscribeSecret) : null;
    result = await sendMail({ to, kind, bookTitle: report.bookTitle, currentRef: report.currentRef, unsubscribeUrl });
  } catch (e) {
    result = { sent: false, error: e?.message };
  }
  if (!result?.sent) {
    await release();
    return { sent: false, reason: 'send_failed' };
  }
  return { sent: true };
}

/** מתזמן את מייל התודה אחרי התשובה למתנדב. best-effort: כשל נרשם בלוג בלבד. */
export function scheduleApprovalThanks(deps, id, kind = 'approved') {
  if (typeof deps?.schedule !== 'function' || typeof deps?.sendThanksMail !== 'function') return;
  const fail = (e) => console.error('[corrections-thanks] send failed:', e?.message);
  try {
    deps.schedule(async () => {
      try {
        await sendApprovalThanks({ id, kind, sendMail: deps.sendThanksMail, config: deps.thanksConfig });
      } catch (e) {
        fail(e);
      }
    });
  } catch (e) {
    fail(e);
  }
}

/** הסרה מקישור במייל: מסמן את כל הדיווחים של אותה כתובת, כולל עתידיים (נבדק בשליחה). */
export async function unsubscribeReporterByToken(token, secret) {
  const reportId = verifyUnsubscribeToken(token, secret, THANKS_UNSUBSCRIBE_PURPOSE);
  if (!reportId) return { ok: false, reason: 'invalid_token' };
  const doc = await ErrorReport.findOne({ reportId }).select('senderEmail').lean();
  if (!doc) return { ok: false, reason: 'not_found' };
  await ErrorReport.updateMany({ senderEmail: doc.senderEmail }, { $set: { reporterUnsubscribed: true } });
  return { ok: true };
}
