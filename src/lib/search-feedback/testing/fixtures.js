/**
 * עזרי בדיקה: מפתחות ed25519 מזרע, חתימה על גוף גולמי ומנות תקינות לפי החוזה.
 */
import crypto from 'node:crypto';

// RFC 8032, מקרה בדיקה 1.
export const RFC_SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
export const RFC_PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
export const RFC_EMPTY_SIG_HEX =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function keyPairFromSeed(seed) {
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const spki = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicRaw = spki.subarray(spki.length - 32);
  return {
    publicRaw,
    publicB64: publicRaw.toString('base64'),
    sign: (bytes) => crypto.sign(null, Buffer.from(bytes), privateKey).toString('base64'),
  };
}

export const randomKeyPair = () => keyPairFromSeed(crypto.randomBytes(32));

let seq = 0;
export const newId = (prefix = 'id') => `${prefix}_${String(++seq).padStart(10, '0')}`;

export const resultRef = (over = {}) => ({
  rank: 1, title: 'משנה ברורה', reference: 'משנה ברורה, סימן א, סעיף קטן א', segment: 12, isPdf: false,
  source: 'both', lexicalScore: 1.2, semanticScore: 0.8, fusedScore: 0.03, mergedCount: 0,
  snippetText: 'יתגבר כארי לעמוד בבוקר', ...over,
});

export const resultFull = (over = {}) => ({
  ...resultRef(), passageText: 'יתגבר כארי לעמוד בבוקר לעבודת בוראו', passageTextSource: 'line',
  matchedText: ['יתגבר', 'כארי'], ...over,
});

export const context = (over = {}) => ({
  app: 'otzaria', appVersion: '1.2.3+456', platform: 'windows', osVersion: '10.0.26200', locale: 'he',
  engine: {
    state: 'ready', modelFamilyId: 'ArieLLL123/judaic-semantic-round2-onnx-zayit@1ec8dc6', modelQuantization: 'int8',
    modelPackageChecksum: 'a'.repeat(64), embeddingDim: 256, vectorsReleaseTag: 'vectors-v30-20260930165019',
    vectorsLibraryVersion: 30, vectorSegments: 1,
  },
  ...over,
});

export function event(type, now, over = {}) {
  const common = { eventId: newId('ev'), type, clientTime: now.toISOString(), searchSessionId: 'session_0001', msSinceSearch: 1234 };
  const payloads = {
    search: {
      query: 'יתגבר כארי', queryLength: 10, queryWordCount: 2,
      params: {
        retrievalMode: 'hybrid', lexicalMode: 'exact', fuzzyMaxDistance: 0, grouping: null, matchNikud: false, matchTaamim: false,
        scope: { facets: ['/הלכה'], allLibrary: false }, pageSize: 50,
        ranking: { alpha: 0.5, rrfK: 60, useBoost: true, mode: 'rrf', extra: null, alphaByQueryType: { short: 0.3, long: 0.7 } },
      },
      response: {
        executedMode: 'hybrid', semanticAvailable: true, fallbackReason: null, fallbackKind: null, latencyMs: 120,
        totalCount: 200, lexicalTotalCount: 37, groupCount: null, countsAreExact: false, truncated: false, candidateWindowTruncated: false,
      },
    },
    results_shown: { offset: 0, results: [resultRef(), resultRef({ rank: 2, isPdf: true, source: 'lexical', semanticScore: null })] },
    open: { openId: 'open_00001', via: 'click', result: resultFull() },
    dwell: { openId: 'open_00001', dwellMs: 45000, endReason: 'tab_closed' },
    vote: { vote: 'like', result: resultFull() },
  };
  return { ...common, ...payloads[type], ...over };
}

export const batch = (now, over = {}) => ({
  schema: 1, batchId: newId('batch'), sentAt: now.toISOString(), context: context(),
  events: ['search', 'results_shown', 'open', 'dwell', 'vote'].map((t) => event(t, now)),
  ...over,
});

export const registerBody = (kp, now, over = {}) => ({
  schema: 1, publicKey: kp.publicB64, app: 'otzaria', appVersion: '1.2.3+456', platform: 'windows', createdAt: now.toISOString(), ...over,
});
