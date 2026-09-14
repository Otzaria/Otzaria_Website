/**
 * worker של תיקוני הטקסט: outbox → משימות, תפיסה אטומית עם lease+fence, בדיקה מול
 * השירות, פרסום, reconciliation ומעקב PR. כל עדכון דיווח מותנה ב-workflow_generation.
 */
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { createRepoClient } from '../dicta/github-api.js';
import { classifyVerifyFailure, computeRetry, FAILURE_CLASS } from './classify.js';
import { buildVerifyRequest, validateVerifyResponse, routeVerifyDecision } from './verify-protocol.js';
import { callVerifyService } from './verify-client.js';
import { resolveSource, USABLE_STATUSES, matchLine } from './resolver.js';
import { createGitSource, getSharedSourceCache } from './git-source.js';
import { computeNewLine } from './payload.js';
import { computeChangeDigest } from './ocj1.js';
import { publishChange, reconcilePublish, PublishConflict } from './publisher.js';
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
const CONFLICT_REASONS = new Set(['source_changed', 'target_missing', 'structural_change']);

function sourceGit(config, deps) {
  const client = createRepoClient({ repo: config.source.repo, token: config.source.token || null, fetchImpl: deps.githubFetch || fetch });
  return createGitSource({ client, ref: config.source.ref, cache: getSharedSourceCache(config.cacheBytes) });
}

function publishClient(config, deps) {
  return createRepoClient({ repo: config.publish.repo, token: config.publish.token, fetchImpl: deps.githubFetch || fetch });
}

const isTransientHttp = (err) => !err.status || err.status === 429 || err.status >= 500 || err.transient === true || err.name === 'TimeoutError';

// ---------------------------------------------------------------- jobs

async function finishJob(job, status, outcome, extra = {}) {
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

/** תפיסה אטומית של משימה אחת (ממתינה שהגיע זמנה, או כזו שה-lease שלה פג). */
export async function claimJob(type, { workerId, now, leaseSeconds }) {
  return CorrectionJob.findOneAndUpdate(
    {
      type,
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'leased', leaseExpiresAt: { $lte: now } },
      ],
    },
    { $set: { status: 'leased', leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000) }, $inc: { fence: 1 } },
    { new: true, sort: { nextAttemptAt: 1 } },
  ).lean();
}

/** מבטל משימות פעילות של דיווח (מגדיל fence כדי שעובד באמצע יפסיד). */
export async function cancelActiveJobs(reportId, type, outcome) {
  await CorrectionJob.updateMany(
    { report: reportId, type, status: { $in: ['pending', 'leased'] } },
    { $set: { status: 'cancelled', outcome, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
  );
}

// ---------------------------------------------------------------- report transitions

/** העברה לתור הידני, מותנית-גרסה; מגדילה generation כדי שתשובה מאוחרת לא תקדם מצב. */
export async function handoffToManual(reportId, generation, reason, { now = new Date(), verificationStatus = 'failed', extraSet = {}, actor = WORKER_ACTOR, data = null } = {}) {
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: reportId, workflowGeneration: generation, state: 'open', 'manual.status': { $ne: 'claimed' } },
    { $set: { ...manualQueueSet(reason, now), 'verification.status': verificationStatus, ...extraSet }, $inc: { workflowGeneration: 1 } },
    { new: true },
  ).lean();
  if (updated) await logEvent(reportId, 'handoff_manual', actor, updated.workflowGeneration, { reason, ...(data || {}) });
  return updated;
}

async function recordLateDecision(reportId, value, generation, why) {
  await ErrorReport.updateOne({ _id: reportId }, {
    $push: {
      decisions: {
        decisionId: value.decisionId, source: 'service', decision: value.decision, scope: value.approvalScope, reasonCode: value.reasonCode,
        message: value.message, generation: value.workflowGeneration ?? generation, stale: true, at: new Date(),
      },
    },
  });
  await logEvent(reportId, 'service_response_ignored', { kind: 'service' }, generation, { why, decision: value.decision, reasonCode: value.reasonCode });
}

// ---------------------------------------------------------------- outbox

export async function dispatchOutbox({ config, now, limit = 50 }) {
  let created = 0;
  if (config.verify.enabled) {
    const reports = await ErrorReport.find({ 'dispatch.verify': true, state: 'open' }).limit(limit).lean();
    for (const r of reports) {
      const gen = r.workflowGeneration;
      const key = `verify:${r._id}`;
      await CorrectionJob.updateMany(
        { activeKey: key, generation: { $ne: gen } },
        { $set: { status: 'cancelled', outcome: 'superseded', finishedAt: now }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
      );
      const res = await CorrectionJob.updateOne({ activeKey: key }, {
        $setOnInsert: {
          type: 'verify', report: r._id, activeKey: key, status: 'pending', generation: gen, requestId: r.verification?.requestId,
          proposalRevision: r.currentRevision, maxAttempts: config.verify.maxAttempts, nextAttemptAt: now,
          deadlineAt: new Date(now.getTime() + config.verify.maxTotalSeconds * 1000),
        },
      }, { upsert: true });
      created += res.upsertedCount || 0;
      await ErrorReport.updateOne({ _id: r._id, workflowGeneration: gen, 'dispatch.verify': true }, { $set: { 'dispatch.verify': false } });
    }
  }
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

/** השירות כבוי/לא מוגדר: כל העבודה האוטומטית הממתינה עוברת לידני בבטחה. */
export async function drainVerifyToManual({ reason, now }) {
  let moved = 0;
  const jobs = await CorrectionJob.find({ type: 'verify', status: { $in: ['pending', 'leased'] } }).lean();
  for (const job of jobs) {
    await CorrectionJob.updateOne(
      { _id: job._id, status: { $in: ['pending', 'leased'] } },
      { $set: { status: 'cancelled', outcome: 'service_disabled', finishedAt: now }, $unset: { activeKey: 1 }, $inc: { fence: 1 } },
    );
  }
  const reports = await ErrorReport.find({ state: 'open', $or: [{ 'dispatch.verify': true }, { 'verification.status': { $in: ['queued', 'in_progress'] } }] }).lean();
  for (const r of reports) {
    const u = await handoffToManual(r._id, r.workflowGeneration, reason, { now, verificationStatus: 'skipped_service_disabled' });
    if (u) moved += 1;
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
    await handoffToManual(report._id, report.workflowGeneration, retry.reason, { now, data: { lastError: cls.reason } });
    await finishJob(job, 'failed', retry.reason, { attempts, lastErrorClass: cls.cls, lastError: cls.reason });
    return 'exhausted';
  }
  const ok = await rescheduleJob(job, { attempts, nextAttemptAt: retry.nextAttemptAt, lastErrorClass: cls.cls, lastError: cls.reason });
  if (ok) {
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration }, {
      $set: { 'verification.status': 'queued', 'verification.attempts': attempts, 'verification.lastErrorClass': cls.cls, 'verification.lastError': cls.reason, 'verification.nextAttemptAt': retry.nextAttemptAt },
    });
    await logEvent(report._id, 'verify_retry_scheduled', WORKER_ACTOR, report.workflowGeneration, { attempts, reason: cls.reason, nextAttemptAt: retry.nextAttemptAt });
  }
  return 'retry';
}

async function failPermanently({ job, report, reason, now, cls = FAILURE_CLASS.PERMANENT }) {
  await handoffToManual(report._id, report.workflowGeneration, reason, { now, data: { class: cls } });
  await finishJob(job, 'failed', reason, { lastErrorClass: cls, lastError: reason, attempts: job.attempts + 1 });
}

async function verifyLocallyAlreadyFixed(change, config, deps) {
  try {
    const git = sourceGit(config, deps);
    const head = await git.getHead();
    const f = await git.getFile(change.path, head.commitSha);
    if (!f || f.lossy) return false;
    const m = matchLine(f.content, { originalLine: change.newLine, lineIndex: change.lineIndex, newLine: null });
    return m.status === 'exact' && m.lineIndex === change.lineIndex;
  } catch {
    return false;
  }
}

export async function processVerifyJob(job, { config, deps, now }) {
  const report = await ErrorReport.findById(job.report).lean();
  const stale = !report || report.state !== 'open' || report.workflowGeneration !== job.generation
    || report.verification?.requestId !== job.requestId || report.manual?.status === 'claimed';
  if (stale) {
    await finishJob(job, 'cancelled', 'superseded');
    if (report) await logEvent(report._id, 'verify_job_superseded', WORKER_ACTOR, report.workflowGeneration, { jobGeneration: job.generation });
    return 'superseded';
  }
  if (!config.verify.enabled) {
    await handoffToManual(report._id, report.workflowGeneration, config.verify.disabledReason, { now, verificationStatus: 'skipped_service_disabled' });
    await finishJob(job, 'cancelled', 'service_disabled');
    return 'handoff';
  }
  const rev = currentRevisionOf(report);
  if (!rev || rev.revision !== job.proposalRevision) return failPermanently({ job, report, reason: 'no_proposal', now });

  let source = report.resolvedSource && report.resolvedSource.generation === report.workflowGeneration ? report.resolvedSource : null;
  if (!source) {
    try {
      source = await resolveSource({
        report, revision: rev, gitSource: sourceGit(config, deps), source: config.source,
        override: rev.targetPath ? { path: rev.targetPath, lineIndex: rev.targetLineIndex, expectedLine: rev.originalLine } : null,
      });
    } catch (err) {
      if (isTransientHttp(err)) return scheduleRetryOrHandoff({ job, report, config, now, cls: { cls: FAILURE_CLASS.TRANSIENT, reason: 'source_lookup_failed' }, retryAfterSeconds: null, deps });
      return failPermanently({ job, report, reason: 'source_not_found', now });
    }
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration }, { $set: { resolvedSource: { ...source, generation: report.workflowGeneration, resolvedAt: now } } });
    if (!USABLE_STATUSES.has(source.status)) {
      await handoffToManual(report._id, report.workflowGeneration, RESOLVE_HANDOFF[source.status] || 'source_not_found', { now, verificationStatus: 'not_requested' });
      await finishJob(job, 'done', `resolve_${source.status}`);
      return 'handoff';
    }
  }

  const request = buildVerifyRequest({ report, revision: rev, requestId: job.requestId, requestedScope: report.verification?.requestedScope || config.verify.requestedScope, source });
  const polling = Boolean(job.serviceJobId);
  if (!polling) {
    await ErrorReport.updateOne({ _id: report._id, workflowGeneration: report.workflowGeneration }, { $set: { 'verification.status': 'in_progress' } });
  }
  const call = await callVerifyService(config, { request, serviceJobId: job.serviceJobId, fetchImpl: deps.verifyFetch || fetch, now });

  if (!call.ok) {
    const cls = classifyVerifyFailure(call.failure);
    if (cls.cls === FAILURE_CLASS.TRANSIENT) {
      return scheduleRetryOrHandoff({ job, report, config, now, cls, retryAfterSeconds: call.retryAfterSeconds, deps });
    }
    await failPermanently({ job, report, reason: cls.cls === FAILURE_CLASS.UNKNOWN ? `unknown_failure:${cls.reason}` : cls.reason, now, cls: cls.cls });
    return 'handoff';
  }

  const v = validateVerifyResponse(call.body, { request, currentGeneration: report.workflowGeneration, siteAuthority: config.verify.authority });
  if (!v.ok) {
    if (v.reason === 'service_failed') {
      const cls = classifyVerifyFailure({ kind: 'service_failed', reasonCode: v.reasonCode });
      if (cls.cls === FAILURE_CLASS.TRANSIENT) return scheduleRetryOrHandoff({ job, report, config, now, cls, retryAfterSeconds: call.retryAfterSeconds, deps });
      await failPermanently({ job, report, reason: cls.reason, now, cls: cls.cls });
      return 'handoff';
    }
    await failPermanently({ job, report, reason: v.reason === 'response_mismatch' ? 'response_mismatch' : 'invalid_response', now });
    return 'handoff';
  }

  if (v.kind === 'pending') {
    const nextAttemptAt = new Date(now.getTime() + Math.min(v.pollAfterSeconds, config.verify.backoffCapSeconds) * 1000);
    if (nextAttemptAt > new Date(job.deadlineAt)) {
      await handoffToManual(report._id, report.workflowGeneration, 'deadline_exhausted', { now });
      await finishJob(job, 'failed', 'deadline_exhausted');
      return 'exhausted';
    }
    await rescheduleJob(job, { serviceJobId: v.jobId, nextAttemptAt, attempts: polling ? job.attempts : job.attempts + 1 });
    await logEvent(report._id, 'verify_pending', WORKER_ACTOR, report.workflowGeneration, { pollAfterSeconds: v.pollAfterSeconds });
    return 'pending';
  }

  if (v.stale) {
    // generation שגוי על המשימה הנוכחית: נשמר להיסטוריה בלבד, והדיווח עובר לידני כדי לא להיתקע.
    await recordLateDecision(report._id, v.value, report.workflowGeneration, 'stale_generation');
    await handoffToManual(report._id, report.workflowGeneration, 'response_mismatch', { now });
    await finishJob(job, 'done', 'stale_response');
    return 'stale';
  }
  await applyServiceDecision({ job, report, rev, source, value: v.value, authorityExceeded: v.authorityExceeded, config, deps, now });
  return 'decided';
}

async function applyServiceDecision({ job, report, rev, source, value, authorityExceeded, config, deps, now }) {
  const sentNewLine = computeNewLine(rev);
  const localAlreadyFixedVerified = value.decision === 'already_fixed' && value.change
    ? await verifyLocallyAlreadyFixed(value.change, config, deps) : false;
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
  const filter = {
    _id: report._id, workflowGeneration: report.workflowGeneration, state: 'open',
    'verification.requestId': job.requestId, 'manual.status': { $ne: 'claimed' },
  };
  const verificationSet = {
    'verification.status': 'completed', 'verification.decisionId': value.decisionId, 'verification.decision': value.decision,
    'verification.reasonCode': value.reasonCode, 'verification.message': value.message, 'verification.authorityExceeded': authorityExceeded,
    'verification.completedAt': now, 'dispatch.verify': false,
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

  const updated = await ErrorReport.findOneAndUpdate(filter, update, { new: true }).lean();
  if (!updated) {
    // החבילה נוצרה לפני העדכון המותנה; כשהוא נכשל היא יתומה ולא מאושרת — מוסרת.
    if (changeId) await ChangePackage.deleteOne({ changeId });
    await recordLateDecision(report._id, value, report.workflowGeneration, 'condition_failed');
    await finishJob(job, 'done', 'late_response');
    return;
  }
  await logEvent(report._id, 'service_decision', { kind: 'service' }, updated.workflowGeneration, {
    decision: value.decision, scope: value.approvalScope, reasonCode: value.reasonCode, route: route.route, handoff: route.handoffReason ?? null, authorityExceeded, changeId,
  });
  await finishJob(job, 'done', route.route);
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
    Object.assign(set, { 'publish.status': 'pr_opened', 'publish.commitSha': outcome.commitSha, 'publish.prNumber': outcome.prNumber, 'publish.prUrl': outcome.prUrl, 'publish.branch': outcome.branch });
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
    { new: true },
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

/** מעקב אחרי PR פתוחים: מוזג → committed; נסגר בלי מיזוג → ידני; בסיס השתנה → סימון. */
export async function trackOpenPulls({ config, deps, now, limit = 10 }) {
  if (config.publish.mode === 'disabled') return 0;
  const reports = await ErrorReport.find({ 'publish.status': 'pr_opened', state: 'open' }).sort({ 'publish.updatedAt': 1 }).limit(limit).lean();
  if (!reports.length) return 0;
  const client = publishClient(config, deps);
  let changed = 0;
  for (const r of reports) {
    try {
      const pr = await client.getPull(r.publish.prNumber);
      if (pr.merged) {
        const toMain = config.publish.repo === config.source.repo && config.publish.branch === config.source.ref;
        await ErrorReport.updateOne({ _id: r._id, 'publish.status': 'pr_opened' }, {
          $set: { 'publish.status': 'committed', 'publish.commitSha': pr.mergeCommitSha || r.publish.commitSha, 'publish.updatedAt': now, state: 'closed_published', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'pr_merged', ...(toMain ? { 'inclusion.status': 'merged_to_main', 'inclusion.at': now } : {}) },
        });
        await logEvent(r._id, 'pr_merged', WORKER_ACTOR, r.workflowGeneration, { prNumber: pr.number });
        changed += 1;
      } else if (pr.state === 'closed') {
        await ErrorReport.updateOne({ _id: r._id, 'publish.status': 'pr_opened' }, { $set: { 'publish.status': 'failed', 'publish.lastError': 'pr_closed_unmerged', 'publish.updatedAt': now, ...manualQueueSet('publish_failed', now) } });
        await logEvent(r._id, 'pr_closed_unmerged', WORKER_ACTOR, r.workflowGeneration, { prNumber: pr.number });
        changed += 1;
      } else {
        const change = await ChangePackage.findOne({ changeId: r.publish.changeId }).lean();
        if (change) {
          const git = createGitSource({ client, ref: config.publish.branch, cache: getSharedSourceCache(config.cacheBytes) });
          const head = await git.getHead();
          const f = await git.getFile(change.path, head.commitSha);
          const m = f ? matchLine(f.content, { originalLine: change.originalLine, lineIndex: change.lineIndex, newLine: change.newLine }) : null;
          const conflict = !m || (m.status !== 'exact' && m.status !== 'already_applied') || m.lineIndex !== change.lineIndex;
          await ErrorReport.updateOne({ _id: r._id }, { $set: { 'publish.conflictReason': conflict ? 'base_changed_while_pr_open' : null, 'publish.updatedAt': now } });
        } else {
          await ErrorReport.updateOne({ _id: r._id }, { $set: { 'publish.updatedAt': now } });
        }
      }
    } catch (err) {
      await ErrorReport.updateOne({ _id: r._id }, { $set: { 'publish.lastError': `pr_track_failed:${err.status || 'net'}`, 'publish.updatedAt': now } });
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
      return 'error';
    }
  });
}

/**
 * אצווה אחת של ה-worker. בטוח להרצה מקבילה בכמה תהליכים (תפיסה אטומית + fence).
 * @param {{config:object, workerId:string, deps?:{verifyFetch?:Function, githubFetch?:Function, random?:Function, hooks?:object}, now?:Date}} args
 */
export async function runWorkerBatch({ config, workerId, deps = {}, now = new Date() }) {
  const stats = { startedAt: now, drained: 0, dispatched: 0, verify: [], publish: [], prTracked: 0, error: null };
  try {
    if (!config.verify.enabled) stats.drained = await drainVerifyToManual({ reason: config.verify.disabledReason, now });
    stats.dispatched = await dispatchOutbox({ config, now });
    if (config.verify.enabled) stats.verify = await processClaimed('verify', { config, deps, now, workerId });
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
