/**
 * חוזה B מול שירות הבדיקה: בניית בקשה (§3.1), אימות תשובה (§3.4) וניתוב (§3.5).
 * תשובת השירות היא נתונים בלבד — שום כתובת/יעד ממנה אינו משמש לפעולה.
 */
import { computeChangeDigest } from './ocj1.js';
import { AUTHORITY } from './config.js';

export const API_VERSION = '1';
export const DECISIONS = Object.freeze(['approved', 'rejected', 'needs_review', 'conflict', 'already_fixed']);
export const KNOWN_REASON_CODES = new Set([
  'ok', 'source_not_found', 'source_ambiguous', 'selection_not_found', 'selection_ambiguous', 'source_changed',
  'proposal_identical', 'proposal_invalid', 'content_doubtful', 'content_wrong', 'structural_change', 'out_of_scope',
  'service_capacity', 'unsupported_capability', 'manual_required',
]);

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** בונה את גוף הבקשה מתוך הדיווח, ההצעה הנוכחית והמקור שאותר. */
export function buildVerifyRequest({ report, revision, requestId, requestedScope, source, change = null }) {
  return {
    api_version: API_VERSION,
    request_id: requestId,
    report_id: String(report._id),
    client_report_id: report.reportId,
    proposal_revision: revision.revision,
    workflow_generation: report.workflowGeneration,
    requested_review_scope: requestedScope,
    report: {
      kind: report.reportKind || 'free_text',
      book_title: report.bookTitle || '',
      current_ref: report.currentRef || '',
      he_ref: report.location?.heRef ?? null,
      source_folder: report.sourceFolder || '',
      library_build_id: report.location?.libraryBuildId ?? null,
      user_explanation: report.errorDetails || '',
      display_text: report.selectedText || '',
    },
    proposal: {
      original_line: revision.originalLine,
      original_selection: revision.originalSelection ?? null,
      selection_offset: revision.selectionOffset ?? null,
      proposed_text: revision.proposedText ?? null,
      context_before: revision.contextBefore ?? '',
      context_after: revision.contextAfter ?? '',
    },
    source: source
      ? {
          repo: source.repo, ref: source.ref, commit_sha: source.commitSha, path: source.path,
          blob_sha: source.blobSha, line_index: source.lineIndex, current_line: source.currentLine, match: source.match,
        }
      : null,
    change: change ? { change_id: change.changeId, change_digest: change.changeDigest } : null,
  };
}

function bad(reason) {
  return { ok: false, reason };
}

/**
 * מאמת תשובת 200/202 מול הבקשה והמצב הנוכחי (§3.4). לא משנה מצב.
 * @returns {{ok:true, kind:'pending', jobId, pollAfterSeconds} | {ok:true, kind:'decision', stale:boolean, value, authorityExceeded:boolean} | {ok:false, reason}}
 */
export function validateVerifyResponse(body, { request, currentGeneration, siteAuthority }) {
  if (!isObj(body)) return bad('invalid_json');
  if (body.api_version !== API_VERSION) return bad('unsupported_api_version');
  if (body.request_id !== request.request_id) return bad('response_mismatch');

  if (body.processing_status === 'pending') {
    if (typeof body.job_id !== 'string' || !ID_RE.test(body.job_id)) return bad('missing_fields');
    const poll = Number.isSafeInteger(body.poll_after_seconds) && body.poll_after_seconds > 0 ? body.poll_after_seconds : 30;
    return { ok: true, kind: 'pending', jobId: body.job_id, pollAfterSeconds: poll };
  }
  if (body.processing_status === 'failed') {
    return { ok: false, reason: 'service_failed', reasonCode: typeof body.reason_code === 'string' ? body.reason_code : null };
  }
  if (body.processing_status !== 'completed') return bad('missing_fields');

  if (body.report_id !== request.report_id || body.proposal_revision !== request.proposal_revision) return bad('response_mismatch');
  if (!Number.isSafeInteger(body.workflow_generation)) return bad('missing_fields');
  if (typeof body.decision_id !== 'string' || !ID_RE.test(body.decision_id)) return bad('missing_fields');
  if (!DECISIONS.includes(body.decision)) return bad('unknown_decision');
  if (typeof body.reason_code !== 'string' || body.reason_code.length > 100) return bad('missing_fields');
  if (body.reason_code === 'unsupported_capability') return bad('unsupported_capability');

  const needsChange = body.decision === 'approved' || body.decision === 'already_fixed';
  let change = null;
  if (needsChange) {
    const c = body.change;
    if (!isObj(c) || !isObj(c.target) || !isObj(c.base)) return bad('invalid_response');
    if (typeof c.change_id !== 'string' || !ID_RE.test(c.change_id)) return bad('invalid_response');
    if (typeof c.change_digest !== 'string' || !SHA256.test(c.change_digest)) return bad('invalid_response');
    if (typeof c.target.path !== 'string' || !Number.isSafeInteger(c.target.line_index) || c.target.line_index < 0) return bad('invalid_response');
    if (!SHA40.test(String(c.base.blob_sha)) || !SHA40.test(String(c.base.commit_sha))) return bad('invalid_response');
    if (typeof c.original_line !== 'string' || typeof c.new_line !== 'string') return bad('invalid_response');
    const local = computeChangeDigest({
      path: c.target.path, base_blob_sha: c.base.blob_sha, line_index: c.target.line_index,
      original_line: c.original_line, new_line: c.new_line,
    });
    if (local !== c.change_digest) return bad('invalid_response');
    change = {
      changeId: c.change_id, changeDigest: c.change_digest, repo: typeof c.target.repo === 'string' ? c.target.repo : null,
      path: c.target.path, lineIndex: c.target.line_index, baseCommitSha: c.base.commit_sha, baseBlobSha: c.base.blob_sha,
      originalLine: c.original_line, newLine: c.new_line,
    };
  }

  let scope = null;
  let authorityExceeded = false;
  if (body.decision === 'approved') {
    if (body.approval_scope !== AUTHORITY.TECHNICAL_ONLY && body.approval_scope !== AUTHORITY.FULL) return bad('invalid_response');
    scope = body.approval_scope;
    if (scope === AUTHORITY.FULL && siteAuthority !== AUTHORITY.FULL) {
      scope = AUTHORITY.TECHNICAL_ONLY;
      authorityExceeded = true;
    }
  }

  const candidates = Array.isArray(body.candidates)
    ? body.candidates.slice(0, 20).filter((c) => isObj(c) && typeof c.path === 'string' && Number.isSafeInteger(c.line_index) && typeof c.line === 'string')
      .map((c) => ({ path: c.path.slice(0, 1000), lineIndex: c.line_index, line: c.line.slice(0, 20_000) }))
    : [];

  return {
    ok: true,
    kind: 'decision',
    stale: body.workflow_generation !== currentGeneration,
    authorityExceeded,
    value: {
      decisionId: body.decision_id,
      decision: body.decision,
      approvalScope: scope,
      reasonCode: body.reason_code,
      reasonKnown: KNOWN_REASON_CODES.has(body.reason_code) || body.reason_code.startsWith('svc_'),
      message: typeof body.message === 'string' ? body.message.slice(0, 2000) : '',
      change,
      candidates,
      workflowGeneration: body.workflow_generation,
    },
  };
}

/**
 * ניתוב לאחר תשובה תקינה (§3.5). פונקציה טהורה; ההחלה בפועל מותנית-גרסה במקום אחר.
 * ctx: { requestedScope, siteAuthority, autoPublish, autoRejectAllowed, sentNewLine, sentPath, sentLineIndex,
 *        manualActive, finalState, localAlreadyFixedVerified }
 * @returns {{route:'publish'|'manual'|'close_already_fixed'|'close_rejected', handoffReason?:string, serviceRevision?:boolean}}
 */
export function routeVerifyDecision(value, ctx) {
  if (ctx.finalState) return { route: 'manual', handoffReason: 'final_state' };
  if (ctx.manualActive) return { route: 'manual', handoffReason: 'manual_active' };
  if (!value.reasonKnown) return { route: 'manual', handoffReason: 'unknown_reason_code' };

  switch (value.decision) {
    case 'approved': {
      const c = value.change;
      const differs = c.newLine !== ctx.sentNewLine || c.path !== ctx.sentPath || c.lineIndex !== ctx.sentLineIndex
        || c.baseBlobSha !== ctx.sentBlobSha || (c.repo !== null && c.repo !== ctx.sentRepo);
      if (differs) return { route: 'manual', handoffReason: 'service_modified_proposal', serviceRevision: c.newLine !== ctx.sentNewLine };
      if (value.approvalScope !== AUTHORITY.FULL) return { route: 'manual', handoffReason: 'needs_content_review' };
      const allowed = ctx.siteAuthority === AUTHORITY.FULL && ctx.autoPublish === true && ctx.requestedScope === AUTHORITY.FULL;
      return allowed ? { route: 'publish' } : { route: 'manual', handoffReason: 'auto_publish_not_permitted' };
    }
    case 'already_fixed':
      return ctx.localAlreadyFixedVerified ? { route: 'close_already_fixed' } : { route: 'manual', handoffReason: 'already_fixed_unverified' };
    case 'rejected':
      return ctx.autoRejectAllowed && ctx.siteAuthority !== AUTHORITY.NONE
        ? { route: 'close_rejected' }
        : { route: 'manual', handoffReason: 'manual_reject_review' };
    case 'conflict':
      return { route: 'manual', handoffReason: 'service_conflict' };
    case 'needs_review':
    default:
      return { route: 'manual', handoffReason: 'needs_review' };
  }
}
