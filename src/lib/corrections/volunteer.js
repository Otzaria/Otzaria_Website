/**
 * פעולות מתנדבים על דיווחים. כל פעולה: בדיקת הרשאה בשרת, תנאי גרסה (generation)
 * שהלקוח ראה, ועדכון אטומי יחיד. כישלון תנאי = 409 "התצוגה לא עדכנית".
 */
import mongoose from 'mongoose';
import ErrorReport from '../../models/ErrorReport.js';
import User from '../../models/User.js';
import ChangePackage from '../../models/ChangePackage.js';
import PublishAttempt from '../../models/PublishAttempt.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import { createRepoClient } from '../dicta/github-api.js';
import { canHandleCorrections, canManageCorrections } from '../roles.js';
import { resolveSource, USABLE_STATUSES, isAllowedRepoPath } from './resolver.js';
import { createGitSource, getSharedSourceCache } from './git-source.js';
import { splitSourceLines } from './source-text.js';
import { computeNewLine } from './payload.js';
import { computeChangeDigest } from './ocj1.js';
import { deriveLabels } from './labels.js';
import { HANDOFF_REASON_LABELS } from './states.js';
import { buildExternalSefariaPackage } from './external.js';
import { newId, logEvent, userActor, currentRevisionOf, manualQueueSet, ensureUpgraded, OPEN_FILTER } from './store.js';
import { cancelActiveJobs } from './worker.js';

const MAX_LINE = 20_000;
const ok = (body) => ({ status: 200, body });
const err = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

function gitSourceFor(config, deps, headTtlMs = 0) {
  const client = createRepoClient({ repo: config.source.repo, token: config.source.token || null, fetchImpl: deps?.githubFetch || fetch });
  return createGitSource({ client, ref: config.source.ref, cache: getSharedSourceCache(config.cacheBytes), headTtlMs });
}

const isId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);
const holdsClaim = (r, user, now) => r.manual?.status === 'claimed' && String(r.manual.assignee) === String(user._id)
  && r.manual.leaseExpiresAt && new Date(r.manual.leaseExpiresAt) > now;

function overrideFor(rev) {
  return rev?.targetPath ? { path: rev.targetPath, lineIndex: rev.targetLineIndex, expectedLine: rev.originalLine } : null;
}

// ---------------------------------------------------------------- list / detail

const LIST_FILTERS = {
  mine: (user) => ({ 'manual.status': 'claimed', 'manual.assignee': user._id }),
  queued: () => ({ ...OPEN_FILTER, 'manual.status': { $in: ['queued', 'released', null] } }),
  claimed: () => ({ 'manual.status': 'claimed', state: 'open' }),
  auto: () => ({ state: 'open', 'verification.status': { $in: ['queued', 'in_progress'] } }),
  publishing: () => ({ state: 'open', 'publish.status': { $in: ['ready', 'in_progress', 'unknown_needs_reconcile', 'pr_opened', 'failed'] } }),
  external: () => ({ state: 'awaiting_external' }),
  closed: () => ({ state: { $regex: '^closed_' } }),
  all: () => ({}),
};

export async function listReports({ user, query = {} }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  const view = LIST_FILTERS[query.view] ? query.view : 'queued';
  const filter = { ...LIST_FILTERS[view](user) };
  if (query.kind === 'free_text' || query.kind === 'text_correction') filter.reportKind = query.kind;
  if (typeof query.source === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(query.source)) filter.sourceFolder = query.source;
  if (typeof query.reason === 'string' && /^[a-z_:]{1,60}$/.test(query.reason)) filter['manual.handoffReason'] = query.reason;
  if (isId(query.assignee)) filter['manual.assignee'] = new mongoose.Types.ObjectId(query.assignee);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const skip = Math.max(0, Number.parseInt(query.skip, 10) || 0);
  const rows = await ErrorReport.find(filter)
    .select('reportId bookTitle currentRef sourceFolder reportKind state status manual verification approval publish external workflowGeneration createdAt resolvedSource.status')
    .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  const total = await ErrorReport.countDocuments(filter);
  return ok({
    view,
    total,
    items: rows.map((r) => ({
      id: String(r._id),
      bookTitle: r.bookTitle,
      currentRef: r.currentRef,
      sourceFolder: r.sourceFolder,
      kind: r.reportKind || 'free_text',
      state: r.state || 'open',
      manual: { status: r.manual?.status || 'queued', handoffReason: r.manual?.handoffReason || (r.state ? null : 'legacy_report'), assigneeName: r.manual?.assigneeName || null, leaseExpiresAt: r.manual?.leaseExpiresAt || null },
      labels: deriveLabels(r),
      generation: r.workflowGeneration ?? 0,
      createdAt: r.createdAt,
    })),
  });
}

function publicReport(r, liveSource = null) {
  return {
    id: String(r._id),
    clientReportId: r.reportId,
    kind: r.reportKind || 'free_text',
    schemaVersion: r.schemaVersion || 1,
    bookTitle: r.bookTitle,
    currentRef: r.currentRef,
    lineNumber: r.lineNumber,
    selectedText: r.selectedText,
    errorDetails: r.errorDetails,
    contextText: r.contextText,
    filePath: r.filePath,
    sourceFolder: r.sourceFolder,
    libraryVersion: r.libraryVersion,
    location: r.location || null,
    client: r.client || null,
    state: r.state || 'open',
    generation: r.workflowGeneration ?? 0,
    currentRevision: r.currentRevision || 0,
    proposals: (r.proposals || []).map((p) => ({ ...p, newLine: computeNewLine(p) })),
    verification: r.verification || null,
    approval: r.approval || null,
    manual: r.manual ? { ...r.manual, handoffLabel: HANDOFF_REASON_LABELS[r.manual.handoffReason] || r.manual.handoffReason || null } : null,
    publish: r.publish || null,
    inclusion: r.inclusion || null,
    external: r.external || null,
    decisions: r.decisions || [],
    labels: deriveLabels(liveSource ? { ...r, resolvedSource: liveSource } : r),
    closeReason: r.closeReason || null,
    createdAt: r.createdAt,
  };
}

/** פרטי דיווח + מקור עדכני מה-resolver (לא מתוך הדיווח) + היסטוריה. */
export async function getReportDetail({ user, id, config, deps }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  if (!isId(id)) return err(404, 'not_found');
  const r = await ensureUpgraded(id);
  if (!r) return err(404, 'not_found');
  const rev = currentRevisionOf(r);
  let source = null;
  let sourceError = null;
  if (rev && r.state === 'open') {
    try {
      source = await resolveSource({ report: r, revision: rev, gitSource: gitSourceFor(config, deps, config.sourceHeadTtlMs), source: config.source, override: overrideFor(rev) });
    } catch (e) {
      sourceError = e.status ? `github_${e.status}` : 'source_unavailable';
    }
  }
  const [events, attempts, changes] = await Promise.all([
    CorrectionEvent.find({ report: r._id }).sort({ createdAt: 1 }).limit(500).lean(),
    PublishAttempt.find({ report: r._id }).sort({ createdAt: 1 }).lean(),
    ChangePackage.find({ report: r._id }).sort({ createdAt: 1 }).lean(),
  ]);
  return ok({
    report: publicReport(r, source),
    source,
    sourceError,
    history: events.map((e) => ({ type: e.type, actorKind: e.actorKind, actorName: e.actorName, generation: e.generation, data: e.data, at: e.createdAt })),
    publishAttempts: attempts.map((a) => ({ attemptId: a.attemptId, status: a.status, mode: a.mode, commitSha: a.commitSha, prNumber: a.prNumber, prUrl: a.prUrl, error: a.error, at: a.createdAt })),
    changes: changes.map((c) => ({ changeId: c.changeId, revision: c.revision, path: c.path, lineIndex: c.lineIndex, baseBlobSha: c.baseBlobSha, createdBy: c.createdBy, originalLine: c.originalLine, newLine: c.newLine, at: c.createdAt })),
    permissions: { canManage: canManageCorrections(user), canVerify: config.verify.enabled },
  });
}

// ---------------------------------------------------------------- claim / release / reassign

export async function claimReport({ user, id, config, now = new Date() }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  if (!isId(id)) return err(404, 'not_found');
  await ensureUpgraded(id);
  const lease = new Date(now.getTime() + config.manual.claimMinutes * 60_000);
  const base = {
    _id: id, state: 'open',
    $or: [{ 'manual.status': { $ne: 'claimed' } }, { 'manual.leaseExpiresAt': { $lte: now } }, { 'manual.assignee': user._id }],
  };
  const claimSet = {
    'manual.status': 'claimed', 'manual.assignee': user._id, 'manual.assigneeName': user.name, 'manual.claimedAt': now,
    'manual.leaseExpiresAt': lease, 'dispatch.verify': false, status: 'in_progress', assignedTo: user._id,
  };
  // אישור שממתין לפרסום נפסל באותו עדכון אטומי: המטפל עשוי לשנות את ההצעה.
  const revokeSet = {
    'approval.authority': 'none', 'approval.scope': 'none', 'approval.changeId': null,
    'publish.status': 'not_ready', 'publish.changeId': null, 'dispatch.publish': false,
  };
  let revoked = false;
  let updated = await ErrorReport.findOneAndUpdate(
    { ...base, 'publish.status': { $nin: ['in_progress', 'unknown_needs_reconcile', 'pr_opened', 'ready'] } },
    { $set: claimSet, $inc: { workflowGeneration: 1 } },
    { new: true },
  ).lean();
  if (!updated) {
    updated = await ErrorReport.findOneAndUpdate(
      { ...base, 'publish.status': 'ready' },
      { $set: { ...claimSet, ...revokeSet }, $inc: { workflowGeneration: 1 } },
      { new: true },
    ).lean();
    revoked = Boolean(updated);
  }
  if (!updated) return err(409, 'claim_conflict');
  if (revoked) {
    await cancelActiveJobs(updated._id, 'publish', 'approval_revoked_by_claim');
    await logEvent(updated._id, 'approval_revoked_by_claim', userActor(user), updated.workflowGeneration);
  }
  // בדיקה אוטומטית ממתינה נפסלת; תשובה מאוחרת תישמר להיסטוריה בלבד.
  if (['queued', 'in_progress'].includes(updated.verification?.status)) {
    await ErrorReport.updateOne({ _id: id, workflowGeneration: updated.workflowGeneration }, { $set: { 'verification.status': 'superseded' } });
  }
  await cancelActiveJobs(updated._id, 'verify', 'manual_claim');
  await logEvent(updated._id, 'claimed', userActor(user), updated.workflowGeneration, { leaseExpiresAt: lease });
  return ok({ generation: updated.workflowGeneration, leaseExpiresAt: lease });
}

export async function releaseReport({ user, id, generation, now = new Date() }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  if (!isId(id)) return err(404, 'not_found');
  const filter = { _id: id, workflowGeneration: generation, state: 'open', 'manual.status': 'claimed' };
  if (!canManageCorrections(user)) filter['manual.assignee'] = user._id;
  const updated = await ErrorReport.findOneAndUpdate(filter, { $set: { ...manualQueueSet('volunteer_released', now), 'manual.status': 'released' } , $inc: { workflowGeneration: 1 } }, { new: true }).lean();
  if (!updated) return err(409, 'stale_view');
  await logEvent(updated._id, 'released', userActor(user), updated.workflowGeneration);
  return ok({ generation: updated.workflowGeneration });
}

export async function reassignReport({ user, id, generation, targetUserId, config, now = new Date() }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  if (!isId(id) || !isId(targetUserId)) return err(400, 'invalid_request');
  const target = await User.findById(targetUserId).select('name role isCorrectionsVolunteer').lean();
  if (!target || !canHandleCorrections(target)) return err(400, 'target_not_authorized');
  const filter = { _id: id, workflowGeneration: generation, state: 'open' };
  if (!canManageCorrections(user)) Object.assign(filter, { 'manual.status': 'claimed', 'manual.assignee': user._id });
  const lease = new Date(now.getTime() + config.manual.claimMinutes * 60_000);
  const updated = await ErrorReport.findOneAndUpdate(filter, {
    $set: { 'manual.status': 'claimed', 'manual.assignee': target._id, 'manual.assigneeName': target.name, 'manual.claimedAt': now, 'manual.leaseExpiresAt': lease, 'dispatch.verify': false, status: 'in_progress', assignedTo: target._id },
    $inc: { workflowGeneration: 1 },
  }, { new: true }).lean();
  if (!updated) return err(409, 'stale_view');
  await cancelActiveJobs(updated._id, 'verify', 'manual_reassign');
  await logEvent(updated._id, 'reassigned', userActor(user), updated.workflowGeneration, { to: String(target._id), toName: target.name });
  return ok({ generation: updated.workflowGeneration });
}

// ---------------------------------------------------------------- approve / edit / reject / close

async function buildChangeFromSource({ r, rev, config, deps, seenBlobSha }) {
  const newLine = computeNewLine(rev);
  if (newLine === null) return { error: err(400, 'no_proposal') };
  if (/[\r\n]/.test(newLine)) return { error: err(400, 'structural_change') };
  if (newLine.length > MAX_LINE) return { error: err(413, 'proposed_text_too_long') };
  let source;
  try {
    source = await resolveSource({ report: r, revision: rev, gitSource: gitSourceFor(config, deps), source: config.source, override: overrideFor(rev) });
  } catch (e) {
    return { error: err(503, 'source_unavailable', { detail: e.status ? `github_${e.status}` : 'network' }) };
  }
  if (source.status === 'already_applied') return { alreadyApplied: true, source };
  if (!USABLE_STATUSES.has(source.status)) return { error: err(409, 'source_not_resolved', { source }) };
  if (seenBlobSha && seenBlobSha !== source.blobSha) return { error: err(409, 'stale_view', { reason: 'source_changed', source }) };
  const originalLine = source.currentLine;
  const target = source.bomAdjusted && newLine.startsWith('\ufeff') ? newLine.slice(1) : newLine;
  const change = {
    changeId: newId('chg'), repo: config.source.repo, path: source.path, baseCommitSha: source.commitSha, baseBlobSha: source.blobSha,
    lineIndex: source.lineIndex, originalLine, newLine: target,
  };
  change.changeDigest = computeChangeDigest({ path: change.path, base_blob_sha: change.baseBlobSha, line_index: change.lineIndex, original_line: originalLine, new_line: target });
  return { change, source };
}

async function approveRevision({ user, r, rev, pushRevision, config, deps, generation, seenBlobSha, now }) {
  const built = await buildChangeFromSource({ r, rev, config, deps, seenBlobSha });
  if (built.error) return built.error;
  const filterBase = { _id: r._id, workflowGeneration: generation, state: 'open', 'manual.status': 'claimed', 'manual.assignee': user._id, 'manual.leaseExpiresAt': { $gt: now } };
  const decision = { decisionId: newId('dec'), source: 'volunteer', actorId: user._id, actorName: user.name, revision: rev.revision, generation, at: now };

  if (built.alreadyApplied) {
    const set = { state: 'closed_already_fixed', status: 'resolved', 'publish.status': 'skipped_already_fixed', closedAt: now, resolvedAt: now, closeReason: 'volunteer_verified_already_fixed', 'manual.status': 'released', resolvedSource: { ...built.source, generation } };
    const update = { $set: set, $inc: { workflowGeneration: 1 }, $push: { decisions: { ...decision, decision: 'already_fixed', reasonCode: 'ok' } } };
    if (pushRevision) { update.$push.proposals = pushRevision; update.$set.currentRevision = pushRevision.revision; }
    const updated = await ErrorReport.findOneAndUpdate(filterBase, update, { new: true }).lean();
    if (!updated) return err(409, 'stale_view');
    await logEvent(r._id, 'closed_already_fixed', userActor(user), updated.workflowGeneration);
    return ok({ generation: updated.workflowGeneration, result: 'already_fixed' });
  }

  const c = built.change;
  await ChangePackage.create({ ...c, report: r._id, revision: rev.revision, generation: generation + 1, createdBy: 'volunteer', createdById: user._id });
  const update = {
    $set: {
      'approval.authority': 'volunteer', 'approval.scope': 'technical_and_content', 'approval.by': user._id, 'approval.byName': user.name,
      'approval.at': now, 'approval.revision': rev.revision, 'approval.changeId': c.changeId,
      'publish.status': 'ready', 'publish.changeId': c.changeId, 'publish.conflictReason': null, 'publish.lastError': null,
      'dispatch.publish': true, 'manual.status': 'released', resolvedSource: { ...built.source, generation: generation + 1 },
    },
    $inc: { workflowGeneration: 1 },
    $push: { decisions: { ...decision, decision: 'approved', scope: 'technical_and_content', reasonCode: 'ok', changeId: c.changeId } },
  };
  if (pushRevision) { update.$push.proposals = pushRevision; update.$set.currentRevision = pushRevision.revision; }
  const updated = await ErrorReport.findOneAndUpdate(filterBase, update, { new: true }).lean();
  if (!updated) {
    await ChangePackage.deleteOne({ changeId: c.changeId });
    return err(409, 'stale_view');
  }
  await logEvent(r._id, 'approved', userActor(user), updated.workflowGeneration, { revision: rev.revision, changeId: c.changeId, path: c.path, lineIndex: c.lineIndex });
  return ok({ generation: updated.workflowGeneration, changeId: c.changeId, publishMode: config.publish.mode });
}

async function loadForAction({ user, id, generation, revision, now }) {
  if (!canHandleCorrections(user)) return { error: err(403, 'Forbidden') };
  if (!isId(id) || !Number.isSafeInteger(generation)) return { error: err(400, 'invalid_request') };
  const r = await ErrorReport.findById(id).lean();
  if (!r) return { error: err(404, 'not_found') };
  if (r.state !== 'open') return { error: err(409, 'final_state') };
  if (r.workflowGeneration !== generation) return { error: err(409, 'stale_view') };
  if (!holdsClaim(r, user, now)) return { error: err(409, 'claim_required') };
  if (revision !== undefined && r.currentRevision !== revision) return { error: err(409, 'stale_view', { reason: 'revision_changed' }) };
  return { r };
}

export async function approveReport({ user, id, generation, revision, seenBlobSha, config, deps, now = new Date() }) {
  const { r, error } = await loadForAction({ user, id, generation, revision, now });
  if (error) return error;
  const rev = currentRevisionOf(r);
  if (!rev) return err(400, 'no_proposal');
  return approveRevision({ user, r, rev, pushRevision: null, config, deps, generation, seenBlobSha, now });
}

/** עריכה ואז אישור: יוצר revision חדשה (שורה שלמה) ומאשר אותה באותו עדכון אטומי. */
export async function editAndApproveReport({ user, id, generation, revision, baseLine, newLine, targetPath, targetLineIndex, seenBlobSha, note, config, deps, now = new Date() }) {
  const { r, error } = await loadForAction({ user, id, generation, revision, now });
  if (error) return error;
  if (typeof baseLine !== 'string' || typeof newLine !== 'string' || !baseLine) return err(400, 'invalid_request');
  if (baseLine.length > MAX_LINE || newLine.length > MAX_LINE) return err(413, 'proposed_text_too_long');
  if (baseLine === newLine) return err(400, 'proposal_identical');
  if (targetPath != null && (!isAllowedRepoPath(targetPath) || !Number.isSafeInteger(targetLineIndex) || targetLineIndex < 0)) return err(400, 'path_not_allowed');
  const cur = currentRevisionOf(r);
  const pushRevision = {
    revision: (r.proposals?.length || 0) + 1, author: 'volunteer', authorId: user._id, authorName: user.name,
    originalLine: baseLine, originalSelection: null, selectionOffset: null, proposedText: newLine, contextBefore: '', contextAfter: '',
    targetPath: targetPath ?? cur?.targetPath ?? null, targetLineIndex: targetPath != null ? targetLineIndex : cur?.targetLineIndex ?? null,
    note: typeof note === 'string' ? note.slice(0, 1000) : null, createdAt: now,
  };
  return approveRevision({ user, r, rev: pushRevision, pushRevision, config, deps, generation, seenBlobSha, now });
}

export async function rejectReport({ user, id, generation, reason, now = new Date() }) {
  const { r, error } = await loadForAction({ user, id, generation, now });
  if (error) return error;
  if (typeof reason !== 'string' || reason.trim().length < 3) return err(400, 'reason_required');
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: r._id, workflowGeneration: generation, state: 'open', 'manual.assignee': user._id, 'publish.status': { $nin: ['in_progress', 'unknown_needs_reconcile', 'pr_opened'] } },
    {
      $set: { state: 'closed_rejected', status: 'rejected', closedAt: now, resolvedAt: now, closeReason: 'volunteer_rejected', 'manual.status': 'released', 'dispatch.publish': false },
      $inc: { workflowGeneration: 1 },
      $push: { decisions: { decisionId: newId('dec'), source: 'volunteer', decision: 'rejected', reasonCode: 'volunteer', message: reason.slice(0, 2000), actorId: user._id, actorName: user.name, revision: r.currentRevision, generation, at: now } },
    },
    { new: true },
  ).lean();
  if (!updated) return err(409, 'stale_view');
  await logEvent(r._id, 'rejected', userActor(user), updated.workflowGeneration, { reason: reason.slice(0, 500) });
  return ok({ generation: updated.workflowGeneration });
}

/** סגירה ידנית (למשל דיווח חופשי שטופל מחוץ למערכת). */
export async function closeManualReport({ user, id, generation, note, now = new Date() }) {
  const { r, error } = await loadForAction({ user, id, generation, now });
  if (error) return error;
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: r._id, workflowGeneration: generation, state: 'open', 'manual.assignee': user._id, 'publish.status': { $nin: ['in_progress', 'unknown_needs_reconcile', 'pr_opened'] } },
    {
      $set: { state: 'closed_manual', status: 'resolved', closedAt: now, resolvedAt: now, closeReason: 'volunteer_closed', 'manual.status': 'released', 'dispatch.publish': false },
      $inc: { workflowGeneration: 1 },
      $push: { decisions: { decisionId: newId('dec'), source: 'volunteer', decision: 'closed_manual', message: typeof note === 'string' ? note.slice(0, 2000) : '', actorId: user._id, actorName: user.name, generation, at: now } },
    },
    { new: true },
  ).lean();
  if (!updated) return err(409, 'stale_view');
  await logEvent(r._id, 'closed_manual', userActor(user), updated.workflowGeneration);
  return ok({ generation: updated.workflowGeneration });
}

/** שליחה מחודשת לשירות — רק כפעולה מפורשת. */
export async function resubmitToService({ user, id, generation, config, now = new Date() }) {
  const { r, error } = await loadForAction({ user, id, generation, now });
  if (error) return error;
  if (!config.verify.enabled) return err(409, 'service_disabled', { reason: config.verify.disabledReason });
  const rev = currentRevisionOf(r);
  if (!rev || computeNewLine(rev) === null) return err(400, 'no_proposal');
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: r._id, workflowGeneration: generation, state: 'open', 'manual.assignee': user._id, 'publish.status': { $nin: ['in_progress', 'unknown_needs_reconcile', 'pr_opened'] } },
    {
      $set: {
        'verification.status': 'queued', 'verification.requestId': newId('req'), 'verification.requestedScope': config.verify.requestedScope,
        'verification.attempts': 0, 'verification.lastError': null, 'verification.lastErrorClass': null, 'dispatch.verify': true,
        'manual.status': 'none', 'manual.assignee': null, 'manual.assigneeName': null, 'manual.leaseExpiresAt': null, 'manual.handoffReason': null,
        'approval.authority': 'none', 'approval.scope': 'none', 'approval.changeId': null, 'publish.status': 'not_ready', 'dispatch.publish': false,
        resolvedSource: null, status: 'pending', assignedTo: null,
      },
      $inc: { workflowGeneration: 1 },
    },
    { new: true },
  ).lean();
  if (!updated) return err(409, 'stale_view');
  await logEvent(r._id, 'resubmitted_to_service', userActor(user), updated.workflowGeneration, { requestId: updated.verification.requestId });
  return ok({ generation: updated.workflowGeneration });
}

/** בחירת מקור ידנית: מחזיר את השורה העדכנית ביעד שנבחר (לתצוגת diff לפני אישור). */
export async function previewSourceChoice({ user, id, path, lineIndex, config, deps }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  if (!isId(id)) return err(404, 'not_found');
  if (!isAllowedRepoPath(path) || !Number.isSafeInteger(lineIndex) || lineIndex < 0) return err(400, 'path_not_allowed');
  const r = await ErrorReport.findById(id).select('_id workflowGeneration state').lean();
  if (!r) return err(404, 'not_found');
  try {
    const git = gitSourceFor(config, deps);
    const head = await git.getHead();
    const f = await git.getFile(path, head.commitSha);
    if (!f) return err(404, 'file_not_found');
    if (f.lossy) return err(409, 'non_utf8_source');
    const { lines } = splitSourceLines(f.content);
    if (lineIndex >= lines.length) return err(400, 'line_out_of_range');
    const from = Math.max(0, lineIndex - 2);
    await logEvent(r._id, 'source_chosen_preview', userActor(user), r.workflowGeneration, { path, lineIndex, blobSha: f.blobSha });
    return ok({
      path, lineIndex, commitSha: head.commitSha, blobSha: f.blobSha, line: lines[lineIndex].text,
      neighbors: lines.slice(from, lineIndex + 3).map((l, i) => ({ lineIndex: from + i, text: l.text })),
    });
  } catch (e) {
    return err(503, 'source_unavailable', { detail: e.status ? `github_${e.status}` : 'network' });
  }
}

// ---------------------------------------------------------------- external (ספריא)

const EXTERNAL_ACTIONS = {
  resolve: { set: { state: 'closed_manual', status: 'resolved', 'external.status': 'resolved', closeReason: 'external_resolved' }, close: true },
  reject: { set: { state: 'closed_rejected', status: 'rejected', 'external.status': 'rejected', closeReason: 'external_rejected' }, close: true },
  return_to_manual: { set: { state: 'open', 'external.status': 'returned_to_manual' }, close: false },
};

export async function externalTransition({ user, id, generation, action, note, now = new Date() }) {
  if (!canManageCorrections(user)) return err(403, 'Forbidden');
  const spec = EXTERNAL_ACTIONS[action];
  if (!spec || !isId(id) || !Number.isSafeInteger(generation)) return err(400, 'invalid_request');
  if (action === 'reject' && (typeof note !== 'string' || note.trim().length < 3)) return err(400, 'reason_required');
  const set = { ...spec.set, 'external.decidedBy': user._id, 'external.decidedByName': user.name, 'external.decidedAt': now, 'external.note': typeof note === 'string' ? note.slice(0, 2000) : null };
  if (spec.close) Object.assign(set, { closedAt: now, resolvedAt: now, 'manual.status': 'none' });
  else Object.assign(set, manualQueueSet('returned_from_external', now));
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: id, workflowGeneration: generation, state: 'awaiting_external' },
    { $set: set, $inc: { workflowGeneration: 1 }, $push: { decisions: { decisionId: newId('dec'), source: 'volunteer', decision: `external_${action}`, message: set['external.note'] || '', actorId: user._id, actorName: user.name, generation, at: now } } },
    { new: true },
  ).lean();
  if (!updated) return err(409, 'stale_view');
  await logEvent(updated._id, `external_${action}`, userActor(user), updated.workflowGeneration);
  return ok({ generation: updated.workflowGeneration, state: updated.state });
}

/** ייצוא חבילות האיתור של הפריטים הממתינים לטיפול חיצוני. אין שליחה אוטומטית. */
export async function exportExternalPackages({ user, limit = 5000 }) {
  if (!canManageCorrections(user)) return err(403, 'Forbidden');
  const rows = await ErrorReport.find({ state: 'awaiting_external' }).sort({ createdAt: 1 }).limit(limit).lean();
  return ok({
    exported_at: new Date().toISOString(),
    external_target: 'sefaria_generator',
    count: rows.length,
    items: rows.map((r) => r.external?.package || buildExternalSefariaPackage(r)),
  });
}

