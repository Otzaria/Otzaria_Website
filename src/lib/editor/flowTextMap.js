// Align flowing editor text to OCR words in reading order. Geometry-only paragraph
// matching cannot identify words reliably, especially across a column boundary.
import { lineStarts, lineWords, splitLines } from './caretWord.js';
import { alignLine, normalizeWord, unionBox } from './wordAlign.js';

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const MAX_CELLS = 40_000;

// Unique shared words provide ordered anchors. The longest increasing subsequence
// avoids accepting a moved/reordered word as an anchor for the rest of the page.
function anchors(A, B) {
  const unique = (xs) => {
    const map = new Map();
    xs.forEach((s, i) => { if (s) map.set(s, map.has(s) ? -1 : i); });
    return map;
  };
  const a = unique(A);
  const b = unique(B);
  const pairs = [...a].filter(([s, i]) => i >= 0 && b.get(s) >= 0).map(([s, i]) => [i, b.get(s)]);
  const tails = [];
  const prev = new Int32Array(pairs.length).fill(-1);
  pairs.forEach((p, i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pairs[tails[mid]][1] < p[1]) lo = mid + 1; else hi = mid; }
    if (lo) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const out = [];
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.push(pairs[i]);
  return out.reverse();
}

export function buildFlowTextMap(text, lines) {
  const scan = [];
  for (let si = 0; si < lines.length; si++) {
    const ws = (lines[si].words || []).filter((w) => isBox(w?.bbox));
    // Incomplete word labels must retain the geometry-only fallback.
    if (!ws.length || ws.some((w) => typeof w.text !== 'string' || !w.text.trim())) return null;
    for (const w of [...ws].sort((a, b) => b.bbox[2] - a.bbox[2])) scan.push({ ...w, si });
  }
  const starts = lineStarts(text);
  const words = splitLines(text).flatMap((s, li) => lineWords(s).map((w) => ({ text: w.text.replace(/<[^>]*>/g, ''), off: starts[li] + w.start }))).filter((w) => w.text.trim());
  if (!words.length || !scan.length) return null;
  const A = words.map((w) => normalizeWord(w.text));
  const B = scan.map((w) => normalizeWord(w.text));
  const matches = new Array(words.length).fill(null);
  const exact = (i, j) => { matches[i] = { scanIndexes: [j], confident: true }; };
  const gap = (a, ae, b, be) => {
    while (a < ae && b < be && A[a] === B[b]) exact(a++, b++);
    while (a < ae && b < be && A[ae - 1] === B[be - 1]) exact(--ae, --be);
    if (a === ae || b === be || (ae - a + 1) * (be - b + 1) > MAX_CELLS) return;
    alignLine(words.slice(a, ae).map((w) => w.text), scan.slice(b, be)).forEach((m, i) => {
      if (m.scanIndexes.length) matches[a + i] = { ...m, scanIndexes: m.scanIndexes.map((j) => j + b) };
    });
  };
  let a = 0, b = 0;
  for (const [i, j] of anchors(A, B)) { gap(a, i, b, j); exact(i, j); a = i + 1; b = j + 1; }
  gap(a, A.length, b, B.length);
  const targets = words.map((w, i) => {
    const m = matches[i];
    const hit = m?.scanIndexes.map((j) => scan[j]);
    if (!hit?.length) return { off: w.off, si: null, box: null, confident: false };
    // A joined word spanning scan lines gets a box on its first line only.
    const si = hit[0].si;
    return { off: w.off, si, box: unionBox(hit.filter((h) => h.si === si).map((h) => h.bbox)), confident: m.confident };
  });
  return { targets, byOffset: new Map(targets.map((t) => [t.off, t])) };
}

export function textMappedCaret(out, c, mapping, lines) {
  const off = c.word >= 0 ? c.lineStart + c.words[c.word].start : null;
  const hit = off == null ? null : mapping.byOffset.get(off);
  if (hit?.si != null) return { ...out, scanIndex: hit.si, lineBox: lines[hit.si].bbox, wordBox: hit.box, kind: hit.confident ? 'solid' : 'dashed', confident: hit.confident };
  // An inserted word has no physical counterpart: reveal the nearest mapped line
  // without drawing a word box over an unrelated printed word.
  let nearest = null;
  const pos = off ?? c.lineStart + c.col;
  for (const t of mapping.targets) if (t.si != null && (!nearest || Math.abs(t.off - pos) < Math.abs(nearest.off - pos))) nearest = t;
  return nearest ? { ...out, scanIndex: nearest.si, lineBox: lines[nearest.si].bbox, lineEstimated: true } : out;
}
