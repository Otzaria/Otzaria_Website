/**
 * בריאות המערכת למנהלים: דופק ה-worker, גיל המשימה הוותיקה, ספירות. "תקין" רק כשהתור
 * באמת מעובד — worker שלא דפק לאחרונה כשיש עבודה ממתינה מסומן כלא תקין.
 */
import ErrorReport from '../../models/ErrorReport.js';
import CorrectionJob from '../../models/CorrectionJob.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { describeConfig } from './config.js';

const ageSec = (d, now) => (d ? Math.round((now.getTime() - new Date(d).getTime()) / 1000) : null);

export async function computeHealth({ config, now = new Date() }) {
  const [beat] = await WorkerHeartbeat.find({}).sort({ lastBeatAt: -1 }).limit(1).lean();
  const oldest = {};
  for (const type of ['verify', 'publish']) {
    const j = await CorrectionJob.findOne({ type, status: { $in: ['pending', 'leased'] } }).sort({ createdAt: 1 }).lean();
    oldest[type] = j ? { ageSeconds: ageSec(j.createdAt, now), attempts: j.attempts, status: j.status, nextAttemptAt: j.nextAttemptAt } : null;
  }
  const count = (q) => ErrorReport.countDocuments(q);
  const counts = {
    open: await count({ state: 'open' }),
    legacyNotMigrated: await count({ state: { $exists: false } }),
    manualQueued: await count({ state: 'open', 'manual.status': { $in: ['queued', 'released'] } }),
    claimed: await count({ state: 'open', 'manual.status': 'claimed' }),
    verifyQueued: await count({ state: 'open', 'verification.status': { $in: ['queued', 'in_progress'] } }),
    outboxPending: await count({ state: 'open', $or: [{ 'dispatch.verify': true }, { 'dispatch.publish': true }] }),
    publishReady: await count({ state: 'open', 'publish.status': 'ready' }),
    publishUnknown: await count({ 'publish.status': 'unknown_needs_reconcile' }),
    publishFailed: await count({ state: 'open', 'publish.status': 'failed' }),
    prOpened: await count({ state: 'open', 'publish.status': 'pr_opened' }),
    awaitingExternal: await count({ state: 'awaiting_external' }),
  };
  const heartbeatAge = ageSec(beat?.lastBeatAt, now);
  const stale = heartbeatAge === null || heartbeatAge > config.worker.staleHeartbeatSeconds;
  const hasWork = counts.verifyQueued + counts.outboxPending + counts.publishReady + counts.publishUnknown + counts.prOpened > 0
    || Boolean(oldest.verify || oldest.publish);
  const problems = [];
  if (stale && hasWork) problems.push('worker_not_running');
  if (beat?.lastError) problems.push('worker_last_batch_error');
  if (counts.publishUnknown > 0) problems.push('publish_unknown_pending');
  if (config.errors.length) problems.push('config_errors');
  return {
    healthy: problems.length === 0,
    problems,
    heartbeat: beat ? { workerId: beat.workerId, lastBeatAt: beat.lastBeatAt, ageSeconds: heartbeatAge, stale, lastBatch: beat.lastBatch, lastError: beat.lastError } : null,
    oldestJob: oldest,
    counts,
    config: describeConfig(config),
  };
}
