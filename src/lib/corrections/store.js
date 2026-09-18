/**
 * עזרי אחסון משותפים: מזהים, יומן פעולות, ומעברים מותני-גרסה על מסמך הדיווח.
 * כל מעבר מצב = findOneAndUpdate יחיד שהתנאי שלו בשאילתה (§5.2).
 */
import { randomUUID } from 'crypto';
import CorrectionEvent from '../../models/CorrectionEvent.js';

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

/** מסנן לדיווחים פתוחים. דיווח ישן בלי state אינו נראה עד שמריצים migration (דף הבריאות מתריע). */
export const OPEN_FILTER = { state: 'open' };
