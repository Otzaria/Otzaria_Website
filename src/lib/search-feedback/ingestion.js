import crypto from 'node:crypto';
import mongoose from 'mongoose';
import SearchFeedbackKey from '../../models/SearchFeedbackKey.js';
import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';

// Older events have no flag and remain readable. Staged batches become readable only
// after their counters have been committed, so a purge cannot interrupt that commit.
export const committedEvents = () => ({ ingestCommitted: { $ne: false } });

const QUEUES = Symbol.for('otzaria.searchFeedback.ingestQueues');
const queues = (globalThis[QUEUES] ??= new Map());
const MAX_CLAIM_ATTEMPTS = 32;
const MAINTENANCE = Symbol.for('otzaria.searchFeedback.stagedMaintenance');
const maintenance = (globalThis[MAINTENANCE] ??= { at: 0, promise: null, after: null });

/** Reclaim interrupted stale-helper upserts, without touching a live receipt. */
export async function cleanupStagedOrphans({ now = new Date(), limit = 500, after = null } = {}) {
  await Promise.all([SearchFeedbackEvent.init(), SearchFeedbackKey.init()]);
  limit = Math.max(1, Math.min(500, Math.floor(limit) || 500));
  const filter = {
    ingestCommitted: false, ingestToken: { $exists: true },
    receivedAt: { $lte: new Date(now.getTime() - 60 * 60 * 1000) },
  };
  if (after) filter.$or = [
    { receivedAt: { $gt: after.receivedAt } },
    { receivedAt: after.receivedAt, _id: { $gt: after._id } },
  ];
  const staged = await SearchFeedbackEvent.find(filter)
    .sort({ receivedAt: 1, _id: 1 }).hint({ ingestCommitted: 1, receivedAt: 1, _id: 1 })
    .select('_id keyId ingestToken receivedAt').limit(limit).lean();
  if (!staged.length) return null;
  const keys = await SearchFeedbackKey.find({ keyId: { $in: [...new Set(staged.map((event) => event.keyId))] } })
    .select('keyId pendingIngest.token').lean();
  const active = new Map(keys.map((key) => [key.keyId, key.pendingIngest?.token]));
  const orphanIds = staged.filter((event) => active.get(event.keyId) !== event.ingestToken).map((event) => event._id);
  if (orphanIds.length) await SearchFeedbackEvent.deleteMany({ _id: { $in: orphanIds }, ingestCommitted: false });
  const last = staged.at(-1);
  return staged.length === limit ? { receivedAt: last.receivedAt, _id: last._id } : null;
}

export async function maintainStagedEvents() {
  if (Date.now() - maintenance.at < 60 * 1000) return;
  if (!maintenance.promise) {
    maintenance.at = Date.now();
    maintenance.promise = cleanupStagedOrphans({ after: maintenance.after }).then((after) => {
      maintenance.after = after;
    }).catch((error) => {
      console.error('Search feedback staged cleanup failed:', error?.message);
    }).finally(() => { maintenance.promise = null; });
  }
  await maintenance.promise;
}

async function pendingFor(keyId) {
  const key = await SearchFeedbackKey.findOne({ keyId }).select('pendingIngest').lean();
  if (!key) throw new Error('search feedback installation no longer exists');
  return key.pendingIngest;
}

async function removeUncommittedAttempt(keyId, token, attemptedIds) {
  if (!attemptedIds.length) return;
  const pending = await pendingFor(keyId);
  // Another helper can have committed these same documents. Never discard its
  // original IDs while it is making the batch visible.
  if (pending?.token === token && pending.phase === 'writing') return;
  const protectedIds = new Set(pending?.token === token ? (pending.eventDocIds ?? []).map(String) : []);
  const disposable = attemptedIds.filter((id) => !protectedIds.has(String(id)));
  if (disposable.length) {
    await SearchFeedbackEvent.deleteMany({ _id: { $in: disposable }, ingestToken: token, ingestCommitted: false });
  }
}

/**
 * Complete the one durable receipt. Helpers may race across processes: only the
 * writing -> counted CAS increments counters, and activation uses the exact Mongo
 * document IDs captured by that CAS. A stale writer's new upsert IDs can therefore
 * neither be activated nor resurrect an event removed by a concurrent purge.
 * All recovery queries and receipt arrays are bounded by the 100-event batch cap.
 */
export async function completePendingIngest(keyId, pending) {
  const token = pending.token;
  let accepted = 0;
  let attemptedIds = [];
  try {
    if (pending.phase === 'writing') {
      const { batch, now, token } = pending;
      attemptedIds = batch.events.map(() => new mongoose.Types.ObjectId());
      if (batch.events.length) {
        await SearchFeedbackEvent.bulkWrite(batch.events.map((event, index) => ({
          updateOne: {
            filter: { eventId: event.eventId },
            update: { $setOnInsert: {
              _id: attemptedIds[index], eventId: event.eventId, keyId,
              batchId: batch.batchId, type: event.type, searchSessionId: event.searchSessionId,
              msSinceSearch: event.msSinceSearch, clientTime: event.clientTime,
              sentAt: batch.sentAt, receivedAt: now, context: batch.context, payload: event.payload,
              ingestToken: token, ingestCommitted: false,
            } },
            upsert: true,
          },
        })), { ordered: false });
      }
      const owned = await SearchFeedbackEvent.find({
        ingestToken: token, eventId: { $in: batch.events.map((event) => event.eventId) },
      }).select('_id').lean();
      const result = await SearchFeedbackKey.updateOne(
        { keyId, 'pendingIngest.token': token, 'pendingIngest.phase': 'writing' },
        {
          $inc: { eventCount: owned.length, batchCount: owned.length > 0 ? 1 : 0 },
          $set: { 'pendingIngest.phase': 'counted', 'pendingIngest.eventDocIds': owned.map((event) => event._id) },
          $unset: { 'pendingIngest.batch': 1 },
        },
      );
      accepted = result.modifiedCount ? owned.length : 0;
      pending = await pendingFor(keyId);
      if (!pending || pending.token !== token) {
        await removeUncommittedAttempt(keyId, token, attemptedIds);
        return accepted;
      }
    }

    if (pending.phase === 'counted') {
      await SearchFeedbackEvent.updateMany(
        { _id: { $in: pending.eventDocIds }, ingestToken: pending.token, ingestCommitted: false },
        { $set: { ingestCommitted: true } },
      );
      await SearchFeedbackKey.updateOne(
        { keyId, 'pendingIngest.token': pending.token, 'pendingIngest.phase': 'counted' },
        { $unset: { pendingIngest: 1 } },
      );
      await removeUncommittedAttempt(keyId, pending.token, attemptedIds);
    }
    return accepted;
  } catch (error) {
    // Preserve a writing receipt for retry. If another helper already finished,
    // dispose only this attempt's still-hidden, unclaimed upserts.
    if (attemptedIds.length) {
      await removeUncommittedAttempt(keyId, token, attemptedIds).catch(() => {});
    }
    throw error;
  }
}

async function ingestUnderReceipt(keyId, batch, now) {
  const unique = new Map();
  for (const event of batch.events) if (!unique.has(event.eventId)) unique.set(event.eventId, event);
  const events = [...unique.values()];
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const pending = await pendingFor(keyId);
    if (pending) {
      await completePendingIngest(keyId, pending);
      continue;
    }
    const receipt = { token: crypto.randomUUID(), phase: 'writing', batch: { ...batch, events }, now };
    const claimed = await SearchFeedbackKey.updateOne(
      { keyId, pendingIngest: { $exists: false } },
      { $set: { pendingIngest: receipt, appVersionLast: batch.context.appVersion }, $max: { lastSeenAt: now } },
    );
    if (!claimed.modifiedCount) continue;
    return completePendingIngest(keyId, receipt);
  }
  throw new Error('search feedback installation is busy; retry this batch');
}

export async function ingestWithReceipt(keyId, batch, now) {
  // The unique event/key indexes must exist before the first concurrent upsert.
  await Promise.all([SearchFeedbackEvent.init(), SearchFeedbackKey.init()]);
  // Avoid redundant recovery work for simultaneous requests in this process.
  // The Mongo receipt/CAS still enforces correctness across independent workers.
  const previous = queues.get(keyId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => ingestUnderReceipt(keyId, batch, now));
  queues.set(keyId, current);
  try {
    const accepted = await current;
    await maintainStagedEvents();
    return accepted;
  } finally {
    if (queues.get(keyId) === current) queues.delete(keyId);
  }
}
