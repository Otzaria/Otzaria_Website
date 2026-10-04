/**
 * אימות ונרמול של חוזה משוב החיפוש (schema 1). שגיאה במעטפה → 422 invalid_payload עם שם השדה;
 * אירוע בודד שגוי מדולג. נשמרים רק שדות מוכרים; שדות לא מוכרים נזרקים בשקט.
 */
import { PUBLIC_KEY_BYTES, decodeStrictBase64 } from './crypto.js';

export const MAX_REGISTER_BODY_BYTES = 4 * 1024;
export const MAX_EVENTS_BODY_BYTES = 512 * 1024;
export const MAX_EVENTS_PER_BATCH = 100;
export const MAX_RESULTS_PER_PAGE = 100;
// תקרות האורך אינן נמוכות מאורכי הקיצוץ של הלקוח (SearchFeedbackLimits) — אחרת מנה שלמה נזרקת.

export const APPS = Object.freeze(['otzaria', 'zayit']);
export const PLATFORMS = Object.freeze(['windows', 'linux', 'macos', 'android', 'ios']);
export const EVENT_TYPES = Object.freeze(['search', 'results_shown', 'open', 'dwell', 'vote']);
const RETRIEVAL_MODES = ['hybrid', 'semanticOnly', 'lexicalOnly'];
const EXECUTED_MODES = ['disabled', ...RETRIEVAL_MODES];
const LEXICAL_MODES = ['exact', 'fuzzy'];
const GROUPINGS = ['sameSection', 'identicalText'];
const RESULT_SOURCES = ['lexical', 'semantic', 'both'];
const PASSAGE_SOURCES = ['line', 'snippet'];
const OPEN_VIA = ['click', 'preview', 'background', 'keyboard'];
const DWELL_END_REASONS = ['tab_closed', 'tab_switched', 'returned_to_results', 'app_exit', 'capped'];
const VOTES = ['like', 'dislike', 'cleared'];

export const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
export const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DWELL_MS = 30 * 60 * 1000;

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;
const RANKING_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_RANKING_KEYS = 40;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_UTC_FRACTION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/;

class Invalid extends Error {
  constructor(field) {
    super(field);
    this.field = field;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function object(v, field) {
  if (!isPlainObject(v)) throw new Invalid(field);
  return v;
}

function oneOf(v, allowed, field) {
  if (!allowed.includes(v)) throw new Invalid(field);
  return v;
}

function id(v, field) {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new Invalid(field);
  return v;
}

function bool(v, field) {
  if (typeof v !== 'boolean') throw new Invalid(field);
  return v;
}

function string(v, field, max, { min = 0, nullable = false } = {}) {
  if (v === null && nullable) return null;
  if (typeof v !== 'string' || v.length < min || v.length > max) throw new Invalid(field);
  return v;
}

function int(v, field, { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if (v === null && nullable) return null;
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new Invalid(field);
  return v;
}

function number(v, field) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Invalid(field);
  return v;
}

function checksum(v, field) {
  if (v === null) return null;
  if (typeof v !== 'string' || !SHA256_HEX_RE.test(v)) throw new Invalid(field);
  return v.toLowerCase();
}

function scalar(v, field) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length <= 300) return v;
  throw new Invalid(field);
}

/** מפה שטוחה של אפשרויות דירוג; מותרת רמת קינון אחת (למשל alphaByQueryType). */
function rankingOptions(v, field, depth = 0) {
  if (v === null || v === undefined) return null;
  object(v, field);
  const entries = Object.entries(v);
  if (entries.length > MAX_RANKING_KEYS) throw new Invalid(field);
  const out = {};
  for (const [key, value] of entries) {
    const f = `${field}.${key}`;
    if (!RANKING_KEY_RE.test(key)) throw new Invalid(field);
    out[key] = depth === 0 && isPlainObject(value) ? rankingOptions(value, f, 1) : scalar(value, f);
  }
  return out;
}

/** שדה nullable שמותר גם להשמיט. */
const opt = (v) => (v === undefined ? null : v);

function utcTime(v, field) {
  if (typeof v !== 'string' || !(ISO_UTC_RE.test(v) || ISO_UTC_FRACTION_RE.test(v))) throw new Invalid(field);
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) throw new Invalid(field);
  return new Date(ms);
}

function withinSkew(date, now, field) {
  if (Math.abs(date.getTime() - now.getTime()) > CLOCK_SKEW_MS) throw new Invalid(field);
  return date;
}

function run(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, field: err.field };
    throw err;
  }
}

// ------------------------------------------------------------------ register

/** רק המפתח הציבורי — כדי לאמת חתימה לפני שאר הוולידציה. */
export function extractPublicKey(raw) {
  if (!isPlainObject(raw)) return { ok: false, field: 'body' };
  const key = decodeStrictBase64(raw.publicKey, PUBLIC_KEY_BYTES);
  return key ? { ok: true, value: key } : { ok: false, field: 'publicKey' };
}

/**
 * @param {unknown} raw גוף הבקשה אחרי JSON.parse
 * @param {Date} now
 */
export function validateRegister(raw, now = new Date()) {
  return run(() => {
    object(raw, 'body');
    if (raw.schema !== 1) throw new Invalid('schema');
    const publicKey = decodeStrictBase64(raw.publicKey, PUBLIC_KEY_BYTES);
    if (!publicKey) throw new Invalid('publicKey');
    return {
      publicKey,
      app: oneOf(raw.app, APPS, 'app'),
      appVersion: string(raw.appVersion, 'appVersion', 64, { min: 1 }),
      platform: oneOf(raw.platform, PLATFORMS, 'platform'),
      createdAt: withinSkew(utcTime(raw.createdAt, 'createdAt'), now, 'createdAt'),
    };
  });
}

// -------------------------------------------------------------------- events

function validateContext(raw) {
  const f = 'context';
  object(raw, f);
  let engine = null;
  if (raw.engine !== undefined && raw.engine !== null) {
    const e = object(raw.engine, `${f}.engine`);
    const ef = (k) => `${f}.engine.${k}`;
    engine = {
      state: string(opt(e.state), ef('state'), 64, { nullable: true }),
      modelFamilyId: string(opt(e.modelFamilyId), ef('modelFamilyId'), 300, { nullable: true }),
      modelQuantization: string(opt(e.modelQuantization), ef('modelQuantization'), 64, { nullable: true }),
      modelPackageChecksum: checksum(opt(e.modelPackageChecksum), ef('modelPackageChecksum')),
      embeddingDim: int(opt(e.embeddingDim), ef('embeddingDim'), { min: 1, max: 65536, nullable: true }),
      vectorsReleaseTag: string(opt(e.vectorsReleaseTag), ef('vectorsReleaseTag'), 300, { nullable: true }),
      vectorsLibraryVersion: int(opt(e.vectorsLibraryVersion), ef('vectorsLibraryVersion'), { nullable: true }),
      vectorSegments: int(opt(e.vectorSegments), ef('vectorSegments'), { nullable: true }),
    };
  }
  return {
    app: oneOf(raw.app, APPS, `${f}.app`),
    appVersion: string(raw.appVersion, `${f}.appVersion`, 64, { min: 1 }),
    platform: oneOf(raw.platform, PLATFORMS, `${f}.platform`),
    osVersion: string(opt(raw.osVersion), `${f}.osVersion`, 100, { nullable: true }),
    locale: string(opt(raw.locale), `${f}.locale`, 35, { nullable: true }),
    engine,
  };
}

function validateResultRef(r, f) {
  object(r, f);
  return {
    rank: int(r.rank, `${f}.rank`, { min: 1 }),
    title: string(r.title, `${f}.title`, 300),
    reference: string(r.reference, `${f}.reference`, 300),
    segment: int(opt(r.segment), `${f}.segment`, { nullable: true }),
    isPdf: bool(r.isPdf, `${f}.isPdf`),
    source: oneOf(r.source, RESULT_SOURCES, `${f}.source`),
    lexicalScore: number(r.lexicalScore, `${f}.lexicalScore`),
    semanticScore: number(r.semanticScore, `${f}.semanticScore`),
    fusedScore: number(r.fusedScore, `${f}.fusedScore`),
    mergedCount: int(opt(r.mergedCount) ?? 0, `${f}.mergedCount`),
    snippetText: string(r.snippetText, `${f}.snippetText`, 2000),
  };
}

function validateResultFull(r, f) {
  const ref = validateResultRef(r, f);
  const matched = r.matchedText ?? [];
  if (!Array.isArray(matched) || matched.length > 50) throw new Invalid(`${f}.matchedText`);
  return {
    ...ref,
    passageText: string(r.passageText, `${f}.passageText`, 20000),
    passageTextSource: oneOf(r.passageTextSource, PASSAGE_SOURCES, `${f}.passageTextSource`),
    matchedText: matched.map((m, i) => string(m, `${f}.matchedText[${i}]`, 200)),
  };
}

function validateSearchPayload(e, f) {
  const p = object(e.params, `${f}.params`);
  const pf = (k) => `${f}.params.${k}`;
  const scope = object(p.scope, pf('scope'));
  const facets = scope.facets ?? [];
  if (!Array.isArray(facets) || facets.length > 200) throw new Invalid(pf('scope.facets'));
  const r = object(e.response, `${f}.response`);
  const rf = (k) => `${f}.response.${k}`;
  return {
    query: string(e.query, `${f}.query`, 500, { min: 1 }),
    queryLength: int(e.queryLength, `${f}.queryLength`, { max: 10000 }),
    queryWordCount: int(e.queryWordCount, `${f}.queryWordCount`, { max: 10000 }),
    params: {
      retrievalMode: oneOf(p.retrievalMode, RETRIEVAL_MODES, pf('retrievalMode')),
      lexicalMode: oneOf(p.lexicalMode, LEXICAL_MODES, pf('lexicalMode')),
      fuzzyMaxDistance: int(opt(p.fuzzyMaxDistance), pf('fuzzyMaxDistance'), { max: 10, nullable: true }),
      grouping: p.grouping == null ? null : oneOf(p.grouping, GROUPINGS, pf('grouping')),
      matchNikud: bool(p.matchNikud, pf('matchNikud')),
      matchTaamim: bool(p.matchTaamim, pf('matchTaamim')),
      scope: {
        facets: facets.map((x, i) => string(x, pf(`scope.facets[${i}]`), 1000)),
        allLibrary: bool(scope.allLibrary, pf('scope.allLibrary')),
      },
      pageSize: int(p.pageSize, pf('pageSize'), { min: 1, max: 1000 }),
      ranking: rankingOptions(p.ranking, pf('ranking')),
    },
    response: {
      executedMode: oneOf(r.executedMode, EXECUTED_MODES, rf('executedMode')),
      semanticAvailable: bool(r.semanticAvailable, rf('semanticAvailable')),
      fallbackReason: string(opt(r.fallbackReason), rf('fallbackReason'), 300, { nullable: true }),
      fallbackKind: string(opt(r.fallbackKind), rf('fallbackKind'), 64, { nullable: true }),
      latencyMs: int(opt(r.latencyMs), rf('latencyMs'), { nullable: true }),
      totalCount: int(opt(r.totalCount), rf('totalCount'), { nullable: true }),
      lexicalTotalCount: int(opt(r.lexicalTotalCount), rf('lexicalTotalCount'), { nullable: true }),
      groupCount: int(opt(r.groupCount), rf('groupCount'), { nullable: true }),
      countsAreExact: bool(r.countsAreExact, rf('countsAreExact')),
      truncated: bool(r.truncated, rf('truncated')),
      candidateWindowTruncated: bool(r.candidateWindowTruncated, rf('candidateWindowTruncated')),
    },
  };
}

const PAYLOAD_VALIDATORS = {
  search: validateSearchPayload,
  results_shown(e, f) {
    if (!Array.isArray(e.results) || e.results.length > MAX_RESULTS_PER_PAGE) throw new Invalid(`${f}.results`);
    return {
      offset: int(e.offset, `${f}.offset`),
      results: e.results.map((r, i) => validateResultRef(r, `${f}.results[${i}]`)),
    };
  },
  open: (e, f) => ({
    openId: id(e.openId, `${f}.openId`),
    via: oneOf(e.via, OPEN_VIA, `${f}.via`),
    result: validateResultFull(e.result, `${f}.result`),
  }),
  dwell: (e, f) => ({
    openId: id(e.openId, `${f}.openId`),
    dwellMs: int(e.dwellMs, `${f}.dwellMs`, { max: MAX_DWELL_MS }),
    endReason: oneOf(e.endReason, DWELL_END_REASONS, `${f}.endReason`),
  }),
  vote: (e, f) => ({
    vote: oneOf(e.vote, VOTES, `${f}.vote`),
    result: validateResultFull(e.result, `${f}.result`),
  }),
};

function validateEvent(e, f, now) {
  object(e, f);
  const type = oneOf(e.type, EVENT_TYPES, `${f}.type`);
  const clientTime = utcTime(e.clientTime, `${f}.clientTime`);
  const age = now.getTime() - clientTime.getTime();
  if (age > MAX_EVENT_AGE_MS || age < -CLOCK_SKEW_MS) throw new Invalid(`${f}.clientTime`);
  return {
    eventId: id(e.eventId, `${f}.eventId`),
    type,
    clientTime,
    searchSessionId: id(e.searchSessionId, `${f}.searchSessionId`),
    msSinceSearch: int(opt(e.msSinceSearch), `${f}.msSinceSearch`, { max: MAX_EVENT_AGE_MS, nullable: true }),
    payload: PAYLOAD_VALIDATORS[type](e, f),
  };
}

export const MAX_REJECTED_SAMPLES = 20;

/**
 * מעטפת שגויה → ok:false (422 לכל המנה). אירוע בודד שגוי, או ישן מ-30 יום, מדולג
 * ונספר ב-rejected (תיקון B לחוזה) — שאר המנה נקלטת.
 * @param {unknown} raw גוף הבקשה אחרי JSON.parse
 * @param {Date} now
 * @returns {{ok:true, value:{batchId:string, sentAt:Date, context:object, events:object[], rejected:number, rejectedSamples:{index:number, field:string}[]}} | {ok:false, field:string}}
 */
export function validateEventsBatch(raw, now = new Date()) {
  return run(() => {
    object(raw, 'body');
    if (raw.schema !== 1) throw new Invalid('schema');
    const batchId = id(raw.batchId, 'batchId');
    const sentAt = withinSkew(utcTime(raw.sentAt, 'sentAt'), now, 'sentAt');
    const context = validateContext(raw.context);
    if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > MAX_EVENTS_PER_BATCH) {
      throw new Invalid('events');
    }
    const events = [];
    const rejectedSamples = [];
    let rejected = 0;
    raw.events.forEach((e, index) => {
      const r = run(() => validateEvent(e, `events[${index}]`, now));
      if (r.ok) {
        events.push(r.value);
        return;
      }
      rejected += 1;
      if (rejectedSamples.length < MAX_REJECTED_SAMPLES) rejectedSamples.push({ index, field: r.field });
    });
    return { batchId, sentAt, context, events, rejected, rejectedSamples };
  });
}
