/**
 * מעבר מצב של issue (מה-webhook, וה-cron כגיבוי): עדכון הדיווחים המקושרים
 * ומייל סגירה פעם אחת לכל מדווח. פתיחה מחדש מאפסת כדי שסגירה הבאה תשלח שוב.
 */
import AppReport from '../../models/AppReport.js';
import { buildUnsubscribeUrl } from './unsubscribe.js';

export const CLOSURE_KINDS = Object.freeze(['completed', 'not_planned', 'duplicate', 'other']);

export function closureKind(stateReason) {
  return ['completed', 'not_planned', 'duplicate'].includes(stateReason) ? stateReason : 'other';
}

export const CLOSURE_TEXT_HE = Object.freeze({
  completed: 'הבעיה שדיווחת עליה טופלה. התיקון ייכלל בגרסה הבאה של אוצריא (אם עוד לא נכלל).',
  not_planned: 'הדיווח נבדק, והוחלט שלא לטפל בו בשלב זה.',
  duplicate: 'הדיווח נסגר כי הבעיה כבר מטופלת בדיווח אחר.',
  other: 'הדיווח נסגר.',
});

/**
 * מי מקבל מייל: יש מייל, לא הסיר את עצמו, וטרם קיבל הודעה על הסגירה הזו. מייל אחד לכל כתובת.
 * @returns {{email:string, reports:object[]}[]}
 */
export function planClosureNotifications(reports) {
  const byEmail = new Map();
  for (const r of reports) {
    if (!r.reporterEmail || r.unsubscribed || r.notifiedClosedAt) continue;
    const key = r.reporterEmail.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email: key, reports: [] });
    byEmail.get(key).reports.push(r);
  }
  return [...byEmail.values()];
}

/**
 * @param {{number:number, state:string, state_reason?:string|null, url?:string}} issue
 * @param {{sendClosedMail:Function, config:object, now?:Date, Model?:object}} deps
 * @returns {Promise<{transition:string, notified:number, failed:number}>}
 */
export async function handleIssueStateChange(issue, deps) {
  const Model = deps.Model || AppReport;
  const now = deps.now || new Date();
  const filter = { issueNumber: issue.number };

  if (issue.state !== 'closed') {
    await Model.updateMany(filter, { $set: { issueState: 'open', issueStateReason: null, notifiedClosedAt: null, issueCheckedAt: now } });
    return { transition: 'open', notified: 0, failed: 0 };
  }

  const reason = issue.state_reason ?? null;
  await Model.updateMany(filter, { $set: { issueState: 'closed', issueStateReason: reason, issueCheckedAt: now } });

  const reports = await Model.find({ ...filter, notifiedClosedAt: null, unsubscribed: { $ne: true }, reporterEmail: { $nin: [null, ''] } })
    .select('_id reportId title reporterEmail unsubscribed notifiedClosedAt')
    .sort({ createdAt: 1 })
    .lean();

  let notified = 0;
  let failed = 0;
  for (const group of planClosureNotifications(reports)) {
    const ids = group.reports.map((r) => r._id);
    // תפיסה אטומית לפני השליחה: ריצה מקבילה לא תשלח שוב
    const claim = await Model.updateMany({ _id: { $in: ids }, notifiedClosedAt: null }, { $set: { notifiedClosedAt: now } });
    if (!claim.modifiedCount) continue;

    const first = group.reports[0];
    const kind = closureKind(reason);
    let result;
    try {
      result = await deps.sendClosedMail({
        to: group.email,
        reportTitle: first.title,
        issueNumber: issue.number,
        issueUrl: issue.url || null,
        reasonKind: kind,
        reasonText: CLOSURE_TEXT_HE[kind],
        unsubscribeUrl: deps.config?.unsubscribeSecret
          ? buildUnsubscribeUrl(deps.config.siteUrl, first.reportId, deps.config.unsubscribeSecret)
          : null,
      });
    } catch (err) {
      result = { sent: false, error: err?.message };
    }
    if (result?.sent) {
      notified += 1;
    } else {
      failed += 1;
      await Model.updateMany({ _id: { $in: ids }, notifiedClosedAt: now }, { $set: { notifiedClosedAt: null } });
    }
  }
  return { transition: 'closed', notified, failed };
}
