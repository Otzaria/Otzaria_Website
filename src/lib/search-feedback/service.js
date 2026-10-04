/**
 * שכבת הנתונים של משוב החיפוש: רישום מפתחות, קליטת אירועים, סטטיסטיקה, ייצוא לאימון וניקוי.
 */
import SearchFeedbackKey from '../../models/SearchFeedbackKey.js';
import SearchFeedbackEvent from '../../models/SearchFeedbackEvent.js';
import { KEY_ID_RE, computeKeyId } from './crypto.js';
import { EVENT_TYPES } from './validation.js';
import { committedEvents, ingestWithReceipt, maintainStagedEvents } from './ingestion.js';
import { orderedEvents } from './event-query.js';
import { createPurgeSnapshot, deletePurgeSnapshot } from './purge-snapshot.js';

/**
 * רישום אידמפוטנטי. מפתח חסום נשאר חסום גם ברישום חוזר.
 * @param {{publicKey:Buffer, app:string, appVersion:string, platform:string}} reg
 * @returns {Promise<{keyId:string, status:'active'|'blocked'}>}
 */
export async function registerKey(reg, { now = new Date() } = {}) {
  await SearchFeedbackKey.init();
  const keyId = computeKeyId(reg.publicKey);
  const doc = await SearchFeedbackKey.findOneAndUpdate(
    { keyId },
    {
      $setOnInsert: {
        publicKey: reg.publicKey.toString('base64'),
        app: reg.app,
        platform: reg.platform,
        appVersionFirst: reg.appVersion,
        status: 'active',
        firstSeenAt: now,
        eventCount: 0,
        batchCount: 0,
      },
      $set: { appVersionLast: reg.appVersion, lastSeenAt: now },
    },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  return { keyId, status: doc.status };
}

/** @returns {Promise<{keyId:string, publicKey:Buffer, status:string}|null>} */
export async function findKey(keyId) {
  await SearchFeedbackKey.init();
  const doc = await SearchFeedbackKey.findOne({ keyId }).select('keyId publicKey status').lean();
  if (!doc) return null;
  return { keyId: doc.keyId, publicKey: Buffer.from(doc.publicKey, 'base64'), status: doc.status };
}

/**
 * eventId כפול (גם בתוך אותה מנה) נספר כ-duplicate ואינו נכתב שוב. אירועים שנדחו בוולידציה
 * כבר אינם ב-batch.events ורק נספרים בתגובה.
 * @returns {Promise<{accepted:number, duplicates:number, rejected:number, rejectedSamples:object[]}>}
 */
export async function ingestEvents(keyId, batch, { now = new Date() } = {}) {
  const accepted = await ingestWithReceipt(keyId, batch, now);
  return {
    accepted,
    duplicates: batch.events.length - accepted,
    rejected: batch.rejected ?? 0,
    rejectedSamples: batch.rejectedSamples ?? [],
  };
}

/** @returns {Promise<object|null>} המפתח המעודכן, או null אם אינו קיים */
export async function setKeyStatus(keyId, status) {
  const key = await SearchFeedbackKey.findOneAndUpdate({ keyId }, { $set: { status } }, { returnDocument: 'after' })
    .select('-_id keyId status')
    .lean();
  invalidateStatsCache();
  return key;
}

// ---------------------------------------------------------------- stats

// משותף לכל ה-bundles בתהליך: ראוט החסימה/הניקוי צריך לפסול את המטמון של ראוט הסטטיסטיקה.
const STATS_CACHE_KEY = Symbol.for('otzaria.searchFeedback.statsCache');
const statsCache = (globalThis[STATS_CACHE_KEY] ??= { value: null, at: 0 });
export const STATS_CACHE_MS = 60 * 1000;

export function invalidateStatsCache() {
  statsCache.value = null;
  statsCache.at = 0;
}

const groupCount = (field, extra = []) => [
  ...extra,
  { $group: { _id: field, count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
];
const toRows = (rows, key) => rows.map((r) => ({ [key]: r._id ?? null, count: r.count }));

/**
 * צבירות על כל האוסף — שמורות במטמון קצר כדי שכל טעינת דף לא תסרוק מחדש.
 * @param {{days?:number, now?:Date, fresh?:boolean}} opts
 */
export async function getStats({ days = 30, now = new Date(), fresh = false } = {}) {
  if (!fresh && statsCache.value && now.getTime() - statsCache.at < STATS_CACHE_MS) {
    return { ...statsCache.value, cachedAt: new Date(statsCache.at) };
  }
  await maintainStagedEvents();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const readable = { $match: committedEvents() };
  const [totalEvents, byType, byDay, byModel, byAppVersion, keyStatus, topKeys] = await Promise.all([
    Promise.all([SearchFeedbackEvent.estimatedDocumentCount(), SearchFeedbackEvent.countDocuments({ ingestCommitted: false })])
      .then(([total, staged]) => Math.max(0, total - staged)),
    SearchFeedbackEvent.aggregate(groupCount('$type', [readable])),
    SearchFeedbackEvent.aggregate([
      { $match: { ...committedEvents(), receivedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    SearchFeedbackEvent.aggregate(groupCount({ modelFamilyId: '$context.engine.modelFamilyId', modelQuantization: '$context.engine.modelQuantization' }, [readable])),
    SearchFeedbackEvent.aggregate([...groupCount('$context.appVersion', [readable]), { $limit: 30 }]),
    SearchFeedbackKey.aggregate(groupCount('$status')),
    SearchFeedbackKey.find({})
      .sort({ eventCount: -1 })
      .limit(20)
      .select('-_id keyId app platform appVersionLast status eventCount batchCount firstSeenAt lastSeenAt')
      .lean(),
  ]);
  const keys = { total: 0, active: 0, blocked: 0 };
  for (const r of keyStatus) {
    keys[r._id] = r.count;
    keys.total += r.count;
  }
  const value = {
    totalEvents,
    keys,
    byType: toRows(byType, 'type'),
    byDay: toRows(byDay, 'day'),
    byModel: byModel.map((r) => ({
      modelFamilyId: r._id?.modelFamilyId ?? null,
      modelQuantization: r._id?.modelQuantization ?? null,
      count: r.count,
    })),
    byAppVersion: toRows(byAppVersion, 'appVersion'),
    topKeys,
  };
  statsCache.value = value;
  statsCache.at = now.getTime();
  return { ...value, cachedAt: now };
}

// ------------------------------------------------------- filters (export/purge)

const MAX_FILTER_STRING = 300;
const isSet = (v) => v !== undefined && v !== null && v !== '';
const filterString = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_FILTER_STRING;

/**
 * פילטר משותף לייצוא ולניקוי. from/to חלים על receivedAt (זמן הקליטה בשרת).
 * modelQuantization: null = רק אירועים בלי קוונטיזציה; השמטה = כל הקוונטיזציות.
 * @param {{from?:string, to?:string, type?:string, modelFamilyId?:string, modelQuantization?:string|null, keyId?:string}} input
 * @returns {{ok:true, filter:object} | {ok:false, field:string}}
 */
export function buildEventFilter(input) {
  const filter = {};
  const range = {};
  for (const [param, op] of [['from', '$gte'], ['to', '$lt']]) {
    const v = input[param];
    if (!isSet(v)) continue;
    const ms = typeof v === 'string' ? Date.parse(v) : Number.NaN;
    if (Number.isNaN(ms)) return { ok: false, field: param };
    range[op] = new Date(ms);
  }
  if (Object.keys(range).length) filter.receivedAt = range;
  if (isSet(input.type)) {
    if (!EVENT_TYPES.includes(input.type)) return { ok: false, field: 'type' };
    filter.type = input.type;
  }
  if (isSet(input.modelFamilyId)) {
    if (!filterString(input.modelFamilyId)) return { ok: false, field: 'modelFamilyId' };
    filter['context.engine.modelFamilyId'] = input.modelFamilyId;
  }
  if (input.modelQuantization === null) {
    filter['context.engine.modelQuantization'] = null;
  } else if (isSet(input.modelQuantization)) {
    if (!filterString(input.modelQuantization)) return { ok: false, field: 'modelQuantization' };
    filter['context.engine.modelQuantization'] = input.modelQuantization;
  }
  if (isSet(input.keyId)) {
    if (typeof input.keyId !== 'string' || !KEY_ID_RE.test(input.keyId)) return { ok: false, field: 'keyId' };
    filter.keyId = input.keyId;
  }
  return { ok: true, filter };
}

/**
 * פילטר הייצוא מפרמטרי ה-URL. noQuantization=1 = רק אירועים שאין להם קוונטיזציה.
 * @param {URLSearchParams} sp
 * @returns {{ok:true, filter:object, includeBlocked:boolean} | {ok:false, field:string}}
 */
export function buildExportFilter(sp) {
  const get = (k) => sp.get(k) ?? undefined;
  const parsed = buildEventFilter({
    from: get('from'),
    to: get('to'),
    type: get('type'),
    modelFamilyId: get('modelFamilyId'),
    modelQuantization: sp.get('noQuantization') === '1' ? null : get('modelQuantization'),
    keyId: get('keyId'),
  });
  if (!parsed.ok) return parsed;
  return { ...parsed, includeBlocked: sp.get('includeBlocked') === '1' };
}

/** NDJSON בזרימה: שורה לכל אירוע, ממוין לפי receivedAt. אירועי מפתחות חסומים מושמטים כברירת מחדל. */
export async function exportEventsStream({ filter, includeBlocked }) {
  const query = { ...filter };
  if (!includeBlocked) {
    const blocked = await SearchFeedbackKey.distinct('keyId', { status: 'blocked' });
    if (blocked.length) query.keyId = filter.keyId ? { $eq: filter.keyId, $nin: blocked } : { $nin: blocked };
  }
  const cursor = await orderedEvents(query, { selection: '-_id -__v -ingestToken -ingestCommitted -purgedUntil' });
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const doc = await cursor.next();
        if (!doc) {
          await cursor.close();
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(doc)}\n`));
      } catch (error) {
        await cursor.close().catch(() => {});
        controller.error(error);
      }
    },
    async cancel() {
      await cursor.close();
    },
  });
}

// ---------------------------------------------------------------- purge

/**
 * פילטר הניקוי מגוף הבקשה. חובה לפחות מסנן אחד, או all:true מפורש (ובלי מסננים) — גוף ריק לא מוחק הכל.
 * @returns {{ok:true, filter:object} | {ok:false, field:string}}
 */
export function buildPurgeFilter(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  if (body.all !== undefined && typeof body.all !== 'boolean') return { ok: false, field: 'all' };
  const parsed = buildEventFilter(body);
  if (!parsed.ok) return parsed;
  const hasFilters = Object.keys(parsed.filter).length > 0;
  if (body.all === true && hasFilters) return { ok: false, field: 'all' };
  if (!hasFilters && body.all !== true) return { ok: false, field: 'filter' };
  return parsed;
}

/** תצוגה מקדימה: שמירת המזהים המדויקים של הקבוצה המאושרת, בצברים זמניים מוגבלים. */
export async function previewPurge(filter, { now = new Date(), replacePreviewId } = {}) {
  return createPurgeSnapshot(filter, now, replacePreviewId);
}

/**
 * מחיקה בפועל. האישור שייך לקבוצת המזהים השמורה; קליטה מקבילה אינה יכולה להרחיב אותה.
 * אירועים שנמחקו בינתיים בידי מנהל אחר מדולגים.
 * מוני eventCount של המפתחות אינם יורדים — הם סופרים מה שנקלט, לא מה שנשמר.
 */
export async function purgeEvents(filter, approval) {
  const result = await deletePurgeSnapshot(filter, approval);
  if (!result.ok) return result;
  invalidateStatsCache();
  return result;
}
