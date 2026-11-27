/**
 * worker של תיקוני הטקסט: outbox → משימות, תפיסה אטומית עם lease+fence, בדיקה מול
 * השירות, פרסום, reconciliation ומעקב PR. כל עדכון דיווח מותנה ב-workflow_generation.
 */
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { leaseEnd } from '../pageProof/lease.js';
import { isExactlyApplied } from './already-applied.js';
import { sendAlreadyFixedThanks } from './reporter-thanks.js';
import { createRepoClient } from '../dicta/github-api.js';
import { classifyVerifyFailure, computeRetry, FAILURE_CLASS } from './classify.js';
import { buildVerifyRequest, validateVerifyResponse, routeVerifyDecision } from './verify-protocol.js';
import { callVerifyService } from './verify-client.js';
import { resolveSource, USABLE_STATUSES, matchLine } from './resolver.js';
import { createGitSource, getSharedSourceCache } from './git-source.js';
import { computeNewLine } from './payload.js';
import { computeChangeDigest } from './ocj1.js';
import { publishChange, reconcilePublish, PublishConflict } from './publisher.js';
import { createAbsorptionChecker, processClosedPull, onClosedPullError, expireAwaitingReports } from './closed-pr.js';
import { newId, logEvent, WORKER_ACTOR, currentRevisionOf, manualQueueSet } from './store.js';

const RESOLVE_HANDOFF = {
  not_found: 'source_not_found',
  ambiguous: 'source_ambiguous',
  source_changed: 'source_changed',
  selection_not_found: 'source_changed',
  already_applied: 'already_fixed_unverified',
  manual_only: 'manual_only_source',
  invalid_path: 'source_not_found',
  no_proposal: 'no_proposal',
};
// התנגשות במקור אחרי האישור → האישור נפסל וחוזר למתנדב. source_not_resolved: הקובץ השתנה והפסקה המדווחת לא אותרה בוודאות.
const CONFLICT_REASONS = new Set(['source_changed', 'source_not_resolved', 'target_missing', 'structural_change']);

function sourceGit(config, deps) {
  const client = createRepoClient({ repo: config.source.repo, token: config.source.token || null, fetchImpl: deps.githubFetch || fetch });
  return createGitSource({ client, ref: config.source.ref, cache: getSharedSourceCache(config.cacheBytes) });
}

function publishClient(config, deps) {
  return createRepoClient({ repo: config.publish.repo, token: config.publish.token, fetchImpl: deps.githubFetch || fetch });
}

const isTransientHttp = (err) => !err.status || err.status === 429 || err.status >= 500 || err.transient === true || err.name === 'TimeoutError';

// ---------------------------------------------------------------- jobs

export async function finishJob(job, status, outcome, extra = {}) {
  const res = await CorrectionJob.updateOne(
    { _id: job._id, fence: job.fence, status: 'leased' },
    { $set: { status, outcome, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, ...extra }, $unset: { activeKey: 1 } },
  );
  return res.modifiedCount === 1;
}

async function rescheduleJob(job, set) {
  const res = await CorrectionJob.updateOne(
    { _id: job._id, fence: job.fence, status: 'leased' },
    { $set: { status: 'pending', leaseOwner: null, leaseExpiresAt: null, ...set } },
  );
  return res.modifiedCount === 1;
}

/**
 * תפיסה אטומית של משימה אחת (ממתינה שהגיע זמנה, או כזו שה-lease שלה פג). משימת בדיקה — דרך allocateVerifyLease,
 * שמקדמת קודם את הסימון בדיווח.
 */
export async function claimJob(type, { workerId, now, leaseSeconds }) {
  const eligible = {
    type,
    $or: [
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { status: 'leased', leaseExpiresAt: { $lte: now } },
    ],
  };
  // leaseTokenHash: אסימון ישן של סוכן משיכה (לפני מעבר לדחיפה) אינו מחזיק את התפיסה הזו.
  const update = { $set: { status: 'leased', leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000), leaseTokenHash: null }, $inc: { fence: 1 } };
  if (type === 'verify') return allocateVerifyLease(eligible, update, { sort: { nextAttemptAt: 1 } });
  return CorrectionJob.findOneAndUpdate(eligible, update, { returnDocument: 'after', sort: { nextAttemptAt: 1 } }).lean();
}

// כל כישלון בהשוואה פירושו שתפיסה אחרת קיבלה את המועמדת, ולכן N תפיסות מקבילות מסתיימות לכל היותר ב-N ניסיונות כל אחת.
const ALLOCATE_TRIES = 16;

/**
 * הקצאת lease למשימת בדיקה (דחיפה ומשיכה): קודם נשמר ה-fence הבא בסימון שבדיווח (reserveVerifyFence), ורק אחר כך
 * המשימה עצמה עוברת אליו — בהשוואה על ה-fence שנקרא. כך ברגע שהמשימה מקבלת fence חדש, אף כתיבה מטעם fence קודם כבר
 * אינה מתאימה לסימון — בלי תלות בשעון ובלי טרנזקציה, גם כשהכתיבה הישנה התעכבה בדרך למסד. מועמדת שנתפסה בינתיים —
 * הבאה בתור. update — עדכון המשימה (מגדיל את ה-fence); updatePipeline — כשהוא pipeline.
 */
export async function allocateVerifyLease(eligible, update, { sort, updatePipeline = false }) {
  for (let n = 0; n < ALLOCATE_TRIES; n++) {
    const cand = await CorrectionJob.findOne(eligible).sort(sort).select('report generation fence').lean();
    if (!cand) return null;
    await reserveVerifyFence(cand);
    const job = await CorrectionJob.findOneAndUpdate(
      { ...eligible, _id: cand._id, fence: cand.fence ?? null },
      update,
      { returnDocument: 'after', ...(updatePipeline ? { updatePipeline: true } : {}) },
    ).lean();
    if (job) return job;
  }
  return null;
}

/**
 * שמירת ה-fence הבא בסימון, לפני ההקצאה במשימה: הסימון עולה ל-fence+1 בלי תוקף (אין עדיין lease), ומרגע זה כל כתיבה
 * מטעם fence קודם אינה מתאימה. לעולם אינו מוריד fence; fence+1 ששמור כבר (תפיסה מקבילה, או כזו שנפלה לפני ההקצאה)
 * נשמר שוב. כשאינו מתאים — הדיווח כבר אינו של המשימה (generation, מזהה) או שהסימון כבר מתקדם ממנה — כתיבות ה-fence
 * הקודם נכשלות ממילא, וההשוואה על ה-fence בהקצאה עצמה מכריעה מי מקבל את המשימה.
 */
async function reserveVerifyFence(cand) {
  const next = (cand.fence ?? 0) + 1;
  await ErrorReport.updateOne(
    {
      _id: cand.report, workflowGeneration: cand.generation, 'verification.activeJob.id': cand._id,
      $or: [{ 'verification.activeJob.fence': { $lt: next } }, { 'verification.activeJob.fence': next, 'verification.activeJob.leaseExpiresAt': null }],
    },
    { $set: { 'verification.activeJob.fence': next, 'verification.activeJob.leaseExpiresAt': null } },
  );
}

/**
 * מבטל משימות פעילות של דיווח (מגדיל fence כדי שעובד באמצע יפסיד) — רק משימות מ-generation ישן מ-beforeGeneration
 * (ה-generation שהמעבר הקורא יצר), כך שמשימה של גרסה חדשה יותר (שליחה מחודשת) לעולם אינה מבוטלת כאן.
 */
export async function cancelActiveJobs(reportId, type, outcome, beforeGeneration) {
  if (!Number.isSafeInteger(beforeGeneration)) throw new TypeError('cancelActiveJobs: beforeGeneration is required');
  await CorrectionJob.updateMany(
    { report: reportId, type, status: { $in: ['pending', 'leased'] }, generation: { $lt: beforeGeneration } },
    { $set: { status: 'cancelled', outcome, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
  );
}

/**
 * סימון המשימה הפעילה בדיווח — verification.activeJob = {id, fence, leaseExpiresAt}: נקבע ב-dispatch (בלי תוקף — אין
 * עדיין lease), וה-fence והתוקף שלו נקבעים בכל תפיסה (bindVerifyJob, בתחילת ההכנה ולפני המסירה). כל כתיבת החלטה על
 * הדיווח מותנית בו יחד עם ה-generation (heldBy), וכל מעבר שמבטל את המשימה — השהיה, מתנדב, מעבר לידני, שליחה
 * מחודשת — מנקה אותו באותו עדכון אטומי, ולפני ביטול המשימה עצמה.
 *
 * הסימון והמשימה הם שני מסמכים, בלי טרנזקציה (MongoDB standalone), ולכן:
 * - הקצאת lease מתחילה בדיווח (allocateVerifyLease): ה-fence הבא נשמר בסימון לפני שהמשימה עוברת אליו, כך שמרגע
 *   ההקצאה כתיבה מטעם fence קודם אינה מתאימה — בלי תלות בשעון, גם כשהכתיבה הישנה התעכבה בדרך למסד.
 * - הקישור והשמירה מונוטוניים: fence בסימון לעולם אינו יורד, ותפיסה ישנה שהתעכבה אינה דורסת סימון חדש.
 * - הסימון נושא גם את תוקף ה-lease, ולעולם אינו מאוחר מזה שבמשימה (הארכה — קודם המשימה ואחר כך הסימון, שתיהן ב-$max).
 *   כתיבת החלטה דורשת שהתוקף עוד לפניה, לפי השעון של הכותב ממש לפני הכתיבה ועם מרווח (LEASE_WRITE_MARGIN_MS): מחזיק
 *   שה-lease שלו פג אינו מכריע, גם לפני שנתפסה מחדש. המרווח מכסה את הזמן עד ביצוע הכתיבה במסד ואת הפרשי השעונים.
 */
export const LEASE_WRITE_MARGIN_MS = 30_000;

/**
 * שעון "עכשיו" לכתיבות מותנות-lease: now של הפעולה ועוד הזמן שעבר מאז תחילתה (המקסימום של שעון מונוטוני ושל שעון
 * הקיר), כך שעיכוב באמצע הפעולה — GitHub איטי, מסד עמוס, השהיית תהליך — נספר גם כש-now מדומה. נקבע בתחילת הפעולה;
 * deps.leaseNow שכבר קיים (מתחילת הבקשה/האצווה, או שעון מוזרק בבדיקות) נשמר.
 */
export function withLeaseClock(deps = {}, now = new Date()) {
  if (typeof deps.leaseNow === 'function') return deps;
  const base = now.getTime();
  const mono0 = performance.now();
  const wall0 = Date.now();
  return { ...deps, leaseNow: () => new Date(base + Math.max(0, performance.now() - mono0, Date.now() - wall0)) };
}

/** הזמן ברגע הכתיבה (ממש לפניה), לפי השעון של הפעולה. */
export const leaseNow = (deps, now) => (typeof deps?.leaseNow === 'function' ? deps.leaseNow() : now);

// שעון הקיר של המערכת (אותו שעון שהמסד מודד בו $$NOW כשהוא על אותה מכונה) — נלכד בטעינת המודול, כך שהחלפת
// Date.now בבדיקות (שעון מדומה) אינה משנה את ההפרש שנמדד מולו ב-heldBy.
const systemNow = Date.now.bind(Date);

/**
 * תנאי ההחזקה של כתיבה מטעם המשימה: הסימון בדיווח הוא של אותה משימה ושל אותה תפיסה (fence), וה-lease שבו בתוקף עוד
 * LEASE_WRITE_MARGIN_MS לפחות אחרי at — הזמן ברגע הכתיבה (leaseNow). סימון בלי תוקף (נוצר לפני שהתוקף נוסף לסימון
 * ולא הוארך מאז) אינו מתאים — נכשל-סגור.
 * ואותו תנאי גם בשעון המסד ($$NOW) ברגע שהכתיבה מתבצעת בפועל: כתיבה שהתעכבה בדרך (המתנה לחיבור פנוי במאגר
 * החיבורים, רשת, מסד עמוס) עד אחרי פקיעת ה-lease אינה נוחתת, גם בלי תפיסה מתחרה. ההפרש בין שעון הפעולה לשעון הקיר
 * (שעון מדומה בבדיקות, now של תחילת הבקשה) נמדד כאן, ברגע בניית התנאי, ומתווסף לשעון המסד.
 */
export function heldBy(job, at) {
  if (!(at instanceof Date)) throw new TypeError('heldBy: the write time is required');
  const shift = at.getTime() - systemNow() + LEASE_WRITE_MARGIN_MS;
  return {
    'verification.activeJob.id': job._id,
    'verification.activeJob.fence': job.fence,
    'verification.activeJob.leaseExpiresAt': { $gt: new Date(at.getTime() + LEASE_WRITE_MARGIN_MS) },
    $expr: { $gt: ['$verification.activeJob.leaseExpiresAt', { $add: ['$$NOW', shift] }] },
  };
}

/**
 * קושר את התפיסה הנוכחית (fence ותוקף ה-lease שלה) לסימון בדיווח, לפני שהמשימה נמסרת. מונוטוני: רק כשה-fence בסימון
 * אינו גבוה משל התפיסה — תפיסה ישנה שהתעכבה אינה דורסת סימון של תפיסה חדשה יותר. false — הדיווח כבר אינו של התפיסה.
 */
async function bindVerifyJob(job) {
  const res = await ErrorReport.updateOne(
    { _id: job.report, workflowGeneration: job.generation, 'verification.activeJob.id': job._id, 'verification.activeJob.fence': { $lte: job.fence } },
    { $set: { 'verification.activeJob.fence': job.fence, 'verification.activeJob.leaseExpiresAt': job.leaseExpiresAt } },
  );
  return res.matchedCount === 1;
}

/**
 * הארכת התוקף בסימון — תמיד אחרי הארכת המשימה, באותו ערך וב-$max: התוקף בסימון לעולם אינו מאוחר מזה שבמשימה, גם
 * כשדופק ותוצאה של אותו מחזיק מקבילים. סימון ישן בלי תוקף מקבל אותו כאן, מהמחזיק שה-lease שלו במשימה אומת זה עתה.
 * false — הדיווח כבר אינו של התפיסה הזו.
 */
export async function extendVerifyMarker(job, until) {
  const res = await ErrorReport.updateOne(
    { _id: job.report, 'verification.activeJob.id': job._id, 'verification.activeJob.fence': job.fence },
    { $max: { 'verification.activeJob.leaseExpiresAt': until } },
  );
  return res.matchedCount === 1;
}

/** הסימון בדיווח עדיין של המשימה, באותה תפיסה או בתפיסה חדשה יותר שלה (הדיווח לא עבר לאחר). */
const stillMarkedFor = async (job) => Boolean(await ErrorReport.exists({
  _id: job.report, workflowGeneration: job.generation, 'verification.activeJob.id': job._id, 'verification.activeJob.fence': { $gte: job.fence },
}));

/**
 * דחיפה: אין דופק, וה-lease נקבע בתפיסה בתחילת האצווה. הוא מוארך מהזמן הנוכחי לפני ההכנה (כך שהקישור לסימון נושא
 * תוקף עדכני) ושוב לפני הקריאה לשירות — המשימה ואחריה הסימון — כך שגם משימה אחרונה באצווה ארוכה מחזיקה lease בתוקף
 * בזמן כתיבת ההחלטה. null — המשימה (או, עם marker, הדיווח) כבר אינה של התפיסה הזו.
 */
async function extendPushLease(job, { config, deps, now, marker = false }) {
  const until = new Date(leaseNow(deps, now).getTime() + config.worker.leaseSeconds * 1000);
  const held = await CorrectionJob.updateOne({ _id: job._id, fence: job.fence, status: 'leased' }, { $max: { leaseExpiresAt: until } });
  if (held.matchedCount !== 1) return null;
  if (marker && !(await extendVerifyMarker(job, until))) return null;
  return until;
}

// ---------------------------------------------------------------- report transitions

/**
 * העברה לתור הידני, מותנית-גרסה; מגדילה generation כדי שתשובה מאוחרת לא תקדם מצב, ומנקה את סימון המשימה
 * (manualQueueSet). job — העברה שהיא תוצאה של המשימה (כשל, תשובה): רק כשהדיווח עדיין שלה ב-lease בתוקף ברגע
 * הכתיבה (heldBy; at — הזמן ברגע הכתיבה, leaseNow).
 */
export async function handoffToManual(reportId, generation, reason, { now = new Date(), at = null, verificationStatus = 'failed', extraSet = {}, actor = WORKER_ACTOR, data = null, job = null } = {}) {
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: reportId, workflowGeneration: generation, state: 'open', 'manual.status': { $ne: 'claimed' }, ...(job ? heldBy(job, at) : {}) },
    { $set: { ...manualQueueSet(reason, now), 'verification.status': verificationStatus, ...extraSet }, $inc: { workflowGeneration: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (updated) await logEvent(reportId, 'handoff_manual', actor, updated.workflowGeneration, { reason, ...(data || {}) });
  return updated;
}

// onlyOnce: במשיכה השירות עשוי לשלוח שוב אותה החלטה מאוחרת — נשמרת פעם אחת לכל decision_id.
export async function recordLateDecision(reportId, value, generation, why, { onlyOnce = false } = {}) {
  const res = await ErrorReport.updateOne({ _id: reportId, ...(onlyOnce ? { 'decisions.decisionId': { $ne: value.decisionId } } : {}) }, {
    $push: {
      decisions: {
        decisionId: value.decisionId, source: 'service', decision: value.decision, scope: value.approvalScope, reasonCode: value.reasonCode,
        message: value.message, generation: value.workflowGeneration ?? generation, stale: true, at: new Date(),
      },
    },
  });
  if (onlyOnce && res.modifiedCount !== 1) return;
  await logEvent(reportId, 'service_response_ignored', { kind: 'service' }, generation, { why, decision: value.decision, reasonCode: value.reasonCode });
}

// ---------------------------------------------------------------- outbox

/**
 * מועד המיצוי של משימת בדיקה. במשיכה: CORRECTIONS_VERIFY_DEADLINE_HOURS (ברירת מחדל 24) שעות שנספרות
 * רק מחוץ לשבת ויו"ט (אותו לוח של תפיסת עמודים בהגהה — pageProof/lease.js): בשבת האתר חסום לשירות
 * וה-worker מושהה, ולכן שבת אינה מכלה את זמן הדיווח. בדחיפה — ללא שינוי (זמן שעון).
 */
export function verifyDeadline(config, now) {
  if (config.verify.transport !== 'pull') return new Date(now.getTime() + config.verify.maxTotalSeconds * 1000);
  const hours = config.verify.deadlineHours;
  try {
    return leaseEnd(now, hours);
  } catch (err) {
    // lease.js זורק כשלוח השנה העברי של Intl השתנה; דדליין רגיל עדיף על אצווה שנכשלת כולה.
    console.error('[corrections] rest-window deadline failed:', err?.message);
    return new Date(now.getTime() + hours * 3_600_000);
  }
}

/** outbox של בדיקה → משימות verify (גם מתפיסת השירות במשיכה, כך שאינה תלויה ב-cron). */
export async function dispatchVerifyOutbox({ config, now, limit = 50 }) {
  if (!config.verify.enabled) return 0;
  let created = 0;
  const reports = await ErrorReport.find({ 'dispatch.verify': true, state: 'open' }).limit(limit).lean();
  for (const r of reports) created += await dispatchVerifyFor(r, config, now);
  return created;
}

/**
 * משימת בדיקה לדיווח כפי שנקרא (generation gen). כל מעבר מותנה ב-gen: מבוטלות רק משימות ישנות ממנו, כך שתהליך
 * שקרא גרסה ישנה אינו מבטל משימה של שליחה מחודשת; והדגל ב-outbox נמחק רק כשהמשימה הפעילה היא של gen.
 * משימה ישנה שנוצרה בין הביטול ליצירה (תהליך מיושן מקביל) מבוטלת בסבב השני. @returns {Promise<number>} 1 כשנוצרה
 */
async function dispatchVerifyFor(r, config, now) {
  const gen = r.workflowGeneration;
  const key = `verify:${r._id}`;
  let created = 0;
  for (let round = 0; round < 2; round++) {
    await CorrectionJob.updateMany(
      { activeKey: key, generation: { $lt: gen } },
      { $set: { status: 'cancelled', outcome: 'superseded', finishedAt: now, leaseOwner: null, leaseExpiresAt: null }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
    );
    // המסנן הוא שוויון על activeKey בלבד, כך ש-upsert מקבילי על האינדקס הייחודי מנוסה שוב בשרת ולא נכשל.
    const res = await CorrectionJob.updateOne({ activeKey: key }, {
      $setOnInsert: {
        type: 'verify', report: r._id, activeKey: key, status: 'pending', generation: gen, requestId: r.verification?.requestId,
        proposalRevision: r.currentRevision, maxAttempts: config.verify.maxAttempts, nextAttemptAt: now,
        deadlineAt: verifyDeadline(config, now),
      },
    }, { upsert: true });
    created += res.upsertedCount || 0;
    const active = await CorrectionJob.findOne({ activeKey: key }).select('generation fence').lean();
    // גרסה חדשה יותר כבר בתור (קראנו גרסה ישנה), או שהמשימה כבר הסתיימה — לא נוגעים בכלום.
    if (!active || active.generation > gen) return created;
    if (active.generation === gen) {
      // הסימון של המשימה הפעילה נקבע באותו עדכון שמוריד את הדגל (גם למשימה קיימת של אותו generation).
      await ErrorReport.updateOne({ _id: r._id, workflowGeneration: gen, 'dispatch.verify': true }, {
        $set: { 'dispatch.verify': false, 'verification.activeJob': { id: active._id, fence: active.fence ?? 0 } },
      });
      return created;
    }
  }
  return created; // הדגל נשאר — הסבב הבא ישלים
}

export async function dispatchOutbox({ config, now, limit = 50 }) {
  let created = await dispatchVerifyOutbox({ config, now, limit });
  if (config.publish.mode !== 'disabled') {
    const reports = await ErrorReport.find({ 'dispatch.publish': true, state: 'open' }).limit(limit).lean();
    for (const r of reports) {
      const gen = r.workflowGeneration;
      const key = `publish:${r._id}`;
      // משימת פרסום שנמצאת באמצע כתיבה אינה מבוטלת — הדיווח ימתין לסבב הבא.
      const busy = await CorrectionJob.exists({ activeKey: key, status: 'leased', leaseExpiresAt: { $gt: now } });
      if (busy) continue;
      await CorrectionJob.updateMany(
        { activeKey: key, $or: [{ generation: { $ne: gen } }, { changeId: { $ne: r.publish?.changeId } }] },
        { $set: { status: 'cancelled', outcome: 'superseded', finishedAt: now }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
      );
      const res = await CorrectionJob.updateOne({ activeKey: key }, {
        $setOnInsert: {
          type: 'publish', report: r._id, activeKey: key, status: 'pending', generation: gen, changeId: r.publish?.changeId,
          maxAttempts: config.publish.maxAttempts, nextAttemptAt: now,
          deadlineAt: new Date(now.getTime() + 7 * 86_400_000),
        },
      }, { upsert: true });
      created += res.upsertedCount || 0;
      await ErrorReport.updateOne({ _id: r._id, workflowGeneration: gen, 'dispatch.publish': true }, { $set: { 'dispatch.publish': false } });
    }
  }
  return created;
}

/**
 * מטאטא מצב המשיכה: משימת בדיקה שעבר מועד המיצוי שלה ואינה מוחזקת ב-lease בתוקף → ידני
 * (deadline_exhausted). משימה שהשירות עובד עליה עכשיו לא נלקחת ממנו — הדופק הבא שלה מבטל אותה.
 */
export async function sweepExpiredVerifyJobs({ now, limit = 100 }) {
  const expired = { type: 'verify', deadlineAt: { $lte: now }, $or: [{ status: 'pending' }, { status: 'leased', leaseExpiresAt: { $lte: now } }] };
  const jobs = await CorrectionJob.find(expired).sort({ deadlineAt: 1 }).limit(limit).lean();
  let swept = 0;
  for (const job of jobs) {
    // הדיווח קודם (ההעברה לידני מנקה את סימון המשימה), ורק אחר כך המשימה — החלטה שמתעכבת אינה נכתבת אחרי הסיום.
    const report = await ErrorReport.findById(job.report).lean();
    if (!isStaleVerifyJob(job, report)) await handoffToManual(report._id, report.workflowGeneration, 'deadline_exhausted', { now, data: { sweeper: true } });
    const res = await CorrectionJob.updateOne(
      { ...expired, _id: job._id, fence: job.fence },
      { $set: { status: 'failed', outcome: 'deadline_exhausted', finishedAt: now, leaseOwner: null, leaseExpiresAt: null }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
    );
    if (res.modifiedCount === 1) swept += 1;
  }
  await requeueStrandedVerifications({ now, limit });
  return swept;
}

// "ממתין לבדיקה" מפורש: פתוח, בתור/בבדיקה, בלי outbox — ולא במסלול הידני (בתור הידני, אצל מתנדב, או שוחרר ממנו):
// דיווח שמתנדב שחרר אינו חוזר לשירות בלי שליחה מחודשת מפורשת (שמחזירה את manual.status ל-none).
const PENDING_VERIFICATION = {
  state: 'open', 'verification.status': { $in: ['queued', 'in_progress'] }, 'dispatch.verify': { $ne: true }, 'manual.status': { $nin: ['queued', 'claimed', 'released'] },
};
const LIVE_JOB_STATUSES = ['pending', 'leased'];

/**
 * רשת ביטחון (חלק מהמטאטא, וגם באצווה בדחיפה): דיווח "ממתין לבדיקה" שסימון המשימה הפעילה שלו חסר או מת — המשימה
 * אינה קיימת, הסתיימה, או של generation אחר — חוזר ל-outbox של אותו generation. הבדיקה נעשית במסד על כל הדיווחים
 * הממתינים (lookup), ו-limit חל רק על מה שנמצא תקוע. אידמפוטנטי: הסימון מותנה ב-generation ובסימון שנקרא, וה-outbox
 * יוצר משימה אחת לכל activeKey (ומשימה קיימת של אותו generation רק מקבלת סימון).
 */
export async function requeueStrandedVerifications({ now, limit = 100 }) {
  const live = (j) => ({ $and: [{ $in: [j('status'), LIVE_JOB_STATUSES] }, { $eq: [j('type'), 'verify'] }, { $eq: [j('generation'), '$workflowGeneration'] }] });
  const reports = await ErrorReport.aggregate([
    { $match: PENDING_VERIFICATION },
    { $project: { workflowGeneration: 1, marker: '$verification.activeJob' } },
    { $lookup: { from: CorrectionJob.collection.collectionName, localField: 'marker.id', foreignField: '_id', as: 'job' } },
    { $match: { $expr: { $not: [{ $anyElementTrue: [{ $map: { input: '$job', as: 'j', in: live((f) => `$$j.${f}`) } }] }] } } },
    { $limit: limit },
    { $project: { workflowGeneration: 1, marker: 1 } },
  ]);
  let requeued = 0;
  for (const r of reports) {
    const sameMarker = r.marker?.id ? { 'verification.activeJob.id': r.marker.id, 'verification.activeJob.fence': r.marker.fence } : { 'verification.activeJob.id': null };
    const res = await ErrorReport.updateOne({ ...PENDING_VERIFICATION, ...sameMarker, _id: r._id, workflowGeneration: r.workflowGeneration }, { $set: { 'dispatch.verify': true } });
    if (res.modifiedCount !== 1) continue;
    requeued += 1;
    await logEvent(r._id, 'verify_requeued', WORKER_ACTOR, r.workflowGeneration, { reason: r.marker?.id ? 'job_not_active' : 'no_active_job', at: now });
  }
  return requeued;
}

/** השירות כבוי/לא מוגדר: כל העבודה האוטומטית הממתינה עוברת לידני בבטחה. */
export async function drainVerifyToManual({ reason, now }) {
  // הדיווחים קודם (ההעברה לידני מנקה את סימון המשימה באותו עדכון) ורק אחר כך המשימות: החלטה שמתעכבת באמצע
  // אינה נכתבת אחרי שהמשימה שלה בוטלה.
  let moved = 0;
  const reports = await ErrorReport.find({ state: 'open', $or: [{ 'dispatch.verify': true }, { 'verification.status': { $in: ['queued', 'in_progress'] } }] }).lean();
  for (const r of reports) {
    const u = await handoffToManual(r._id, r.workflowGeneration, reason, { now, verificationStatus: 'skipped_service_disabled' });
    if (u) moved += 1;
  }
  const jobs = await CorrectionJob.find({ type: 'verify', status: { $in: LIVE_JOB_STATUSES } }).lean();
  for (const job of jobs) {
    await CorrectionJob.updateOne(
      { _id: job._id, status: { $in: LIVE_JOB_STATUSES } },
      { $set: { status: 'cancelled', outcome: 'service_disabled', finishedAt: now }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
    );
  }
  return moved;
}

// ---------------------------------------------------------------- verify

async function scheduleRetryOrHandoff({ job, report, config, now, cls, retryAfterSeconds, deps, countAttempt = true }) {
  const attempts = job.attempts + (countAttempt ? 1 : 0);
  const retry = computeRetry({
    attempts, maxAttempts: job.maxAttempts, deadlineAt: job.deadlineAt, now,
    baseSeconds: config.verify.backoffBaseSeconds, capSeconds: config.verify.backoffCapSeconds,
    retryAfterSeconds, random: deps.random || Math.random,
  });
  if (retry.exhausted) {
    await handoffToManual(report._id, report.workflowGeneration, retry.reason, { now, at: leaseNow(deps, now), data: { lastError: cls.reason }, job });
    await finishJob(job, 'failed', retry.reason, { attempts, lastErrorClass: cls.cls, lastError: cls.reason });
    return 'exhausted';
  }
  const ok = await rescheduleJob(job, { attempts, nextAttemptAt: retry.nextAttemptAt, lastErrorClass: cls.cls, lastError: cls.reason });
  if (ok) {
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration, ...heldBy(job, leaseNow(deps, now)) }, {
      $set: { 'verification.status': 'queued', 'verification.attempts': attempts, 'verification.lastErrorClass': cls.cls, 'verification.lastError': cls.reason, 'verification.nextAttemptAt': retry.nextAttemptAt },
    });
    await logEvent(report._id, 'verify_retry_scheduled', WORKER_ACTOR, report.workflowGeneration, { attempts, reason: cls.reason, nextAttemptAt: retry.nextAttemptAt });
  }
  return 'retry';
}

async function failPermanently({ job, report, reason, now, deps, cls = FAILURE_CLASS.PERMANENT }) {
  await handoffToManual(report._id, report.workflowGeneration, reason, { now, at: leaseNow(deps, now), data: { class: cls }, job });
  await finishJob(job, 'failed', reason, { lastErrorClass: cls, lastError: reason, attempts: job.attempts + 1 });
}

/**
 * "כבר תוקן" של השירות נסגר רק לפי אותו כלל מחמיר של הסגירה האוטומטית (already-applied.js), מול הקובץ ב-HEAD:
 * במיקום שנשלח בדיוק השורה המוצעת, השורה השגויה שנשלחה אינה בשום מקום בקובץ (טעות שזזה עדיין בספר), והמוצעת
 * ייחודית (לא כותרת, ≥15 תווים נראים) ומופיעה פעם אחת. כל ספק, וגם כשל בקריאה — לא מאומת (ידני).
 */
async function verifyLocallyAlreadyFixed({ source, rev }, config, deps) {
  try {
    const git = sourceGit(config, deps);
    const head = await git.getHead();
    const f = await git.getFile(source.path, head.commitSha);
    if (!f || f.lossy) return false;
    const m = matchLine(f.content, { originalLine: source.currentLine, lineIndex: source.lineIndex, newLine: computeNewLine(rev) });
    return isExactlyApplied({ ...m, bomAdjusted: source.bomAdjusted }, rev);
  } catch {
    return false;
  }
}

/** משימה שכבר אינה תואמת לדיווח: נסגר, ה-generation או הבקשה התחלפו, או שמתנדב לקח אותו. */
export const isStaleVerifyJob = (job, report) => !report || report.state !== 'open' || report.workflowGeneration !== job.generation
  || report.verification?.requestId !== job.requestId || report.manual?.status === 'claimed';

// המקור שאותר באותו generation (נשמר בהכנה) — אותו מקור שממנו נבנתה הבקשה שנשלחה.
const cachedSource = (report) => (report.resolvedSource && report.resolvedSource.generation === report.workflowGeneration ? report.resolvedSource : null);

const requestFor = ({ report, rev, source }, job, config) => buildVerifyRequest({
  report, revision: rev, requestId: job.requestId, requestedScope: report.verification?.requestedScope || config.verify.requestedScope, source,
});

/**
 * סגירת "כבר תוקן" שאומתה מקומית מול המקור (הכלל: already-applied.js), בלי השירות ובלי קומיט.
 * מותנית-גרסה כמו כל מעבר.
 */
async function closeAlreadyApplied({ job, report, rev, source, now, deps }) {
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: report._id, workflowGeneration: report.workflowGeneration, state: 'open', 'manual.status': { $ne: 'claimed' }, ...heldBy(job, leaseNow(deps, now)) },
    {
      $set: {
        state: 'closed_already_fixed', status: 'resolved', 'publish.status': 'skipped_already_fixed', closedAt: now, resolvedAt: now,
        closeReason: 'source_already_applied', 'manual.status': 'none', 'verification.status': 'not_requested', 'dispatch.verify': false, assignedTo: null,
        'verification.activeJob': null,
      },
      $inc: { workflowGeneration: 1 },
      $push: {
        decisions: {
          decisionId: newId('dec'), source: 'system', decision: 'already_fixed', reasonCode: 'already_applied',
          message: 'השורה במקור כבר זהה לשורה המוצעת', revision: rev.revision, generation: report.workflowGeneration, at: now,
        },
      },
    },
    { returnDocument: 'after' },
  ).lean();
  await finishJob(job, 'done', 'resolve_already_applied');
  if (!updated) return 'superseded';
  await logEvent(report._id, 'closed_already_fixed', WORKER_ACTOR, updated.workflowGeneration, {
    reason: 'source_already_applied', path: source.path, lineIndex: source.lineIndex, blobSha: source.blobSha,
  });
  await notifyAlreadyFixed(deps, report._id);
  return 'closed_already_fixed';
}

// המדווח מקבל את אותה הודעה כמו בסגירת "כבר תוקן" של מתנדב. best-effort: אחרי התשובה כשהקורא מתזמן
// (deps.schedule, למשל after בתפיסה), ובאצווה — מיד. כשל נרשם בלוג ואינו נוגע בסגירה.
async function notifyAlreadyFixed(deps, id) {
  const work = async () => {
    try {
      await sendAlreadyFixedThanks(id, { sendMail: deps?.sendThanksMail, config: deps?.thanksConfig });
    } catch (err) {
      console.error('[corrections-thanks] send failed:', err?.message);
    }
  };
  if (typeof deps?.schedule !== 'function') return work();
  try {
    deps.schedule(work);
  } catch (err) {
    console.error('[corrections-thanks] schedule failed:', err?.message);
  }
  return undefined;
}

/**
 * הכנה משותפת לדחיפה ולמשיכה: בדיקת עדכניות, איתור המקור ובניית בקשת חוזה B (§3.1) בדיוק.
 * מקור שלא אותר עובר לידני ו"כבר הוחל" מדויק נסגר — שניהם לעולם לא נשלחים לשירות.
 * @returns {Promise<{ready:true, report:object, rev:object, source:object, request:object}
 *   | {ready:false, result:(string|undefined), transient?:boolean}>}
 */
export async function prepareVerify(job, { config, deps, now }) {
  const report = await ErrorReport.findById(job.report).lean();
  if (isStaleVerifyJob(job, report) || !(await bindVerifyJob(job))) {
    // תפיסה ישנה שהפסידה לתפיסה חדשה יותר של אותה משימה — finishJob (מותנה ב-fence) אינו נוגע בה, ואין מה לתעד.
    if ((await finishJob(job, 'cancelled', 'superseded')) && report) {
      await logEvent(report._id, 'verify_job_superseded', WORKER_ACTOR, report.workflowGeneration, { jobGeneration: job.generation });
    }
    return { ready: false, result: 'superseded' };
  }
  if (!config.verify.enabled) {
    await handoffToManual(report._id, report.workflowGeneration, config.verify.disabledReason, { now, verificationStatus: 'skipped_service_disabled' });
    await finishJob(job, 'cancelled', 'service_disabled');
    return { ready: false, result: 'handoff' };
  }
  const rev = currentRevisionOf(report);
  if (!rev || rev.revision !== job.proposalRevision) return { ready: false, result: await failPermanently({ job, report, reason: 'no_proposal', now, deps }) };

  // מקור שמור שאינו שמיש (כבר הוחל, לא אותר...) נשאר רק כשהטיפול בו נקטע (תקלה אחרי שמירתו) — מאתרים מחדש: הסגירה
  // וההעברה לידני נעשות רק לפי מקור שאותר זה עתה, ומקור כזה לעולם אינו נשלח לשירות כ"מוכן".
  let source = cachedSource(report);
  if (source && !USABLE_STATUSES.has(source.status)) source = null;
  if (!source) {
    try {
      source = await resolveSource({
        report, revision: rev, gitSource: sourceGit(config, deps), source: config.source, contextLines: config.diffContextLines,
        override: rev.targetPath ? { path: rev.targetPath, lineIndex: rev.targetLineIndex, expectedLine: rev.originalLine } : null,
      });
    } catch (err) {
      if (isTransientHttp(err)) {
        const result = await scheduleRetryOrHandoff({ job, report, config, now, cls: { cls: FAILURE_CLASS.TRANSIENT, reason: 'source_lookup_failed' }, retryAfterSeconds: null, deps });
        return { ready: false, transient: true, result };
      }
      return { ready: false, result: await failPermanently({ job, report, reason: 'source_not_found', now, deps }) };
    }
    // המקור שייך לתפיסה ששולחת אותו: הכתיבה מותנית בסימון של אותה תפיסה (fence). תפיסה ישנה שהתעכבה כאן אחרי שתפיסה
    // חדשה כבר נקשרה (ואולי איתרה ושלחה מקור אחר) אינה דורסת אותו — היא אינה נמסרת, וההשוואה של התוצאה החדשה
    // (loadVerifyContext) נשארת מול המקור שנשלח בפועל.
    const saved = await ErrorReport.updateOne(
      { _id: report._id, workflowGeneration: report.workflowGeneration, 'verification.activeJob.id': job._id, 'verification.activeJob.fence': job.fence },
      { $set: { resolvedSource: { ...source, generation: report.workflowGeneration, resolvedAt: now } } },
    );
    if (saved.matchedCount !== 1) {
      if (await finishJob(job, 'cancelled', 'superseded')) {
        await logEvent(report._id, 'verify_job_superseded', WORKER_ACTOR, report.workflowGeneration, { jobGeneration: job.generation });
      }
      return { ready: false, result: 'superseded' };
    }
    if (!USABLE_STATUSES.has(source.status)) {
      if (isExactlyApplied(source, rev)) return { ready: false, result: await closeAlreadyApplied({ job, report, rev, source, now, deps }) };
      await handoffToManual(report._id, report.workflowGeneration, RESOLVE_HANDOFF[source.status] || 'source_not_found', { now, at: leaseNow(deps, now), verificationStatus: 'not_requested', job });
      await finishJob(job, 'done', `resolve_${source.status}`);
      return { ready: false, result: 'handoff' };
    }
  }
  const ctx = { report, rev, source };
  return { ready: true, ...ctx, request: requestFor(ctx, job, config) };
}

/**
 * ההקשר של בקשה שכבר נמסרה (משיכה): אותו דיווח, אותה הצעה ואותו מקור שמור — בלי לאתר מחדש,
 * כך שהתשובה נבדקת מול מה שנשלח בפועל. stale כשהדיווח השתנה מאז; missing כשההקשר חסר בלי
 * שהדיווח השתנה (לא אמור לקרות: ההכנה שומרת את המקור באותו generation).
 */
export async function loadVerifyContext(job, { config }) {
  const report = await ErrorReport.findById(job.report).lean();
  if (isStaleVerifyJob(job, report)) return { stale: true, report };
  const rev = currentRevisionOf(report);
  const source = cachedSource(report);
  if (!rev || rev.revision !== job.proposalRevision || !source || !USABLE_STATUSES.has(source.status)) return { stale: true, missing: true, report };
  const ctx = { report, rev, source };
  return { stale: false, ...ctx, request: requestFor(ctx, job, config) };
}

/** דחיפה: הכנה → קריאת HTTP לשירות → אימות וניתוב. */
export async function processVerifyJob(claimed, { config, deps: given = {}, now }) {
  // השעון נקבע בתחילת האצווה (runWorkerBatch), כך שגם ההמתנה בתור האצווה נספרת.
  const deps = withLeaseClock(given, now);
  const until = await extendPushLease(claimed, { config, deps, now });
  // ה-lease פג ואצווה אחרת כבר תפסה את המשימה: בלי הכנה ובלי קריאה לשירות.
  if (!until) return 'lease_lost';
  const job = { ...claimed, leaseExpiresAt: until };
  const prep = await prepareVerify(job, { config, deps, now });
  if (!prep.ready) return prep.result;
  if (!(await extendPushLease(job, { config, deps, now, marker: true }))) {
    // נתפסה מחדש, או שהדיווח עבר לאחר (מעבר שמנקה את הסימון): בלי קריאה לשירות.
    await finishJob(job, 'cancelled', 'superseded');
    return 'superseded';
  }
  const { report, request } = prep;
  const polling = Boolean(job.serviceJobId);
  if (!polling) {
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration, ...heldBy(job, leaseNow(deps, now)) }, { $set: { 'verification.status': 'in_progress' } });
  }
  const call = await callVerifyService(config, { request, serviceJobId: job.serviceJobId, fetchImpl: deps.verifyFetch || fetch, now });

  if (!call.ok) {
    const cls = classifyVerifyFailure(call.failure);
    if (cls.cls === FAILURE_CLASS.TRANSIENT) {
      return scheduleRetryOrHandoff({ job, report, config, now, cls, retryAfterSeconds: call.retryAfterSeconds, deps });
    }
    await failPermanently({ job, report, reason: cls.cls === FAILURE_CLASS.UNKNOWN ? `unknown_failure:${cls.reason}` : cls.reason, now, deps, cls: cls.cls });
    return 'handoff';
  }
  return (await applyVerifyResponse(job, prep, call.body, { config, deps, now, retryAfterSeconds: call.retryAfterSeconds, polling })).result;
}

/**
 * אימות התשובה (§3.4) וניתוב (§3.5) — משותף לתשובת HTTP (דחיפה) ולתוצאה שהשירות מסר (משיכה).
 * @param {object} job המשימה המוחזקת (fence)
 * @param {{report:object, rev:object, source:object, request:object}} ctx מ-prepareVerify / loadVerifyContext
 * @param {{allowPending?:boolean, countCapacityAttempt?:boolean}} opts תשובת pending (202 + polling) קיימת רק
 *   בדחיפה; במשיכה service_capacity אינו צורך ניסיון (רק מועד המיצוי מגביל אותו)
 * @returns {Promise<{kind:'invalid'|'service_failed'|'pending'|'stale'|'decided'|'cancelled', result:(string|undefined), reason?:string, route?:string}>}
 *   result — ערך ההחזרה הקיים של processVerifyJob
 */
export async function applyVerifyResponse(job, { report, rev, source, request }, body, { config, deps, now, retryAfterSeconds = null, polling = false, allowPending = true, countCapacityAttempt = true }) {
  const v = validateVerifyResponse(body, { request, currentGeneration: report.workflowGeneration, siteAuthority: config.verify.authority });
  if (!v.ok) {
    if (v.reason === 'service_failed') {
      const cls = classifyVerifyFailure({ kind: 'service_failed', reasonCode: v.reasonCode });
      if (cls.cls === FAILURE_CLASS.TRANSIENT) {
        const result = await scheduleRetryOrHandoff({ job, report, config, now, cls, retryAfterSeconds, deps, countAttempt: countCapacityAttempt });
        return { kind: 'service_failed', reason: cls.reason, result };
      }
      await failPermanently({ job, report, reason: cls.reason, now, deps, cls: cls.cls });
      return { kind: 'service_failed', reason: cls.reason, result: 'handoff' };
    }
    await failPermanently({ job, report, reason: v.reason === 'response_mismatch' ? 'response_mismatch' : 'invalid_response', now, deps });
    return { kind: 'invalid', reason: v.reason, result: 'handoff' };
  }

  if (v.kind === 'pending') {
    if (!allowPending) {
      await failPermanently({ job, report, reason: 'invalid_response', now, deps });
      return { kind: 'invalid', reason: 'pending_not_supported', result: 'handoff' };
    }
    const nextAttemptAt = new Date(now.getTime() + Math.min(v.pollAfterSeconds, config.verify.backoffCapSeconds) * 1000);
    if (nextAttemptAt > new Date(job.deadlineAt)) {
      await handoffToManual(report._id, report.workflowGeneration, 'deadline_exhausted', { now, at: leaseNow(deps, now), job });
      await finishJob(job, 'failed', 'deadline_exhausted');
      return { kind: 'pending', result: 'exhausted' };
    }
    await rescheduleJob(job, { serviceJobId: v.jobId, nextAttemptAt, attempts: polling ? job.attempts : job.attempts + 1 });
    await logEvent(report._id, 'verify_pending', WORKER_ACTOR, report.workflowGeneration, { pollAfterSeconds: v.pollAfterSeconds });
    return { kind: 'pending', result: 'pending' };
  }

  if (v.stale) {
    // generation שגוי על המשימה הנוכחית: נשמר להיסטוריה בלבד, והדיווח עובר לידני כדי לא להיתקע.
    await recordLateDecision(report._id, v.value, report.workflowGeneration, 'stale_generation');
    await handoffToManual(report._id, report.workflowGeneration, 'response_mismatch', { now, at: leaseNow(deps, now), job });
    await finishJob(job, 'done', 'stale_response');
    return { kind: 'stale', result: 'stale' };
  }
  const route = await applyServiceDecision({ job, report, rev, source, value: v.value, authorityExceeded: v.authorityExceeded, config, deps, now });
  return route ? { kind: 'decided', route, result: 'decided' } : { kind: 'cancelled', result: 'cancelled' };
}

async function applyServiceDecision({ job, report, rev, source, value, authorityExceeded, config, deps, now }) {
  const sentNewLine = computeNewLine(rev);
  // "כבר תוקן" נבדק רק במיקום שנשלח ולשורה המוצעת — לא בכל מקום שהשירות מצביע עליו.
  const c = value.change;
  const sameTarget = c && c.path === source.path && c.lineIndex === source.lineIndex && c.newLine === sentNewLine;
  const localAlreadyFixedVerified = value.decision === 'already_fixed' && sameTarget
    ? await verifyLocallyAlreadyFixed({ source, rev }, config, deps) : false;
  const route = routeVerifyDecision(value, {
    requestedScope: report.verification?.requestedScope || config.verify.requestedScope,
    siteAuthority: config.verify.authority,
    autoPublish: config.autoPublish,
    autoRejectAllowed: config.verify.autoRejectAllowed,
    sentNewLine, sentPath: source.path, sentLineIndex: source.lineIndex, sentBlobSha: source.blobSha, sentRepo: config.source.repo,
    manualActive: false, finalState: false, localAlreadyFixedVerified,
  });
  const decisionEntry = {
    decisionId: value.decisionId, source: 'service', decision: value.decision, scope: value.approvalScope, reasonCode: value.reasonCode,
    message: value.message, revision: rev.revision, generation: report.workflowGeneration, at: now,
  };
  // תנאי ההחזקה (heldBy) נוסף רק ברגע הכתיבה, אחרי הצעדים האיטיים (אימות מקומי, יצירת החבילה): השעון נקרא ממש לפני
  // הכתיבה האטומית — lease שפג בינתיים אינו מכריע, גם בלי תפיסה מתחרה.
  const filter = {
    _id: report._id, workflowGeneration: report.workflowGeneration, state: 'open',
    'verification.requestId': job.requestId, 'manual.status': { $ne: 'claimed' },
  };
  const verificationSet = {
    'verification.status': 'completed', 'verification.decisionId': value.decisionId, 'verification.decision': value.decision,
    'verification.reasonCode': value.reasonCode, 'verification.message': value.message, 'verification.authorityExceeded': authorityExceeded,
    'verification.completedAt': now, 'verification.activeJob': null, 'dispatch.verify': false,
  };
  let update;
  let changeId = null;

  if (route.route === 'publish') {
    const c = value.change;
    changeId = newId('chg');
    await ChangePackage.create({
      changeId, report: report._id, revision: rev.revision, generation: report.workflowGeneration + 1, repo: config.source.repo,
      path: c.path, baseCommitSha: c.baseCommitSha, baseBlobSha: c.baseBlobSha, lineIndex: c.lineIndex, originalLine: c.originalLine,
      newLine: c.newLine, changeDigest: computeChangeDigest({ path: c.path, base_blob_sha: c.baseBlobSha, line_index: c.lineIndex, original_line: c.originalLine, new_line: c.newLine }),
      createdBy: 'service', serviceChangeId: c.changeId,
    });
    update = {
      $set: {
        ...verificationSet, 'approval.authority': 'service', 'approval.scope': 'technical_and_content', 'approval.at': now,
        'approval.revision': rev.revision, 'approval.changeId': changeId, 'publish.status': 'ready', 'publish.changeId': changeId,
        'publish.conflictReason': null, 'dispatch.publish': true, 'manual.status': 'none',
      },
      $inc: { workflowGeneration: 1 },
      $push: { decisions: { ...decisionEntry, changeId } },
    };
  } else if (route.route === 'close_already_fixed') {
    update = {
      $set: { ...verificationSet, state: 'closed_already_fixed', status: 'resolved', 'publish.status': 'skipped_already_fixed', closedAt: now, closeReason: 'service_already_fixed_verified', resolvedAt: now, 'manual.status': 'none' },
      $inc: { workflowGeneration: 1 },
      $push: { decisions: decisionEntry },
    };
  } else if (route.route === 'close_rejected') {
    update = {
      $set: { ...verificationSet, state: 'closed_rejected', status: 'rejected', closedAt: now, closeReason: `service_rejected:${value.reasonCode}`, resolvedAt: now, 'manual.status': 'none' },
      $inc: { workflowGeneration: 1 },
      $push: { decisions: decisionEntry },
    };
  } else {
    const set = { ...verificationSet, ...manualQueueSet(route.handoffReason, now) };
    if (value.decision === 'approved' && value.approvalScope === 'technical_only' && !route.serviceRevision) {
      set['approval.authority'] = 'service';
      set['approval.scope'] = 'technical_only';
      set['approval.at'] = now;
      set['approval.revision'] = rev.revision;
    }
    update = { $set: set, $inc: { workflowGeneration: 1 }, $push: { decisions: decisionEntry } };
    if (route.serviceRevision) {
      const c = value.change;
      update.$push.proposals = {
        revision: (report.proposals?.length || 0) + 1, author: 'service', originalLine: c.originalLine, originalSelection: null, selectionOffset: null,
        proposedText: c.newLine, contextBefore: '', contextAfter: '', targetPath: c.path, targetLineIndex: c.lineIndex, createdAt: now,
        note: `הצעת השירות (${value.decisionId})`,
      };
      update.$set.currentRevision = (report.proposals?.length || 0) + 1;
    }
  }

  // המשימה עדיין מחזיקה בדיווח באותה תפיסה, ב-lease בתוקף ברגע הכתיבה — אחרת בוטלה/הושהתה/נתפסה מחדש/פגה בזמן ההחלה.
  const updated = await ErrorReport.findOneAndUpdate({ ...filter, ...heldBy(job, leaseNow(deps, now)) }, update, { returnDocument: 'after' }).lean();
  if (!updated) {
    // המשימה כבר אינה מחזיקה בדיווח (בוטלה, הושהתה, נתפסה מחדש, ה-lease פג, או שהדיווח השתנה): בלי תופעות לוואי — החבילה
    // שנוצרה לפני העדכון המותנה מוסרת, ואין סגירה, פרסום או מייל. ההחלטה נשמרת להיסטוריה בלבד (stale, כמו כל
    // תשובה מאוחרת — T16). המשימה מסתיימת כמבוטלת רק אם היא עדיין באותה תפיסה (finishJob מותנה ב-fence), ורק כשהדיווח
    // כבר אינו שלה: lease שפג, או שתפיסה חדשה כבר שמרה את ה-fence הבא, נשאר למנגנון ה-lease (תפיסה מחדש / המחזיק החדש).
    if (changeId) await ChangePackage.deleteOne({ changeId });
    await recordLateDecision(report._id, value, report.workflowGeneration, 'condition_failed');
    if (!(await stillMarkedFor(job))) await finishJob(job, 'cancelled', 'superseded');
    return null;
  }
  await logEvent(report._id, 'service_decision', { kind: 'service' }, updated.workflowGeneration, {
    decision: value.decision, scope: value.approvalScope, reasonCode: value.reasonCode, route: route.route, handoff: route.handoffReason ?? null, authorityExceeded, changeId,
  });
  await finishJob(job, 'done', route.route);
  return route.route;
}

// ---------------------------------------------------------------- publish

async function markPublishOutcome({ report, job, attempt, outcome, config, now }) {
  const attemptSet = { status: outcome.status === 'already_fixed' ? 'already_fixed' : outcome.status, commitSha: outcome.commitSha || null, prNumber: outcome.prNumber || null, prUrl: outcome.prUrl || null, prBranch: outcome.branch || null, finishedAt: now };
  await PublishAttempt.updateOne({ attemptId: attempt.attemptId }, { $set: attemptSet });
  const set = { 'publish.updatedAt': now, 'publish.attemptId': attempt.attemptId, 'publish.lastError': null };
  const toMain = config.publish.repo === config.source.repo && config.publish.branch === config.source.ref;
  if (outcome.status === 'committed') {
    Object.assign(set, { 'publish.status': 'committed', 'publish.commitSha': outcome.commitSha, state: 'closed_published', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'published' });
    if (toMain) Object.assign(set, { 'inclusion.status': 'merged_to_main', 'inclusion.at': now });
  } else if (outcome.status === 'pr_opened') {
    // PR חדש (גם אחרי אישור מחדש של דיווח שה-PR הקודם שלו נסגר): מעקב רגיל, לא "ממתין לקליטה".
    Object.assign(set, {
      'publish.status': 'pr_opened', 'publish.commitSha': outcome.commitSha, 'publish.prNumber': outcome.prNumber, 'publish.prUrl': outcome.prUrl, 'publish.branch': outcome.branch,
      'publish.prClosedAt': null, 'publish.absorptionDeadline': null, 'publish.absorptionCheck': null, 'publish.prCloseComment': null,
    });
  } else if (outcome.status === 'already_fixed') {
    Object.assign(set, { 'publish.status': 'skipped_already_fixed', state: 'closed_already_fixed', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'already_fixed_at_publish' });
  }
  // ב-GitHub הכתיבה כבר קרתה: התוצאה נרשמת גם אם ה-generation התקדם בינתיים.
  await ErrorReport.updateOne({ _id: report._id }, { $set: set });
  await logEvent(report._id, 'publish_outcome', WORKER_ACTOR, report.workflowGeneration, { status: outcome.status, commitSha: outcome.commitSha || null, prNumber: outcome.prNumber || null, attemptId: attempt.attemptId });
  if (job) await finishJob(job, 'done', outcome.status);
}

export async function processPublishJob(job, { config, deps, now }) {
  const report = await ErrorReport.findById(job.report).lean();
  // כל ניסיון שהתחיל ולא תועד (גם לחבילה קודמת) נבדק מול GitHub לפני כתיבה נוספת.
  const pendingAttempt = await PublishAttempt.findOne({ report: job.report, status: { $in: ['started', 'unknown'] } }).sort({ createdAt: -1 }).lean();
  const stale = !report || report.state !== 'open' || report.workflowGeneration !== job.generation
    || report.publish?.changeId !== job.changeId || report.approval?.changeId !== job.changeId;
  if (!report) {
    await finishJob(job, 'cancelled', 'report_missing');
    return 'superseded';
  }
  if (stale && !pendingAttempt) {
    await finishJob(job, 'cancelled', 'superseded');
    return 'superseded';
  }
  if (config.publish.mode === 'disabled') {
    await finishJob(job, 'cancelled', 'publish_disabled');
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration }, { $set: { 'dispatch.publish': true } });
    return 'disabled';
  }
  const change = await ChangePackage.findOne({ changeId: job.changeId }).lean();
  if (!change) {
    await finishJob(job, 'failed', 'change_missing');
    return 'failed';
  }
  // fence לפני כל כתיבה: worker שה-lease שלו נלקח לא כותב; למחזיק — ה-lease מוארך לחלון הכתיבה.
  const held = await CorrectionJob.updateOne(
    { _id: job._id, fence: job.fence, status: 'leased' },
    { $set: { leaseExpiresAt: new Date(Math.max(now.getTime(), Date.now()) + config.worker.leaseSeconds * 5000) } },
  );
  if (held.matchedCount !== 1) return 'lease_lost';
  const client = publishClient(config, deps);
  const target = { branch: config.publish.branch, mode: config.publish.mode, maxRefRetries: config.publish.maxRefRetries };
  const authority = report.approval?.authority;

  if (pendingAttempt) {
    await ErrorReport.updateOne({ _id: report._id }, { $set: { 'publish.status': 'unknown_needs_reconcile', 'publish.updatedAt': now } });
    let rec;
    try {
      const attemptChange = pendingAttempt.changeId === change.changeId ? change : await ChangePackage.findOne({ changeId: pendingAttempt.changeId }).lean();
      rec = await reconcilePublish({ client, target: { ...target, mode: pendingAttempt.mode }, report, attemptId: pendingAttempt.attemptId, change: attemptChange, authority });
    } catch (err) {
      return retryPublish({ job, report, config, now, deps, reason: `reconcile_failed:${err.status || 'net'}`, transient: isTransientHttp(err) });
    }
    await logEvent(report._id, 'publish_reconciled', WORKER_ACTOR, report.workflowGeneration, { attemptId: pendingAttempt.attemptId, result: rec.status });
    if (rec.status !== 'not_found') {
      await markPublishOutcome({ report, job, attempt: pendingAttempt, outcome: rec, config, now });
      return rec.status;
    }
    await PublishAttempt.updateOne({ attemptId: pendingAttempt.attemptId }, { $set: { status: 'failed', error: 'not_found_on_reconcile', finishedAt: now } });
    if (stale) {
      await finishJob(job, 'cancelled', 'superseded');
      return 'superseded';
    }
  }

  const attemptId = newId('pa');
  await PublishAttempt.create({ attemptId, report: report._id, changeId: change.changeId, job: job._id, mode: target.mode, repo: config.publish.repo, branch: target.branch });
  const started = await ErrorReport.findOneAndUpdate(
    { _id: report._id, workflowGeneration: report.workflowGeneration, 'publish.changeId': change.changeId, state: 'open' },
    { $set: { 'publish.status': 'in_progress', 'publish.attemptId': attemptId, 'publish.updatedAt': now }, $inc: { 'publish.attempts': 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!started) {
    await PublishAttempt.updateOne({ attemptId }, { $set: { status: 'failed', error: 'superseded_before_write', finishedAt: now } });
    await finishJob(job, 'cancelled', 'superseded');
    return 'superseded';
  }

  let outcome;
  try {
    outcome = await publishChange({ client, target, change, report, attemptId, authority, cache: getSharedSourceCache(config.cacheBytes) });
    if (deps.hooks?.afterPublishWrite) await deps.hooks.afterPublishWrite({ attemptId, outcome });
  } catch (err) {
    if (err instanceof PublishConflict) return handlePublishConflict({ job, report, change, attemptId, err, now });
    if (err?.simulatedCrash) throw err;
    // תקלה באמצע כתיבה = תוצאה לא ידועה; הניסיון הבא יבצע reconciliation לפני כתיבה נוספת.
    await PublishAttempt.updateOne({ attemptId }, { $set: { status: 'unknown', error: String(err?.message || err).slice(0, 300) } });
    return retryPublish({ job, report, config, now, deps, reason: `github_${err?.status || 'network'}`, transient: isTransientHttp(err) });
  }
  await markPublishOutcome({ report, job, attempt: { attemptId }, outcome, config, now });
  return outcome.status;
}

async function retryPublish({ job, report, now, deps, reason, transient }) {
  const attempts = job.attempts + 1;
  const retry = transient
    ? computeRetry({ attempts, maxAttempts: job.maxAttempts, deadlineAt: job.deadlineAt, now, baseSeconds: 60, capSeconds: 3600, random: deps.random || Math.random })
    : { exhausted: true, reason: 'permanent' };
  if (retry.exhausted) {
    await ErrorReport.updateOne({ _id: report._id }, { $set: { 'publish.status': 'failed', 'publish.lastError': reason, 'publish.updatedAt': now, ...manualQueueSet('publish_failed', now) } });
    await logEvent(report._id, 'publish_failed', WORKER_ACTOR, report.workflowGeneration, { reason, attempts });
    await finishJob(job, 'failed', reason, { attempts, lastError: reason });
    return 'failed';
  }
  await rescheduleJob(job, { attempts, nextAttemptAt: retry.nextAttemptAt, lastErrorClass: 'transient', lastError: reason });
  await ErrorReport.updateOne({ _id: report._id }, { $set: { 'publish.lastError': reason, 'publish.updatedAt': now } });
  return 'retry';
}

async function handlePublishConflict({ job, report, change, attemptId, err, now }) {
  await PublishAttempt.updateOne({ attemptId }, { $set: { status: 'conflict', error: err.reason, finishedAt: now } });
  if (CONFLICT_REASONS.has(err.reason)) {
    // הקטע השתנה אחרי האישור → האישור נפסל, ההצעה נשמרת, מתנדב בודק מחדש.
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration }, {
      $set: {
        'publish.status': 'not_ready', 'publish.conflictReason': err.reason, 'publish.updatedAt': now,
        'approval.authority': 'none', 'approval.scope': 'none', 'approval.changeId': null,
        resolvedSource: null, ...manualQueueSet('source_changed_after_approval', now),
      },
      $inc: { workflowGeneration: 1 },
    });
  } else {
    await ErrorReport.updateOne({ _id: report._id }, { $set: { 'publish.status': 'failed', 'publish.lastError': err.reason, 'publish.updatedAt': now, ...manualQueueSet('publish_failed', now) } });
  }
  await logEvent(report._id, 'publish_conflict', WORKER_ACTOR, report.workflowGeneration, { reason: err.reason, changeId: change.changeId, attemptId });
  await finishJob(job, 'failed', `conflict:${err.reason}`);
  return 'conflict';
}

/**
 * מעקב PR: מוזג → committed; נסגר בלי מיזוג → בדיקת קליטה ב-main (closed-pr.js); בסיס השתנה → סימון.
 * מנהל הספרייה מחיל PRs בקומיט מקומי וסוגר אותם, ולכן ב-PR שנסגר הקובע הוא main.
 */
export async function trackOpenPulls({ config, deps, now, limit = 10 }) {
  // הפרסום כבוי: בלי GitHub — אבל דיווח שה-PR שלו נסגר עדיין עובר לידני בתום ההמתנה.
  if (config.publish.mode === 'disabled') return expireAwaitingReports({ config, now, actor: WORKER_ACTOR });
  const tracked = { 'publish.status': 'pr_opened', state: 'open' };
  // PR שנסגרו וממתינים לקליטה נבדקים בתור משלהם, כדי שלא ידחקו את ה-PR הפתוחים (ולהפך).
  const reports = [
    ...await ErrorReport.find({ ...tracked, 'publish.prClosedAt': null }).sort({ 'publish.updatedAt': 1 }).limit(limit).lean(),
    ...await ErrorReport.find({ ...tracked, 'publish.prClosedAt': { $ne: null } }).sort({ 'publish.updatedAt': 1 }).limit(limit).lean(),
  ];
  if (!reports.length) return 0;
  const client = publishClient(config, deps);
  // הקשר לאצווה: main נקרא רק כשיש PR שנסגר ופעם אחת; כל PR והערות הסגירה שלו — פעם אחת (ל-PR מרוכז יש עשרות דיווחים).
  const ctx = { checker: null, client, config, now, actor: WORKER_ACTOR, comments: new Map() };
  const pulls = new Map();
  const getPull = (n) => {
    // PR שאינו קיים עוד (404) נבדק כמו PR שנסגר: התוכן ב-main הוא הקובע.
    if (!pulls.has(n)) pulls.set(n, client.getPull(n).catch((err) => (err.status === 404 ? { number: n, state: 'closed', merged: false, missing: true, labels: [] } : Promise.reject(err))));
    return pulls.get(n);
  };
  let changed = 0;
  for (const r of reports) {
    let pr = null;
    try {
      pr = await getPull(r.publish.prNumber);
      if (pr.merged) {
        const toMain = config.publish.repo === config.source.repo && config.publish.branch === config.source.ref;
        await ErrorReport.updateOne({ _id: r._id, 'publish.status': 'pr_opened' }, {
          $set: { 'publish.status': 'committed', 'publish.commitSha': pr.mergeCommitSha || r.publish.commitSha, 'publish.updatedAt': now, state: 'closed_published', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'pr_merged', ...(toMain ? { 'inclusion.status': 'merged_to_main', 'inclusion.at': now } : {}) },
        });
        await logEvent(r._id, 'pr_merged', WORKER_ACTOR, r.workflowGeneration, { prNumber: pr.number });
        changed += 1;
      } else if (pr.state === 'closed') {
        ctx.checker ??= createAbsorptionChecker({ config, deps });
        if (await processClosedPull(r, pr, ctx)) changed += 1;
      } else {
        // PR פתוח (או שנפתח מחדש אחרי סגירה) → המעקב הרגיל (prClosedAt מתאפס). GitHub כבר אישר שה-PR פתוח, ולכן
        // כשל בבדיקת המקור הנוספת (סימון "הבסיס השתנה") אינו מעביר לידני: הסימון הקודם נשאר והשגיאה נרשמת.
        const set = { 'publish.prClosedAt': null, 'publish.updatedAt': now };
        try {
          const change = await ChangePackage.findOne({ changeId: r.publish.changeId }).lean();
          if (change) {
            const git = createGitSource({ client, ref: config.publish.branch, cache: getSharedSourceCache(config.cacheBytes) });
            const head = await git.getHead();
            const f = await git.getFile(change.path, head.commitSha);
            const m = f ? matchLine(f.content, { originalLine: change.originalLine, lineIndex: change.lineIndex, newLine: change.newLine }) : null;
            const conflict = !m || (m.status !== 'exact' && m.status !== 'already_applied') || m.lineIndex !== change.lineIndex;
            set['publish.conflictReason'] = conflict ? 'base_changed_while_pr_open' : null;
          }
        } catch (err) {
          set['publish.lastError'] = `pr_source_check_failed:${err.status || 'net'}`;
        }
        // מותנה במצב שנקרא: אצווה ישנה אינה מאפסת את prClosedAt בדיווח שכבר עבר לידני או נסגר בינתיים.
        await ErrorReport.updateOne({ _id: r._id, state: 'open', 'publish.status': 'pr_opened', 'publish.prClosedAt': r.publish.prClosedAt ?? null }, { $set: set });
      }
    } catch (err) {
      await ErrorReport.updateOne({ _id: r._id }, { $set: { 'publish.lastError': `pr_track_failed:${err.status || 'net'}`, 'publish.updatedAt': now } });
      // PR סגור (או ממתין) שבדיקתו נכשלת — גם שוב ושוב — יוצא מההמתנה בתום הזמן, בלי תלות ב-GitHub. PR ש-GitHub
      // החזיר פתוח (או ממוזג) אינו נכנס לכאן גם כשהדיווח עדיין מסומן כממתין: הוא אינו סגור.
      if (pr ? pr.state === 'closed' && !pr.merged : Boolean(r.publish.prClosedAt)) {
        const res = await onClosedPullError(r, { now, config, actor: WORKER_ACTOR }).catch(() => null);
        if (res === 'handoff' || (res === 'awaiting' && !r.publish.prClosedAt)) changed += 1;
      }
    }
  }
  return changed;
}

// ---------------------------------------------------------------- batch

async function runPool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// חריגה לא צפויה נספרת כניסיון; בלי זה משימה "רעילה" נתפסת מחדש בכל תפוגת lease, לנצח.
async function recordCrash(job, { config, deps, now }) {
  const attempts = job.attempts + 1;
  const retry = computeRetry({
    attempts, maxAttempts: job.maxAttempts, deadlineAt: job.deadlineAt, now,
    baseSeconds: config.verify.backoffBaseSeconds, capSeconds: config.verify.backoffCapSeconds, random: deps.random || Math.random,
  });
  const failure = { attempts, lastErrorClass: FAILURE_CLASS.UNKNOWN, lastError: 'worker_error' };
  if (!retry.exhausted) return rescheduleJob(job, { ...failure, nextAttemptAt: retry.nextAttemptAt });
  if (!(await finishJob(job, 'failed', 'worker_error', failure))) return false;
  // המעבר מותנה בגרסה שהמשימה שנכשלה שייכת לה: כשל של משימה ישנה לא נוגע בגרסה חדשה של הדיווח (שליחה מחודשת).
  if (job.type === 'verify') {
    const report = await ErrorReport.findById(job.report).lean();
    if (!isStaleVerifyJob(job, report)) await handoffToManual(report._id, job.generation, 'worker_error', { now });
  } else {
    await ErrorReport.updateOne(
      { _id: job.report, state: 'open', 'publish.changeId': job.changeId },
      { $set: { 'publish.status': 'failed', 'publish.lastError': 'worker_error', 'publish.updatedAt': now, ...manualQueueSet('publish_failed', now) } },
    );
  }
  return true;
}

async function processClaimed(type, { config, deps, now, workerId }) {
  const jobs = [];
  for (let n = 0; n < config.worker.batchSize; n++) {
    // lease ארוך יותר לפרסום: כתיבה ל-GitHub כוללת כמה קריאות עם timeouts.
    const leaseSeconds = type === 'publish' ? config.worker.leaseSeconds * 5 : config.worker.leaseSeconds;
    const job = await claimJob(type, { workerId, now, leaseSeconds });
    if (!job) break;
    jobs.push(job);
  }
  const fn = type === 'verify' ? processVerifyJob : processPublishJob;
  return runPool(jobs, config.worker.concurrency, async (job) => {
    try {
      return await fn(job, { config, deps, now });
    } catch (err) {
      if (err?.simulatedCrash) throw err;
      console.error(`[corrections] ${type} job ${job._id} failed:`, err?.message);
      await recordCrash(job, { config, deps, now }).catch((e) => console.error('[corrections] recordCrash failed:', e?.message));
      return 'error';
    }
  });
}

/**
 * אצווה אחת של ה-worker. בטוח להרצה מקבילה בכמה תהליכים (תפיסה אטומית + fence).
 * @param {{config:object, workerId:string, deps?:{verifyFetch?:Function, githubFetch?:Function, random?:Function, hooks?:object}, now?:Date}} args
 */
export async function runWorkerBatch({ config, workerId, deps = {}, now = new Date() }) {
  const stats = { startedAt: now, drained: 0, dispatched: 0, verify: [], swept: 0, publish: [], prTracked: 0, error: null };
  try {
    if (!config.verify.enabled) stats.drained = await drainVerifyToManual({ reason: config.verify.disabledReason, now });
    // בדחיפה אין מטאטא — רשת הביטחון של "ממתין לבדיקה בלי משימה" רצה כאן, לפני ה-outbox.
    if (config.verify.enabled && config.verify.transport !== 'pull') stats.requeued = await requeueStrandedVerifications({ now });
    stats.dispatched = await dispatchOutbox({ config, now });
    // משיכה: השירות תופס את משימות הבדיקה בעצמו (agent.js); האצווה לא פונה אליו, רק מטאטאת את אלה שפג זמנן.
    if (config.verify.enabled && config.verify.transport === 'pull') stats.swept = await sweepExpiredVerifyJobs({ now });
    // שעון הכתיבות המותנות-lease מתחיל עם now של האצווה (התפיסות והתוקף נספרים ממנו).
    else if (config.verify.enabled) stats.verify = await processClaimed('verify', { config, deps: withLeaseClock(deps, now), now, workerId });
    if (config.publish.mode !== 'disabled') stats.publish = await processClaimed('publish', { config, deps, now, workerId });
    stats.prTracked = await trackOpenPulls({ config, deps, now });
  } catch (err) {
    if (err?.simulatedCrash) throw err;
    stats.error = String(err?.message || err).slice(0, 300);
  }
  await WorkerHeartbeat.updateOne(
    { workerId },
    { $set: { lastBeatAt: new Date(), lastBatch: { ...stats, finishedAt: new Date() }, lastError: stats.error } },
    { upsert: true },
  );
  return stats;
}
