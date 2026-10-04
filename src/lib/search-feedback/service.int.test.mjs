/**
 * בדיקות אינטגרציה של משוב החיפוש מול MongoDB אמיתי (בזיכרון). הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import SearchFeedbackKey from '../../models/SearchFeedbackKey.js';
import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';
import { handleRegisterPost, handleEventsPost } from './handler.js';
import {
  getStats, exportEventsStream, buildExportFilter, setKeyStatus, invalidateStatsCache, buildPurgeFilter, previewPurge, purgeEvents,
} from './service.js';
import { getSearchFeedbackConfig } from './config.js';
import { checkRateLimit } from '../rate-limit.js';
import { MAX_EVENTS_BODY_BYTES } from './validation.js';
import { committedEvents } from './ingestion.js';
import { startMongo } from '../corrections/testing/mongo.js';
import { RFC_SEED_HEX, keyPairFromSeed, randomKeyPair, batch, event, registerBody } from './testing/fixtures.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });
beforeEach(async () => {
  invalidateStatsCache();
  if (!db.skip) await db.reset();
});

const RFC_KEY_ID = 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';
const enabled = getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: '1' });
const baseDeps = { config: enabled, connectDB: async () => {}, rateLimit: () => true, getIp: () => '203.0.113.7' };

/**
 * @param {Function} handler
 * @param {object|string} body אובייקט (מוצפן ל-JSON) או מחרוזת גולמית
 * @param {{kp?:object, signWith?:object, keyId?:string|null, sig?:string, mutate?:(b:Buffer)=>Buffer, deps?:object}} opts
 */
async function post(handler, body, { kp, signWith, keyId, sig, mutate, deps = {} } = {}) {
  let bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  const headers = { 'content-type': 'application/json; charset=utf-8', 'user-agent': 'otzaria-search-feedback/1.2.3' };
  const signer = signWith || kp;
  if (sig !== undefined) headers['x-otzaria-signature'] = sig;
  else if (signer) headers['x-otzaria-signature'] = signer.sign(bytes);
  if (keyId !== null && (keyId || kp)) headers['x-otzaria-key-id'] = keyId || keyIdOf(kp);
  if (mutate) bytes = mutate(bytes);
  const req = new Request('http://localhost/api/search-feedback/x', { method: 'POST', headers, body: bytes });
  const res = await handler(req, { ...baseDeps, ...deps });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const keyIdOf = (kp) => crypto.createHash('sha256').update(kp.publicRaw).digest('base64url');
const register = (kp, over = {}, opts = {}) => post(handleRegisterPost, registerBody(kp, new Date(), over), { kp, keyId: null, ...opts });
const sendEvents = (kp, body = batch(new Date()), opts = {}) => post(handleEventsPost, body, { kp, ...opts });

test('register: מפתח ה-RFC נרשם עם keyId מחושב בשרת; רישום חוזר אידמפוטנטי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = keyPairFromSeed(Buffer.from(RFC_SEED_HEX, 'hex'));
  const first = await register(kp);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { keyId: RFC_KEY_ID, status: 'active' });
  assert.equal(first.headers.get('cache-control'), 'no-store');

  const again = await register(kp, { appVersion: '1.3.0' });
  assert.deepEqual(again.body, { keyId: RFC_KEY_ID, status: 'active' });

  const docs = await SearchFeedbackKey.find({}).lean();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].publicKey, kp.publicB64);
  assert.equal(docs[0].appVersionFirst, '1.2.3+456');
  assert.equal(docs[0].appVersionLast, '1.3.0');
  assert.equal(docs[0].platform, 'windows');
  // אין שום שדה IP במסמך
  assert.equal(JSON.stringify(docs[0]).includes('203.0.113.7'), false);
});

test('golden: גופים שהלקוח האמיתי (Dart) בנה וחתם — escape של \\uXXXX ושדות באורך הקיצוץ של הלקוח', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const golden = JSON.parse(readFileSync(new URL('./testing/client-golden.json', import.meta.url), 'utf8'));
  const deps = { ...baseDeps, now: () => new Date(golden.now) };
  const send = (handler, c, headers = {}) => handler(new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-otzaria-signature': c.signature, ...headers },
    body: Buffer.from(c.body, 'utf8'),
  }), deps).then(async (res) => [res.status, await res.json()]);

  assert.match(golden.events.body, /^[\x20-\x7e]+$/);
  assert.deepEqual(await send(handleRegisterPost, golden.register), [200, { keyId: RFC_KEY_ID, status: 'active' }]);
  assert.equal(golden.keyId, RFC_KEY_ID);
  assert.deepEqual(
    await send(handleEventsPost, golden.events, { 'x-otzaria-key-id': golden.keyId }),
    [200, { accepted: 2, duplicates: 0, rejected: 0, rejectedSamples: [] }],
  );
  const search = await SearchFeedbackEvent.findOne({ type: 'search' }).lean();
  assert.equal(search.payload.query, 'שבת שלום');
  assert.equal(search.context.appVersion.length, 64);
});

test('register: חתימה חסרה/של מפתח אחר → bad_signature; גוף פגום → invalid_json/invalid_payload', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  assert.deepEqual((await register(kp, {}, { sig: '' })).body, { error: 'bad_signature' });
  assert.equal((await register(kp, {}, { signWith: randomKeyPair() })).status, 401);
  const garbage = await post(handleRegisterPost, '{not json', { kp, keyId: null });
  assert.deepEqual([garbage.status, garbage.body], [400, { error: 'invalid_json' }]);
  const bad = await register(kp, { platform: 'beos' });
  assert.deepEqual([bad.status, bad.body], [422, { error: 'invalid_payload', field: 'platform' }]);
  const noKey = await post(handleRegisterPost, { schema: 1 }, { kp, keyId: null });
  assert.deepEqual(noKey.body, { error: 'invalid_payload', field: 'publicKey' });
  assert.equal(await SearchFeedbackKey.countDocuments(), 0);
});

test('events: קליטה, כפילויות בין מנות ובתוך מנה, מונים ותוכן שמור', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  const body = batch(new Date());
  const res = await sendEvents(kp, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { accepted: 5, duplicates: 0, rejected: 0, rejectedSamples: [] });

  const replay = await sendEvents(kp, { ...body, batchId: 'batch_retry_0001' });
  assert.deepEqual(replay.body, { accepted: 0, duplicates: 5, rejected: 0, rejectedSamples: [] });

  const dupEvent = event('dwell', new Date());
  const inBatch = await sendEvents(kp, batch(new Date(), { events: [dupEvent, dupEvent, event('vote', new Date())] }));
  assert.deepEqual(inBatch.body, { accepted: 2, duplicates: 1, rejected: 0, rejectedSamples: [] });

  assert.equal(await SearchFeedbackEvent.countDocuments(), 7);
  const key = await SearchFeedbackKey.findOne({ keyId: keyIdOf(kp) }).lean();
  assert.equal(key.eventCount, 7);
  // מנה של כפילויות בלבד (שליחה חוזרת) אינה נספרת כמנה
  assert.equal(key.batchCount, 2);

  const search = await SearchFeedbackEvent.findOne({ eventId: body.events[0].eventId }).lean();
  assert.equal(search.keyId, keyIdOf(kp));
  assert.equal(search.type, 'search');
  assert.equal(search.batchId, body.batchId);
  assert.equal(search.context.engine.modelFamilyId, body.context.engine.modelFamilyId);
  assert.equal(search.payload.query, 'יתגבר כארי');
  assert.deepEqual(search.payload.params.ranking.alphaByQueryType, { short: 0.3, long: 0.7 });
  assert.equal(search.clientTime.toISOString(), body.events[0].clientTime);
  assert.ok(search.receivedAt instanceof Date);
  assert.equal(JSON.stringify(search).includes('203.0.113.7'), false);
});

test('events: unknown_key למפתח שלא נרשם או בלי כותרת; bad_signature לגוף ששונה או לחתימה זרה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const stranger = randomKeyPair();
  assert.deepEqual((await sendEvents(stranger)).body, { error: 'unknown_key' });

  const kp = randomKeyPair();
  await register(kp);
  const noHeader = await sendEvents(kp, batch(new Date()), { keyId: null });
  assert.deepEqual([noHeader.status, noHeader.body], [401, { error: 'unknown_key' }]);
  assert.deepEqual((await sendEvents(kp, batch(new Date()), { keyId: 'not-a-key' })).body, { error: 'unknown_key' });

  const tampered = await sendEvents(kp, batch(new Date()), {
    mutate: (b) => Buffer.from(b.toString('utf8').replace('יתגבר כארי', 'יתגבר כנמר'), 'utf8'),
  });
  assert.deepEqual([tampered.status, tampered.body], [401, { error: 'bad_signature' }]);
  const foreign = await sendEvents(kp, batch(new Date()), { signWith: stranger });
  assert.deepEqual(foreign.body, { error: 'bad_signature' });
  const missing = await sendEvents(kp, batch(new Date()), { sig: '' });
  assert.deepEqual(missing.body, { error: 'bad_signature' });
  assert.equal(await SearchFeedbackEvent.countDocuments(), 0);
});

test('events: JSON פגום חתום → invalid_json; מעטפה שגויה → 422+field; גוף ענק → too_large', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  const garbage = await post(handleEventsPost, '{"schema":1,', { kp });
  assert.deepEqual([garbage.status, garbage.body], [400, { error: 'invalid_json' }]);

  const body = batch(new Date());
  body.context.platform = 'beos';
  const invalid = await sendEvents(kp, body);
  assert.deepEqual([invalid.status, invalid.body], [422, { error: 'invalid_payload', field: 'context.platform' }]);
  const tooMany = await sendEvents(kp, batch(new Date(), { events: Array.from({ length: 101 }, () => event('dwell', new Date())) }));
  assert.deepEqual([tooMany.status, tooMany.body], [422, { error: 'invalid_payload', field: 'events' }]);

  const huge = await post(handleEventsPost, 'x'.repeat(MAX_EVENTS_BODY_BYTES + 1), { kp });
  assert.deepEqual([huge.status, huge.body], [413, { error: 'too_large' }]);
  assert.equal(await SearchFeedbackEvent.countDocuments(), 0);
});

test('מפתח חסום: events ו-register מחזירים key_blocked; שחרור מחזיר לפעולה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  assert.deepEqual(await setKeyStatus(keyIdOf(kp), 'blocked'), { keyId: keyIdOf(kp), status: 'blocked' });

  const blocked = await sendEvents(kp);
  assert.deepEqual([blocked.status, blocked.body], [403, { error: 'key_blocked' }]);
  const reReg = await register(kp);
  assert.deepEqual([reReg.status, reReg.body], [403, { error: 'key_blocked' }]);
  // חתימה פגומה על מפתח חסום עדיין bad_signature — לא חושפים מצב בלי הוכחת בעלות
  assert.deepEqual((await sendEvents(kp, batch(new Date()), { signWith: randomKeyPair() })).body, { error: 'bad_signature' });

  await setKeyStatus(keyIdOf(kp), 'active');
  assert.equal((await sendEvents(kp)).status, 200);
  assert.equal(await setKeyStatus('A'.repeat(43), 'blocked'), null);
});

test('rate limit: register לפי IP, events לפי IP ולפי keyId, עם Retry-After', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const ip = `198.51.100.${crypto.randomInt(1, 250)}-${Date.now()}`;
  const deps = {
    rateLimit: (bucket, id, tokens) => checkRateLimit(id, `search-feedback-${bucket}`, tokens, 'hour'),
    getIp: () => ip,
    config: { ...enabled, limits: { registerPerIpPerHour: 2, eventsPerIpPerHour: 3, eventsPerKeyPerHour: 2 } },
  };
  const a = randomKeyPair();
  const b = randomKeyPair();
  assert.equal((await register(a, {}, { deps })).status, 200);
  assert.equal((await register(b, {}, { deps })).status, 200);
  const limited = await register(randomKeyPair(), {}, { deps });
  assert.deepEqual([limited.status, limited.body], [429, { error: 'rate_limited' }]);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);

  assert.equal((await sendEvents(a, batch(new Date()), { deps })).status, 200);
  assert.equal((await sendEvents(a, batch(new Date()), { deps })).status, 200);
  const perKey = await sendEvents(a, batch(new Date()), { deps });
  assert.deepEqual([perKey.status, perKey.body], [429, { error: 'rate_limited' }]);
  // מפתח אחר אינו חסום לפי keyId, אבל מכסת ה-IP (3, כולל הבקשה שנחסמה) כבר מוצתה
  const otherKey = await sendEvents(b, batch(new Date()), { deps });
  assert.deepEqual([otherKey.status, otherKey.body], [429, { error: 'rate_limited' }]);
});

test('rate limit לפי keyId נספר רק אחרי אימות חתימה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  const seen = [];
  const deps = { rateLimit: (bucket) => { seen.push(bucket); return true; } };
  await sendEvents(kp, batch(new Date()), { deps, signWith: randomKeyPair() });
  assert.deepEqual(seen, ['events-ip']);
  await sendEvents(kp, batch(new Date()), { deps });
  assert.deepEqual(seen, ['events-ip', 'events-ip', 'events-key']);
});

test('מתג כיבוי: 503 disabled לשני הנתיבים, בלי כתיבה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  const deps = { config: getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: '0' }) };
  const reg = await register(kp, {}, { deps });
  assert.deepEqual([reg.status, reg.body], [503, { error: 'disabled' }]);
  assert.ok(Number(reg.headers.get('retry-after')) > 0);
  const ev = await sendEvents(kp, batch(new Date()), { deps });
  assert.deepEqual([ev.status, ev.body], [503, { error: 'disabled' }]);
  assert.equal(await SearchFeedbackKey.countDocuments(), 0);
});

async function readNdjson(stream) {
  const text = await new Response(stream).text();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('סטטיסטיקה וייצוא NDJSON: מסננים, והשמטת מפתחות חסומים', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = randomKeyPair();
  const b = randomKeyPair();
  await register(a);
  await register(b, { app: 'zayit' });
  await sendEvents(a);
  const fp32 = batch(new Date());
  fp32.context.engine.modelQuantization = 'fp32';
  await sendEvents(b, fp32);

  const stats = await getStats({ fresh: true });
  assert.equal(stats.totalEvents, 10);
  assert.deepEqual(stats.keys, { total: 2, active: 2, blocked: 0 });
  assert.deepEqual(stats.byType.map((r) => [r.type, r.count]).sort(), [['dwell', 2], ['open', 2], ['results_shown', 2], ['search', 2], ['vote', 2]]);
  assert.equal(stats.byDay.length, 1);
  assert.equal(stats.byDay[0].count, 10);
  assert.deepEqual(stats.byModel.map((r) => r.modelQuantization).sort(), ['fp32', 'int8']);
  assert.deepEqual(stats.byAppVersion, [{ appVersion: '1.2.3+456', count: 10 }]);
  assert.equal(stats.topKeys.length, 2);

  const all = await readNdjson(await exportEventsStream(buildExportFilter(new URLSearchParams(''))));
  assert.equal(all.length, 10);
  assert.equal('_id' in all[0], false);
  assert.ok(all[0].eventId && all[0].payload && all[0].context);

  const votesInt8 = await readNdjson(await exportEventsStream(buildExportFilter(new URLSearchParams('type=vote&modelQuantization=int8'))));
  assert.equal(votesInt8.length, 1);
  assert.equal(votesInt8[0].keyId, keyIdOf(a));

  const future = await readNdjson(await exportEventsStream(buildExportFilter(new URLSearchParams(`from=${new Date(Date.now() + 60000).toISOString()}`))));
  assert.equal(future.length, 0);

  await setKeyStatus(keyIdOf(b), 'blocked');
  const withoutBlocked = await readNdjson(await exportEventsStream(buildExportFilter(new URLSearchParams(''))));
  assert.equal(withoutBlocked.length, 5);
  const withBlocked = await readNdjson(await exportEventsStream(buildExportFilter(new URLSearchParams('includeBlocked=1'))));
  assert.equal(withBlocked.length, 10);
  assert.deepEqual((await getStats()).keys, { total: 2, active: 1, blocked: 1 });
});

test('תיקון B: אירוע שגוי או ישן מ-30 יום מדולג, שאר המנה נקלטת; הכל שגוי → 200 עם 0', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  const now = new Date();
  const body = batch(now);
  body.events[1].results[0].source = 'oracle';
  body.events[3].clientTime = new Date(now.getTime() - 31 * 24 * 3600 * 1000).toISOString();
  const res = await sendEvents(kp, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, {
    accepted: 3,
    duplicates: 0,
    rejected: 2,
    rejectedSamples: [
      { index: 1, field: 'events[1].results[0].source' },
      { index: 3, field: 'events[3].clientTime' },
    ],
  });
  assert.deepEqual((await SearchFeedbackEvent.find({}).lean()).map((e) => e.type).sort(), ['open', 'search', 'vote']);

  const allBad = batch(now, { events: Array.from({ length: 25 }, () => event('dwell', now, { endReason: 'bored' })) });
  const res2 = await sendEvents(kp, allBad);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.accepted, 0);
  assert.equal(res2.body.rejected, 25);
  assert.equal(res2.body.rejectedSamples.length, 20);
  const key = await SearchFeedbackKey.findOne({ keyId: keyIdOf(kp) }).lean();
  assert.equal(key.eventCount, 3);
  assert.equal(key.batchCount, 1);
});

test('סטטיסטיקה: מטמון קצר, fresh עוקף, חסימה פוסלת', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const kp = randomKeyPair();
  await register(kp);
  await sendEvents(kp);
  const first = await getStats();
  assert.equal(first.totalEvents, 5);
  await sendEvents(kp);
  const cached = await getStats();
  assert.equal(cached.totalEvents, 5);
  assert.equal(cached.cachedAt.getTime(), first.cachedAt.getTime());
  assert.equal((await getStats({ fresh: true })).totalEvents, 10);
  const later = await getStats({ now: new Date(Date.now() + 61 * 1000) });
  assert.equal(later.totalEvents, 10);
  await setKeyStatus(keyIdOf(kp), 'blocked');
  assert.deepEqual((await getStats()).keys, { total: 1, active: 0, blocked: 1 });
});

test('ניקוי: תצוגה מקדימה, אישור בספירה מדויקת, asOf מקבע את הקבוצה, all מפורש', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const a = randomKeyPair();
  const b = randomKeyPair();
  await register(a);
  await register(b);
  await sendEvents(a);
  const noQuant = batch(new Date());
  noQuant.context.engine.modelQuantization = null;
  await sendEvents(b, noQuant);

  // קוונטיזציה null = רק אירועים בלי קוונטיזציה, לא "כל הקוונטיזציות"
  const famNull = buildPurgeFilter({ modelFamilyId: noQuant.context.engine.modelFamilyId, modelQuantization: null });
  assert.equal((await previewPurge(famNull.filter)).count, 5);
  const famAny = buildPurgeFilter({ modelFamilyId: noQuant.context.engine.modelFamilyId });
  assert.equal((await previewPurge(famAny.filter)).count, 10);

  const votes = buildPurgeFilter({ type: 'vote' });
  const preview = await previewPurge(votes.filter);
  assert.equal(preview.count, 2);
  assert.deepEqual(await purgeEvents(votes.filter, { confirmCount: 3, asOf: preview.asOf }), { ok: false, count: 2 });
  assert.equal(await SearchFeedbackEvent.countDocuments(), 10);

  // אירוע שנקלט אחרי התצוגה המקדימה אינו נמחק ואינו משנה את הספירה
  await new Promise((r) => setTimeout(r, 5));
  await sendEvents(a, batch(new Date(), { events: [event('vote', new Date())] }));
  assert.deepEqual(await purgeEvents(votes.filter, { confirmCount: 2, asOf: preview.asOf }), { ok: true, deleted: 2 });
  assert.equal(await SearchFeedbackEvent.countDocuments({ type: 'vote' }), 1);

  const byKey = buildPurgeFilter({ keyId: keyIdOf(b) });
  const p2 = await previewPurge(byKey.filter);
  assert.equal(p2.count, 4);
  assert.deepEqual(await purgeEvents(byKey.filter, { confirmCount: 4, asOf: p2.asOf }), { ok: true, deleted: 4 });

  const all = buildPurgeFilter({ all: true });
  const p3 = await previewPurge(all.filter);
  assert.equal(p3.count, 5);
  assert.deepEqual(await purgeEvents(all.filter, { confirmCount: 5, asOf: p3.asOf }), { ok: true, deleted: 5 });
  assert.equal(await SearchFeedbackEvent.countDocuments(committedEvents()), 0);
  const erased = await SearchFeedbackEvent.find({}).lean();
  assert.ok(erased.every((event) => !event.payload && !event.context && !event.keyId && event.purgedUntil instanceof Date));
  // מוני המפתחות סופרים מה שנקלט ואינם יורדים בניקוי
  assert.equal((await SearchFeedbackKey.findOne({ keyId: keyIdOf(a) }).lean()).eventCount, 6);
});
