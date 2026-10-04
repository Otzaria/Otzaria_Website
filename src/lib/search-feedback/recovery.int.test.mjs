import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import SearchFeedbackKey from '../../models/SearchFeedbackKey.js';
import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';
import { SearchFeedbackPurgeSnapshot, SearchFeedbackPurgeChunk } from '../../models/SearchFeedbackPurgeSnapshot.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { handleRegisterPost, handleEventsPost } from './handler.js';
import { getSearchFeedbackConfig } from './config.js';
import { computeKeyId } from './crypto.js';
import { validateEventsBatch } from './validation.js';
import { committedEvents, completePendingIngest, cleanupStagedOrphans } from './ingestion.js';
import { orderedEvents } from './event-query.js';
import { MAX_PURGE_PREVIEWS, PURGE_CHUNK_SIZE } from './purge-snapshot.js';
import { previewPurge, purgeEvents, exportEventsStream, getStats, invalidateStatsCache, ingestEvents } from './service.js';
import { randomKeyPair, registerBody, batch, event, resultFull } from './testing/fixtures.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => { if (!db.skip) await db.reset(); invalidateStatsCache(); });
const deps = { config: getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: '1' }), connectDB: async () => {}, rateLimit: () => true, getIp: () => '198.51.100.4' };
async function post(handler, kp, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  const response = await handler(new Request('http://localhost/api/search-feedback/x', {
    method: 'POST', body: bytes,
    headers: { 'x-otzaria-key-id': computeKeyId(kp.publicRaw), 'x-otzaria-signature': kp.sign(bytes) },
  }), deps);
  return { status: response.status, body: await response.json() };
}
async function installation() {
  const kp = randomKeyPair();
  assert.equal((await post(handleRegisterPost, kp, registerBody(kp, new Date()))).status, 200);
  return kp;
}
const send = (kp, body) => post(handleEventsPost, kp, body);
const keyFor = (kp) => SearchFeedbackKey.findOne({ keyId: computeKeyId(kp.publicRaw) }).lean();
async function readExport() {
  const stream = await exportEventsStream({ filter: {}, includeBlocked: true });
  const text = await new Response(stream).text();
  return text.split('\n').filter(Boolean).map(JSON.parse);
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('counter failure before its CAS is recovered by an exact signed retry without losing counts', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), body = batch(new Date());
  const update = SearchFeedbackKey.updateOne;
  let failed = false;
  SearchFeedbackKey.updateOne = function(filter, ...args) {
    if (!failed && filter['pendingIngest.phase'] === 'writing') {
      failed = true;
      throw new Error('injected transient counter failure');
    }
    return update.call(this, filter, ...args);
  };
  try {
    assert.equal((await send(kp, body)).status, 500);
    assert.equal(await SearchFeedbackEvent.countDocuments(), 5);
    assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 0);
    assert.equal((await keyFor(kp)).eventCount, 0);
    assert.equal((await keyFor(kp)).pendingIngest.batch.events.length, 5);
    assert.deepEqual(await readExport(), []);
    const retry = await send(kp, body);
    assert.deepEqual(retry.body, { accepted: 0, duplicates: 5, rejected: 0, rejectedSamples: [] });
    const key = await keyFor(kp);
    assert.equal(key.eventCount, 5);
    assert.equal(key.batchCount, 1);
    assert.equal(key.pendingIngest, undefined);
    const exported = await readExport();
    assert.equal(exported.length, 5);
    assert.ok(exported.every((row) => !('ingestToken' in row) && !('ingestCommitted' in row)));
  } finally { SearchFeedbackKey.updateOne = update; }
});

test('lost acknowledgement after the counter CAS cannot increment either counter twice', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), body = batch(new Date());
  const update = SearchFeedbackKey.updateOne;
  let failed = false;
  SearchFeedbackKey.updateOne = async function(filter, ...args) {
    const result = await update.call(this, filter, ...args);
    if (!failed && filter['pendingIngest.phase'] === 'writing') {
      failed = true;
      throw new Error('injected lost counter acknowledgement');
    }
    return result;
  };
  try {
    assert.equal((await send(kp, body)).status, 500);
    const counted = await keyFor(kp);
    assert.equal(counted.eventCount, 5);
    assert.equal(counted.pendingIngest.phase, 'counted');
    assert.equal(counted.pendingIngest.batch, undefined, 'raw content is removed from the receipt before activation');
    assert.equal((await send(kp, body)).status, 200);
    const recovered = await keyFor(kp);
    assert.equal(recovered.eventCount, 5);
    assert.equal(recovered.batchCount, 1);
    assert.equal(recovered.pendingIngest, undefined);
    assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 5);
  } finally { SearchFeedbackKey.updateOne = update; }
});

test('partial activation, explicit purge, and retry cannot restore erased paragraphs or recount them', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), body = batch(new Date());
  const update = SearchFeedbackEvent.updateMany;
  let failed = false;
  SearchFeedbackEvent.updateMany = async function(filter, ...args) {
    if (!failed && filter.ingestCommitted === false && filter._id?.$in?.length === 5) {
      failed = true;
      await update.call(this, { ...filter, _id: { $in: filter._id.$in.slice(0, 2) } }, ...args);
      throw new Error('injected partial activation failure');
    }
    return update.call(this, filter, ...args);
  };
  try {
    assert.equal((await send(kp, body)).status, 500);
    const preview = await previewPurge({});
    assert.equal(preview.count, 2);
    assert.deepEqual(await purgeEvents({}, { ...preview, confirmCount: 2 }), { ok: true, deleted: 2 });
    const retry = await send(kp, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.accepted, 0);
    assert.equal(retry.body.duplicates, 5);
    assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 3);
    const key = await keyFor(kp);
    assert.equal(key.eventCount, 5);
    assert.equal(key.batchCount, 1);
    assert.equal(key.pendingIngest, undefined);
    const erased = await SearchFeedbackEvent.find({ purgedUntil: { $exists: true } }).lean();
    assert.equal(erased.length, 2);
    for (const row of erased) {
      assert.deepEqual(Object.keys(row).sort(), ['_id', 'eventId', 'ingestCommitted', 'purgedUntil']);
      assert.ok(row.purgedUntil.getTime() > Date.now());
    }
  } finally { SearchFeedbackEvent.updateMany = update; }
});

test('late ingestion with a pre-preview receivedAt never joins the approved purge membership', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation();
  assert.equal((await send(kp, batch(new Date(), { events: [event('vote', new Date())] }))).status, 200);
  const write = SearchFeedbackEvent.bulkWrite, ready = deferred(), release = deferred();
  let pause = true;
  SearchFeedbackEvent.bulkWrite = async function(...args) {
    if (pause) { pause = false; ready.resolve(); await release.promise; }
    return write.apply(this, args);
  };
  const late = send(kp, batch(new Date(), { events: [event('vote', new Date())] }));
  try {
    await ready.promise;
    const preview = await previewPurge({ type: 'vote' });
    assert.equal(preview.count, 1);
    release.resolve();
    assert.equal((await late).status, 200);
    assert.deepEqual(await purgeEvents({ type: 'vote' }, { ...preview, confirmCount: 1 }), { ok: true, deleted: 1 });
    assert.equal(await SearchFeedbackEvent.countDocuments({ ...committedEvents(), type: 'vote' }), 1);
  } finally { release.resolve(); await late; SearchFeedbackEvent.bulkWrite = write; }
});

test('independent recovery helpers cannot resurrect a purged batch when an older writer resumes', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), keyId = computeKeyId(kp.publicRaw), body = batch(new Date());
  const update = SearchFeedbackKey.updateOne;
  SearchFeedbackKey.updateOne = function(filter, ...args) {
    if (filter['pendingIngest.phase'] === 'writing') throw new Error('leave a recoverable receipt');
    return update.call(this, filter, ...args);
  };
  assert.equal((await send(kp, body)).status, 500);
  SearchFeedbackKey.updateOne = update;
  const pending = (await keyFor(kp)).pendingIngest;
  const write = SearchFeedbackEvent.bulkWrite, ready = deferred(), release = deferred();
  let pause = true;
  SearchFeedbackEvent.bulkWrite = async function(...args) {
    if (pause) { pause = false; ready.resolve(); await release.promise; }
    return write.apply(this, args);
  };
  const stale = completePendingIngest(keyId, pending);
  try {
    await ready.promise;
    assert.equal(await completePendingIngest(keyId, pending), 5);
    const preview = await previewPurge({});
    assert.deepEqual(await purgeEvents({}, { ...preview, confirmCount: 5 }), { ok: true, deleted: 5 });
    release.resolve();
    await stale;
    assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 0);
    assert.equal(await SearchFeedbackEvent.countDocuments(), 5, 'only bounded tombstone identities remain');
    assert.equal((await keyFor(kp)).eventCount, 5);
    assert.equal((await keyFor(kp)).batchCount, 1);
    assert.equal((await send(kp, body)).body.accepted, 0);
  } finally { release.resolve(); await stale; SearchFeedbackEvent.bulkWrite = write; }
});

test('concurrent signed batches and exact retries preserve counts and do not accumulate receipts', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation();
  const bodies = Array.from({ length: 24 }, () => batch(new Date()));
  const result = await Promise.all(bodies.flatMap((body) => [send(kp, body), send(kp, body)]));
  assert.ok(result.every((response) => response.status === 200));
  assert.equal(result.reduce((sum, response) => sum + response.body.accepted, 0), 120);
  const key = await keyFor(kp);
  assert.equal(key.eventCount, 120);
  assert.equal(key.batchCount, 24);
  assert.equal(key.pendingIngest, undefined);
  assert.equal(await SearchFeedbackEvent.countDocuments(), 120);
  assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 120);
});

test('overlapping purges never exceed either approved set and cannot erase later incoming events', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation();
  await send(kp, batch(new Date()));
  const [a, b] = await Promise.all([previewPurge({}), previewPurge({})]);
  assert.equal(a.count, 5); assert.equal(b.count, 5);
  await send(kp, batch(new Date()));
  const result = await Promise.all([purgeEvents({}, { ...a, confirmCount: 5 }), purgeEvents({}, { ...b, confirmCount: 5 })]);
  assert.ok(result.every((r) => r.ok && r.deleted <= 5));
  assert.equal(result.reduce((sum, r) => sum + r.deleted, 0), 5);
  assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 5);
  assert.equal((await keyFor(kp)).eventCount, 10);
});

test('preview identity, expiry, changed filters, and a reused token fail before any erasure', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(); await send(kp, batch(new Date()));
  const preview = await previewPurge({ type: 'vote' });
  assert.equal((await purgeEvents({ type: 'open' }, { ...preview, confirmCount: 1 })).ok, false);
  assert.equal((await purgeEvents({ type: 'vote' }, { ...preview, previewId: 'unknown', confirmCount: 1 })).ok, false);
  assert.equal((await purgeEvents({ type: 'vote' }, { ...preview, confirmCount: 2 })).ok, false);
  await SearchFeedbackPurgeSnapshot.updateOne({ previewId: preview.previewId }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await purgeEvents({ type: 'vote' }, { ...preview, confirmCount: 1 })).ok, false);
  assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 5);
  const fresh = await previewPurge({ type: 'vote' });
  assert.deepEqual(await purgeEvents({ type: 'vote' }, { ...fresh, confirmCount: 1 }), { ok: true, deleted: 1 });
  assert.equal((await purgeEvents({ type: 'vote' }, { ...fresh, confirmCount: 1 })).ok, false);
});

test('active preview storage has a fixed capacity and an expired slot can be reused', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const previews = [];
  for (let i = 0; i < MAX_PURGE_PREVIEWS; i += 1) previews.push(await previewPurge({}));
  await assert.rejects(previewPurge({}), { code: 'PURGE_PREVIEWS_BUSY' });
  assert.equal(await SearchFeedbackPurgeSnapshot.countDocuments(), MAX_PURGE_PREVIEWS);
  const replacement = await previewPurge({}, { replacePreviewId: previews[0].previewId });
  assert.notEqual(replacement.previewId, previews[0].previewId);
  assert.equal(await SearchFeedbackPurgeSnapshot.countDocuments(), MAX_PURGE_PREVIEWS);
  assert.equal((await purgeEvents({}, { ...previews[0], confirmCount: 0 })).ok, false);
  await SearchFeedbackPurgeSnapshot.updateOne({ previewId: replacement.previewId }, { $set: { expiresAt: new Date(0) } });
  await previewPurge({});
  assert.equal(await SearchFeedbackPurgeSnapshot.countDocuments(), MAX_PURGE_PREVIEWS);
});

test('orphan cleanup is bounded and preserves live pending receipts and erased-data tombstones', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), keyId = computeKeyId(kp.publicRaw), now = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const valid = validateEventsBatch(batch(now)); assert.equal(valid.ok, true);
  const update = SearchFeedbackKey.updateOne;
  SearchFeedbackKey.updateOne = function(filter, ...args) {
    if (filter['pendingIngest.phase'] === 'writing') throw new Error('leave a live pending receipt');
    return update.call(this, filter, ...args);
  };
  try { await assert.rejects(ingestEvents(keyId, valid.value, { now })); }
  finally { SearchFeedbackKey.updateOne = update; }
  const live = await SearchFeedbackEvent.findOne({ ingestCommitted: false }).lean();
  delete live._id;
  await SearchFeedbackEvent.collection.insertMany([0, 1, 2].map((n) => ({ ...live, eventId: `orphan_event_${n}`, ingestToken: `orphan_token_${n}` })));
  await cleanupStagedOrphans({ limit: 500 });
  assert.equal(await SearchFeedbackEvent.countDocuments({ ingestCommitted: false }), 5);
  await completePendingIngest(keyId, (await keyFor(kp)).pendingIngest);
  const preview = await previewPurge({});
  await purgeEvents({}, { ...preview, confirmCount: 5 });
  await cleanupStagedOrphans();
  assert.equal(await SearchFeedbackEvent.countDocuments({ purgedUntil: { $exists: true } }), 5);
  const indexes = await SearchFeedbackEvent.collection.listIndexes().toArray();
  assert.ok(indexes.some((index) => index.key.purgedUntil === 1 && index.expireAfterSeconds === 0));
});

test('paged orphan cleanup reaches entries behind a full page of live staged receipts using the ordered index', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const now = new Date(Date.now() - 2 * 60 * 60 * 1000);
  for (let key = 0; key < 5; key += 1) {
    const kp = await installation(), keyId = computeKeyId(kp.publicRaw), token = `live-${key}`;
    await SearchFeedbackKey.updateOne({ keyId }, { $set: { pendingIngest: { token, phase: 'writing' } } });
    await SearchFeedbackEvent.collection.insertMany(Array.from({ length: 100 }, (_, n) => ({
      eventId: `staged-${key}-${n}`, keyId, ingestToken: token, ingestCommitted: false, receivedAt: now,
    })));
  }
  await SearchFeedbackEvent.collection.insertMany(Array.from({ length: 10 }, (_, n) => ({
    eventId: `orphan-${n}`, keyId: 'missing', ingestToken: 'orphan', ingestCommitted: false,
    receivedAt: new Date(now.getTime() + 1000),
  })));
  const after = await cleanupStagedOrphans();
  assert.ok(after);
  assert.equal(await SearchFeedbackEvent.countDocuments({ ingestToken: 'orphan' }), 10);
  assert.equal(await cleanupStagedOrphans({ after }), null);
  assert.equal(await SearchFeedbackEvent.countDocuments({ ingestToken: 'orphan' }), 0);
  assert.equal(await SearchFeedbackEvent.countDocuments(), 500);
  const plan = await SearchFeedbackEvent.find({ ingestCommitted: false, receivedAt: { $lte: now } })
    .sort({ receivedAt: 1, _id: 1 }).hint({ ingestCommitted: 1, receivedAt: 1, _id: 1 }).limit(500).explain('executionStats');
  assert.ok(stages(plan.queryPlanner.winningPlan).includes('IXSCAN'));
  assert.ok(!stages(plan.queryPlanner.winningPlan).includes('SORT'));
  assert.ok(plan.executionStats.totalDocsExamined <= 500);
});

const stages = (value) => value && typeof value === 'object'
  ? [value.stage, ...Object.values(value).flatMap(stages)].filter(Boolean) : [];

test('large real-Mongo export uses ordered indexes without external sorting and snapshots only bounded ID chunks', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = await installation(), other = await installation(), now = new Date();
  const full = resultFull({ passageText: 'א'.repeat(20000) });
  const normalized = validateEventsBatch(batch(now, { events: [event('open', now, { result: full }), event('vote', now, { result: full })] }));
  assert.equal(normalized.ok, true);
  const n = 7000;
  for (let start = 0; start < n; start += 500) {
    await SearchFeedbackEvent.collection.insertMany(Array.from({ length: Math.min(500, n - start) }, (_, offset) => {
      const index = start + offset, value = normalized.value.events[index % 2];
      return {
        eventId: `large_event_${String(index).padStart(10, '0')}`, keyId: computeKeyId((index % 3 ? kp : other).publicRaw),
        batchId: normalized.value.batchId, type: value.type, searchSessionId: value.searchSessionId,
        msSinceSearch: value.msSinceSearch, clientTime: value.clientTime, sentAt: normalized.value.sentAt,
        receivedAt: new Date(now.getTime() - (index % 10)), payload: value.payload,
        context: { ...normalized.value.context, engine: { ...normalized.value.context.engine,
          modelFamilyId: index % 4 < 2 ? 'family-a' : 'family-b', modelQuantization: index % 2 ? 'int8' : null,
        } },
        ...(index % 2 ? { ingestCommitted: true } : {}),
      };
    }));
  }
  await mongoose.connection.db.admin().command({ setParameter: 1, allowDiskUseByDefault: false });
  try {
    const plans = [];
    const filters = [{}, { type: 'vote' }, { keyId: computeKeyId(kp.publicRaw) },
      { 'context.engine.modelFamilyId': 'family-a' },
      { 'context.engine.modelFamilyId': 'family-a', 'context.engine.modelQuantization': null },
      { 'context.engine.modelQuantization': 'int8' }];
    for (const filter of filters) {
      const cursor = await orderedEvents(filter, { selection: '-_id -__v' });
      try {
        const explain = await cursor.query.clone().explain('executionStats');
        const plan = stages(explain.queryPlanner.winningPlan);
        assert.ok(plan.includes('IXSCAN'), JSON.stringify(explain.queryPlanner.winningPlan));
        assert.ok(!plan.includes('SORT'), JSON.stringify(explain.queryPlanner.winningPlan));
        plans.push({ filter, plan, returned: explain.executionStats.nReturned });
      } finally { await cursor.close(); }
    }
    const reader = (await exportEventsStream({ filter: {}, includeBlocked: true })).getReader();
    const rssBefore = process.memoryUsage().rss, started = performance.now();
    let rows = 0, bytes = 0, peakRss = rssBefore, previousDate = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      const row = JSON.parse(new TextDecoder().decode(value));
      assert.equal(row.payload.result.passageText.length, 20000);
      assert.ok(row.receivedAt >= previousDate); previousDate = row.receivedAt;
      assert.equal('ingestCommitted' in row, false);
      rows += 1; peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
    assert.equal(rows, n);
    const preview = await previewPurge({});
    assert.equal(preview.count, n);
    const chunks = await SearchFeedbackPurgeChunk.find({ previewId: preview.previewId }).lean();
    assert.equal(chunks.length, Math.ceil(n / PURGE_CHUNK_SIZE));
    assert.ok(chunks.every((chunk) => chunk.eventIds.length <= PURGE_CHUNK_SIZE && !chunk.payload && !chunk.context));
    assert.deepEqual(await purgeEvents({}, { ...preview, confirmCount: n }), { ok: true, deleted: n });
    assert.equal((await getStats({ fresh: true })).totalEvents, 0);
    console.log('feedback export load', JSON.stringify({ rows, bytes, ms: performance.now() - started, rssBefore, peakRss, plans }));
  } finally { await mongoose.connection.db.admin().command({ setParameter: 1, allowDiskUseByDefault: true }); }
});
