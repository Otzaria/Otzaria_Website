// הסמן בטקסט ↔ שורה ומילה בצילום (לוגיקה טהורה): מחבר את caretWord, lineAlign,
// wordAlign ו-scanFollow לחישוב אחד שה-hook (src/hooks/useWordTracking.js) מריץ בכל
// תזוזת סמן, ואת הכיוון ההפוך — לחיצה על הצילום → היסט בטקסט. הקואורדינטות כמו
// במקור (TrackSource) — ההמרה לפיקסלי התמונה המוצגת (scaleBox) בצד המצייר.

import { caretInfo, lineCount, lineStarts, lineWords, offsetOfWord, splitLines } from './caretWord.js';
import { alignLines, nearestAlignedLine } from './lineAlign.js';
import { wordBoxFor } from './scanFollow.js';
import { streamLines, streamsOf } from './trackingSource.js';
import { buildFlow, countsAgree, flowCaret, flowLineAgreement, flowOffsetFromScan, pickTarget, scanTargets, shouldUseFlow } from './flowTrack.js';

/** זרמים שאינם חלק מהטקסט שמקלידים (כותרת עליונה / שורה תחתונה מזיהוי הצילום) */
const EDGE_STREAMS = new Set(['header', 'footer']);

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);

/**
 * @typedef {import('./trackingSource.js').TrackSource} TrackSource
 * @typedef {import('./trackingSource.js').TrackLine} TrackLine
 * @typedef {import('./lineAlign.js').LineMatch} LineMatch
 */

/**
 * שורות הצילום שמולן עובד ה-textarea הנוכחי.
 * עמוד בטור אחד — כל השורות בסדר הקריאה (כותרת, גוף, ריהוט — כמו הטקסט שהזיהוי כתב
 * לעמוד). שני טורים בטקסט: אם בצילום בדיוק שני זרמים — ימין לראשון
 * ושמאל לשני (סדר הקריאה), עם מעקב מילה; יותר משני זרמים — לפי מיקומם
 * האופקי (columnStreamGroups); אחרת — כל השורות, ברמת שורה בלבד (שורה i של
 * הטור אינה בהכרח המילים של שורה i בצילום).
 * @param {TrackSource|null} source
 * @param {{ twoColumns?: boolean, column?: 'content'|'right'|'left'|null }} [o]
 * @returns {{ stream: string|null, lines: TrackLine[], wordLevel: boolean }}
 */
export function linesForColumn(source, { twoColumns = false, column = null } = {}) {
  // כותרת עליונה / שורה תחתונה של הדף (מזיהוי הצילום) אינן חלק מהטקסט שמקלידים
  const all = streamsOf(source);
  const streams = all.filter((s) => !EDGE_STREAMS.has(s));
  const body = (source?.lines || []).filter((l) => streams.includes(l.stream));
  if (!streams.length) return { stream: null, lines: [], wordLevel: false };
  if (!twoColumns) return { stream: streams.length === 1 ? streams[0] : null, lines: body, wordLevel: true };
  if (streams.length === 2) {
    const s = column === 'left' ? streams[1] : streams[0];
    return { stream: s, lines: streamLines(source, s), wordLevel: true };
  }
  // יותר משני זרמים (למשל ימין + שמאל + פסקה ברוחב העמוד, או טור שנחתך לשניים): מחלקים לפי
  // המיקום האופקי — הזרמים שבחצי הימני לטור הימני ושבחצי השמאלי לשמאלי; זרם ברוחב העמוד — לאף אחד
  const groups = streams.length > 2 ? columnStreamGroups(body, streams) : null;
  if (groups) {
    const set = new Set(column === 'left' ? groups.left : groups.right);
    const lines = body.filter((l) => set.has(l.stream));
    return { stream: set.size === 1 ? [...set][0] : null, lines, wordLevel: true };
  }
  return { stream: null, lines: body, wordLevel: false };
}

/**
 * חלוקת זרמי הצילום לשני טורים לפי מרכזם האופקי (טקסט בשני טורים מול יותר משני זרמים). זרם רחב
 * (מעל wideRatio מרוחב הטקסט בעמוד) אינו שייך לטור. החלוקה — בפער הגדול ביותר בין מרכזי הזרמים
 * הצרים, ורק אם הוא באמת מפריד (≥ minGap מהרוחב) ושני הצדדים לא ריקים; אחרת null.
 * @param {{ stream?: string, bbox: number[] }[]} lines
 * @param {string[]} streams
 * @param {{ wideRatio?: number, minGap?: number }} [o]
 * @returns {{ right: string[], left: string[] }|null}
 */
export function columnStreamGroups(lines, streams, { wideRatio = 0.6, minGap = 0.15 } = {}) {
  const ext = new Map();
  for (const l of lines) {
    if (!isBox(l?.bbox) || !streams.includes(l.stream)) continue;
    const e = ext.get(l.stream) || [Infinity, -Infinity];
    ext.set(l.stream, [Math.min(e[0], l.bbox[0]), Math.max(e[1], l.bbox[2])]);
  }
  if (ext.size < 2) return null;
  const x0 = Math.min(...[...ext.values()].map((e) => e[0]));
  const x1 = Math.max(...[...ext.values()].map((e) => e[1]));
  const span = x1 - x0;
  if (!(span > 0)) return null;
  const narrow = [...ext].filter(([, e]) => e[1] - e[0] <= wideRatio * span).map(([s, e]) => ({ s, c: (e[0] + e[1]) / 2 }));
  if (narrow.length < 2) return null;
  narrow.sort((a, b) => b.c - a.c); // מימין לשמאל
  let at = -1;
  let gap = 0;
  for (let i = 1; i < narrow.length; i++) {
    const d = narrow[i - 1].c - narrow[i].c;
    if (d > gap) [at, gap] = [i, d];
  }
  if (at < 0 || gap < minGap * span) return null;
  const order = (xs) => streams.filter((s) => xs.includes(s));
  return { right: order(narrow.slice(0, at).map((x) => x.s)), left: order(narrow.slice(at).map((x) => x.s)) };
}

/** @type {WeakMap<object, { text: string, al: LineMatch[] }>} */
const LAST_ALIGNMENT = new WeakMap();

/**
 * יישור שורות הטקסט מול שורות הצילום (lineAlign.alignLines).
 * @param {string} text
 * @param {TrackLine[]} scanLines
 * @returns {LineMatch[]}
 */
export function lineAlignmentFor(text, scanLines) {
  // היישור האחרון לכל מערך שורות נשמר: בדיקת העקביות (usePageTracking, בזמן פנוי) והמעקב
  // (useWordTracking, בהקשה) מבקשים את אותו יישור — מחושב פעם אחת, ובבדיקה מראש (מחומם)
  const key = scanLines && typeof scanLines === 'object' ? scanLines : null;
  const hit = key ? LAST_ALIGNMENT.get(key) : null;
  if (hit && hit.text === text) return hit.al;
  const al = alignLines(splitLines(text), scanLines || []);
  // טקסט בפסקאות (לא שורה-מול-שורה) — מצרפים מודל "טקסט זורם", ו-trackCaret/offsetFromScan
  // עוברים אליו. נשמר כמאפיין לא-ספיר כדי שהמערך יישאר LineMatch[] רגיל לשאר הקוראים.
  if (shouldUseFlow(text, scanLines)) {
    const flow = buildFlow(text, scanLines);
    if (flow) Object.defineProperty(al, 'flow', { value: flow, enumerable: false });
  }
  if (key) LAST_ALIGNMENT.set(key, { text, al });
  return al;
}

/**
 * עקביות היישור: בכמה משורות הצילום מספר המילים שיושרו אליהן מהטקסט קרוב למספר המילים
 * שזוהו בהן. טקסט זורם — flowLineAgreement; שורה-מול-שורה — כל שורת צילום שמולה שורה אחת
 * (identity/match): מספר המילים בשורת הטקסט מול מספר המילים שזוהו בה. שורות בלי מילים
 * מזוהות לא נספרות.
 * @param {string} text
 * @param {TrackLine[]} scanLines
 * @param {LineMatch[]|null} [alignment]
 * @returns {{ agree: number, total: number }}
 */
export function alignmentAgreement(text, scanLines, alignment = null) {
  const S = scanLines || [];
  const al = alignment || lineAlignmentFor(text, S);
  if (al.flow) return flowLineAgreement(S, al.flow);
  const ls = splitLines(text);
  let agree = 0;
  let total = 0;
  al.forEach((m, i) => {
    if (m?.scanIndex == null || (m.kind !== 'identity' && m.kind !== 'match')) return;
    const n = (S[m.scanIndex]?.words || []).filter((w) => isBox(w?.bbox)).length;
    if (!n) return;
    total++;
    if (countsAgree(lineWords(ls[i] ?? '').length, n)) agree++;
  });
  return { agree, total };
}

/** מטמון יישורי-מילים לפי (שורת צילום, טקסט השורה) — חוסך DP בכל תזוזת סמן באותה שורה */
export function createWordAlignCache(max = 300) {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      if (m.size >= max) m.clear();
      m.set(k, v);
    },
    clear: () => m.clear(),
    get size() {
      return m.size;
    },
  };
}

/**
 * @typedef {object} CaretTrack
 * @property {number} line        שורת הסמן בטקסט (מ-0)
 * @property {number} word        מילת הסמן בשורה (מ-0; -1 בשורה בלי מילים)
 * @property {number} lineWords   מספר המילים בשורה
 * @property {number} lineCount   מספר השורות בטקסט
 * @property {number|null} scanIndex שורת הצילום (אינדקס ב-scanLines) או null
 * @property {boolean} lineEstimated  לשורה אין שורה משלה בצילום (נוספה) — השכנה הקרובה
 * @property {number[]|null} lineBox
 * @property {number[]|null} wordBox
 * @property {'solid'|'dashed'|'under'|null} kind
 * @property {boolean} confident  מספר המילים ביחידה (שורה / קבוצת פסקאות) בטקסט ובצילום קרובים
 *   — אפשר לסמוך על מסגרת המילה; false — הפריסה כנראה לא זוהתה נכון ביחידה הזו
 */

/**
 * מה מציירים לסמן במיקום pos.
 * @param {string} text
 * @param {number} pos
 * @param {TrackLine[]} scanLines
 * @param {{ alignment?: LineMatch[]|null, wordLevel?: boolean, cache?: ReturnType<typeof createWordAlignCache>|null }} [o]
 * @returns {CaretTrack}
 */
export function trackCaret(text, pos, scanLines, { alignment = null, wordLevel = true, cache = null } = {}) {
  const S = scanLines || [];
  const al = alignment || lineAlignmentFor(text, S);
  if (al.flow) return flowCaret(text, pos, S, al.flow);
  const c = caretInfo(text, pos);
  /** @type {CaretTrack} */
  const out = { line: c.line, word: c.word, lineWords: c.words.length, lineCount: lineCount(text), scanIndex: null, lineEstimated: false, lineBox: null, wordBox: null, kind: null, confident: false };
  const own = al[c.line]?.scanIndex;
  const scanIndex = own ?? nearestAlignedLine(al, c.line);
  if (scanIndex == null || !S[scanIndex] || !isBox(S[scanIndex].bbox)) return out;
  out.scanIndex = scanIndex;
  out.lineEstimated = own == null;
  const line = S[scanIndex];
  out.lineBox = line.bbox;
  // שורה מוערכת — רק הפס; מסגרת מילה בה הייתה מטעה
  if (out.lineEstimated || c.word < 0) return out;
  const scanLine = wordLevel ? line : { bbox: line.bbox };
  const key = `${scanIndex}\u0000${c.lineText}`;
  const cached = wordLevel && cache ? cache.get(key) : null;
  const r = wordBoxFor(scanLine, c, { alignment: cached || null });
  if (wordLevel && cache && r.alignment && !cached) cache.set(key, r.alignment);
  out.wordBox = r.box;
  out.kind = r.kind;
  // שורה שיושרה אחת-לאחת ומספר המילים בה קרוב למספר המילים שזוהו בצילום
  const kindOk = al[c.line]?.kind === 'identity' || al[c.line]?.kind === 'match';
  out.confident = wordLevel && kindOk && countsAgree(c.words.length, (line.words || []).filter((w) => isBox(w?.bbox)).length);
  return out;
}

/**
 * לחיצה על שורה/מילה בצילום → היסט בטקסט (תחילת המילה המתאימה). -1 כשאין שורה מתאימה.
 * ההופכי המדויק של trackCaret: המילה בטקסט שהמעקב קדימה מסמן בנקודה שנלחצה (pickTarget) —
 * כולל מילים שמיקומן משוער ומילה אחת בצילום שהיא שתיים בטקסט (לפי x בתוך התיבה).
 * @param {string} text
 * @param {TrackLine[]} scanLines
 * @param {LineMatch[]|null} alignment
 * @param {number} scanIndex
 * @param {number|null} [scanWord] אינדקס במילים התקינות של השורה (כמו hitTestScan)
 * @param {{ x?: number|null, wordLevel?: boolean, cache?: ReturnType<typeof createWordAlignCache>|null }} [o]
 *   x — נקודת הלחיצה (קואורדינטות המקור); בלעדיה — מרכז המילה scanWord, או תחילת השורה
 */
export function offsetFromScan(text, scanLines, alignment, scanIndex, scanWord = null, { x = null, wordLevel = true, cache = null } = {}) {
  const S = scanLines || [];
  if (!Number.isInteger(scanIndex) || !S[scanIndex]) return -1;
  const al = alignment || lineAlignmentFor(text, S);
  const line = S[scanIndex];
  const words = (line.words || []).filter((w) => isBox(w?.bbox));
  const wb = Number.isInteger(scanWord) && scanWord >= 0 ? words[scanWord]?.bbox : null;
  const px = Number.isFinite(x) ? x : isBox(wb) ? (wb[0] + wb[2]) / 2 : isBox(line.bbox) ? line.bbox[2] : NaN;
  if (al.flow) return flowOffsetFromScan(text, S, al.flow, scanIndex, px);
  let li = al.findIndex((m) => m?.scanIndexes?.includes(scanIndex));
  if (li < 0) {
    // שורת צילום שאין לה שורה בטקסט — השורה בטקסט שממופה לשורת הצילום הקרובה לפניה
    for (let j = scanIndex - 1; j >= 0 && li < 0; j--) li = al.findIndex((m) => m?.scanIndexes?.includes(j));
    if (li < 0) return -1;
    return offsetOfWord(text, li, 0);
  }
  if (!Number.isFinite(px)) return offsetOfWord(text, li, 0);
  // כל מילות שורות הטקסט שממופות לשורת הצילום הזו, והיכן המעקב קדימה מסמן כל אחת
  const starts = lineStarts(text);
  const ls = splitLines(text);
  const offs = [];
  al.forEach((m, k) => {
    if (!m?.scanIndexes?.includes(scanIndex)) return;
    for (const w of lineWords(ls[k] ?? '')) offs.push(starts[k] + w.start);
  });
  const targets = scanTargets(offs, (off) => trackCaret(text, off, S, { alignment: al, wordLevel, cache }));
  const t = pickTarget(targets.filter((q) => q.si === scanIndex), scanIndex, px);
  return t ? t.off : offsetOfWord(text, li, 0);
}

/**
 * איזו שורה/מילה בנקודה (x, y) בקואורדינטות המקור. pad — סבולת אופקית סביב תיבת השורה;
 * padY — סבולת אנכית (ברירת מחדל pad), כדי שלחיצה ברווח שבין השורות תיתפס בשורה הקרובה.
 * המילה — המילה שמתחת ל-x בשורה, או הקרובה אליה (null רק בשורה בלי מילים).
 * @param {TrackLine[]} lines
 * @param {number} x
 * @param {number} y
 * @param {number} [pad]
 * @param {number} [padY]
 * @returns {{ line: number, word: number|null }|null}
 */
export function hitTestScan(lines, x, y, pad = 4, padY = pad) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best = -1;
  let bestD = Infinity;
  (lines || []).forEach((l, i) => {
    const b = l?.bbox;
    if (!isBox(b) || x < b[0] - pad || x > b[2] + pad || y < b[1] - padY || y > b[3] + padY) return;
    // בתוך השורה — 0; מחוצה לה — המרחק מהקצה הקרוב
    const d = y < b[1] ? b[1] - y : y > b[3] ? y - b[3] : 0;
    const c = Math.abs(y - (b[1] + b[3]) / 2);
    if (d < bestD || (d === bestD && best >= 0 && c < Math.abs(y - (lines[best].bbox[1] + lines[best].bbox[3]) / 2))) [best, bestD] = [i, d];
  });
  if (best < 0) return null;
  const words = (lines[best].words || []).filter((w) => isBox(w?.bbox));
  let word = null;
  let wd = Infinity;
  words.forEach((w, j) => {
    const [x0, , x1] = w.bbox;
    const d = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    if (d < wd) [word, wd] = [j, d];
  });
  return { line: best, word };
}

/**
 * סבולת אנכית ללחיצה על הצילום: חצי מהרווח החציוני בין שורות סמוכות (לפחות 0), כך שכל
 * הרווח שבין שתי שורות מתחלק ביניהן.
 * @param {TrackLine[]} lines
 */
export function lineGapPad(lines) {
  const B = (lines || []).map((l) => l?.bbox).filter(isBox).sort((a, b) => a[1] - b[1]);
  const gaps = [];
  for (let i = 1; i < B.length; i++) {
    const g = B[i][1] - B[i - 1][3];
    if (g >= 0) gaps.push(g);
  }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1] / 2 + 1;
}

/**
 * תיבה מקואורדינטות המקור לפיקסלי התמונה המוצגת (sx, sy = רוחב/גובה התמונה ÷ size המקור).
 * @param {number[]|null} b
 * @param {number} sx
 * @param {number} [sy]
 */
export function scaleBox(b, sx, sy = sx) {
  if (!isBox(b)) return null;
  return [b[0] * sx, b[1] * sy, b[2] * sx, b[3] * sy];
}
