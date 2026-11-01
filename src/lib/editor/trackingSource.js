// מקורות הקואורדינטות למעקב המילה → מבנה אחיד אחד (תוכנית §5.2), ובחירת המקור הטוב
// ביותר לפי סדר עדיפות (§5.1). לוגיקה טהורה — הקורא מביא את הנתונים (API / worker /
// canvas) ומעביר כאן.
//
// המבנה האחיד (פיקסלים טבעיים של תמונת העמוד באתר):
//   { level: 'word'|'line'|'ruler'|'off', source: 'layout'|'proof'|'local'|'profile'|'manual'|null,
//     size: [w, h] | null, regions?: [{ id, stream, bbox }],
//     lines: [{ id, stream, bbox, text?, words?: [{ text?, bbox, conf? }] }] }
// מילים בכל שורה ממוינות מימין לשמאל (x יורד) — סדר הקריאה בעברית.

import { boxToSourceEnvelope, wordBox } from '../ocr/ocrLayoutGeometry.js';

/** סדר העדיפות של המקורות */
export const SOURCE_PRIORITY = Object.freeze(['layout', 'proof', 'local', 'profile', 'manual']);

/**
 * @typedef {[number, number, number, number]} Box
 * @typedef {{ text?: string, bbox: Box, conf?: number }} TrackWord
 * @typedef {{ id: string|number, stream: string, bbox: Box, text?: string, words?: TrackWord[] }} TrackLine
 * @typedef {{ id: string, stream: string, bbox: Box }} TrackRegion
 * @typedef {'word'|'line'|'ruler'|'off'} TrackLevel
 * @typedef {'layout'|'proof'|'local'|'profile'|'manual'} SourceKind
 * @typedef {{ level: TrackLevel, source: SourceKind|null, size: [number, number]|null, regions?: TrackRegion[], lines: TrackLine[] }} TrackSource
 */

/** @type {TrackSource} */
export const OFF = Object.freeze({ level: 'off', source: null, size: null, lines: [] });

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1];
const isSize = (s) => Array.isArray(s) && s.length === 2 && s.every((n) => Number.isFinite(n) && n > 0);
const isMatrix = (M) => Array.isArray(M) && M.length === 6 && M.every(Number.isFinite) && M[0] * M[4] - M[1] * M[3] !== 0;
const round2 = (v) => Math.round(v * 100) / 100;
const rbox = (b) => /** @type {Box} */ (b.map(round2));
const splitWords = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
const byXDesc = (a, b) => b.bbox[0] - a.bbox[0] || b.bbox[2] - a.bbox[2];

function finish(source, size, lines, { regions = null, level = null } = {}) {
  const ls = lines.filter((l) => isBox(l.bbox));
  if (!ls.length) return OFF;
  for (const l of ls) if (l.words) l.words.sort(byXDesc);
  const lv = level || (ls.some((l) => l.words?.length) ? 'word' : 'line');
  /** @type {TrackSource} */
  const out = { level: lv, source, size: isSize(size) ? [size[0], size[1]] : null, lines: ls };
  if (regions?.length) out.regions = regions;
  return out;
}

// טקסטים למילים: מפורשים אם יש בדיוק כמספר המילים, אחרת מפיצול טקסט השורה אם מספר
// המילים תואם, ואחרת בלי טקסט (היישור יעבור לשיוך לפי מקום)
function wordTexts(explicit, lineText, n) {
  if (Array.isArray(explicit) && explicit.length === n) return explicit.map((t) => String(t ?? ''));
  const ws = splitWords(lineText);
  return ws.length === n ? ws : null;
}

/**
 * layout v1 (OcrPageResult.layoutJson) → מבנה אחיד בפיקסלי תמונת המקור (דרך toSource).
 * @param {object|string|null} layout האובייקט או ה-JSON שלו
 * @returns {TrackSource}
 */
export function fromLayout(layout) {
  let L = layout;
  if (typeof L === 'string') {
    try {
      L = JSON.parse(L);
    } catch {
      return OFF;
    }
  }
  if (!L || typeof L !== 'object' || L.layoutVersion !== 1 || !Array.isArray(L.lines)) return OFF;
  const M = isMatrix(L.toSource) ? L.toSource : [1, 0, 0, 0, 1, 0];
  const env = (b) => rbox(boxToSourceEnvelope(M, b));
  const size = [L.image?.width, L.image?.height];
  const frames = Array.isArray(L.frames) ? L.frames.filter((f) => f && isBox(f.bbox)) : [];
  const frameOrder = new Map(frames.map((f) => [f.fid, Number.isFinite(f.order) ? f.order : Infinity]));
  const src = L.lines
    .filter((l) => l && isBox(l.bbox))
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => {
      const oa = Number.isFinite(a.l.order) ? a.l.order : frameOrder.get(a.l.fid) ?? Infinity;
      const ob = Number.isFinite(b.l.order) ? b.l.order : frameOrder.get(b.l.fid) ?? Infinity;
      return oa - ob || a.l.bbox[1] - b.l.bbox[1] || a.idx - b.idx;
    });
  const streamOfFrame = new Map();
  const lines = src.map(({ l, idx }) => {
    const stream = typeof l.stream === 'string' && l.stream ? l.stream : 'main';
    if (l.fid && !streamOfFrame.has(l.fid)) streamOfFrame.set(l.fid, stream);
    const text = typeof l.corrected === 'string' ? l.corrected : typeof l.text === 'string' ? l.text : '';
    /** @type {TrackLine} */
    const out = { id: Number.isInteger(l.k) ? l.k : idx, stream, bbox: env(l.bbox), text };
    const ws = Array.isArray(l.words) ? l.words.filter((w) => Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1]) && w[1] >= w[0]) : [];
    if (ws.length) {
      const texts = wordTexts(l.wordTexts, text, ws.length);
      out.words = ws.map((w, i) => {
        /** @type {TrackWord} */
        const tw = { bbox: env(wordBox(l, w)) };
        if (texts) tw.text = texts[i];
        if (Number.isFinite(w[2])) tw.conf = w[2];
        return tw;
      });
    }
    return out;
  });
  const regions = frames.map((f) => ({ id: String(f.fid), stream: f.stream || streamOfFrame.get(f.fid) || f.role || 'main', bbox: env(f.bbox) }));
  return finish('layout', size, lines, { regions });
}

/**
 * PageProofPage.doc → מבנה אחיד. imageSize — ממדי התמונה המוצגת אם שונים מ-doc.size
 * (מצב-קישור: תמונת-האתר באותו יחס) — הקואורדינטות מוקטנות/מוגדלות בהתאם.
 * @param {any} doc
 * @param {{ imageSize?: [number, number]|null }} [opts]
 * @returns {TrackSource}
 */
export function fromProof(doc, { imageSize = null } = {}) {
  if (!doc || !Array.isArray(doc.lines)) return OFF;
  const base = isSize(doc.size) ? doc.size : null;
  const size = isSize(imageSize) ? imageSize : base;
  const sx = base && size ? size[0] / base[0] : 1;
  const sy = base && size ? size[1] / base[1] : 1;
  const sc = (b) => rbox([b[0] * sx, b[1] * sy, b[2] * sx, b[3] * sy]);
  const lines = doc.lines
    .filter((l) => l && l.status !== 'removed' && isBox(l.bbox))
    .map((l) => {
      const text = typeof l.text === 'string' ? l.text : '';
      /** @type {TrackLine} */
      const out = { id: l.id, stream: typeof l.stream === 'string' && l.stream ? l.stream : 'main', bbox: sc(l.bbox), text };
      const raw = Array.isArray(l.words) ? l.words : [];
      const tokens = splitWords(text);
      const ws = [];
      raw.forEach((w, i) => {
        const b = w?.bbox;
        if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || !(b[2] > b[0])) return;
        const box = b[3] > b[1] ? b : [b[0], l.bbox[1], b[2], l.bbox[3]];
        /** @type {TrackWord} */
        const tw = { bbox: sc(box) };
        const t = typeof w.text === 'string' ? w.text : tokens.length === raw.length ? tokens[i] : undefined;
        if (t !== undefined) tw.text = t;
        if (Number.isFinite(w.conf)) tw.conf = w.conf;
        ws.push(tw);
      });
      if (ws.length) out.words = ws;
      return out;
    });
  const regions = (Array.isArray(doc.frames) ? doc.frames : [])
    .filter((f) => f && isBox(f.bbox))
    .map((f, i) => ({ id: String(f.fid ?? i), stream: typeof f.stream === 'string' && f.stream ? f.stream : 'main', bbox: sc(f.bbox) }));
  return finish('proof', size, lines, { regions });
}

const tbox = (b) => (b && [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) ? [b.x0, b.y0, b.x1, b.y1] : null);

// tesseract.js: data.lines (גרסאות ישנות) או data.blocks[].paragraphs[].lines (v5+)
function tesseractLines(data) {
  if (Array.isArray(data?.lines) && data.lines.length) return data.lines;
  const out = [];
  for (const b of data?.blocks || []) for (const p of b?.paragraphs || []) for (const l of p?.lines || []) out.push(l);
  return out;
}

/**
 * תוצאת tesseract.js (result או result.data) → מבנה אחיד. scale — פי כמה הוגדלה התמונה
 * שנשלחה לזיהוי ביחס לתמונה הטבעית (התיבות מחולקות בו).
 * @param {any} result
 * @param {{ size?: [number, number]|null, scale?: number, stream?: string }} [opts]
 * @returns {TrackSource}
 */
export function fromTesseract(result, { size = null, scale = 1, stream = 'main' } = {}) {
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const sc = (b) => rbox(b.map((v) => v / k));
  let maxX = 0;
  let maxY = 0;
  const lines = tesseractLines(data)
    .map((l, i) => {
      const lb = tbox(l?.bbox);
      if (!lb || !isBox(lb)) return null;
      maxX = Math.max(maxX, lb[2] / k);
      maxY = Math.max(maxY, lb[3] / k);
      const words = (l.words || [])
        .map((w) => {
          const b = tbox(w?.bbox);
          if (!b || !isBox(b) || !String(w.text ?? '').trim()) return null;
          /** @type {TrackWord} */
          const tw = { text: String(w.text).trim(), bbox: sc(b) };
          if (Number.isFinite(w.confidence)) tw.conf = Math.max(0, Math.min(1, w.confidence / 100));
          return tw;
        })
        .filter(Boolean);
      /** @type {TrackLine} */
      const out = { id: `t${i}`, stream, bbox: sc(lb), text: String(l.text ?? '').trim() };
      if (words.length) out.words = /** @type {TrackWord[]} */ (words);
      return out;
    })
    .filter(Boolean);
  return finish('local', isSize(size) ? size : [Math.ceil(maxX), Math.ceil(maxY)], /** @type {TrackLine[]} */ (lines));
}

/**
 * חלוקת שורות לטורים לפי המיקום האופקי (זיהוי מקומי מחזיר את כל השורות בזרם אחד): קו
 * חלוקה בפער הגדול ביותר בין מרכזי השורות הצרות (עד wideRatio מרוחב הטקסט), ורק אם הוא
 * באמת מפריד — לפחות minGap מהרוחב, לפחות minLines שורות בכל צד, וכמעט אף שורה צרה לא חוצה
 * אותו. שורה צרה → 'right'/'left' לפי מרכזה; שורה רחבה שחוצה את הקו → 'main'. הסדר לא משתנה.
 * בלי חלוקה ברורה — המקור כמו שהוא.
 * @param {TrackSource} source
 * @param {{ wideRatio?: number, minGap?: number, minLines?: number, maxCross?: number }} [o]
 * @returns {TrackSource}
 */
export function splitColumnStreams(source, { wideRatio = 0.6, minGap = 0.15, minLines = 3, maxCross = 0.1 } = {}) {
  const ls = (source?.lines || []).filter((l) => isBox(l?.bbox));
  if (ls.length < 2 * minLines) return source;
  const x0 = Math.min(...ls.map((l) => l.bbox[0]));
  const x1 = Math.max(...ls.map((l) => l.bbox[2]));
  const span = x1 - x0;
  if (!(span > 0)) return source;
  const narrow = ls.filter((l) => l.bbox[2] - l.bbox[0] <= wideRatio * span);
  if (narrow.length < 2 * minLines) return source;
  const cs = narrow.map((l) => (l.bbox[0] + l.bbox[2]) / 2).sort((a, b) => b - a);
  let at = -1;
  let gap = 0;
  for (let i = 1; i < cs.length; i++) if (cs[i - 1] - cs[i] > gap) [at, gap] = [i, cs[i - 1] - cs[i]];
  if (at < minLines || cs.length - at < minLines || gap < minGap * span) return source;
  // קו החלוקה: באמצע התעלה בין הקצה השמאלי (החציוני) של הטור הימני לקצה הימני (החציוני)
  // של השמאלי — חציון ולא קיצון, כדי ששורה חריגה אחת (כותרת באמצע) לא תזיז אותו
  const mid = (cs[at - 1] + cs[at]) / 2;
  const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
  const rightEdge = med(narrow.filter((l) => (l.bbox[0] + l.bbox[2]) / 2 > mid).map((l) => l.bbox[0]));
  const leftEdge = med(narrow.filter((l) => (l.bbox[0] + l.bbox[2]) / 2 <= mid).map((l) => l.bbox[2]));
  const cut = rightEdge > leftEdge ? (rightEdge + leftEdge) / 2 : mid;
  const crosses = (l) => l.bbox[0] < cut - 0.01 * span && l.bbox[2] > cut + 0.01 * span;
  if (narrow.filter(crosses).length > maxCross * narrow.length) return source;
  const lines = source.lines.map((l) => {
    if (!isBox(l?.bbox)) return l;
    const wide = l.bbox[2] - l.bbox[0] > wideRatio * span;
    const stream = wide && crosses(l) ? 'main' : (l.bbox[0] + l.bbox[2]) / 2 > cut ? 'right' : 'left';
    return stream === l.stream ? l : { ...l, stream };
  });
  return { ...source, lines };
}

/**
 * תוצאת פרופיל ההקרנה (projectionProfile) → מבנה אחיד.
 * @param {{ size?: [number, number], lines?: { bbox: Box, stream?: string, words?: ({ x0: number, x1: number }|[number, number])[] }[] }|null} profile
 * @returns {TrackSource}
 */
export function fromProfile(profile) {
  if (!profile || !Array.isArray(profile.lines)) return OFF;
  const lines = profile.lines
    .filter((l) => l && isBox(l.bbox))
    .map((l, i) => {
      /** @type {TrackLine} */
      const out = { id: `p${i}`, stream: l.stream || 'main', bbox: rbox(l.bbox) };
      if (typeof l.paraEnd === 'boolean') out.paraEnd = l.paraEnd;
      const ws = (l.words || [])
        .map((w) => (Array.isArray(w) ? { x0: w[0], x1: w[1] } : w))
        .filter((w) => w && Number.isFinite(w.x0) && Number.isFinite(w.x1) && w.x1 > w.x0)
        .map((w) => ({ bbox: rbox([w.x0, l.bbox[1], w.x1, l.bbox[3]]) }));
      if (ws.length) out.words = /** @type {TrackWord[]} */ (ws);
      return out;
    });
  return finish('profile', profile.size, lines);
}

/**
 * סרגל ידני → שורות במרווח קבוע מ-y כלפי מטה (count שורות, או עד תחתית התמונה).
 * @param {{ size?: [number, number], x0: number, x1: number, y: number, pitch: number, count?: number, stream?: string }|null} ruler
 * @returns {TrackSource}
 */
export function fromRuler(ruler) {
  if (!ruler || ![ruler.x0, ruler.x1, ruler.y, ruler.pitch].every(Number.isFinite) || !(ruler.pitch > 0) || !(ruler.x1 > ruler.x0)) return OFF;
  const H = isSize(ruler.size) ? ruler.size[1] : ruler.y + ruler.pitch;
  const max = Number.isInteger(ruler.count) && ruler.count > 0 ? ruler.count : Math.max(1, Math.floor((H - ruler.y) / ruler.pitch));
  const lines = [];
  for (let i = 0; i < Math.min(max, 1000); i++) {
    const y0 = ruler.y + i * ruler.pitch;
    lines.push({ id: `r${i}`, stream: ruler.stream || 'main', bbox: rbox([ruler.x0, y0, ruler.x1, y0 + ruler.pitch]) });
  }
  return finish('manual', ruler.size, lines, { level: 'ruler' });
}

const NORMALIZERS = { layout: fromLayout, proof: fromProof, local: fromTesseract, profile: fromProfile, manual: fromRuler };

/**
 * מקור אחד → מבנה אחיד.
 * @param {SourceKind} kind
 * @param {any} input
 * @param {object} [opts]
 * @returns {TrackSource}
 */
export function normalizeSource(kind, input, opts = {}) {
  const fn = Object.hasOwn(NORMALIZERS, kind) ? NORMALIZERS[kind] : null;
  if (!fn || input == null) return OFF;
  return fn(input, opts);
}

const LEVEL_RANK = { off: 0, ruler: 1, line: 2, word: 3 };

/**
 * המקור הראשון לפי סדר העדיפות שנותן משהו (level ≠ 'off').
 * @param {Partial<Record<SourceKind, any>>} inputs
 * @param {{ order?: SourceKind[], minLevel?: TrackLevel, opts?: Partial<Record<SourceKind, object>> }} [o]
 *   minLevel — לדלג על מקור ברמה נמוכה ממנה (למשל 'word' כדי להעדיף מילים מקומיות על פני
 *   layout ברמת שורה); אם אף מקור לא עומד בה — הראשון שנותן משהו
 * @returns {TrackSource}
 */
export function pickSource(inputs, { order = /** @type {SourceKind[]} */ ([...SOURCE_PRIORITY]), minLevel = 'ruler', opts = {} } = {}) {
  let fallback = OFF;
  for (const kind of order) {
    const s = normalizeSource(kind, inputs?.[kind], opts?.[kind]);
    if (s.level === 'off') continue;
    if (LEVEL_RANK[s.level] >= LEVEL_RANK[minLevel]) return s;
    if (fallback === OFF) fallback = s;
  }
  return fallback;
}

/**
 * הזרמים שבמקור, בסדר הופעתם.
 * @param {TrackSource} src
 */
export const streamsOf = (src) => [...new Set((src?.lines || []).map((l) => l.stream))];

/**
 * שורות זרם אחד בסדר הקריאה.
 * @param {TrackSource} src
 * @param {string} stream
 */
export const streamLines = (src, stream) => (src?.lines || []).filter((l) => l.stream === stream);
