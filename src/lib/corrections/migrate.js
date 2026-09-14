/**
 * migration תואמת-לאחור של דיווחים ישנים למודל התיקונים. אידמפוטנטית: נוגעת רק במסמכים
 * בלי state, מוסיפה שדות בלבד, לא מוחקת ולא משנה שדות קיימים (status/emailSent וכו').
 */
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';

const COMMON = {
  schemaVersion: { $ifNull: ['$schemaVersion', 1] },
  reportKind: { $ifNull: ['$reportKind', 'free_text'] },
  currentRevision: { $ifNull: ['$currentRevision', 0] },
  workflowGeneration: { $ifNull: ['$workflowGeneration', 0] },
  'verification.status': 'not_requested',
  'approval.authority': 'none',
  'approval.scope': 'none',
  'publish.status': 'not_ready',
  'inclusion.status': 'unknown',
};

export async function migrateLegacyReports({ apply = false } = {}) {
  const col = ErrorReport.collection;
  const groups = [
    { filter: { state: { $exists: false }, status: { $nin: ['resolved', 'rejected'] } }, set: { ...COMMON, state: 'open', 'manual.status': 'queued', 'manual.handoffReason': 'legacy_report', 'manual.queuedAt': { $ifNull: ['$createdAt', '$$NOW'] } } },
    { filter: { state: { $exists: false }, status: 'resolved' }, set: { ...COMMON, state: 'closed_manual', 'manual.status': 'none', closeReason: 'legacy_closed' } },
    { filter: { state: { $exists: false }, status: 'rejected' }, set: { ...COMMON, state: 'closed_rejected', 'manual.status': 'none', closeReason: 'legacy_closed' } },
  ];
  const result = { apply, matched: 0, modified: 0, byGroup: [] };
  for (const g of groups) {
    const n = await col.countDocuments(g.filter);
    let modified = 0;
    if (apply && n) modified = (await col.updateMany(g.filter, [{ $set: g.set }])).modifiedCount;
    result.byGroup.push({ state: g.set.state, matched: n, modified });
    result.matched += n;
    result.modified += modified;
  }
  if (apply) {
    // createIndexes (לא syncIndexes): לא מוחק אינדקסים קיימים שאינם בסכמה.
    for (const m of [ErrorReport, CorrectionJob, ChangePackage, PublishAttempt, WorkerHeartbeat, CorrectionEvent]) await m.createIndexes();
  }
  return result;
}
