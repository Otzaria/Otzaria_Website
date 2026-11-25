/**
 * דיווח שה-PR שלו נסגר בלי מיזוג: קריאת הקובץ מ-main (קריאה בלבד) והמעבר המותנה שנגזר ממנה
 * (הכלל עצמו — absorption.js). משמש את מעקב ה-PR ב-worker ואת ה-migration של דיווחים ישנים.
 */
import ErrorReport from '../../models/ErrorReport.js';
import ChangePackage from '../../models/ChangePackage.js';
import { createRepoClient } from '../dicta/github-api.js';
import { createGitSource, getSharedSourceCache } from './git-source.js';
import { resolveSource } from './resolver.js';
import { computeNewLine } from './payload.js';
import { ABSORPTION, PR_CLOSED_HANDOFF, CLOSED_PR_ACTION, evaluateAbsorption, handoffReasonOf } from './absorption.js';
import { currentRevisionOf, logEvent, manualQueueSet } from './store.js';

export function sourceGitFor(config, deps = {}) {
  const client = createRepoClient({ repo: config.source.repo, token: config.source.token || null, fetchImpl: deps.githubFetch || fetch });
  return createGitSource({ client, ref: config.source.ref, cache: getSharedSourceCache(config.cacheBytes) });
}

/** גרסת ההצעה שאושרה (ואם אינה ידועה — הנוכחית). */
function approvedRevisionOf(r) {
  const n = r.approval?.revision;
  return (Number.isSafeInteger(n) && r.proposals?.find((p) => p.revision === n)) || currentRevisionOf(r);
}

/**
 * השינוי שה-PR נשא: מחבילת השינוי, ואם אין חבילה (דיווחים שאושרו בכמות מחוץ ל-worker) — מההצעה
 * שאושרה, בנתיב שה-resolver מאתר באותו קומיט של main.
 * @param {{gitSource:object, head:{commitSha:string}, source:{repo:string, ref:string}, packages?:Map<string, object>}} ctx
 * @returns {Promise<{path:string, lineIndex:(number|null), originalLine:string, newLine:string, from:'package'|'proposal'} | {error:string}>}
 */
export async function closedPrChange(report, { gitSource, head, source, packages }) {
  const changeId = report.publish?.changeId;
  if (changeId) {
    const pkg = packages ? packages.get(changeId) : await ChangePackage.findOne({ changeId }).lean();
    if (pkg) return { path: pkg.path, lineIndex: pkg.lineIndex, originalLine: pkg.originalLine, newLine: pkg.newLine, from: 'package' };
  }
  const rev = approvedRevisionOf(report);
  const newLine = computeNewLine(rev);
  if (!rev || newLine === null) return { error: 'no_proposal' };
  const override = rev.targetPath ? { path: rev.targetPath, lineIndex: rev.targetLineIndex, expectedLine: rev.originalLine } : null;
  const pinned = { ...gitSource, getHead: async () => head };
  const found = await resolveSource({ report, revision: rev, gitSource: pinned, source, override });
  if (!found.path) return { error: found.reason || found.status };
  return {
    path: found.path, lineIndex: override ? override.lineIndex : report.location?.lineIndex ?? null,
    originalLine: override ? override.expectedLine : rev.originalLine, newLine, from: 'proposal',
  };
}

/**
 * בודק מול קומיט אחד של main: הראש נקרא פעם אחת לכל בודק (אצווה / הרצת migration).
 * @param {{config:object, deps?:object}} opts
 */
export function createAbsorptionChecker({ config, deps = {} }) {
  const gitSource = sourceGitFor(config, deps);
  const relocationLines = config.publish.absorptionRelocationLines;
  let headPromise = null;
  // כשל בקריאת הראש אינו נשמר: הקריאה הבאה מנסה שוב.
  const head = () => (headPromise ??= gitSource.getHead().catch((err) => {
    headPromise = null;
    throw err;
  }));
  const change = async (report, packages) => closedPrChange(report, { gitSource, head: await head(), source: config.source, packages });
  // הקובץ ב-main (null כשאינו קיים); במטמון לפי blob — כמה דיווחים על אותו קובץ קוראים אותו פעם אחת.
  const file = async (path) => gitSource.getFile(path, (await head()).commitSha);
  /** התוצאה לשינוי שכבר אותר: evaluateAbsorption + הנתיב וה-sha של main שמולו נבדק. */
  const evaluate = async (found, f) => ({ ...evaluateAbsorption(f, found, { relocationLines }), path: found.path, from: found.from, mainSha: (await head()).commitSha });
  const unresolved = async (found) => ({ outcome: ABSORPTION.CHANGED, detail: found.error, lineIndex: null, relocated: false, path: null, mainSha: (await head()).commitSha });
  return {
    head,
    change,
    file,
    evaluate,
    unresolved,
    async check(report, packages) {
      const found = await change(report, packages);
      return found.error ? unresolved(found) : evaluate(found, await file(found.path));
    },
  };
}

// הדיווח יוצא מהתור הידני (המעקב הישן העביר אותו לשם) וממתין לקליטה ב-main.
const UNQUEUE_SET = {
  'manual.status': 'none', 'manual.handoffReason': null, 'manual.queuedAt': null, 'manual.assignee': null, 'manual.assigneeName': null,
  'manual.claimedAt': null, 'manual.leaseExpiresAt': null, status: 'pending', assignedTo: null,
};

/**
 * מחיל את המעבר בעדכון אטומי יחיד, מותנה ב-generation, במצב הפרסום ובמספר ה-PR שנקראו.
 * המקור: 'pr_opened' (מעקב ה-PR), או 'failed' — דיווח שמעקב ה-PR הישן כבר העביר לידני (migration).
 * @param {object} r הדיווח כפי שנקרא
 * @param {string} action CLOSED_PR_ACTION
 * @param {object} verdict תוצאת הבדיקה (evaluateAbsorption + path/mainSha)
 * @param {{now:Date, closedAt:Date, actor:object, filter?:object, data?:object}} opts
 * @returns {Promise<'closed'|'awaiting'|'handoff'|'unchanged'|'raced'>}
 */
export async function applyClosedPrAction(r, action, verdict, { now, closedAt, actor, filter = {}, data = {} }) {
  const queued = r.publish?.status === 'failed';
  const where = { _id: r._id, state: 'open', workflowGeneration: r.workflowGeneration, 'publish.status': r.publish?.status, 'publish.prNumber': r.publish?.prNumber, ...filter };
  const eventData = { prNumber: r.publish?.prNumber ?? null, mainSha: verdict.mainSha ?? null, path: verdict.path ?? null, lineIndex: verdict.lineIndex ?? null, detail: verdict.detail, ...data };
  let update;
  let event;
  let result;
  if (action === CLOSED_PR_ACTION.CLOSE_ABSORBED) {
    update = {
      $set: {
        state: 'closed_published', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'pr_absorbed', 'manual.status': 'none',
        ...(queued ? { 'manual.handoffReason': null } : {}), 'dispatch.publish': false,
        'publish.status': 'committed', 'publish.absorbed': true, 'publish.prClosedAt': closedAt, 'publish.lastError': null,
        'publish.conflictReason': null, 'publish.updatedAt': now, 'inclusion.status': 'merged_to_main', 'inclusion.at': now,
      },
      $inc: { workflowGeneration: 1 },
    };
    [event, result] = ['pr_absorbed', 'closed'];
    eventData.relocated = verdict.relocated;
  } else if (action === CLOSED_PR_ACTION.AWAIT) {
    const set = { 'publish.prClosedAt': closedAt, 'publish.lastError': null, 'publish.updatedAt': now };
    update = queued
      ? { $set: { ...set, ...UNQUEUE_SET, 'publish.status': 'pr_opened' }, $inc: { workflowGeneration: 1 } }
      : { $set: set };
    // ביומן רק כשהסגירה זוהתה; בדיקות חוזרות בזמן ההמתנה אינן אירוע.
    [event, result] = [queued || !r.publish?.prClosedAt ? 'pr_closed_awaiting_absorption' : null, 'awaiting'];
  } else {
    const reason = handoffReasonOf(action);
    if (queued && r.manual?.handoffReason === reason) return 'unchanged';
    const set = {
      'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged', 'publish.prClosedAt': closedAt, 'publish.updatedAt': now,
      'publish.conflictReason': reason === PR_CLOSED_HANDOFF.CHANGED ? reason : null,
    };
    // כבר בתור הידני: רק הסיבה מתעדכנת (אין עבודה ישנה לפסול); אחרת — העברה לידני רגילה.
    update = queued
      ? { $set: { ...set, 'manual.handoffReason': reason } }
      : { $set: { ...set, ...manualQueueSet(reason, now) }, $inc: { workflowGeneration: 1 } };
    [event, result] = ['pr_closed_unmerged', 'handoff'];
    eventData.reason = reason;
  }
  const updated = await ErrorReport.findOneAndUpdate(where, update, { returnDocument: 'after' }).lean();
  if (!updated) return 'raced';
  if (event) await logEvent(r._id, event, actor, updated.workflowGeneration, eventData);
  return result;
}
