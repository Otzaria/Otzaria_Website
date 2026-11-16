import { LEXICON_NAME_RE } from './proofreadingOptions.js';

export const CAPABILITIES_MAX_BYTES = 16 * 1024;
export const CAPABILITIES_FRESH_MS = 15 * 60 * 1000;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function normalizeCapabilities(body) {
  const p = body?.proofreading;
  if (!object(body) || body.schemaVersion !== 1 || !object(p) || p.version !== 1
    || ['lmCheck', 'alternatives', 'lexiconAvailable', 'contextAvailable'].some((k) => typeof p[k] !== 'boolean')
    || !Array.isArray(p.lexicons) || p.lexicons.length > 50) return null;
  const seen = new Set();
  const lexicons = [];
  for (const item of p.lexicons) {
    if (!object(item) || typeof item.name !== 'string' || !LEXICON_NAME_RE.test(item.name) || seen.has(item.name)
      || !Number.isSafeInteger(item.version) || item.version < 0) return null;
    seen.add(item.name);
    lexicons.push({ name: item.name, version: item.version });
  }
  const out = { version: 1, lmCheck: p.lmCheck, alternatives: p.alternatives,
    lexiconAvailable: p.lexiconAvailable, contextAvailable: p.contextAvailable,
    lexicons: lexicons.sort((a, b) => a.name.localeCompare(b.name)) };
  if (Object.hasOwn(p, 'defaultLexicons')) {
    if (!Array.isArray(p.defaultLexicons) || p.defaultLexicons.length > 16
      || p.defaultLexicons.some((n) => !seen.has(n)) || new Set(p.defaultLexicons).size !== p.defaultLexicons.length) return null;
    out.defaultLexicons = [...p.defaultLexicons].sort();
  }
  return out;
}

export function proofreadingCapabilitiesView(state, now = new Date()) {
  const p = normalizeCapabilities({ schemaVersion: 1, proofreading: state?.proofreadingCapabilities });
  const time = new Date(state?.capabilitiesReceivedAt ?? NaN).getTime();
  if (!p || !Number.isFinite(time)) return { state: 'unavailable', receivedAt: null };
  const age = now.getTime() - time;
  return { ...p, state: age >= 0 && age <= CAPABILITIES_FRESH_MS ? 'available' : 'stale', receivedAt: new Date(time).toISOString() };
}

// Called only for a NEW request. Stored jobs keep their immutable options even
// when a later capability report changes or the worker temporarily disconnects.
export function unsupportedProofreadingOptions(options, capabilities) {
  if (!['lmCheck', 'alts', 'lexicons'].some((k) => Object.hasOwn(options, k))) return null;
  if (capabilities?.state !== 'available') return 'המחשב המקומי טרם דיווח על תמיכה בהגדרות ההגהה, או שהדיווח התיישן';
  if (Object.hasOwn(options, 'lmCheck') && !capabilities.lmCheck) return 'המחשב המקומי אינו תומך במתג מודל השפה';
  if (Object.hasOwn(options, 'alts') && !capabilities.alternatives) return 'המחשב המקומי אינו תומך בחלופות לפי ההקשר';
  if (options.alts === 'on' && options.lm !== 'modern' && (!capabilities.contextAvailable || !capabilities.lexiconAvailable)) {
    return 'הספרייה המקומית הדרושה לחלופות לפי ההקשר אינה זמינה במחשב';
  }
  if (Object.hasOwn(options, 'lexicons')) {
    if (!capabilities.lexiconAvailable) return 'מילון הספרייה אינו זמין במחשב המקומי';
    const names = new Set(capabilities.lexicons.map((item) => item.name));
    if (options.lexicons.some((name) => !names.has(name))) return 'אחד המילונים שנבחרו אינו זמין עוד במחשב המקומי';
  }
  return null;
}

export function cleanProofreadingMetadata(value) {
  if (!object(value) || value.requested !== true
    || !['ready', 'unavailable', 'failed', 'skipped_salvage'].includes(value.status)) return null;
  const out = { requested: true, status: value.status };
  if (['library_unavailable', 'context_unavailable', 'outside_domain', 'context_error', 'context_timeout', 'cancelled'].includes(value.reason)) out.reason = value.reason;
  if (['book', 'shared', 'miss'].includes(value.cache)) out.cache = value.cache;
  return out;
}

export function proofreadingResultLabel(value) {
  const p = cleanProofreadingMetadata(value);
  if (!p) return null;
  if (p.status === 'ready') return 'חישוב ההקשר הושלם; חלופות זמינות במילים שבהן נמצא הקשר מתאים.';
  const reason = p.status === 'skipped_salvage' ? 'הועברו תוצאות הזיהוי שנשמרו לפני עצירה'
    : p.reason === 'library_unavailable' ? 'ספריית ההקשר אינה זמינה במחשב'
      : p.reason === 'outside_domain' ? 'הספר מחוץ לתחום ההגהה של הספרייה'
        : p.reason === 'context_unavailable' ? 'נתוני ההקשר אינם זמינים'
          : p.reason === 'context_timeout' ? 'חישוב ההקשר חרג ממגבלת הזמן'
        : p.reason === 'cancelled' ? 'חישוב ההקשר הופסק'
          : 'חישוב ההקשר לא הושלם';
  return `הזיהוי הושלם; חלופות לפי ההקשר לא חושבו — ${reason}.`;
}
