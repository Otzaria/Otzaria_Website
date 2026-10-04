/**
 * בדיקות הליבה הטהורה של משוב החיפוש: קריפטו, ולידציה, הגדרות ומסנן הייצוא. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeKeyId, decodeStrictBase64, verifyBodySignature, KEY_ID_RE } from './crypto.js';
import { validateRegister, validateEventsBatch, extractPublicKey, MAX_EVENTS_PER_BATCH, MAX_DWELL_MS, MAX_REJECTED_SAMPLES } from './validation.js';
import { getSearchFeedbackConfig, ipBucketWarning } from './config.js';
import { buildExportFilter, buildPurgeFilter } from './service.js';
import { hasSearchFeedbackAccess, hasOcrAccess, hasAnyAdminAccess, ALL_ADMIN_ROLES, ROLE_LABELS, ROLES } from '../roles.js';
import {
  RFC_SEED_HEX, RFC_PUBLIC_HEX, RFC_EMPTY_SIG_HEX, keyPairFromSeed, batch, event, registerBody, resultFull,
} from './testing/fixtures.js';

const NOW = new Date('2026-10-02T10:00:00.000Z');
const rfcPublic = Buffer.from(RFC_PUBLIC_HEX, 'hex');
// ערך צפוי משותף ללקוח (Dart) — אותו חישוב בשני הצדדים.
const RFC_KEY_ID = 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';

// ------------------------------------------------------------------ crypto

test('keyId: base64url בלי ריפוד של SHA-256 על המפתח הגולמי (וקטור RFC 8032 #1)', () => {
  const keyId = computeKeyId(rfcPublic);
  assert.equal(keyId, RFC_KEY_ID);
  assert.equal(keyId.length, 43);
  assert.match(keyId, KEY_ID_RE);
});

test('חתימה: וקטור RFC 8032 #1 על הודעה ריקה מאומת', () => {
  const sig = Buffer.from(RFC_EMPTY_SIG_HEX, 'hex').toString('base64');
  assert.equal(verifyBodySignature(new Uint8Array(0), sig, rfcPublic), true);
  assert.equal(verifyBodySignature(new Uint8Array([0]), sig, rfcPublic), false);
});

test('חתימה: זרע ה-RFC מפיק את המפתח הציבורי, וחתימה על גוף JSON אמיתי עוברת סבב מלא', () => {
  const kp = keyPairFromSeed(Buffer.from(RFC_SEED_HEX, 'hex'));
  assert.equal(kp.publicRaw.toString('hex'), RFC_PUBLIC_HEX);
  assert.equal(kp.sign(new Uint8Array(0)), Buffer.from(RFC_EMPTY_SIG_HEX, 'hex').toString('base64'));

  const body = Buffer.from(JSON.stringify(batch(NOW)), 'utf8');
  const sig = kp.sign(body);
  assert.equal(verifyBodySignature(body, sig, kp.publicRaw), true);

  const tampered = Buffer.from(body);
  tampered[tampered.length - 2] ^= 1;
  assert.equal(verifyBodySignature(tampered, sig, kp.publicRaw), false);
  // אותו JSON בסידור רווחים שונה = בתים אחרים = חתימה לא תקפה (אין קנוניזציה)
  const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString('utf8')), null, 1), 'utf8');
  assert.equal(verifyBodySignature(reformatted, sig, kp.publicRaw), false);
});

test('חתימה: קידוד פגום, אורך שגוי או מפתח באורך שגוי — false בלי חריגה', () => {
  const kp = keyPairFromSeed(Buffer.from(RFC_SEED_HEX, 'hex'));
  const body = Buffer.from('{}');
  const sig = kp.sign(body);
  assert.equal(verifyBodySignature(body, sig.replace(/=+$/, ''), kp.publicRaw), false);
  assert.equal(verifyBodySignature(body, Buffer.from(sig, 'base64').toString('hex'), kp.publicRaw), false);
  assert.equal(verifyBodySignature(body, Buffer.alloc(63).toString('base64'), kp.publicRaw), false);
  assert.equal(verifyBodySignature(body, null, kp.publicRaw), false);
  assert.equal(verifyBodySignature(body, sig, kp.publicRaw.subarray(0, 31)), false);
});

test('decodeStrictBase64: דורש ריפוד ואורך מדויק', () => {
  const b64 = rfcPublic.toString('base64');
  assert.deepEqual(decodeStrictBase64(b64, 32), rfcPublic);
  assert.equal(decodeStrictBase64(b64.replace(/=$/, ''), 32), null);
  assert.equal(decodeStrictBase64(rfcPublic.toString('base64url'), 32), null);
  assert.equal(decodeStrictBase64(b64, 31), null);
  assert.equal(decodeStrictBase64(123, 32), null);
});

// ---------------------------------------------------------------- register

test('register: גוף תקין מנורמל', () => {
  const kp = keyPairFromSeed(Buffer.from(RFC_SEED_HEX, 'hex'));
  const r = validateRegister(registerBody(kp, NOW), NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.publicKey, rfcPublic);
  assert.equal(r.value.app, 'otzaria');
  assert.equal(r.value.createdAt.toISOString(), NOW.toISOString());
  assert.equal(extractPublicKey(registerBody(kp, NOW)).ok, true);
});

test('register: שדות שגויים מחזירים את שם השדה', () => {
  const kp = keyPairFromSeed(Buffer.from(RFC_SEED_HEX, 'hex'));
  const cases = [
    [{ schema: 2 }, 'schema'],
    [{ publicKey: 'abc' }, 'publicKey'],
    [{ app: 'other' }, 'app'],
    [{ platform: 'other' }, 'platform'],
    [{ appVersion: '' }, 'appVersion'],
    [{ appVersion: 'x'.repeat(65) }, 'appVersion'],
    [{ createdAt: '2026-10-02T10:00:00+03:00' }, 'createdAt'],
    [{ createdAt: '2026-10-03T10:00:01.000Z' }, 'createdAt'],
    [{ createdAt: '2026-10-01T09:59:59.000Z' }, 'createdAt'],
  ];
  for (const [over, field] of cases) {
    const r = validateRegister(registerBody(kp, NOW, over), NOW);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.equal(r.field, field, JSON.stringify(over));
  }
  assert.equal(validateRegister([], NOW).field, 'body');
  assert.equal(extractPublicKey(null).field, 'body');
});

// ------------------------------------------------------------------ events

test('events: מנה עם כל חמשת הסוגים תקינה; שדות לא מוכרים נזרקים', () => {
  const raw = batch(NOW);
  raw.events[0].unknownField = 'x';
  raw.context.hostname = 'my-pc';
  const r = validateEventsBatch(raw, NOW);
  assert.equal(r.ok, true, r.field);
  assert.equal(r.value.events.length, 5);
  assert.equal('hostname' in r.value.context, false);
  assert.equal('unknownField' in r.value.events[0].payload, false);
  const search = r.value.events[0].payload;
  assert.deepEqual(search.params.ranking.alphaByQueryType, { short: 0.3, long: 0.7 });
  assert.equal(search.response.fallbackKind, null);
  assert.equal(r.value.context.engine.modelFamilyId, 'ArieLLL123/judaic-semantic-round2-onnx-zayit@1ec8dc6');
  assert.equal(r.value.events[1].payload.results[1].isPdf, true);
});

test('events: engine ו-ranking יכולים להיות null; שדות nullable מושמטים מקבלים null', () => {
  const raw = batch(NOW, { context: { app: 'zayit', appVersion: '1.0.0', platform: 'linux', engine: null } });
  raw.events[0].params.ranking = null;
  delete raw.events[0].response.fallbackKind;
  const r = validateEventsBatch(raw, NOW);
  assert.equal(r.ok, true, r.field);
  assert.equal(r.value.context.engine, null);
  assert.equal(r.value.context.osVersion, null);
  assert.equal(r.value.events[0].payload.params.ranking, null);
  assert.equal(r.value.events[0].payload.response.fallbackKind, null);

  const allNull = batch(NOW, { context: { app: 'otzaria', appVersion: '1', platform: 'ios', engine: { modelFamilyId: null } } });
  const r2 = validateEventsBatch(allNull, NOW);
  assert.equal(r2.ok, true, r2.field);
  assert.equal(r2.value.context.engine.modelQuantization, null);
});

test('events: שגיאה במעטפה → ok:false עם שם השדה; אירוע שגוי בודד מדולג עם index+field', () => {
  const mutate = (fn) => { const raw = batch(NOW); fn(raw); return validateEventsBatch(raw, NOW); };
  const envelopeCases = [
    [(b) => { b.schema = 2; }, 'schema'],
    [(b) => { b.batchId = 'short'; }, 'batchId'],
    [(b) => { b.batchId = 'has space 123'; }, 'batchId'],
    [(b) => { b.sentAt = '2026-10-03T10:00:01.000Z'; }, 'sentAt'],
    [(b) => { b.sentAt = '2026-10-02 10:00:00'; }, 'sentAt'],
    [(b) => { b.context.app = 'x'; }, 'context.app'],
    [(b) => { b.context.engine.modelPackageChecksum = 'abc'; }, 'context.engine.modelPackageChecksum'],
    [(b) => { b.context.engine.embeddingDim = 1.5; }, 'context.engine.embeddingDim'],
    [(b) => { b.events = []; }, 'events'],
    [(b) => { b.events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => event('dwell', NOW)); }, 'events'],
    [(b) => { b.events = 'nope'; }, 'events'],
  ];
  for (const [fn, field] of envelopeCases) {
    const r = mutate(fn);
    assert.equal(r.ok, false, `expected envelope failure for ${field}`);
    assert.equal(r.field, field);
  }

  const eventCases = [
    [(b) => { b.events[2].type = 'click'; }, 'events[2].type'],
    [(b) => { b.events[0].eventId = 'x'; }, 'events[0].eventId'],
    [(b) => { b.events[0].clientTime = '2026-09-01T09:59:59.000Z'; }, 'events[0].clientTime'],
    [(b) => { b.events[0].clientTime = '2026-10-03T10:00:01.000Z'; }, 'events[0].clientTime'],
    [(b) => { b.events[0].query = 'א'.repeat(501); }, 'events[0].query'],
    [(b) => { b.events[0].params.retrievalMode = 'magic'; }, 'events[0].params.retrievalMode'],
    [(b) => { b.events[0].params.ranking = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, i])); }, 'events[0].params.ranking'],
    [(b) => { b.events[0].params.ranking = { a: { b: { c: 1 } } }; }, 'events[0].params.ranking.a.b'],
    [(b) => { b.events[0].params.ranking = { $where: 1 }; }, 'events[0].params.ranking'],
    [(b) => { b.events[0].params.ranking = { a: [1] }; }, 'events[0].params.ranking.a'],
    [(b) => { b.events[0].response.fallbackKind = 'x'.repeat(65); }, 'events[0].response.fallbackKind'],
    [(b) => { b.events[0].response.truncated = 'no'; }, 'events[0].response.truncated'],
    [(b) => { b.events[1].results = Array.from({ length: 101 }, () => ({})); }, 'events[1].results'],
    [(b) => { b.events[1].results[1].rank = 0; }, 'events[1].results[1].rank'],
    [(b) => { b.events[1].results[0].title = 'x'.repeat(301); }, 'events[1].results[0].title'],
    [(b) => { b.events[1].results[0].snippetText = 'x'.repeat(2001); }, 'events[1].results[0].snippetText'],
    [(b) => { b.events[1].results[0].fusedScore = Number.NaN; }, 'events[1].results[0].fusedScore'],
    [(b) => { b.events[2].via = 'telepathy'; }, 'events[2].via'],
    [(b) => { b.events[2].result = resultFull({ passageText: 'x'.repeat(20001) }); }, 'events[2].result.passageText'],
    [(b) => { b.events[2].result = resultFull({ matchedText: Array(51).fill('a') }); }, 'events[2].result.matchedText'],
    [(b) => { b.events[2].result = resultFull({ matchedText: ['x'.repeat(201)] }); }, 'events[2].result.matchedText[0]'],
    [(b) => { b.events[3].dwellMs = MAX_DWELL_MS + 1; }, 'events[3].dwellMs'],
    [(b) => { b.events[3].endReason = 'bored'; }, 'events[3].endReason'],
    [(b) => { b.events[4].vote = 'meh'; }, 'events[4].vote'],
    [(b) => { b.events[1] = 'not an object'; }, 'events[1]'],
  ];
  for (const [fn, field] of eventCases) {
    const r = mutate(fn);
    assert.equal(r.ok, true, `event error must not fail the batch: ${field}`);
    assert.equal(r.value.rejected, 1, field);
    const index = Number(field.match(/^events\[(\d+)\]/)[1]);
    assert.deepEqual(r.value.rejectedSamples, [{ index, field }]);
    assert.equal(r.value.events.length, 4, field);
  }
});

test('events: כל האירועים שגויים → ok עם 0 תקינים; דגימות מוגבלות ל-20', () => {
  const raw = batch(NOW, { events: Array.from({ length: 30 }, () => event('dwell', NOW, { dwellMs: -1 })) });
  const r = validateEventsBatch(raw, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.events.length, 0);
  assert.equal(r.value.rejected, 30);
  assert.equal(r.value.rejectedSamples.length, MAX_REJECTED_SAMPLES);
  assert.deepEqual(r.value.rejectedSamples[19], { index: 19, field: 'events[19].dwellMs' });
});

test('events: גבולות מותרים — אירוע בן 30 יום, dwell של 30 דקות, 100 אירועים', () => {
  const raw = batch(NOW);
  raw.events[0].clientTime = new Date(NOW.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  raw.events[3].dwellMs = MAX_DWELL_MS;
  raw.events[3].endReason = 'capped';
  assert.equal(validateEventsBatch(raw, NOW).ok, true);
  const big = batch(NOW, { events: Array.from({ length: MAX_EVENTS_PER_BATCH }, () => event('dwell', NOW)) });
  assert.equal(validateEventsBatch(big, NOW).ok, true);
});

// ------------------------------------------------------------ config/admin

test('config: הקליטה פעילה כברירת מחדל; רק 0/false מפורש מכבה', () => {
  assert.equal(getSearchFeedbackConfig({}).enabled, true);
  assert.equal(getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: '' }).enabled, true);
  assert.equal(getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: '1' }).enabled, true);
  for (const off of ['0', 'false', ' FALSE ', 'off', 'no']) {
    assert.equal(getSearchFeedbackConfig({ SEARCH_FEEDBACK_ENABLED: off }).enabled, false, off);
  }
  assert.deepEqual(getSearchFeedbackConfig({}).limits, { registerPerIpPerHour: 10, eventsPerIpPerHour: 600, eventsPerKeyPerHour: 120 });
});

test('config: אזהרה כשהקליטה פעילה ו-TRUSTED_PROXY_COUNT=0 (מכסת IP משותפת)', () => {
  assert.match(ipBucketWarning({}), /TRUSTED_PROXY_COUNT/);
  assert.match(ipBucketWarning({ TRUSTED_PROXY_COUNT: '0' }), /TRUSTED_PROXY_COUNT/);
  assert.equal(ipBucketWarning({ TRUSTED_PROXY_COUNT: '1' }), null);
  assert.equal(ipBucketWarning({ SEARCH_FEEDBACK_ENABLED: '0' }), null);
});

test('הרשאה: מנהל כללי ומאמן מודלים בלבד', () => {
  assert.equal(hasSearchFeedbackAccess('admin'), true);
  assert.equal(hasSearchFeedbackAccess('model_trainer'), true);
  for (const role of ['developer', 'admin_books', 'admin_plugins', 'admin_books_only', 'admin_ocr', 'user', undefined]) {
    assert.equal(hasSearchFeedbackAccess(role), false, role);
  }
});

test('תפקיד מאמן מודלים: כמו מנהל OCR + משוב החיפוש; מנהל OCR ללא שינוי', () => {
  assert.equal(ROLES.MODEL_TRAINER, 'model_trainer');
  assert.equal(ROLE_LABELS.model_trainer, 'מאמן מודלים');
  assert.equal(hasOcrAccess('model_trainer'), true);
  assert.equal(hasOcrAccess('admin_ocr'), true);
  assert.equal(hasSearchFeedbackAccess('admin_ocr'), false);
  // כמו admin_ocr: חלק מ-ALL_ADMIN_ROLES (דשבורד /library/admin, /api/admin/stats)
  assert.equal(ALL_ADMIN_ROLES.includes('model_trainer'), true);
  assert.equal(hasAnyAdminAccess('model_trainer'), true);
});

test('מסנן ייצוא: from/to/type/model ושגיאות', () => {
  const r = buildExportFilter(new URLSearchParams('from=2026-10-01T00:00:00Z&to=2026-10-02&type=vote&modelFamilyId=m@1&modelQuantization=int8'));
  assert.equal(r.ok, true);
  assert.equal(r.filter.receivedAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(r.filter.receivedAt.$lt.toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(r.filter.type, 'vote');
  assert.equal(r.filter['context.engine.modelFamilyId'], 'm@1');
  assert.equal(r.filter['context.engine.modelQuantization'], 'int8');
  assert.equal(r.includeBlocked, false);
  assert.deepEqual(buildExportFilter(new URLSearchParams('')).filter, {});
  assert.equal(buildExportFilter(new URLSearchParams('from=yesterday')).field, 'from');
  assert.equal(buildExportFilter(new URLSearchParams('type=click')).field, 'type');
  assert.equal(buildExportFilter(new URLSearchParams('keyId=short')).field, 'keyId');
  assert.equal(buildExportFilter(new URLSearchParams('includeBlocked=1')).includeBlocked, true);
  // noQuantization=1 → רק אירועים בלי קוונטיזציה; השמטה → כל הקוונטיזציות של המשפחה
  const noQ = buildExportFilter(new URLSearchParams('modelFamilyId=m@1&noQuantization=1'));
  assert.equal(noQ.filter['context.engine.modelQuantization'], null);
  const anyQ = buildExportFilter(new URLSearchParams('modelFamilyId=m@1'));
  assert.equal('context.engine.modelQuantization' in anyQ.filter, false);
});

test('מסנן ניקוי: חובה מסנן או all:true מפורש, ולא שניהם', () => {
  assert.deepEqual(buildPurgeFilter({}), { ok: false, field: 'filter' });
  assert.deepEqual(buildPurgeFilter({ all: false }), { ok: false, field: 'filter' });
  assert.deepEqual(buildPurgeFilter({ all: 'yes' }), { ok: false, field: 'all' });
  assert.deepEqual(buildPurgeFilter({ all: true, type: 'vote' }), { ok: false, field: 'all' });
  assert.deepEqual(buildPurgeFilter(null), { ok: false, field: 'body' });
  assert.deepEqual(buildPurgeFilter([]), { ok: false, field: 'body' });
  assert.deepEqual(buildPurgeFilter({ all: true }), { ok: true, filter: {} });
  assert.deepEqual(buildPurgeFilter({ type: 'vote', modelFamilyId: 'm', modelQuantization: null }).filter, {
    type: 'vote', 'context.engine.modelFamilyId': 'm', 'context.engine.modelQuantization': null,
  });
  assert.equal(buildPurgeFilter({ keyId: 'A'.repeat(43) }).filter.keyId, 'A'.repeat(43));
  // אובייקטים (הזרקת אופרטורים של Mongo) נדחים
  assert.equal(buildPurgeFilter({ type: { $ne: null } }).field, 'type');
  assert.equal(buildPurgeFilter({ modelFamilyId: { $gt: '' } }).field, 'modelFamilyId');
  assert.equal(buildPurgeFilter({ keyId: { $ne: 'x' } }).field, 'keyId');
});

test('ממשק: מסנני הדף מתורגמים לשרת — קוונטיזציה null נשלחת במפורש', async () => {
  const { filtersToCriteria, criteriaToSearchParams } = await import('../../components/admin/searchFeedback/labels.js');
  const models = [
    { modelFamilyId: null, modelQuantization: null, count: 3 },
    { modelFamilyId: 'fam@1', modelQuantization: 'int8', count: 2 },
    { modelFamilyId: 'fam@1', modelQuantization: null, count: 1 },
  ];
  const base = { from: '', to: '', type: '', model: '' };
  assert.deepEqual(filtersToCriteria(base, models), {});
  assert.deepEqual(filtersToCriteria({ ...base, model: '0' }, models), { modelFamilyId: 'fam@1', modelQuantization: 'int8' });
  const noQ = filtersToCriteria({ ...base, model: '1', type: 'vote' }, models);
  assert.deepEqual(noQ, { type: 'vote', modelFamilyId: 'fam@1', modelQuantization: null });
  assert.equal(criteriaToSearchParams(noQ).toString(), 'type=vote&modelFamilyId=fam%401&noQuantization=1');
  assert.deepEqual(buildPurgeFilter(noQ).filter['context.engine.modelQuantization'], null);
  assert.equal(buildExportFilter(criteriaToSearchParams(noQ)).filter['context.engine.modelQuantization'], null);
});
