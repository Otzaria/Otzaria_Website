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
import { PR_CLOSED_HANDOFF, CLOSED_PR_ACTION, closedPrAction, handoffReasonOf, absorptionDeadline } from './absorption.js';
import { createAbsorptionChecker, applyClosedPrAction, fetchCloseComment } from './closed-pr.js';
import { logEvent } from './store.js';

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
  'manual.handoffReason': { $in: ['publish_failed', ...Object.values(PR_CLOSED_HANDOFF)] },
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
 * PR שסומן בתווית דחייה (config.publish.rejectedLabels) → ידני מיד, בלי בדיקת תוכן. בדיווח שמתנדב
 * מטפל בו כעת (שיוך בתוקף) לא נוגעים. כשהפרסום כבוי לא מעבירים להמתנה (מעקב ה-PR לא יבדוק אותם).
 * כל מעבר נרשם ביומן עם data.migration ו-data.before — לביטול ב-revertClosedPullMigration.
 * @param {{config:object, deps?:{githubFetch?:Function, retryDelayMs?:number, hooks?:{beforeWrite?:Function}}, apply?:boolean, now?:Date, rows?:Array}} args
 *   rows — מערך שאליו נוספת שורה לכל דיווח (בלי פרטים אישיים), ל---out של הסקריפט
 */
export async function migrateClosedPullReports({ config, deps = {}, apply = false, now = new Date(), rows = null }) {
  const result = {
    apply, mainSha: null, publishMode: config.publish.mode, candidates: 0, skippedClaimed: 0, files: 0, rejectedLabeled: 0,
    outcomes: {}, details: {}, actions: {}, anchored: { yes: 0, no: 0 }, written: {}, unchanged: 0, raced: 0,
    skipped: { awaitPublishDisabled: 0 }, errors: 0, errorSamples: [],
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
  // תוויות דחייה: קריאה אחת לכל תווית (Issues API), לא קריאה לכל PR.
  const rejected = new Set();
  for (const label of config.publish.rejectedLabels || []) {
    for (const n of await retrying(() => checker.client.listClosedPullNumbersWithLabel(label), retryDelayMs)) rejected.add(n);
  }

  // איתור היעד של כל דיווח (מהחבילה, או מההצעה בעזרת ה-resolver), ואז קיבוץ לפי קובץ.
  const byPath = new Map();
  const settled = [];
  for (const r of reports) {
    if (rejected.has(r.publish.prNumber)) {
      settled.push({ r, verdict: null, rejected: true });
      continue;
    }
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
      for (const { r, found } of items) settled.push({ r, verdict: await checker.evaluate(found, file) });
    } catch (err) {
      fail(items.length, err);
    } finally {
      await checker.forget(path);
    }
  }

  const graceSeconds = config.publish.absorptionGraceSeconds;
  const pulls = new Map();
  const commentOf = (n) => {
    if (!pulls.has(n)) {
      pulls.set(n, checker.client.getPull(n).then((pr) => fetchCloseComment(checker.client, pr)).catch(() => null));
    }
    return pulls.get(n);
  };
  for (const { r, verdict, rejected: isRejected } of settled) {
    const closedAt = r.publish.prClosedAt || r.publish.updatedAt || now;
    const action = isRejected ? CLOSED_PR_ACTION.HANDOFF_REJECTED : closedPrAction(verdict, { closedAt, now, graceSeconds });
    if (isRejected) result.rejectedLabeled += 1;
    else {
      count(result.outcomes, verdict.outcome);
      count(result.details, `${verdict.outcome}:${verdict.detail}`);
      result.anchored[verdict.anchored ? 'yes' : 'no'] += 1;
    }
    count(result.actions, action);
    const row = rows && {
      id: String(r._id), pr: r.publish.prNumber, path: verdict?.path ?? null, lineIndex: verdict?.lineIndex ?? null, outcome: verdict?.outcome ?? null,
      detail: isRejected ? 'rejected_label' : verdict.detail, anchored: Boolean(verdict?.anchored), action, closedAt,
      deadline: absorptionDeadline(closedAt, graceSeconds), written: null,
    };
    if (row) rows.push(row);
    const sameReason = r.manual?.handoffReason === handoffReasonOf(action);
    // ממתין רק כשמעקב ה-PR רץ: כשהפרסום כבוי, דיווח שהיה עובר להמתנה נשאר בתור הידני.
    if (action === CLOSED_PR_ACTION.AWAIT && config.publish.mode === 'disabled') {
      result.skipped.awaitPublishDisabled += 1;
      if (row) row.written = 'skipped_publish_disabled';
      continue;
    }
    if (!apply) {
      if (sameReason) result.unchanged += 1;
      continue;
    }
    // הערת הסגירה של מנהל הספרייה נשמרת רק לדיווחים שנשארים פתוחים (להצגה למתנדב).
    const comment = action !== CLOSED_PR_ACTION.CLOSE_ABSORBED && !sameReason ? await commentOf(r.publish.prNumber) : null;
    if (deps.hooks?.beforeWrite) await deps.hooks.beforeWrite(r);
    const res = await applyClosedPrAction(r, action, verdict, {
      now, closedAt, graceSeconds, actor: MIGRATION_ACTOR, comment, data: { migration: true },
      filter: { 'publish.lastError': 'pr_closed_unmerged', $or: [{ 'manual.status': { $ne: 'claimed' } }, { 'manual.leaseExpiresAt': { $lte: now } }] },
    });
    if (row) row.written = res;
    if (res === 'unchanged') result.unchanged += 1;
    else if (res === 'raced') result.raced += 1;
    else count(result.written, action);
  }
  return result;
}

// השדות שה-migration מוסיפה; בביטול הם נמחקים.
const MIGRATION_FIELDS = ['publish.absorbed', 'publish.prClosedAt', 'publish.absorptionDeadline', 'publish.absorptionCheck', 'publish.prCloseComment'];

/** data.before (beforeSnapshot) → $set בנתיבים מנוקדים. */
function restoreSet(before) {
  const set = {};
  for (const [k, v] of Object.entries(before || {})) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype) for (const [kk, vv] of Object.entries(v)) set[`${k}.${kk}`] = vv ?? null;
    else set[k] = v ?? null;
  }
  return set;
}

/**
 * ביטול ה-migration של PR שנסגרו: כל דיווח שה-migration העבירה ושלא השתנה מאז (ה-workflowGeneration שלו
 * הוא זה של אירוע ה-migration האחרון) חוזר למצב שלפני השרשרת הרציפה של מעברי ה-migration שלו (data.before
 * של הראשון בה). ברירת מחדל dry-run; אידמפוטנטי. מעברים של מעקב ה-PR עצמו (בלי data.migration) אינם מבוטלים.
 */
export async function revertClosedPullMigration({ apply = false } = {}) {
  const result = { apply, events: 0, reports: 0, revertible: 0, reverted: 0, skippedChanged: 0 };
  const events = await CorrectionEvent.find({ 'data.migration': true, 'data.before': { $exists: true } }).sort({ createdAt: -1, _id: -1 }).lean();
  result.events = events.length;
  const byReport = new Map();
  for (const ev of events) (byReport.get(String(ev.report)) || byReport.set(String(ev.report), []).get(String(ev.report))).push(ev);
  for (const [id, evs] of byReport) {
    result.reports += 1;
    const current = await ErrorReport.findById(id).select('workflowGeneration').lean();
    if (!current || current.workflowGeneration !== evs[0].generation) {
      result.skippedChanged += 1;
      continue;
    }
    // הרצות חוזרות: כל מעבר ממשיך את הקודם (generation שלו = נקודת המוצא של הבא) — חוזרים לפני הראשון.
    let first = evs[0];
    for (const ev of evs.slice(1)) {
      if (ev.generation !== first.data.fromGeneration) break;
      first = ev;
    }
    result.revertible += 1;
    if (!apply) continue;
    const updated = await ErrorReport.findOneAndUpdate(
      { _id: id, workflowGeneration: evs[0].generation },
      { $set: restoreSet(first.data.before), $unset: Object.fromEntries(MIGRATION_FIELDS.map((f) => [f, 1])), $inc: { workflowGeneration: 1 } },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) {
      result.skippedChanged += 1;
      continue;
    }
    result.reverted += 1;
    await logEvent(updated._id, 'migration_reverted', MIGRATION_ACTOR, updated.workflowGeneration, { revertedEvents: evs.slice(0, evs.indexOf(first) + 1).map((e) => e.type) });
  }
  return result;
}
