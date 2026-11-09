// Persisted, page-local decisions. A text snapshot identifies occurrences, not a
// dictionary: approving a word must never approve its other occurrences.
export function validOcrReviewState(value) {
  return value != null && value.version === 1 && typeof value.revision === 'string' && value.revision.length <= 2048
    && Array.isArray(value.words) && value.words.length <= 50_000
    // A standalone bidi control normalizes to an empty key; it must not make
    // every other occurrence on a Hebrew page impossible to approve.
    && value.words.every((w) => typeof w === 'string' && w.length <= 2_000_000)
    && value.words.reduce((n, w) => n + w.length, 0) <= 2_000_000
    && Array.isArray(value.accepted) && value.accepted.length <= value.words.length
    && value.accepted.every((i) => Number.isSafeInteger(i) && i >= 0 && i < value.words.length)
    && new Set(value.accepted).size === value.accepted.length;
}

// Includes every OCR provider's text fingerprint as well as the local result and
// image identity. Decisions from a previous scan/result are not carried forward.
export function ocrReviewRevision(page) {
  return JSON.stringify([
    page.imagePath || '', String(page.lastOcrJobId || ''), page.lastOcrResultSha256 || '',
    page.lastOcrAt ? new Date(page.lastOcrAt).toISOString() : '', page.lastOcrTextSha256 || '',
  ]);
}
