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
import { PR_CLOSED_HANDOFF, closedPrAction, handoffReasonOf } from './absorption.js';
import { createAbsorptionChecker, applyClosedPrAction } from './closed-pr.js';

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

// דיווחים שה-PR שלהם נסגר בלי מיזוג וכבר בתור הידני: מהמעקב הישן (publish_failed) או מהחדש.
export const CLOSED_PR_FAILED_FILTER = Object.freeze({
  state: 'open', 'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged', 'publish.prNumber': { $type: 'number' },
  'manual.handoffReason': { $in: ['publish_failed', PR_CLOSED_HANDOFF.NOT_ABSORBED, PR_CLOSED_HANDOFF.CHANGED] },
});
const MIGRATION_ACTOR = Object.freeze({ kind: 'system' });
const count = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

// תקלת GitHub זמנית (רשת, 429, 5xx) לא אמורה להפיל הרצה של מאות קריאות: עד שני ניסיונות נוספים.
const isTransient = (err) => !err?.status || err.status === 429 || err.status >= 500;
async function retrying(fn, delayMs) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 3 || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

/**
 * הערכה מחדש, לפי אותו כלל של מעקב ה-PR (closed-pr.js), של דיווחים שהועברו לידני כי ה-PR שלהם נסגר
 * בלי מיזוג. ברירת מחדל dry-run; אידמפוטנטית (הרצה חוזרת קולטת גם תיקונים שהגיעו ל-main מאוחר).
 * כל הדיווחים מושווים לאותו קומיט של main; הקריאות מ-GitHub מקובצות לפי קובץ — כל קובץ נקרא פעם אחת.
 * תחילת ההמתנה: מתי שהסגירה זוהתה (publish.prClosedAt, ובדיווחים מהמעקב הישן — publish.updatedAt).
 * בדיווח שמתנדב מטפל בו כעת (שיוך בתוקף) לא נוגעים.
 */
export async function migrateClosedPullReports({ config, deps = {}, apply = false, now = new Date() }) {
  const result = {
    apply, mainSha: null, candidates: 0, skippedClaimed: 0, files: 0,
    outcomes: {}, details: {}, actions: {}, written: {}, unchanged: 0, raced: 0, errors: 0, errorSamples: [],
  };
  const all = await ErrorReport.find(CLOSED_PR_FAILED_FILTER).lean();
  result.candidates = all.length;
  const reports = all.filter((r) => !(r.manual?.status === 'claimed' && r.manual.leaseExpiresAt && new Date(r.manual.leaseExpiresAt) > now));
  result.skippedClaimed = all.length - reports.length;
  if (!reports.length) return result;

  const checker = createAbsorptionChecker({ config, deps });
  const retryDelayMs = deps.retryDelayMs ?? 2000;
  result.mainSha = (await retrying(() => checker.head(), retryDelayMs)).commitSha;
  const ids = [...new Set(reports.map((r) => r.publish?.changeId).filter(Boolean))];
  const packages = new Map((await ChangePackage.find({ changeId: { $in: ids } }).lean()).map((p) => [p.changeId, p]));
  const fail = (n, err) => {
    result.errors += n;
    if (result.errorSamples.length < 5) result.errorSamples.push(err?.status ? `github_${err.status}` : String(err?.message || err).slice(0, 120));
  };

  // איתור היעד של כל דיווח (מהחבילה, או מההצעה בעזרת ה-resolver), ואז קיבוץ לפי קובץ.
  const byPath = new Map();
  const settled = [];
  for (const r of reports) {
    try {
      const found = await retrying(() => checker.change(r, packages), retryDelayMs);
      if (found.error) settled.push({ r, verdict: await checker.unresolved(found) });
      else (byPath.get(found.path) || byPath.set(found.path, []).get(found.path)).push({ r, found });
    } catch (err) {
      fail(1, err);
    }
  }
  result.files = byPath.size;
  for (const [path, items] of byPath) {
    let file;
    try {
      file = await retrying(() => checker.file(path), retryDelayMs);
    } catch (err) {
      fail(items.length, err);
      continue;
    }
    for (const { r, found } of items) settled.push({ r, verdict: await checker.evaluate(found, file) });
  }

  for (const { r, verdict } of settled) {
    const closedAt = r.publish.prClosedAt || r.publish.updatedAt || now;
    const action = closedPrAction(verdict, { closedAt, now, graceSeconds: config.publish.absorptionGraceSeconds });
    count(result.outcomes, verdict.outcome);
    count(result.details, `${verdict.outcome}:${verdict.detail}`);
    count(result.actions, action);
    if (!apply) {
      // כבר בתור הידני עם אותה סיבה — אין מה לכתוב.
      if (r.manual?.handoffReason === handoffReasonOf(action)) result.unchanged += 1;
      continue;
    }
    const res = await applyClosedPrAction(r, action, verdict, {
      now, closedAt, actor: MIGRATION_ACTOR, data: { migration: true },
      filter: { 'publish.lastError': 'pr_closed_unmerged', $or: [{ 'manual.status': { $ne: 'claimed' } }, { 'manual.leaseExpiresAt': { $lte: now } }] },
    });
    if (res === 'unchanged') result.unchanged += 1;
    else if (res === 'raced') result.raced += 1;
    else count(result.written, action);
  }
  return result;
}
