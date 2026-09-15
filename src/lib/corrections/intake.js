/**
 * קליטה אטומית של דיווח (CONTRACT §2): הדיווח והצורך בעיבוד (תור ידני / outbox
 * לבדיקה) נכתבים באותו insert יחיד — אין חלון שבו דיווח נשמר בלי תור.
 */
import ErrorReport from '../../models/ErrorReport.js';
import { computeNewLine } from './payload.js';
import { reachesOtzariaInbox } from './report-email.js';
import { newId, logEvent } from './store.js';

/** מחשב את ניתוב הקליטה (טהור). */
export function planIntakeRouting({ kind, correction, reachesOtzaria, verifyConfig }) {
  if (!reachesOtzaria) return { route: 'email_only' };
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
    // אותו ערך שהמייל מנותב לפיו, כדי שהשרת לא יכריע אחרת מתיבת הדואר.
    reachesOtzaria: reachesOtzariaInbox(legacy.source_folder),
    verifyConfig: config.verify,
  });
  if (plan.route === 'email_only') {
    doc.state = 'email_only';
    doc.manual = { status: 'none' };
    doc.verification = { status: 'not_requested' };
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
  if (existing) return compareExisting(existing, validated, legacy);

  const { doc, plan } = buildDoc({ legacy, validated, config, now });
  const created = new ErrorReport(doc);
  try {
    await created.save();
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await ErrorReport.findOne({ reportId: legacy.report_id }).lean();
      if (raced) return compareExisting(raced, validated, legacy);
    }
    throw err;
  }
  const report = created.toObject();
  await logEvent(report._id, 'report_received', { kind: 'public' }, report.workflowGeneration, {
    kind: report.reportKind, route: plan.route, reason: plan.reason ?? null, schemaVersion: report.schemaVersion,
  });
  return { outcome: 'created', report, plan };
}

async function compareExisting(existing, validated, legacy) {
  // דיווח ישן בלי digest: לא ניתן להשוות, ולכן ההתנהגות הישנה (upsert שקט) נשמרת.
  if (!existing.contentDigest || existing.contentDigest === validated.contentDigest) return { outcome: 'replay', report: existing };
  if (validated.schemaVersion === 2) return { outcome: 'conflict', report: existing };
  // לקוח ישן מסווג 409 כזמני ונתקע עליו; לכן upsert כמו פעם — ורק על דיווח v1 פתוח, לעולם לא על v2.
  const updated = await ErrorReport.findOneAndUpdate(
    { _id: existing._id, schemaVersion: 1, contentDigest: existing.contentDigest, state: 'open' },
    { $set: { ...legacyDisplaySet(legacy), contentDigest: validated.contentDigest } },
    { returnDocument: 'after' },
  ).lean();
  if (updated) await logEvent(updated._id, 'report_updated_by_legacy_client', { kind: 'public' }, updated.workflowGeneration);
  return { outcome: 'replay', report: updated || existing };
}

function legacyDisplaySet(l) {
  return {
    subject: l.subject, bookTitle: l.book_title, currentRef: l.current_ref, lineNumber: l.line_number, selectedText: l.selected_text,
    errorDetails: l.error_details, contextText: l.context_text, filePath: l.file_path, sourceFolder: l.source_folder, libraryVersion: l.library_version,
  };
}

