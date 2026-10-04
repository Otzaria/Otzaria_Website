import crypto from 'node:crypto';
import { SearchFeedbackPurgeSnapshot as Snapshot, SearchFeedbackPurgeChunk as Chunk } from '../../models/SearchFeedbackPurgeSnapshot.js';
import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';
import { orderedEvents } from './event-query.js';
import { committedEvents } from './ingestion.js';
import { MAX_EVENT_AGE_MS, CLOCK_SKEW_MS } from './validation.js';

export const PURGE_PREVIEW_MS = 15 * 60 * 1000;
export const PURGE_CHUNK_SIZE = 1000;
export const MAX_PURGE_PREVIEWS = 32;
const CHUNK_LIFETIME_MS = 60 * 60 * 1000;

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
const filterHash = (filter) => crypto.createHash('sha256').update(JSON.stringify(canonical(filter))).digest('hex');

async function allocateSnapshot(record) {
  await Promise.all([Snapshot.init(), Chunk.init()]);
  for (let slot = 0; slot < MAX_PURGE_PREVIEWS; slot += 1) {
    try {
      const previous = await Snapshot.findOneAndUpdate(
        { _id: slot, $or: [{ expiresAt: { $lte: new Date() } }, { phase: 'done' }] },
        { $set: record }, { upsert: true, returnDocument: 'before', lean: true },
      );
      if (previous) await Chunk.deleteMany({ previewId: previous.previewId });
      return;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw Object.assign(new Error('יותר מדי תצוגות מקדימות פעילות; יש לנסות שוב מאוחר יותר'), { code: 'PURGE_PREVIEWS_BUSY' });
}

/** Snapshot only IDs, in fixed-size chunks. No full paragraphs are loaded or copied. */
export async function createPurgeSnapshot(filter, now, replacePreviewId) {
  await Promise.all([Snapshot.init(), Chunk.init()]);
  if (replacePreviewId) {
    // Release only an unused preview. A purge already holding it keeps its IDs.
    const released = await Snapshot.updateOne({ previewId: replacePreviewId, phase: 'ready' }, { $set: { phase: 'done' } });
    if (released.modifiedCount) await Chunk.deleteMany({ previewId: replacePreviewId });
  }
  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PURGE_PREVIEW_MS);
  await allocateSnapshot({ previewId, filterHash: filterHash(filter), asOf: now, count: 0, chunks: 0, phase: 'building', expiresAt });
  let cursor;
  try {
    cursor = await orderedEvents({ ...filter, receivedAt: { ...(filter.receivedAt ?? {}), $lte: now } }, {
      selection: '_id', batchSize: PURGE_CHUNK_SIZE,
    });
    let ids = [], count = 0, chunks = 0;
    const writeChunk = async () => {
      await Chunk.create({ previewId, chunk: chunks, eventIds: ids, expiresAt: new Date(Date.now() + CHUNK_LIFETIME_MS) });
      count += ids.length;
      chunks += 1;
      ids = [];
    };
    for await (const event of cursor) {
      ids.push(event._id);
      if (ids.length === PURGE_CHUNK_SIZE) await writeChunk();
    }
    if (ids.length) await writeChunk();
    const saved = await Snapshot.updateOne({ previewId, phase: 'building' }, {
      $set: { count, chunks, phase: 'ready', expiresAt: new Date(Date.now() + PURGE_PREVIEW_MS) },
    });
    if (!saved.modifiedCount) throw new Error('purge preview expired while being built; create a new preview');
    return { count, asOf: now, previewId };
  } catch (error) {
    await Promise.allSettled([Snapshot.deleteOne({ previewId }), Chunk.deleteMany({ previewId })]);
    throw error;
  } finally {
    if (cursor) await cursor.close().catch(() => {});
  }
}

/**
 * Only the immutable, confirmed IDs are eligible for deletion. A concurrent purge
 * can make some IDs absent; it cannot add other events to this approved set.
 * Legacy admin pages sending asOf without previewId resolve the same saved snapshot.
 */
export async function deletePurgeSnapshot(filter, { confirmCount, asOf, previewId }) {
  await Promise.all([Snapshot.init(), Chunk.init(), SearchFeedbackEvent.init()]);
  const identity = { filterHash: filterHash(filter), asOf };
  if (previewId !== undefined) identity.previewId = previewId;
  const candidates = await Snapshot.find({ ...identity, phase: 'ready', expiresAt: { $gt: new Date() } }).limit(2).lean();
  // asOf-only requests from cached older admin pages must not choose between two
  // different saved memberships created in the same millisecond.
  const snapshot = candidates.length === 1 ? candidates[0] : null;
  if (!snapshot || snapshot.count !== confirmCount) return { ok: false, count: snapshot?.count ?? 0 };
  const claimed = await Snapshot.updateOne({ previewId: snapshot.previewId, phase: 'ready' }, {
    $set: { phase: 'deleting', expiresAt: new Date(Date.now() + CHUNK_LIFETIME_MS) },
  });
  if (!claimed.modifiedCount) return { ok: false, count: snapshot.count };
  let deleted = 0;
  try {
    for (let index = 0; index < snapshot.chunks; index += 1) {
      const chunk = await Chunk.findOne({ previewId: snapshot.previewId, chunk: index }).select('eventIds').lean();
      if (!chunk) throw new Error('purge preview expired; create a new preview');
      // Erase all training content atomically with retaining its dedup identity.
      // A retry within the existing event-validity window cannot restore it.
      // These tiny tombstones expire; normal events do not have a TTL field.
      const result = await SearchFeedbackEvent.collection.updateMany(
        { _id: { $in: chunk.eventIds }, ...committedEvents() },
        [{ $replaceWith: {
          _id: '$_id', eventId: '$eventId', ingestCommitted: { $literal: false },
          purgedUntil: { $max: [
            { $add: [{ $ifNull: ['$clientTime', '$$NOW'] }, MAX_EVENT_AGE_MS + CLOCK_SKEW_MS] },
            { $add: ['$$NOW', CLOCK_SKEW_MS] },
          ] },
        } }],
      );
      deleted += result.modifiedCount ?? 0;
    }
    await Snapshot.updateOne({ previewId: snapshot.previewId }, { $set: { phase: 'done' } });
    await Chunk.deleteMany({ previewId: snapshot.previewId });
    return { ok: true, deleted };
  } catch (error) {
    // A retry of this saved preview remains limited to its original IDs, even if
    // earlier chunks were deleted before a database/network failure.
    await Snapshot.updateOne({ previewId: snapshot.previewId, phase: 'deleting' }, {
      $set: { phase: 'ready', expiresAt: new Date(Date.now() + PURGE_PREVIEW_MS) },
    }).catch(() => {});
    throw error;
  }
}
