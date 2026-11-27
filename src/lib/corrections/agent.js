/**
 * שכבת המשיכה של שירות הבדיקה (CONTRACT §3.7): השירות תופס משימת בדיקה, מחזיק אותה ב-lease
 * ומוסר את ההחלטה. ההכנה, האימות והניתוב הם אלה של הדחיפה (worker.js) — רק ההעברה שונה.
 * כל כתיבה מותנית ב-fence של המשימה וב-hash של אסימון ה-lease; האסימון עצמו אינו נשמר.
 */
import { createHash } from 'node:crypto';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import CorrectionsAgentState from '../../models/CorrectionsAgentState.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { newLeaseToken, hashLeaseToken, isLeaseTokenShape } from '../servicePlugins/workerAuth.js';
import { validateVerifyResponse } from './verify-protocol.js';
import {
  prepareVerify, loadVerifyContext, applyVerifyResponse, finishJob, handoffToManual, recordLateDecision,
  sweepExpiredVerifyJobs, dispatchVerifyOutbox, drainVerifyToManual, isStaleVerifyJob, heldBy, recordCrash, isTransientPrepareError,
  withLeaseClock, leaseNow, extendVerifyMarker, allocateVerifyLease, budgetExceededError,
} from './worker.js';
import { FAILURE_CLASS } from './classify.js';
import { logEvent, WORKER_ACTOR } from './store.js';
import { restGate, restWindowAhead } from './rest-gate.js';

const AGENT_ACTOR = Object.freeze({ kind: 'service' });
const JOB_ID_RE = /^[a-f0-9]{24}$/;
const APPLY_RETRY_AFTER_SECONDS = 30;
const fail = (status, code, extra = {}) => ({ ok: false, status, code, ...extra });
const leaseUntil = (now, config) => new Date(now.getTime() + config.agent.leaseSeconds * 1000);
const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

// המשימה מוחזקת ב-lease בתוקף של אותה תפיסה (fence) ואותו אסימון.
const heldFilter = (job, now) => ({ _id: job._id, fence: job.fence, status: 'leased', leaseTokenHash: job.leaseTokenHash, leaseExpiresAt: { $gt: now } });

// ---------------------------------------------------------------- claim

/**
 * תפיסה של הוותיקה שהגיע זמנה (או שה-lease שלה פג — נספר כפקיעה), דרך allocateVerifyLease: ה-fence החדש נשמר קודם
 * בסימון שבדיווח. משימה שעבר מועדה — למטאטא.
 */
function takeNextJob({ config, agentId, tokenHash, now }) {
  return allocateVerifyLease(
    {
      type: 'verify',
      deadlineAt: { $gt: now },
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'leased', leaseExpiresAt: { $lte: now } },
      ],
    },
    [{
      $set: {
        leaseExpiries: { $add: [{ $ifNull: ['$leaseExpiries', 0] }, { $cond: [{ $eq: ['$status', 'leased'] }, 1, 0] }] },
        status: 'leased',
        leaseOwner: { $literal: agentId },
        leaseTokenHash: { $literal: tokenHash },
        leaseExpiresAt: { $literal: leaseUntil(now, config) },
        resultSha256: null,
        resultOutcome: null,
        resultReason: null,
        fence: { $add: [{ $ifNull: ['$fence', 0] }, 1] },
      },
    }],
    { sort: { nextAttemptAt: 1, _id: 1 }, updatePipeline: true },
  );
}

// סיום המשימה (מותנה ב-fence) והעברת הדיווח לידני — אם הוא עדיין של אותה משימה.
async function failJobToManual(job, reason, now, data = null) {
  if (!(await finishJob(job, 'failed', reason, { lastError: reason }))) return false;
  const report = await ErrorReport.findById(job.report).lean();
  if (!isStaleVerifyJob(job, report)) await handoffToManual(report._id, report.workflowGeneration, reason, { now, data });
  return true;
}

// לוג מינימלי בכוונה: שם/קוד החריגה בלבד (message/stack עלולים להכיל תוכן דיווח).
const logFailure = (what, job, err) => console.error(`[corrections-agent] ${what} job=${job?._id} name=${String(err?.name ?? 'unknown')} code=${String(err?.code ?? '-')}`);

/**
 * אצווה מלאה דרושה: פרסום ממתין ב-outbox, או שאף אצווה לא רצה AGENT_BATCH_INTERVAL_SECONDS. כך התפיסות
 * של הסוכן מקדמות גם פרסום, ניסיונות חוזרים ומעקב PR כשאין cron. בכל מקרה לא יותר מאחת בערך כל
 * AGENT_BATCH_MIN_GAP_SECONDS: פרסום תקוע ב-outbox לא הופך כל תפיסה (פעם בדקה, או מהר יותר מסוכן פגום) לאצווה.
 */
async function isBatchDue({ config, now }) {
  const [beat] = await WorkerHeartbeat.find({}).sort({ lastBeatAt: -1 }).limit(1).select('lastBeatAt').lean();
  const sinceMs = beat ? now.getTime() - new Date(beat.lastBeatAt).getTime() : Infinity;
  if (sinceMs < config.agent.batchMinGapSeconds * 1000) return false;
  if (sinceMs >= config.agent.batchIntervalSeconds * 1000) return true;
  return config.publish.mode !== 'disabled' && Boolean(await ErrorReport.exists({ 'dispatch.publish': true, state: 'open' }));
}

/** תפיסה או תוצאה של הסוכן — עבודת התור עצמה (דף הבריאות: אין "worker לא רץ" כשהסוכן פעיל). */
export async function recordAgentWork({ agentId, now = new Date() }) {
  if (!agentId) return;
  await CorrectionsAgentState.updateOne({ agentId }, { $max: { lastWorkAt: now, lastSeenAt: now } }, { upsert: true });
}

/**
 * תפיסת משימת הבדיקה הבאה. דיווח שהמקור שלו לא אותר עובר לידני ו"כבר הוחל" מדויק נסגר — שניהם
 * לעולם לא נמסרים — ונבדקת המשימה הבאה. batchDue — על הראוט להריץ אצווה מלאה אחרי התשובה.
 * תקציב הזמן (AGENT_CLAIM_BUDGET_MS) נספר מתחילת הבקשה — מהכניסה לראוט (startedAt), כולל האימות, המסד ו"נראה
 * לאחרונה" — ומכסה כל פעולה בה: פעולות התור, כתיבות למסד וקריאות GitHub. בקשה שכבר חרגה ממנו לפני התפיסה אינה נוגעת
 * בתור כלל, והוא נבדק שוב אחרי כל שלב ("נראה לאחרונה", המטאטא, ה-outbox, כל תפיסה וההכנה שלה) וממש לפני המסירה; כל
 * העבודה שאחרי המסירה נעשית לפניה, כך שאין lease באסימון שלא נמסר. מרגע שהתקציב נגמר אין עוד תופעות לוואי: תשובת
 * "אין עבודה" (204) בלי outbox, בלי משימה ובלי אצווה (batchDue=false).
 * @param {{startedAt?:number}} args startedAt — קריאת השעון (deps.clock או Date.now) בתחילת הבקשה; בלעדיו — מכאן
 * @returns {Promise<{job:({jobId:string, leaseToken:string, leaseExpiresAt:Date, request:object}|null), retryAfter?:number, batchDue:boolean}>}
 *   request — גוף חוזה B §3.1 בדיוק
 */
export async function claimVerifyJob({ config, agentId, deps = {}, now = new Date(), startedAt = null }) {
  const clock = deps.clock || Date.now;
  const fromRequestStart = Number.isFinite(startedAt);
  const started = fromRequestStart ? startedAt : clock();
  const budget = {
    remainingMs: () => config.agent.claimBudgetMs - (clock() - started),
    exceeded: () => clock() - started >= config.agent.claimBudgetMs,
  };
  // הבקשה התעכבה עוד לפני התפיסה (אימות, מסד), או ש"נראה לאחרונה" עצמו מיצה את התקציב: הלקוח עלול כבר להתנתק —
  // בלי משימה, בלי lease, בלי לגעת בתור ובלי אצווה; הסוכן ינסה שוב בקרוב.
  const spent = { job: null, retryAfter: config.agent.busyRetrySeconds, batchDue: false };
  if (fromRequestStart && budget.exceeded()) return spent;
  const lease = withLeaseClock(deps, now);
  await recordAgentWork({ agentId, now });
  if (budget.exceeded()) return spent;
  const batchDue = await isBatchDue({ config, now });
  const claimed = await claimNext({ config, agentId, deps: lease, now, budget });
  // 204 אחרי שהתקציב נגמר (באחד השלבים, או בדרך החוצה) — בלי אצווה לצידו.
  if (!claimed.job && budget.exceeded()) return { ...claimed, batchDue: false };
  return { ...claimed, batchDue };
}

async function claimNext({ config, agentId, deps, now, budget }) {
  const spent = () => ({ job: null, retryAfter: config.agent.busyRetrySeconds });
  if (budget.exceeded()) return spent();
  if (!config.verify.enabled) {
    // הושהתה/כובתה: כל משימה פתוחה מבוטלת מיד והדיווחים עוברים לידני (כמו באצווה) — בלי לחכות ל-cron,
    // ובלי שהסוכן ייענש בפקיעת lease כשהבדיקה תחודש.
    await drainVerifyToManual({ reason: config.verify.disabledReason, now });
    return { job: null, retryAfter: config.agent.disabledRetrySeconds };
  }
  // הסוכן פונה כל דקה כשאין עבודה, ולכן גם בלי cron: מטאטא ו-outbox רצים כאן (שניהם אידמפוטנטיים).
  await sweepExpiredVerifyJobs({ now });
  // כל שלב נבדק מול התקציב לפני הבא: מטאטא שמיצה אותו אינו ממשיך ל-outbox (שיוצר משימות).
  if (budget.exceeded()) return spent();
  await dispatchVerifyOutbox({ config, now });
  // שבת/יו"ט עכשיו, או חלון מנוחה שיתחיל לפני שה-lease ייגמר — לא מוסרים משימה (היא לא תוכל להסתיים).
  const rest = restGate(now);
  if (rest.closed) return { job: null, retryAfter: rest.retryAfter };
  const ahead = restWindowAhead(now, config.agent.leaseSeconds * 1000);
  if (ahead) return { job: null, retryAfter: ahead.retryAfter };
  for (let n = 0; n < config.agent.claimScan; n++) {
    // תקציב זמן: תפיסה שהתעכבה (תור, מסד, מקורות איטיים) חוזרת לפני שהלקוח מתנתק ב-timeout (ואז היה נשאר lease
    // באסימון שלא נמסר). נבדק לפני כל תפיסה — גם הראשונה, אחרי פעולות התור — ושוב לפני המסירה.
    if (budget.exceeded()) return spent();
    const token = newLeaseToken();
    const job = await takeNextJob({ config, agentId, tokenHash: hashLeaseToken(token), now });
    if (!job) return { job: null, retryAfter: config.agent.idleRetrySeconds };
    // לקיחת המשימה עצמה (תור או מסד איטיים) מיצתה את התקציב: חוזרת לתור לפני כל הכנה — בלי סימון, בלי ניסיון ובלי פקיעה.
    if (budget.exceeded()) {
      await returnToQueue(job, now, { reason: 'claim_budget' }).catch((e) => logFailure('budget release failed', job, e));
      return spent();
    }
    if (job.leaseExpiries >= config.agent.maxLeaseExpiries) {
      // הסוכן איבד את המשימה שוב ושוב (קריסה/ניתוק חוזרים, או דיווח שמפיל אותו) → ידני בסיבה נפרדת.
      await failJobToManual(job, 'lease_expired_repeatedly', now, { leaseExpiries: job.leaseExpiries });
      continue;
    }
    let prep;
    try {
      // יתרת התקציב מועברת להכנה כ-timeout לקריאות GitHub (worker.js, withClaimBudget).
      prep = await prepareVerify(job, { config, deps: { ...deps, claimBudget: { remainingMs: budget.remainingMs } }, now });
      if (prep.ready) {
        // וגם לפני הסימון "בבדיקה": אחרי שהתקציב נגמר אין כתיבה לדיווח (המשימה חוזרת לתור למטה)
        if (budget.exceeded()) throw budgetExceededError();
        const res = await ErrorReport.updateOne({ _id: prep.report._id, workflowGeneration: prep.report.workflowGeneration, ...heldBy(job, leaseNow(deps, now)) }, { $set: { 'verification.status': 'in_progress' } });
        // הדיווח עבר לאחר בין ההכנה לכאן (השהיה, מתנדב): המשימה אינה נמסרת.
        if (res.matchedCount !== 1) {
          await finishJob(job, 'cancelled', 'superseded');
          continue;
        }
      }
    } catch (err) {
      logFailure('prepare failed', job, err);
      if (err?.budgetExceeded) {
        // התקציב נגמר באמצע ההכנה: אינו כשל של הדיווח. המשימה חוזרת לתור מיד, בלי ניסיון, בלי פקיעה ובלי lease.
        await returnToQueue(job, now, { reason: 'claim_budget' }).catch((e) => logFailure('budget release failed', job, e));
        return spent();
      }
      if (isTransientPrepareError(err)) {
        // תקלת מסד/רשת רגעית: ניסיון נספר ו-backoff (כמו בדחיפה); לידני רק כשהניסיונות נגמרו.
        await recordCrash(job, { config, deps, now, reason: 'prepare_failed', cls: FAILURE_CLASS.TRANSIENT }).catch((e) => logFailure('prepare retry failed', job, e));
        return { job: null, retryAfter: config.agent.idleRetrySeconds };
      }
      // כשל דטרמיניסטי של דיווח אחד: לידני, והלאה (בלי להפיל את התפיסה ובלי lease באסימון שלא נמסר).
      await failJobToManual(job, 'prepare_failed', now).catch((e) => logFailure('prepare cleanup failed', job, e));
      continue;
    }
    if (!prep.ready) {
      // GitHub לא זמין: המשימה נדחתה ב-backoff, ואין טעם לנסות את הבאות באותה בקשה.
      if (prep.transient) return { job: null, retryAfter: config.agent.idleRetrySeconds };
      continue;
    }
    // הכנה וכתיבות למסד שהתעכבו מעבר לתקציב — המשימה חוזרת לתור מיד, בלי ניסיון, בלי פקיעה ובלי lease (האסימון לא
    // נמסר ובוטל), והסוכן ינסה שוב בקרוב. נבדק אחרי ההכנה (בלי לרשום "נתפסה"), ושוב ממש לפני המסירה.
    const release = async () => {
      await returnToQueue(job, now, { reason: 'claim_budget' }).catch((e) => logFailure('budget release failed', job, e));
      return spent();
    };
    if (budget.exceeded()) return release();
    const { report } = prep;
    await logEvent(report._id, 'verify_claimed', AGENT_ACTOR, report.workflowGeneration, {
      agentId, leaseExpiresAt: job.leaseExpiresAt, leaseExpiries: job.leaseExpiries,
    });
    if (budget.exceeded()) return release();
    return { job: { jobId: String(job._id), leaseToken: token, leaseExpiresAt: job.leaseExpiresAt, request: prep.request } };
  }
  // נגמרה הסריקה וכל המשימות שנבדקו דולגו (לידני / נסגרו) — ייתכן שיש עוד עבודה: לחזור מהר.
  return { job: null, retryAfter: config.agent.busyRetrySeconds };
}

// ---------------------------------------------------------------- heartbeat / result

/** המשימה לפי מזהה; held=true רק כשהאסימון הוא של התפיסה הנוכחית שלה. null = לא קיימת. */
async function findJob(jobId, token) {
  if (typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) return null;
  const held = isLeaseTokenShape(token)
    ? await CorrectionJob.findOne({ _id: jobId, type: 'verify', leaseTokenHash: hashLeaseToken(token) }).lean()
    : null;
  if (held) return { job: held, held: true };
  const job = await CorrectionJob.findOne({ _id: jobId, type: 'verify' }).lean();
  return job ? { job, held: false } : null;
}

/**
 * דופק: מאריך את ה-lease. cancelled=true כשהמשימה כבר אינה של השירות: מתנדב לקח את הדיווח,
 * ה-generation התחלף, המשימה בוטלה/נסגרה, הבדיקה הושהתה, או שעבר מועד המיצוי שלה.
 * @returns {Promise<{ok:true, cancelled:boolean, leaseExpiresAt:(Date|null)} | {ok:false, status:number, code:string}>}
 */
export async function heartbeatVerifyJob({ config, jobId, token, deps = {}, now = new Date() }) {
  const lease = withLeaseClock(deps, now);
  const found = await findJob(jobId, token);
  if (!found) return fail(404, 'not_found');
  if (!found.held) return fail(409, 'lease_invalid');
  const { job } = found;
  const cancelled = { ok: true, cancelled: true, leaseExpiresAt: null };
  if (job.status !== 'leased') return cancelled;
  if (job.leaseExpiresAt <= now) return fail(409, 'lease_expired');
  const report = await ErrorReport.findById(job.report).lean();
  if (isStaleVerifyJob(job, report)) {
    if ((await finishJob(job, 'cancelled', 'superseded')) && report) {
      await logEvent(report._id, 'verify_job_superseded', WORKER_ACTOR, report.workflowGeneration, { jobGeneration: job.generation });
    }
    return cancelled;
  }
  // הארכה: המשימה קודם ורק אחר כך הסימון בדיווח, שתיהן ב-$max — התוקף בסימון לעולם אינו מאוחר משל המשימה (worker.js,
  // heldBy). גם לפני השהיה/מיצוי: ההעברה לידני מטעם המשימה מותנית ב-lease בתוקף שבסימון.
  const leaseExpiresAt = leaseUntil(now, config);
  const res = await CorrectionJob.updateOne(heldFilter(job, now), { $max: { leaseExpiresAt } });
  if (res.matchedCount !== 1) return fail(409, 'lease_invalid');
  if (!(await extendVerifyMarker(job, leaseExpiresAt))) {
    // הסימון כבר אינו של התפיסה הזו: הדיווח עבר לאחר, או שתפיסה חדשה כבר שמרה את ה-fence הבא. המשימה חוזרת לתור מיד
    // (בלי ניסיון ובלי פקיעה), והתפיסה הבאה מכריעה — ממשיכה את ה-fence השמור, או מבטלת משימה של דיווח שעבר לאחר.
    await returnToQueue(job, now, { reason: 'marker_lost' });
    return cancelled;
  }
  // הושהתה/כובתה: המשימה מבוטלת והדיווח עובר לידני מיד (כמו drainVerifyToManual), בלי פקיעה.
  // הדיווח קודם (ההעברה לידני מנקה את סימון המשימה באותו עדכון) ורק אחר כך המשימה: תוצאה שבאמצע ההחלה אינה
  // נכתבת אחרי הביטול.
  if (!config.verify.enabled) {
    await handoffToManual(report._id, report.workflowGeneration, config.verify.disabledReason, { now, at: leaseNow(lease, now), verificationStatus: 'skipped_service_disabled', job });
    await finishJob(job, 'cancelled', 'service_disabled');
    return cancelled;
  }
  if (job.deadlineAt <= now) {
    await handoffToManual(report._id, report.workflowGeneration, 'deadline_exhausted', { now, at: leaseNow(lease, now), job });
    await finishJob(job, 'failed', 'deadline_exhausted');
    return cancelled;
  }
  // חלון מנוחה יתחיל לפני שה-lease המוארך ייגמר: המשימה חוזרת לתור עד אחריו, בלי ניסיון ובלי פקיעה.
  const ahead = restWindowAhead(now, config.agent.leaseSeconds * 1000);
  if (ahead) {
    await returnToQueue(job, ahead.end, { reason: 'rest_window' });
    return cancelled;
  }
  return { ok: true, cancelled: false, leaseExpiresAt };
}

/**
 * שחרור: השירות מחזיר את המשימה לתור (למשל כשבניית db או OCR צריכים את המחשב) — בלי ניסיון ובלי פקיעה.
 * retryAfterSeconds (אופציונלי, עד התקרה) — לא לפני מתי היא תימסר שוב; מועד המיצוי ממשיך לחול.
 * @returns {Promise<{ok:true, released:boolean, nextAttemptAt?:Date} | {ok:false, status:number, code:string}>}
 */
export async function releaseVerifyJob({ config, jobId, token, retryAfterSeconds = 0, now = new Date() }) {
  const found = await findJob(jobId, token);
  if (!found) return fail(404, 'not_found');
  if (!found.held) return fail(409, 'lease_invalid');
  const { job } = found;
  // המשימה כבר אינה של השירות (בוטלה/נסגרה/הוחזרה) — אין מה לשחרר.
  if (job.status !== 'leased') return { ok: true, released: false };
  const delay = Math.min(Math.max(0, retryAfterSeconds || 0), config.verify.backoffCapSeconds);
  const nextAttemptAt = new Date(now.getTime() + delay * 1000);
  if (!(await returnToQueue(job, nextAttemptAt, { retryAfterSeconds: delay }))) return fail(409, 'lease_invalid');
  return { ok: true, released: true, nextAttemptAt };
}

// המשימה חוזרת ל-pending (לא לפני nextAttemptAt) בלי ניסיון ובלי פקיעה, והאסימון מבוטל. תוצאה שכבר
// ביישום (resultSha256) אינה משוחררת מתחתיה.
async function returnToQueue(job, nextAttemptAt, data) {
  const res = await CorrectionJob.updateOne(
    { _id: job._id, fence: job.fence, status: 'leased', leaseTokenHash: job.leaseTokenHash, resultSha256: null },
    { $set: { status: 'pending', nextAttemptAt, leaseOwner: null, leaseExpiresAt: null, leaseTokenHash: null } },
  );
  if (res.matchedCount !== 1) return false;
  await ErrorReport.updateOne({ _id: job.report, workflowGeneration: job.generation, state: 'open' }, { $set: { 'verification.status': 'queued' } });
  await logEvent(job.report, 'verify_released', AGENT_ACTOR, job.generation, data);
  return true;
}

/** החלטה שהגיעה בלי lease בתוקף: נשמרת לתיעוד בלבד (stale), פעם אחת לכל decision_id. */
async function recordLateResult(job, body, why, config) {
  try {
    const report = await ErrorReport.findById(job.report).select('_id workflowGeneration').lean();
    if (!report) return;
    const request = { request_id: job.requestId, report_id: String(job.report), proposal_revision: job.proposalRevision };
    const v = validateVerifyResponse(body, { request, currentGeneration: report.workflowGeneration, siteAuthority: config.verify.authority });
    if (v.ok && v.kind === 'decision') await recordLateDecision(report._id, v.value, report.workflowGeneration, why, { onlyOnce: true });
  } catch (err) {
    // תיעוד בלבד — כשל בו אינו משנה את התשובה לשירות.
    logFailure('late result not recorded', job, err);
  }
}

const ERROR_OUTCOMES = { invalid_result: 422, stale_generation: 409, apply_failed: 409 };

// תשובה לשליחה חוזרת של גוף שכבר נקלט: אותה תוצאה, בלי להחיל שוב.
function replay(outcome, reason) {
  if (!ERROR_OUTCOMES[outcome]) return { ok: true, outcome, ...(outcome === 'cancelled' ? { cancelled: true } : {}), duplicate: true };
  return fail(ERROR_OUTCOMES[outcome], outcome, reason ? { reason } : {});
}

async function notApplied({ jobId, sha, body, config, now }) {
  const job = await CorrectionJob.findById(jobId).lean();
  const live = job.status === 'leased' && job.leaseExpiresAt > now;
  if (job.resultSha256 === sha) {
    if (job.resultOutcome) return replay(job.resultOutcome, job.resultReason);
    if (live) return fail(503, 'apply_in_progress', { retryAfter: APPLY_RETRY_AFTER_SECONDS });
  }
  let code = 'lease_invalid';
  if (job.resultSha256 && job.resultSha256 !== sha) code = 'result_conflict';
  else if (job.status === 'leased' && !live) code = 'lease_expired';
  await recordLateResult(job, body, code, config);
  return fail(409, code);
}

// התשובה השמורה לשליחה חוזרת — רק של התפיסה ששומרת אותה (fence): מחזיק ישן ששלח בדיוק אותו גוף (אותה טביעה) אינו
// דורס את התשובה של המחזיק החדש (למשל manual → cancelled), שליחה חוזרת שלו הייתה מקבלת אז תשובה שגויה.
const saveOutcome = (job, sha, outcome, reason = null) => CorrectionJob.updateOne({ _id: job._id, fence: job.fence, resultSha256: sha }, { $set: { resultOutcome: outcome, resultReason: reason } });

/**
 * תוצאת השירות: הגוף הוא חוזה B §3.2 (שדות נוספים כמו evidence נסבלים ונשמטים כאן). אותו אימות
 * ואותו ניתוב כמו בדחיפה. lease שאינו בתוקף / generation ישן → 409, וההחלטה נשמרת כמאוחרת בלבד.
 * שליחה חוזרת של אותו גוף (sha256) מקבלת את אותה תשובה בלי להחיל שוב.
 * @param {{raw:Buffer, body:any}} args הגוף כפי שהתקבל (raw) ומפוענח (body)
 * @returns {Promise<{ok:true, outcome:string, publish?:boolean, duplicate?:boolean}
 *   | {ok:false, status:number, code:string, reason?:string, retryAfter?:number}>}
 */
export async function submitVerifyResult({ config, agentId = null, jobId, token, raw, body, deps: given = {}, now = new Date() }) {
  const deps = withLeaseClock(given, now);
  const found = await findJob(jobId, token);
  if (!found) return fail(404, 'not_found');
  await recordAgentWork({ agentId, now });
  const sha = sha256Hex(raw);
  // נעילת ההחלה: חידוש ה-lease וטביעת הגוף בעדכון אחד — שליחה מקבילה או מאוחרת לא תחיל פעמיים.
  const leaseExpiresAt = leaseUntil(now, config);
  const job = found.held
    ? await CorrectionJob.findOneAndUpdate(
      { ...heldFilter(found.job, now), resultSha256: null },
      { $max: { leaseExpiresAt }, $set: { resultSha256: sha } },
      { returnDocument: 'after' },
    ).lean()
    : null;
  if (!job) return notApplied({ jobId: found.job._id, sha, body, config, now });
  // ואחרי המשימה — הסימון בדיווח (גם סימון ישן בלי תוקף). דיווח שכבר אינו של התפיסה: ההחלטה המותנית תיכשל ממילא.
  await extendVerifyMarker(job, leaseExpiresAt);
  try {
    if (!config.verify.enabled) return await cancelPausedResult({ job, sha, body, config, deps, now });
    return await applyResult({ job, sha, body, config, deps, now });
  } catch (err) {
    // חריגה לא צפויה ביישום: הדיווח אינו נשאר "בבדיקה" והמשימה אינה נשארת נעולה — לידני בסיבה
    // מפורשת, ושליחה חוזרת של אותו גוף מקבלת אותה תשובה (לא 503/500 בלולאה).
    logFailure('result apply failed', job, err);
    if (!(await failJobToManual(job, 'result_apply_failed', now))) throw err;
    await saveOutcome(job, sha, 'apply_failed');
    return fail(409, 'apply_failed');
  }
}

/**
 * הבדיקה הושהתה/כובתה: התוצאה אינה מוחלת (גם לא "כבר תוקן"). אותה תוצאה כמו בדופק — cancelled: המשימה מבוטלת
 * ומשוחררת בלי קנס, והדיווח, אם הוא עדיין של המשימה, עובר למסלול שבלי בדיקה (ידני, skipped_service_disabled).
 * ההחלטה נשמרת לתיעוד בלבד, ושליחה חוזרת של אותו גוף מקבלת אותה תשובה.
 */
async function cancelPausedResult({ job, sha, body, config, deps, now }) {
  await recordLateResult(job, body, config.verify.disabledReason, config);
  const report = await ErrorReport.findById(job.report).lean();
  if (!isStaleVerifyJob(job, report)) {
    await handoffToManual(report._id, job.generation, config.verify.disabledReason, { now, at: leaseNow(deps, now), verificationStatus: 'skipped_service_disabled', job });
  }
  await finishJob(job, 'cancelled', 'service_disabled');
  await saveOutcome(job, sha, 'cancelled');
  return { ok: true, outcome: 'cancelled', cancelled: true };
}

async function applyResult({ job, sha, body, config, deps, now }) {
  const ctx = await loadVerifyContext(job, { config });
  if (ctx.stale) {
    // הדיווח השתנה מאז התפיסה (מתנדב לקח, נערך, נשלח מחדש, נסגר): ההחלטה לתיעוד בלבד.
    // הקשר חסר בדיווח שלא השתנה — לידני, כדי שלא ייתקע "בבדיקה" בלי משימה.
    if (ctx.missing) {
      if (await finishJob(job, 'failed', 'context_missing')) await handoffToManual(ctx.report._id, ctx.report.workflowGeneration, 'worker_error', { now });
    } else if ((await finishJob(job, 'cancelled', 'superseded')) && ctx.report) {
      await logEvent(ctx.report._id, 'verify_job_superseded', WORKER_ACTOR, ctx.report.workflowGeneration, { jobGeneration: job.generation });
    }
    await recordLateResult(job, body, 'stale_generation', config);
    await saveOutcome(job, sha, 'stale_generation');
    return fail(409, 'stale_generation');
  }
  // אין כותרת Retry-After בתוצאה שנמסרה; retry_after_seconds שבגוף (§3.2) ממלא את מקומה.
  const retryAfterSeconds = Number.isSafeInteger(body?.retry_after_seconds) && body.retry_after_seconds > 0 ? body.retry_after_seconds : null;
  // service_capacity אינו צורך ניסיון: השירות מוותר על המשאבים לטובת בניית db/OCR, ורק מועד המיצוי מגביל.
  const applied = await applyVerifyResponse(job, ctx, body, { config, deps, now, retryAfterSeconds, allowPending: false, countCapacityAttempt: false });

  // המשימה בוטלה/נתפסה מחדש בזמן ההחלה (כתיבת ההחלטה לא התאימה לסימון): אותה תשובה כמו בדופק, בלי תופעות לוואי.
  if (applied.kind === 'cancelled') {
    await saveOutcome(job, sha, 'cancelled');
    return { ok: true, outcome: 'cancelled', cancelled: true };
  }
  let outcome;
  if (applied.kind === 'decided') outcome = applied.route;
  else if (applied.kind === 'service_failed') outcome = applied.result === 'retry' ? 'retry' : 'manual';
  else if (applied.kind === 'invalid') outcome = 'invalid_result';
  else outcome = 'stale_generation'; // stale: ההחלטה נשמרה לתיעוד בלבד
  await saveOutcome(job, sha, outcome, outcome === 'invalid_result' ? applied.reason : null);
  if (outcome === 'invalid_result') return fail(422, outcome, { reason: applied.reason });
  if (outcome === 'stale_generation') return fail(409, outcome);
  return { ok: true, outcome, publish: outcome === 'publish' };
}

// ---------------------------------------------------------------- liveness / health

/** "נראה לאחרונה" של הסוכן — לתצוגה בלבד. */
export async function recordAgentSeen({ agentId, route, version = null, now = new Date() }) {
  const set = { lastRoute: route };
  if (version) set.agentVersion = version;
  await CorrectionsAgentState.updateOne({ agentId }, { $max: { lastSeenAt: now }, $set: set }, { upsert: true });
}

const JOB_STATUSES = ['pending', 'leased', 'done', 'failed', 'cancelled'];

/**
 * מצב שירות הבדיקה לדף הבריאות: אופן ההעברה, "נראה לאחרונה" של הסוכן וספירת משימות הבדיקה.
 * problem=agent_not_seen: מצב משיכה פעיל, יש משימות ממתינות, והסוכן לא פנה זמן רב.
 */
export async function computeAgentHealth({ config, now = new Date() }) {
  const v = config.verify;
  const count = (q) => CorrectionJob.countDocuments({ type: 'verify', ...q });
  const jobs = {};
  for (const status of JOB_STATUSES) jobs[status] = await count({ status });
  jobs.leaseExpired = await count({ status: 'leased', leaseExpiresAt: { $lte: now } });
  const pull = v.transport === 'pull';
  const state = pull && v.agentId ? await CorrectionsAgentState.findOne({ agentId: v.agentId }).lean() : null;
  const age = (d) => (d ? Math.round((now.getTime() - new Date(d).getTime()) / 1000) : null);
  const ageSeconds = age(state?.lastSeenAt);
  const workAgeSeconds = age(state?.lastWorkAt);
  const stale = ageSeconds === null || ageSeconds > config.agent.staleSeconds;
  return {
    transport: v.transport,
    enabled: v.enabled,
    disabledReason: v.disabledReason,
    agent: pull
      ? {
        agentId: v.agentId || null, version: state?.agentVersion ?? null, lastSeenAt: state?.lastSeenAt ?? null, ageSeconds, stale,
        lastRoute: state?.lastRoute ?? null, lastWorkAt: state?.lastWorkAt ?? null, workAgeSeconds,
      }
      : null,
    jobs,
    // במשיכה תפיסה/תוצאה אחרונה בטווח הדופק = התור מעובד, גם בלי cron.
    workActive: pull && v.enabled && workAgeSeconds !== null && workAgeSeconds <= config.worker.staleHeartbeatSeconds,
    problem: pull && v.enabled && stale && jobs.pending + jobs.leased > 0 ? 'agent_not_seen' : null,
  };
}
