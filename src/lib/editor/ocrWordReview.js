// Model annotations belong to unchanged OCR words, never to approximate geometry.
// The editor may reflow the page, add HTML, split columns or edit words. Keep raw
// UTF-16 ranges for both editing surfaces and use bounded, exact sequence matching.
import { tokenize } from '../../components/editor/v2/richMap.js';
import { LOW_CONF, shapeReasons } from './suspectWords.js';
import { validOcrReviewState } from './ocrReviewState.js';

const list = (x) => Array.isArray(x) ? x : [];
const probability = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 ? x : null;
// Quote typography changes during export; letter, punctuation and vowel edits do
// not count as unchanged. In particular, do not fold final letters as tracking does.
const keyOf = (s) => String(s ?? '').normalize('NFC').replace(/[׳‘’]/gu, "'").replace(/[״“”]/gu, '"').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '');

/** Visible words with raw ranges. Formatting inside a word is preserved on edits;
 * tag attributes, embedded images and entity chips are never spelling input. */
export function reviewTextWords(text) {
  const out = [];
  let word = null;
  const flush = () => { if (word) out.push(word); word = null; };
  for (const t of tokenize(text)) {
    if (t.kind === 'tag' && t.known) continue;
    if (t.kind !== 'text') { flush(); continue; }
    for (const m of t.raw.matchAll(/\S+|\s+/gu)) {
      if (/\s/u.test(m[0][0])) { flush(); continue; }
      const start = t.start + m.index;
      const end = start + m[0].length;
      if (!word) word = { text: '', start, end, segments: [] };
      word.text += m[0];
      word.end = end;
      word.segments.push({ start, end });
    }
  }
  flush();
  return out;
}

/** Convert one layout-v1 or PageProof line, independently of missing/filtered or
 * reordered word boxes. Annotation indexes refer to logical, original line text. */
export function reviewWordsOfLine(line, { proof = false } = {}) {
  const tokens = String(line.text ?? '').split(/\s+/u).filter(Boolean);
  const words = list(line.words);
  const low = new Set(list(line.flags?.low_words));
  return tokens.map((text, i) => {
    const reasons = [];
    const raw = words.length === tokens.length ? words[i] : null;
    const label = proof ? raw?.text : list(line.wordTexts)[i];
    const conf = label == null || keyOf(label) === keyOf(text) ? probability(proof ? raw?.conf : raw?.[2]) : null;
    if (low.has(i) || (conf !== null && conf < LOW_CONF)) reasons.push('low_conf');
    const markers = (xs) => list(xs).filter((a) => a?.i === i && (a.word == null || keyOf(a.word) === keyOf(text)));
    const alternatives = markers(line.alternatives);
    const lm = markers(line.lm);
    const legacy = markers(line.lm_flags);
    if (alternatives.length) reasons.push('alternatives');
    if (lm.length || legacy.length) reasons.push('language_model');
    const suggestions = new Map();
    const add = (items, kind) => {
      for (const a of list(items).slice(0, 50)) {
        if (typeof a?.text !== 'string' || !a.text.trim() || a.text.length > 500 || /[<>\r\n]/u.test(a.text)) continue;
        const value = a.text.trim();
        if (keyOf(value) === keyOf(text)) continue;
        const k = keyOf(value);
        const p = probability(a.p);
        const item = suggestions.get(k);
        if (item) {
          if (!item.sources.includes(kind)) item.sources.push(kind);
          if (item.p === null) item.p = p;
        } else suggestions.set(k, { text: value, sources: [kind], p });
      }
    };
    alternatives.forEach((a) => add(a.alts, 'recognition'));
    lm.forEach((a) => add(a.alts, 'language'));
    legacy.forEach((a) => { add(a.rec, 'context'); add(a.lm, 'language'); });
    return { text, conf, reasons, suggestions: [...suggestions.values()], p: probability(alternatives[0]?.p) };
  });
}

const MAX_CELLS = 40_000;
function orderedAnchors(A, B) {
  const unique = (xs) => {
    const map = new Map();
    xs.forEach((s, i) => map.set(s, map.has(s) ? -1 : i));
    return map;
  };
  const b = unique(B);
  const pairs = [...unique(A)].filter(([s, i]) => i >= 0 && b.get(s) >= 0).map(([s, i]) => [i, b.get(s)]);
  const tails = [];
  const prev = new Int32Array(pairs.length).fill(-1);
  pairs.forEach((p, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pairs[tails[mid]][1] < p[1]) lo = mid + 1; else hi = mid; }
    prev[i] = lo ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const out = [];
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.push(pairs[i]);
  return out.reverse();
}

// If the shorter sequence is a subsequence, every optimal alignment uses all of
// it. A pair is mandatory exactly when the earliest and latest embeddings agree.
// This also handles large identical/repetitive pages in linear time and space.
function matchSubsequence(shorter, longer, match) {
  const earliest = new Int32Array(shorter.length);
  let j = 0;
  for (let i = 0; i < shorter.length; i++) {
    while (j < longer.length && shorter[i] !== longer[j]) j++;
    if (j === longer.length) return false;
    earliest[i] = j++;
  }
  j = longer.length - 1;
  for (let i = shorter.length - 1; i >= 0; i--) {
    while (shorter[i] !== longer[j]) j--;
    if (earliest[i] === j) match(i, j);
    j--;
  }
  return true;
}

// Emit only pairs present in EVERY optimal LCS. A viable pair (i,j) satisfies
// prefix(i,j) + 1 + suffix(i+1,j+1) === L, and always has rank prefix(i,j)+1.
// Every optimal alignment has one pair at each rank, so a sole viable pair at a
// rank is mandatory; multiple candidates mean none of them is safe to annotate.
function matchMandatoryLcs(A, B, match) {
  const n = A.length, m = B.length, width = m + 1;
  if ((n + 1) * width > MAX_CELLS) return;
  const suffix = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    suffix[i * width + j] = A[i] === B[j] ? 1 + suffix[(i + 1) * width + j + 1]
      : Math.max(suffix[(i + 1) * width + j], suffix[i * width + j + 1]);
  }
  const length = suffix[0];
  const candidates = new Uint8Array(length + 1);
  const oldAt = new Int32Array(length + 1), newAt = new Int32Array(length + 1);
  const prefix = new Uint16Array(width);
  for (let i = 0; i < n; i++) {
    let diagonal = 0;
    for (let j = 0; j < m; j++) {
      const above = prefix[j + 1];
      if (A[i] === B[j]) {
        const rank = diagonal + 1;
        if (rank + suffix[(i + 1) * width + j + 1] === length) {
          if (candidates[rank] === 0) { oldAt[rank] = i; newAt[rank] = j; }
          candidates[rank] = Math.min(2, candidates[rank] + 1);
        }
        prefix[j + 1] = rank;
      } else prefix[j + 1] = Math.max(above, prefix[j]);
      diagonal = above;
    }
  }
  for (let rank = 1; rank <= length; rank++) if (candidates[rank] === 1) match(oldAt[rank], newAt[rank]);
}

// Returns new-index -> old-index. There is no fuzzy, positional or nearest-word
// fallback: a corrected/deleted/split/joined word must lose its old annotations.
function unchangedWords(A, B) {
  const out = new Map();
  const gap = (a, ae, b, be) => {
    if (a === ae || b === be) return;
    // Tokens absent from the opposite gap cannot occur in any LCS. Removing
    // them preserves all alignments and often turns a long correction into the
    // linear subsequence case. Keep explicit indexes into the original arrays.
    const oldKeys = new Set(A.slice(a, ae)), newKeys = new Set(B.slice(b, be));
    const oldIndexes = [], newIndexes = [], oldWords = [], newWords = [];
    for (let i = a; i < ae; i++) if (newKeys.has(A[i])) { oldIndexes.push(i); oldWords.push(A[i]); }
    for (let j = b; j < be; j++) if (oldKeys.has(B[j])) { newIndexes.push(j); newWords.push(B[j]); }
    if (!oldWords.length || !newWords.length) return;
    const match = (i, j) => out.set(newIndexes[j], oldIndexes[i]);
    const subsequence = oldWords.length <= newWords.length
      ? matchSubsequence(oldWords, newWords, match)
      : matchSubsequence(newWords, oldWords, (j, i) => match(i, j));
    if (!subsequence) matchMandatoryLcs(oldWords, newWords, match);
  };
  let a = 0, b = 0;
  for (const [i, j] of orderedAnchors(A, B)) { gap(a, i, b, j); out.set(j, i); a = i + 1; b = j + 1; }
  gap(a, A.length, b, B.length);
  return out;
}

/** One review result for the whole page (right then left in a split editor).
 * Each occurrence is consumed once, including repeated words across columns. */
export function buildPageWordReview(texts, source, decisions = null) {
  const fields = {};
  const target = [];
  for (const [column, raw] of Object.entries(texts)) {
    const text = String(raw ?? '');
    fields[column] = { text, suspects: [] };
    for (const w of reviewTextWords(text)) target.push({ ...w, column });
  }
  const original = (source?.lines || []).filter((l) => l.inText !== false && !['header', 'footer', 'sep'].includes(l.stream))
    .flatMap((l) => l.reviewWords ? list(l.reviewWords) : list(l.words).some((w) => typeof w?.text === 'string' && probability(w.conf) !== null) ? reviewWordsOfLine(l, { proof: true }) : []);
  const A = original.map((w) => keyOf(w.text));
  const B = target.map((w) => keyOf(w.text));
  const aligned = unchangedWords(A, B);
  const approved = acceptedWordIndexes(B, decisions);
  const accepted = [];
  target.forEach((w, j) => {
    const model = original[aligned.get(j)];
    const reasons = [...new Set([...(model?.reasons || []), ...shapeReasons(w.text)])];
    if (reasons.length) {
      const suspect = { ...w, reasons, suggestions: model?.suggestions || [], conf: model?.conf ?? null, p: model?.p ?? null };
      if (approved.has(j)) accepted.push(suspect);
      else fields[w.column].suspects.push(suspect);
    }
  });
  const suspects = Object.values(fields).flatMap((f) => f.suspects);
  return { fields, suspects, accepted, count: suspects.length, available: original.length > 0 };
}

function acceptedWordIndexes(words, decisions) {
  if (!validOcrReviewState(decisions)) return new Set();
  const approved = new Set(decisions.accepted);
  return new Set([...unchangedWords(decisions.words, words)].filter(([, old]) => approved.has(old)).map(([now]) => now));
}

/** Rebase previous approvals onto the current text, then change exactly one
 * live occurrence. Returning null means the action's text/range is stale. */
export function setWordReviewAccepted(texts, decisions, suspect, revision, accept = true) {
  const target = Object.entries(texts).flatMap(([column, text]) => reviewTextWords(text).map((w) => ({ ...w, column })));
  const index = target.findIndex((w) => w.column === suspect.column && w.start === suspect.start && w.end === suspect.end && w.text === suspect.text);
  if (index < 0 || typeof revision !== 'string') return null;
  const words = target.map((w) => keyOf(w.text));
  const accepted = acceptedWordIndexes(words, decisions?.revision === revision ? decisions : null);
  if (accept) accepted.add(index);
  else accepted.delete(index);
  const next = { version: 1, revision, words, accepted: [...accepted].sort((a, b) => a - b) };
  return validOcrReviewState(next) ? next : null;
}

/** Consumers must never decorate old offsets between an input event and React's
 * next render. Shape-only fallback is also used by standalone editor surfaces. */
export function wordReviewForText(text, review) {
  if (review?.text === text) return review.suspects;
  return reviewTextWords(text).flatMap((w) => {
    const reasons = shapeReasons(w.text);
    return reasons.length ? [{ ...w, reasons, suggestions: [] }] : [];
  });
}

/** Replace only visible text; leave formatting, image attributes and entities
 * intact. Revalidate offsets against the field's live value before applying. */
export function replaceReviewedWord(value, suspect, replacement) {
  if (typeof replacement !== 'string' || /[<>\r\n]/u.test(replacement)) return null;
  const current = reviewTextWords(value).find((w) => w.start === suspect.start && w.end === suspect.end && w.text === suspect.text);
  if (!current) return null;
  const remaining = Array.from(replacement);
  const parts = current.segments.map((s, i) => {
    const length = i === current.segments.length - 1 ? remaining.length : Array.from(value.slice(s.start, s.end)).length;
    return remaining.splice(0, length).join('');
  });
  let next = value;
  for (let i = current.segments.length - 1; i >= 0; i--) {
    const s = current.segments[i];
    next = next.slice(0, s.start) + parts[i] + next.slice(s.end);
  }
  return { value: next, start: current.start, end: current.end + replacement.length - current.text.length };
}
