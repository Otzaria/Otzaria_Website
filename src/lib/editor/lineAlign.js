// יישור שורות הטקסט מול שורות הצילום של אותו זרם (לוגיקה טהורה).
// במקרה הרגיל מספר השורות שווה — שורה i מול שורה i. כשהוא שונה (שורה נמחקה, פוצלה
// או אוחדה), או כשהוא שווה אבל יישור אחר מתאים בבירור יותר (שורת כותרת בצילום שאין לה
// מקבילה + שורה שנוספה בטקסט — אותו מספר, הזזה של שורה) — יישור DP: לפי דמיון התוכן כשלשורות הצילום יש טקסט (Dice על זוגות-אותיות,
// עמיד לשגיאות זיהוי), ולפי היחס בין אורך השורה בתווים לרוחבה בצילום כשאין.

import { normalizeWord } from './wordAlign.js';

/** עלות דילוג על שורה */
export const LINE_GAP = 0.5;
/** קנס על איחוד/פיצול שורות */
export const LINE_JOIN_PENALTY = 0.3;

/**
 * @typedef {string | { text?: string|null, bbox?: number[]|null }} ScanLineLike
 * @typedef {{ text: string, grams: Map<string, number> }} PreparedLine
 * @typedef {{ scanIndex: number|null, scanIndexes: number[], cost: number, kind: 'match'|'merge'|'split'|'insert'|'identity' }} LineMatch
 */

const textOf = (l) => (typeof l === 'string' ? l : typeof l?.text === 'string' ? l.text : null);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);

/** שורה מנורמלת להשוואה: בלי רווחים, ניקוד ופיסוק */
export const normalizeLine = (s) =>
  String(s ?? '')
    .split(/\s+/)
    .map(normalizeWord)
    .join('');

function bigrams(s) {
  const ch = Array.from(s);
  const m = new Map();
  for (let i = 0; i + 1 < ch.length; i++) {
    const g = ch[i] + ch[i + 1];
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

/**
 * מרחק 0..1 בין שתי שורות מנורמלות (1 − Dice על זוגות-אותיות).
 * @param {string} a
 * @param {string} b
 */
export function lineCost(a, b) {
  if (a === b) return 0;
  return preparedCost(a, b, bigrams(a), bigrams(b));
}

function preparedCost(a, b, A, B) {
  if (a === b) return 0;
  if (!a.length || !b.length) return 1;
  if (a.length < 2 || b.length < 2) return 1;
  let common = 0;
  for (const [g, c] of A) common += Math.min(c, B.get(g) || 0);
  return 1 - (2 * common) / (a.length - 1 + (b.length - 1));
}

const median = (xs) => {
  const s = xs.filter((x) => x > 0).sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * יישור שורות.
 * @param {string[]} textLines שורות הטקסט של הזרם
 * @param {ScanLineLike[]} scanLines שורות הצילום של הזרם, בסדר הקריאה
 * @param {{ gap?: number, force?: boolean }} [opts] force — DP בלי העדפה לזהות כשמספר השורות שווה
 * @returns {LineMatch[]} רשומה לכל שורת טקסט
 */
export function alignLines(textLines, scanLines, { gap = LINE_GAP, force = false } = {}) {
  const T = (textLines || []).map((s) => String(s ?? ''));
  const S = scanLines || [];
  const n = T.length;
  const m = S.length;
  if (!n) return [];
  if (!m) return T.map(() => ({ scanIndex: null, scanIndexes: [], cost: 1, kind: 'insert' }));
  const identity = () => T.map((_, i) => ({ scanIndex: i, scanIndexes: [i], cost: 0, kind: /** @type {'identity'} */ ('identity') }));

  const withText = S.every((l) => textOf(l) !== null);
  const widths = S.map((l) => (typeof l === 'object' && l && isBox(l.bbox) ? l.bbox[2] - l.bbox[0] : NaN));
  const withWidth = widths.every((w) => w > 0);
  if (!withText && !withWidth) {
    return T.map((_, i) => (i < m ? { scanIndex: i, scanIndexes: [i], cost: 0, kind: 'identity' } : { scanIndex: null, scanIndexes: [], cost: 1, kind: 'insert' }));
  }

  /** @type {(a: PreparedLine|number, b: PreparedLine|number) => number} */
  let cost;
  /** @type {(a: PreparedLine|number, b: PreparedLine|number) => PreparedLine|number} */
  let join;
  /** @type {(PreparedLine|number)[]} */
  let A;
  /** @type {(PreparedLine|number)[]} */
  let B;
  if (withText) {
    // כל שורה (כולל זוג שורות מחוברות) מופיעה במאות תאי DP. בונים את זוגות
    // האותיות פעם אחת לכל טקסט, במקום שוב בכל השוואה. המטמון מוגבל לריצה הזו.
    const preparedLines = new Map();
    const prepared = (s) => {
      if (!preparedLines.has(s)) preparedLines.set(s, { text: s, grams: bigrams(s) });
      return preparedLines.get(s);
    };
    A = T.map((s) => prepared(normalizeLine(s)));
    B = S.map((l) => prepared(normalizeLine(textOf(l))));
    cost = (a, b) => a === b ? 0 : preparedCost(a.text, b.text, a.grams, b.grams);
    join = (a, b) => prepared(a.text + b.text);
  } else {
    // אורך יחסי: תווים מול רוחב, כל אחד ביחס לחציון שלו
    const lens = T.map((s) => Array.from(normalizeLine(s)).length);
    const tm = median(lens) || 1;
    const wm = median(widths) || 1;
    A = lens.map((x) => x / tm);
    B = widths.map((x) => x / wm);
    cost = (a, b) => Math.min(1, Math.abs(/** @type {number} */ (a) - /** @type {number} */ (b)));
    join = (a, b) => /** @type {number} */ (a) + /** @type {number} */ (b);
  }

  // אותו מספר שורות — שורה i מול שורה i, אלא אם יישור אחר (למשל שורת כותרת בצילום שאין לה
  // שורה בטקסט, ושורה בטקסט שנוספה בסוף) זול ממנה בבירור: עדיף בפער של יותר מדילוג אחד
  const idCost = n === m && !force ? A.reduce((acc, a, i) => acc + cost(a, B[i]), 0) : Infinity;
  // כל עלויות ה-DP אי-שליליות. כשהזהות זולה מדילוג אחד, שום מסלול אינו יכול
  // לנצח אותה בפער הנדרש למטה — גם אחרי הקלדת אות אין צורך במטריצה שלמה.
  if (idCost === 0 || idCost < gap) return identity();

  const joinedA = A.map((a, i) => i ? join(A[i - 1], a) : null);
  const joinedB = B.map((b, i) => i ? join(B[i - 1], b) : null);

  const D = [];
  const P = [];
  for (let i = 0; i <= n; i++) {
    D.push(new Float64Array(m + 1));
    P.push(new Int8Array(m + 1));
    D[i][0] = i * gap;
    P[i][0] = 1;
  }
  for (let j = 0; j <= m; j++) {
    D[0][j] = j * gap;
    P[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = D[i - 1][j - 1] + cost(A[i - 1], B[j - 1]);
      let mv = 0;
      if (i > 1) {
        const v = D[i - 2][j - 1] + cost(joinedA[i - 1], B[j - 1]) + LINE_JOIN_PENALTY;
        if (v < best) [best, mv] = [v, 3];
      }
      if (j > 1) {
        const v = D[i - 1][j - 2] + cost(A[i - 1], joinedB[j - 1]) + LINE_JOIN_PENALTY;
        if (v < best) [best, mv] = [v, 4];
      }
      if (D[i - 1][j] + gap < best) [best, mv] = [D[i - 1][j] + gap, 1];
      if (D[i][j - 1] + gap < best) [best, mv] = [D[i][j - 1] + gap, 2];
      D[i][j] = best;
      P[i][j] = mv;
    }
  }
  if (D[n][m] > idCost - gap) return identity();
  /** @type {LineMatch[]} */
  const res = new Array(n);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = i === 0 ? 2 : j === 0 ? 1 : P[i][j];
    if (mv === 0) {
      res[i - 1] = { scanIndex: j - 1, scanIndexes: [j - 1], cost: cost(A[i - 1], B[j - 1]), kind: 'match' };
      i--;
      j--;
    } else if (mv === 3) {
      const c = cost(joinedA[i - 1], B[j - 1]);
      res[i - 2] = { scanIndex: j - 1, scanIndexes: [j - 1], cost: c, kind: 'merge' };
      res[i - 1] = { scanIndex: j - 1, scanIndexes: [j - 1], cost: c, kind: 'merge' };
      i -= 2;
      j--;
    } else if (mv === 4) {
      res[i - 1] = { scanIndex: j - 2, scanIndexes: [j - 2, j - 1], cost: cost(A[i - 1], joinedB[j - 1]), kind: 'split' };
      i--;
      j -= 2;
    } else if (mv === 1) {
      res[i - 1] = { scanIndex: null, scanIndexes: [], cost: 1, kind: 'insert' };
      i--;
    } else j--;
  }
  return res;
}

/**
 * שורת הצילום הקרובה לשורת טקסט שאין לה שורה משלה (נוספה): השכנה המיושרת הקודמת,
 * ואם אין — הבאה. null כשאף שורה לא מיושרת.
 * @param {LineMatch[]} alignment
 * @param {number} i
 */
export function nearestAlignedLine(alignment, i) {
  if (!alignment?.length || !Number.isInteger(i)) return null;
  const at = Math.max(0, Math.min(i, alignment.length - 1));
  if (alignment[at]?.scanIndex != null) return alignment[at].scanIndex;
  for (let k = at - 1; k >= 0; k--) if (alignment[k]?.scanIndex != null) return alignment[k].scanIndex;
  for (let k = at + 1; k < alignment.length; k++) if (alignment[k]?.scanIndex != null) return alignment[k].scanIndex;
  return null;
}
