/**
 * migration תואמת-לאחור של דיווחים ישנים למודל התיקונים. אידמפוטנטית: נוגעת רק במסמכים
 * בלי state, מוסיפה שדות בלבד, לא מוחקת ולא משנה שדות קיימים (status/emailSent וכו').
 * בנוסף משלימה/מתקנת את מפתח מיון הגרסה הנגזר בכל הדיווחים, בלי לשנות updatedAt.
 */
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import { NON_OTZARIA_SOURCE_FOLDER_RE } from './report-email.js';
import { libraryVersionKeyExpr, LIBRARY_VERSION_SORT_SCHEMA } from './listSort.js';

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
    // דיווח שהמייל שלו לא הגיע לאוצריא (ספריא) אינו נכנס לתור.
    { filter: { state: { $exists: false }, status: { $nin: ['resolved', 'rejected'] }, sourceFolder: NON_OTZARIA_SOURCE_FOLDER_RE }, set: { ...COMMON, state: 'email_only', 'manual.status': 'none' } },
    { filter: { state: { $exists: false }, status: { $nin: ['resolved', 'rejected'] }, sourceFolder: { $not: NON_OTZARIA_SOURCE_FOLDER_RE } }, set: { ...COMMON, state: 'open', 'manual.status': 'queued', 'manual.handoffReason': 'legacy_report', 'manual.queuedAt': { $ifNull: ['$createdAt', '$$NOW'] } } },
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
  // Explicit maintenance only, never startup/request work. Re-check the computed value too:
  // rerunning after a rollback repairs keys left stale by an older writer.
  const versionKey = libraryVersionKeyExpr();
  const versionFilter = { $or: [
    { libraryVersionSortSchema: { $ne: LIBRARY_VERSION_SORT_SCHEMA } },
    { $expr: { $ne: ['$libraryVersionSortKey', versionKey] } },
  ] };
  result.versionSort = { matched: await col.countDocuments(versionFilter), modified: 0 };
  if (apply) {
    result.versionSort.modified = (await col.updateMany(versionFilter, [{ $set: {
      libraryVersionSortKey: versionKey, libraryVersionSortSchema: LIBRARY_VERSION_SORT_SCHEMA,
    } }])).modifiedCount;
    // createIndexes (לא syncIndexes): לא מוחק אינדקסים קיימים שאינם בסכמה.
    for (const m of [ErrorReport, CorrectionJob, ChangePackage, PublishAttempt, WorkerHeartbeat, CorrectionEvent]) await m.createIndexes();
  }
  return result;
}
