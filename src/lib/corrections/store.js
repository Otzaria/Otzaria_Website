/**
 * עזרי אחסון משותפים: מזהים, יומן פעולות, ומעברים מותני-גרסה על מסמך הדיווח.
 * כל מעבר מצב = findOneAndUpdate יחיד שהתנאי שלו בשאילתה (§5.2).
 */
import { randomUUID } from 'crypto';
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionEvent from '../../models/CorrectionEvent.js';
import { legacyStateFromStatus } from './states.js';
import { reachesOtzariaInbox, NON_OTZARIA_SOURCE_FOLDER_RE } from './report-email.js';

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '')}`;

export const WORKER_ACTOR = Object.freeze({ kind: 'worker' });
export const userActor = (u) => ({ kind: 'user', id: u?._id ?? null, name: u?.name ?? null });

/** רישום ביומן — כשל ברישום לא מפיל את הפעולה עצמה. */
export async function logEvent(reportId, type, actor, generation = null, data = null) {
  try {
    await CorrectionEvent.create({
      report: reportId, type, actorKind: actor.kind, actorId: actor.id ?? null, actorName: actor.name ?? null, generation, data,
    });
  } catch (err) {
    console.error('[corrections] event log failed:', err?.message);
  }
}

export function currentRevisionOf(r) {
  if (!Array.isArray(r?.proposals) || !r.proposals.length) return null;
  return r.proposals.find((p) => p.revision === r.currentRevision) || null;
}

/** עדכון שמכניס את הדיווח לתור הידני (ומבטל בדיקה אוטומטית ממתינה). */
export function manualQueueSet(reason, now) {
  return {
    'manual.status': 'queued',
    'manual.handoffReason': reason,
    'manual.queuedAt': now,
    'manual.assignee': null,
    'manual.assigneeName': null,
    'manual.claimedAt': null,
    'manual.leaseExpiresAt': null,
    'dispatch.verify': false,
    status: 'pending',
    assignedTo: null,
  };
}

/** מסנן לדיווחים פתוחים, כולל דיווחים ישנים שעוד לא עברו migration. */
export const OPEN_FILTER = {
  $or: [{ state: 'open' }, { state: { $exists: false }, status: { $in: ['pending', 'in_progress'] }, sourceFolder: { $not: NON_OTZARIA_SOURCE_FOLDER_RE } }],
};

/** שדרוג עצל ואידמפוטנטי של דיווח ישן למודל החדש (זהה ל-migration). */
export function legacyUpgradeSet(r, now = new Date()) {
  const legacyState = legacyStateFromStatus(r.status);
  const state = legacyState === 'open' && !reachesOtzariaInbox(r.sourceFolder) ? 'email_only' : legacyState;
  const set = {
    state,
    schemaVersion: r.schemaVersion || 1,
    reportKind: r.reportKind || 'free_text',
    currentRevision: r.currentRevision || 0,
    workflowGeneration: r.workflowGeneration || 0,
    'verification.status': 'not_requested',
    'approval.authority': 'none',
    'approval.scope': 'none',
    'publish.status': 'not_ready',
    'inclusion.status': 'unknown',
  };
  if (state === 'open') {
    set['manual.status'] = 'queued';
    set['manual.handoffReason'] = 'legacy_report';
    set['manual.queuedAt'] = r.createdAt || now;
  } else if (state === 'email_only') {
    set['manual.status'] = 'none';
  } else {
    set['manual.status'] = 'none';
    set.closeReason = 'legacy_closed';
  }
  return set;
}

export async function ensureUpgraded(id) {
  const r = await ErrorReport.findById(id).lean();
  if (!r || r.state) return r;
  await ErrorReport.updateOne({ _id: id, state: { $exists: false } }, { $set: legacyUpgradeSet(r) });
  return ErrorReport.findById(id).lean();
}
