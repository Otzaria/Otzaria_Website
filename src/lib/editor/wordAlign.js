// יישור מילים בתוך שורה: המילים שהמתנדב רואה/מקליד מול מילות הצילום (לוגיקה טהורה).
// Needleman-Wunsch עם עלות-התאמה = Levenshtein (Damerau) מנורמל על המילים אחרי נרמול,
// ועלות-דילוג GAP. בנוסף להתאמה/דילוג יש שני מהלכים לאיחוד ולפיצול: שתי מילים בטקסט
// מול מילה אחת בצילום (הזיהוי חיבר "בית המקדש") ומילה אחת בטקסט מול שתיים בצילום
// (הזיהוי פיצל, או שהמתנדב מחק רווח).
//
// כיוון: אינדקס 0 = המילה הראשונה בקריאה. בעברית זו הימנית — מילות הצילום חייבות
// להגיע ממוינות לפי x יורד (trackingSource עושה את זה).

import { editDistance } from '../emailTypo.js';
import { normalizeHebrew } from '../hebrewSearchNormalize.js';

/** עלות דילוג (מילה שנוספה בטקסט / שחסרה בו) */
export const GAP = 0.55;
/** התאמה בעלות עד כאן = מסגרת רציפה; מעל — מקווקווה */
export const CONFIDENT_COST = 0.6;
/** קנס נוסף על איחוד/פיצול, כדי שהתאמה 1:1 טובה תמיד תועדף */
export const JOIN_PENALTY = 0.3;

/**
 * @typedef {[number, number, number, number]} Box  [x0, y0, x1, y1] בפיקסלי התמונה
 * @typedef {string | { text?: string|null, bbox?: Box|null }} ScanWordLike
 * @typedef {'match'|'merge'|'split'|'insert'|'position'} AlignKind
 *   merge — שתי מילים (או יותר) בטקסט מול מילה אחת בצילום; split — מילה בטקסט מול שתיים;
 *   insert — אין לה מילה בצילום; position — שיוך לפי מקום בלבד (לצילום אין טקסט)
 * @typedef {{ scanIndex: number|null, scanIndexes: number[], cost: number, confident: boolean, kind: AlignKind }} WordMatch
 */

/**
 * נרמול מילה להשוואה: בלי ניקוד וטעמים, גרש/גרשיים ומירכאות, מקף, פיסוק ותווים
 * בלתי-נראים; אותיות סופיות → רגילות; לטינית → אותיות קטנות. (מבוסס normalizeHebrew.)
 * @param {string} word
 */
export function normalizeWord(word) {
  return normalizeHebrew(String(word ?? '')).replace(/ /g, '');
}

/**
 * עלות 0..1 בין שתי מילים מנורמלות: 0 = זהות, 1 = שונות לגמרי. שתיהן ריקות (פיסוק
 * מול פיסוק) = 0; רק אחת ריקה = 1.
 * @param {string} a
 * @param {string} b
 */
export function normCost(a, b) {
  if (a === b) return 0;
  const L = Math.max(a.length, b.length);
  if (!a.length || !b.length) return 1;
  return Math.min(1, editDistance(a, b) / L);
}

/**
 * עלות 0..1 בין שתי מילים גולמיות (מנרמל קודם).
 * @param {string} a
 * @param {string} b
 */
export const wordCost = (a, b) => normCost(normalizeWord(a), normalizeWord(b));

const textOf = (w) => (typeof w === 'string' ? w : typeof w?.text === 'string' ? w.text : null);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);

// לצילום יש טקסט אם לכל מילה שלו יש מחרוזת (גם ריקה מנרמול, כמו "—")
const hasScanText = (scan) => scan.length > 0 && scan.every((w) => textOf(w) !== null && textOf(w).trim() !== '');

const mk = (scanIndexes, cost, kind) => ({
  scanIndex: scanIndexes.length ? scanIndexes[0] : null,
  scanIndexes,
  cost,
  confident: scanIndexes.length > 0 && cost <= CONFIDENT_COST,
  kind,
});

// ---------- שיוך לפי מקום (כשלמילות הצילום אין טקסט) ----------

// מרכז כל מילה בטקסט כשבר 0..1 מאורך השורה (לפי תווים, רווח אחד בין מילים)
function textCenters(words) {
  const lens = words.map((w) => Array.from(w).length);
  const total = lens.reduce((a, b) => a + b, 0) + Math.max(0, words.length - 1);
  let at = 0;
  return lens.map((n) => {
    const c = total ? (at + n / 2) / total : 0.5;
    at += n + 1;
    return c;
  });
}

// מרכז כל מילת צילום כשבר 0..1 מימין (RTL): לפי התיבות אם לכולן יש, אחרת לפי האינדקס
function scanCenters(scan) {
  const boxes = scan.map((w) => (typeof w === 'object' && w ? w.bbox : null));
  if (boxes.length && boxes.every(isBox)) {
    const right = Math.max(...boxes.map((b) => b[2]));
    const left = Math.min(...boxes.map((b) => b[0]));
    const span = right - left;
    if (span > 0) return boxes.map((b) => (right - (b[0] + b[2]) / 2) / span);
  }
  return scan.map((_, j) => (j + 0.5) / scan.length);
}

function alignByPosition(text, scan) {
  // אותו מספר מילים — לפי הסדר (זה המקרה הרגיל בצילום שהזיהוי שלו לא נשמר כטקסט)
  if (text.length === scan.length) return text.map((_, i) => mk([i], 0, 'position'));
  const tc = textCenters(text);
  const sc = scanCenters(scan);
  return tc.map((c) => {
    let best = 0;
    for (let j = 1; j < sc.length; j++) if (Math.abs(sc[j] - c) < Math.abs(sc[best] - c)) best = j;
    const cost = Math.min(1, 2 * Math.abs(sc[best] - c));
    return { ...mk([best], cost, 'position'), confident: false };
  });
}

// ---------- Needleman-Wunsch ----------

const DIAG = 0;
const UP = 1; // מילה בטקסט בלי מילה בצילום
const LEFT = 2; // מילה בצילום בלי מילה בטקסט
const MERGE = 3; // שתי מילים בטקסט ← מילה אחת בצילום
const SPLIT = 4; // מילה בטקסט ← שתי מילים בצילום

/**
 * יישור מילות השורה בטקסט מול מילות אותה שורה בצילום.
 * @param {string[]} textWords מילות הטקסט בסדר הקריאה
 * @param {ScanWordLike[]} scanWords מילות הצילום בסדר הקריאה (RTL: x יורד)
 * @param {{ gap?: number }} [opts]
 * @returns {WordMatch[]} רשומה לכל מילה בטקסט
 */
export function alignLine(textWords, scanWords, { gap = GAP } = {}) {
  const text = (textWords || []).map((w) => String(w ?? ''));
  const scan = scanWords || [];
  const n = text.length;
  const m = scan.length;
  if (!n) return [];
  if (!m) return text.map(() => mk([], 1, 'insert'));
  if (!hasScanText(scan)) return alignByPosition(text, scan);

  const A = text.map(normalizeWord);
  const B = scan.map((w) => normalizeWord(textOf(w) ?? ''));
  const D = [];
  const P = [];
  for (let i = 0; i <= n; i++) {
    D.push(new Float64Array(m + 1));
    P.push(new Int8Array(m + 1));
    D[i][0] = i * gap;
    P[i][0] = UP;
  }
  for (let j = 0; j <= m; j++) {
    D[0][j] = j * gap;
    P[0][j] = LEFT;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = D[i - 1][j - 1] + normCost(A[i - 1], B[j - 1]);
      let move = DIAG;
      if (i > 1) {
        const v = D[i - 2][j - 1] + normCost(A[i - 2] + A[i - 1], B[j - 1]) + JOIN_PENALTY;
        if (v < best) [best, move] = [v, MERGE];
      }
      if (j > 1) {
        const v = D[i - 1][j - 2] + normCost(A[i - 1], B[j - 2] + B[j - 1]) + JOIN_PENALTY;
        if (v < best) [best, move] = [v, SPLIT];
      }
      const up = D[i - 1][j] + gap;
      if (up < best) [best, move] = [up, UP];
      const left = D[i][j - 1] + gap;
      if (left < best) [best, move] = [left, LEFT];
      D[i][j] = best;
      P[i][j] = move;
    }
  }

  /** @type {WordMatch[]} */
  const res = new Array(n);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = i === 0 ? LEFT : j === 0 ? UP : P[i][j];
    if (move === DIAG) {
      res[i - 1] = mk([j - 1], normCost(A[i - 1], B[j - 1]), 'match');
      i--;
      j--;
    } else if (move === MERGE) {
      const c = normCost(A[i - 2] + A[i - 1], B[j - 1]);
      res[i - 2] = mk([j - 1], c, 'merge');
      res[i - 1] = mk([j - 1], c, 'merge');
      i -= 2;
      j--;
    } else if (move === SPLIT) {
      res[i - 1] = mk([j - 2, j - 1], normCost(A[i - 1], B[j - 2] + B[j - 1]), 'split');
      i--;
      j -= 2;
    } else if (move === UP) {
      res[i - 1] = mk([], 1, 'insert');
      i--;
    } else j--;
  }
  return res;
}

/**
 * המיפוי ההפוך: לכל מילה בצילום — המילה הראשונה בטקסט שמשויכת אליה, או null.
 * @param {WordMatch[]} alignment
 * @param {number} scanCount
 * @returns {(number|null)[]}
 */
export function inverseMap(alignment, scanCount) {
  const out = new Array(Math.max(0, scanCount | 0)).fill(null);
  (alignment || []).forEach((a, i) => {
    for (const j of a?.scanIndexes || []) if (j >= 0 && j < out.length && out[j] === null) out[j] = i;
  });
  return out;
}

/** מעטפת של כמה תיבות */
export function unionBox(boxes) {
  const bs = (boxes || []).filter(isBox);
  if (!bs.length) return null;
  return [
    Math.min(...bs.map((b) => b[0])),
    Math.min(...bs.map((b) => b[1])),
    Math.max(...bs.map((b) => b[2])),
    Math.max(...bs.map((b) => b[3])),
  ];
}

/**
 * התיבה של מילה בטקסט לפי היישור: מעטפת מילות הצילום שלה; null למילה שנוספה.
 * @param {WordMatch[]} alignment
 * @param {ScanWordLike[]} scanWords
 * @param {number} i
 * @returns {Box|null}
 */
export function matchedBox(alignment, scanWords, i) {
  const a = alignment?.[i];
  if (!a?.scanIndexes?.length) return null;
  return unionBox(a.scanIndexes.map((j) => (typeof scanWords?.[j] === 'object' ? scanWords[j]?.bbox : null)));
}

/**
 * מיקום משוער למילה בטקסט שאין לה מילה בצילום (נוספה, או שהזיהוי פספס אותה): בין
 * השכנות המיושרות שלפניה ואחריה, ביחס לאורכי המילים. RTL: המילה הקודמת בקריאה
 * מימינה, הבאה משמאלה. בלי שכנות מיושרות — בתוך lineBox לפי מקום התווים, ובלעדיו null.
 * @param {string[]} textWords
 * @param {WordMatch[]} alignment
 * @param {ScanWordLike[]} scanWords
 * @param {number} index המילה בטקסט
 * @param {{ lineBox?: Box|null, gapPx?: number }} [opts]
 * @returns {Box|null}
 */
export function estimateInserted(textWords, alignment, scanWords, index, { lineBox = null, gapPx = null } = {}) {
  const n = (textWords || []).length;
  if (!Number.isInteger(index) || index < 0 || index >= n) return null;
  const own = matchedBox(alignment, scanWords, index);
  if (own) return own;
  const lenOf = (k) => Math.max(1, Array.from(normalizeWord(textWords[k])).length || Array.from(String(textWords[k])).length);

  let p = index - 1;
  while (p >= 0 && !matchedBox(alignment, scanWords, p)) p--;
  let q = index + 1;
  while (q < n && !matchedBox(alignment, scanWords, q)) q++;
  const prev = p >= 0 ? matchedBox(alignment, scanWords, p) : null;
  const next = q < n ? matchedBox(alignment, scanWords, q) : null;
  const ref = prev || next;
  const y0 = isBox(lineBox) ? lineBox[1] : ref?.[1];
  const y1 = isBox(lineBox) ? lineBox[3] : ref?.[3];

  if (!ref) {
    if (!isBox(lineBox)) return null;
    // אין עוגן בכלל — לפי מקום התווים בשורה
    const total = textWords.reduce((s, _, k) => s + lenOf(k), 0) + (n - 1);
    let at = 0;
    for (let k = 0; k < index; k++) at += lenOf(k) + 1;
    const span = lineBox[2] - lineBox[0];
    return [lineBox[2] - ((at + lenOf(index)) / total) * span, y0, lineBox[2] - (at / total) * span, y1];
  }

  // רוחב לתו מהמילים המיושרות
  let px = 0;
  let chars = 0;
  for (let k = 0; k < n; k++) {
    const b = matchedBox(alignment, scanWords, k);
    if (!b || alignment[k].kind === 'merge') continue;
    px += b[2] - b[0];
    chars += lenOf(k);
  }
  const perChar = chars ? px / chars : (y1 - y0) * 0.6;
  const gp = Number.isFinite(gapPx) ? gapPx : perChar * 0.6;
  const clampX = (x) => (isBox(lineBox) ? Math.max(lineBox[0], Math.min(lineBox[2], x)) : x);

  if (prev && next) {
    // הרווח בין השכנות: מקצה שמאל של הקודמת עד קצה ימין של הבאה
    const right = prev[0];
    const left = next[2];
    const lens = [];
    for (let k = p + 1; k < q; k++) lens.push(lenOf(k));
    const tot = lens.reduce((a, b) => a + b, 0);
    let before = 0;
    for (let k = p + 1; k < index; k++) before += lenOf(k);
    if (right - left > 2) {
      const span = right - left;
      const x1 = right - (before / tot) * span;
      const x0 = right - ((before + lenOf(index)) / tot) * span;
      return [x0, y0, x1, y1];
    }
    // השכנות צמודות — פס צר על הגבול
    const mid = (right + left) / 2;
    const w = Math.max(2, perChar * 0.5);
    return [mid - w / 2, y0, mid + w / 2, y1];
  }

  // רק שכנה מצד אחד: מצמידים אליה, אחרי מילים מוערכות שבינה למילה הזו
  const w = perChar * lenOf(index);
  if (prev) {
    let x = prev[0] - gp;
    for (let k = p + 1; k < index; k++) x -= perChar * lenOf(k) + gp;
    return [clampX(x - w), y0, clampX(x), y1];
  }
  let x = next[2] + gp;
  for (let k = q - 1; k > index; k--) x += perChar * lenOf(k) + gp;
  return [clampX(x), y0, clampX(x + w), y1];
}
