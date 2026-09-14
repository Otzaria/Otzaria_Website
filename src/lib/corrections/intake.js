/**
 * קליטה אטומית של דיווח (CONTRACT §2): הדיווח והצורך בעיבוד (תור ידני / outbox
 * לבדיקה / טיפול חיצוני) נכתבים באותו insert יחיד — אין חלון שבו דיווח נשמר בלי תור.
 */
import ErrorReport from '../../models/ErrorReport.js';
import { computeNewLine } from './payload.js';
import { routeSourceKind } from './resolver.js';
import { buildExternalSefariaPackage, EXTERNAL_TARGET } from './external.js';
import { newId, logEvent } from './store.js';

/** מחשב את ניתוב הקליטה (טהור). */
export function planIntakeRouting({ kind, correction, sourceKind, verifyConfig }) {
  if (sourceKind === 'external_handling') return { route: 'external' };
  if (kind !== 'text_correction') return { route: 'manual', reason: 'free_text', verification: 'not_requested' };
  if (correction.proposedText === null) return { route: 'manual', reason: 'no_proposal', verification: 'not_requested' };
  if (/[\r\n]/.test(computeNewLine(correction))) return { route: 'manual', reason: 'structural_change', verification: 'not_requested' };
  if (!verifyConfig.enabled) return { route: 'manual', reason: verifyConfig.disabledReason, verification: 'skipped_service_disabled' };
  return { route: 'verify' };
}

function buildDoc({ legacy, validated, config, now }) {
  const doc = {
    reportId: legacy.report_id,
    senderEmail: legacy.sender_email,
    subject: legacy.subject,
    bookTitle: legacy.book_title,
    currentRef: legacy.current_ref,
    lineNumber: legacy.line_number,
    selectedText: legacy.selected_text,
    errorDetails: legacy.error_details,
    contextText: legacy.context_text,
    filePath: legacy.file_path,
    sourceFolder: legacy.source_folder,
    libraryVersion: legacy.library_version,
    emailSent: false,
    schemaVersion: validated.schemaVersion,
    reportKind: validated.kind,
    contentDigest: validated.contentDigest,
    location: validated.location,
    sourceHint: validated.sourceHint,
    client: validated.client,
    currentRevision: 0,
    workflowGeneration: 1,
    state: 'open',
    approval: { authority: 'none', scope: 'none' },
    publish: { status: 'not_ready' },
    inclusion: { status: 'unknown' },
    dispatch: { verify: false, publish: false },
  };
  if (validated.correction) {
    doc.proposals = [{ revision: 1, author: 'user', ...validated.correction, createdAt: now }];
    doc.currentRevision = 1;
  }

  const plan = planIntakeRouting({
    kind: validated.kind,
    correction: validated.correction,
    sourceKind: routeSourceKind(doc),
    verifyConfig: config.verify,
  });
  if (plan.route === 'external') {
    doc.state = 'awaiting_external';
    doc.manual = { status: 'none' };
    doc.verification = { status: 'not_requested' };
    doc.external = { target: EXTERNAL_TARGET, status: 'awaiting_external', package: null };
  } else if (plan.route === 'verify') {
    doc.manual = { status: 'none' };
    doc.verification = { status: 'queued', requestId: newId('req'), requestedScope: config.verify.requestedScope, attempts: 0 };
    doc.dispatch.verify = true;
  } else {
    doc.manual = { status: 'queued', handoffReason: plan.reason, queuedAt: now };
    doc.verification = { status: plan.verification };
  }
  doc.status = 'pending';
  return { doc, plan };
}

/**
 * @returns {Promise<{outcome:'created'|'replay'|'conflict', report:object, plan?:object}>}
 */
export async function ingestReport({ legacy, validated, config, now = new Date() }) {
  const existing = await ErrorReport.findOne({ reportId: legacy.report_id }).lean();
  if (existing) return compareExisting(existing, validated);

  const { doc, plan } = buildDoc({ legacy, validated, config, now });
  const created = new ErrorReport(doc);
  if (plan.route === 'external') created.external.package = buildExternalSefariaPackage(created.toObject());
  try {
    await created.save();
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await ErrorReport.findOne({ reportId: legacy.report_id }).lean();
      if (raced) return compareExisting(raced, validated);
    }
    throw err;
  }
  const report = created.toObject();
  await logEvent(report._id, 'report_received', { kind: 'public' }, report.workflowGeneration, {
    kind: report.reportKind, route: plan.route, reason: plan.reason ?? null, schemaVersion: report.schemaVersion,
  });
  return { outcome: 'created', report, plan };
}

function compareExisting(existing, validated) {
  // דיווח ישן בלי digest: לא ניתן להשוות, ולכן ההתנהגות הישנה (upsert שקט) נשמרת.
  if (!existing.contentDigest || existing.contentDigest === validated.contentDigest) return { outcome: 'replay', report: existing };
  return { outcome: 'conflict', report: existing };
}

