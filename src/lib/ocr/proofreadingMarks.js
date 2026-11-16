// Context probabilities are relative weights among alternatives, not accuracy.
export const MAX_CONTEXT_ALTS = 3;
const text = (value) => typeof value === 'string' && value.length <= 200 && value.trim()
  && !/[<>\r\n\u0000-\u001f\u007f-\u009f]/u.test(value);
const probability = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;

export function cleanContextAlternatives(raw, word, suggestions = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([word, ...suggestions].map((s) => String(s).trim()));
  const out = [];
  for (const alternative of raw.slice(0, 12)) {
    if (!alternative || typeof alternative !== 'object' || !text(alternative.text)) continue;
    const value = alternative.text.trim();
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ text: value, p: probability(alternative.p), why: text(alternative.why) ? alternative.why.trim() : '' });
    if (out.length === MAX_CONTEXT_ALTS) break;
  }
  return out;
}
