// Shared by browser and server. Missing keys retain the exact legacy job shape.
// A negative any-character lookahead is a strict end anchor; JS $ also matches before a final newline.
export const LEXICON_NAME_RE = /^[0-9A-Za-z_\-א-ת]{1,60}(?![\s\S])/u;
export const MAX_SELECTED_LEXICONS = 16;
const own = (v, k) => Object.hasOwn(v, k);

export function normalizeProofreadingOptions(options = {}) {
  const value = {};
  for (const key of ['lmCheck', 'alts']) {
    if (!own(options, key)) continue;
    if (!['on', 'off'].includes(options[key])) return { ok: false, error: 'ערך לא חוקי בהגדרות ההגהה' };
    value[key] = options[key];
  }
  if (own(options, 'lexicons')) {
    const names = options.lexicons;
    if (!Array.isArray(names) || names.length > MAX_SELECTED_LEXICONS
      || names.some((name) => typeof name !== 'string' || !LEXICON_NAME_RE.test(name))
      || new Set(names).size !== names.length) return { ok: false, error: 'בחירת המילונים אינה תקינה' };
    value.lexicons = [...names].sort();
  }
  return { ok: true, value };
}

// Appended only for new options: old request IDs/envelopes remain byte-compatible.
export function proofreadingFingerprint(options = {}) {
  const clean = normalizeProofreadingOptions(options);
  if (!clean.ok) return ['proofreading-invalid'];
  const entries = Object.entries(clean.value);
  return entries.length ? ['proofreading-v1', entries] : [];
}
