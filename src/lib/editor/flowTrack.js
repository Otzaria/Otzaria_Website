// מעקב "טקסט זורם" (לוגיקה טהורה): כשהטקסט בעורך אינו שורה-מול-שורה עם הצילום — פסקה
// שלמה בשורה אחת, ובעיקר כל העמוד בשורה אחת (המקרה הנפוץ: כך מגיע טקסט של עמוד שלם) — אין
// טעם ביישור שורה i מול שורה i. במקום זה:
//   1. פסקאות בצילום: רצף שורות (בסדר הקריאה) עד שורת סוף-פסקה (paraEnd, או מחושב
//      לפי paragraphEnds של scanProfile).
//   2. קטעים בטקסט: כל שורה לא-ריקה, ובתוכה חיתוך לפי עוגנים (softBreaks): אחרי ": " ולפני
//      <b>/<strong>. אורך — בתווים נראים (בלי תגיות HTML).
//   3. התאמת קטעים לפסקאות (DP, matchParagraphs) לפי היחס בין מספר התווים לרוחב הדיו. כותרת
//      שבטקסט היא שורה נפרדת ובדפוס בתחילת הפסקה — 2:1; עוגן שאין לו מקבילה — מצורף לשכנו.
//   4. בתוך קבוצה: יישור מילים לפי רוחב (alignWordWidths) — אורך כל מילה בטקסט מול רוחב
//      המילים שזוהו בצילום. בלי מילים מזוהות — המקום היחסי בתווים = המקום היחסי ברוחב השורות.
// התוצאה תמיד משוערת (מסגרת מקווקווה). הצד שמחבר: caretTrack.js.

import { caretInfo, lineCount, lineWords, splitLines, lineStarts } from './caretWord.js';
import { paragraphEnds } from './scanProfile.js';

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const TAG = /<[^>]*>/g;

/**
 * מיפוי היסטים בשורת טקסט: היסט גולמי → מספר התווים הנראים לפניו (תגיות HTML לא נספרות).
 * @param {string} s
 * @returns {{ vis: Int32Array, len: number }} vis[i] לכל 0 ≤ i ≤ s.length
 */
export function visibleMap(s) {
  const str = String(s ?? '');
  // שמור לפי תוכן השורה (נקרא בכל הקשה, על שורות של אלפי תווים); התוצאה משותפת — לקריאה בלבד
  const hit = VIS_CACHE.get(str);
  if (hit) return hit;
  const out = computeVisibleMap(str);
  VIS_CACHE.set(str, out);
  if (VIS_CACHE.size > 256) VIS_CACHE.delete(VIS_CACHE.keys().next().value);
  return out;
}

/** @type {Map<string, { vis: Int32Array, len: number }>} */
const VIS_CACHE = new Map();

/** @param {string} str */
function computeVisibleMap(str) {
  const vis = new Int32Array(str.length + 1);
  let n = 0;
  let inTag = false;
  for (let i = 0; i < str.length; i++) {
    vis[i] = n;
    const ch = str[i];
    if (ch === '<' && /^<\/?[a-zA-Z][^>]*>/.test(str.slice(i, i + 40))) inTag = true;
    if (!inTag) n++;
    if (ch === '>' && inTag) inTag = false;
  }
  vis[str.length] = n;
  return { vis, len: n };
}

/** האם להשתמש במעקב זורם: הרבה פחות שורות טקסט משורות צילום */
export function shouldUseFlow(text, scanLines, ratio = 0.6) {
  const S = (scanLines || []).filter((l) => isBox(l?.bbox));
  if (S.length < 4) return false;
  const tl = splitLines(text).filter((l) => l.replace(TAG, '').trim()).length;
  return tl > 0 && tl < ratio * S.length;
}

// פסקאות הצילום: [{ a, b }] אינדקסים בשורות (b לא כולל). בלי paraEnd — מחשבים לכל זרם.
function scanParagraphs(lines) {
  let ends = lines.map((l) => l.paraEnd);
  if (ends.some((e) => typeof e !== 'boolean')) {
    ends = new Array(lines.length).fill(false);
    const byStream = new Map();
    lines.forEach((l, i) => {
      const k = l.stream ?? '';
      if (!byStream.has(k)) byStream.set(k, []);
      byStream.get(k).push(i);
    });
    for (const idx of byStream.values()) {
      const pe = paragraphEnds(idx.map((i) => lines[i]));
      idx.forEach((i, j) => (ends[i] = pe[j]));
    }
  }
  const out = [];
  let a = 0;
  lines.forEach((_, i) => {
    if (ends[i] || i === lines.length - 1) {
      out.push({ a, b: i + 1 });
      a = i + 1;
    }
  });
  return out;
}

/**
 * התאמת פסקאות טקסט (אורכים בתווים) לפסקאות צילום (רוחב בפיקסלים) — DP: קבוצה של עד maxText
 * קטעי טקסט מול עד maxScan פסקאות צילום, לפי היחס בין מספר התווים לרוחב הדיו.
 * @param {number[]} tLens
 * @param {number[]} sWidths
 * @param {{ maxGroup?: number, maxText?: number, maxScan?: number, skipCost?: number, groupPenalty?: number, sJoin?: number,
 *   tJoin?: (number|undefined)[], tSkippable?: boolean[] }} [o]
 *   tJoin[k] — מחיר צירוף קטע k לקטע k+1 באותה קבוצה (ברירת מחדל groupPenalty; גבול "רך" כמו
 *   נקודתיים באמצע שורה — זול יותר); tSkippable[k] === false — קטע שאינו שורה שלמה בטקסט:
 *   דילוג עליו יקר מאוד (הוא בוודאי מודפס איפשהו); sJoin — מחיר כל פסקת צילום נוספת בקבוצה
 * @returns {{ t0: number, t1: number, s0: number, s1: number }[]} טווחים (1 לא כולל); קבוצה
 *   עם t0 === t1 או s0 === s1 — פסקה שאין לה מקבילה
 */
export function matchParagraphs(tLens, sWidths, { maxGroup = 3, maxText = maxGroup, maxScan = maxGroup, skipCost = 1.2, groupPenalty = 0.12, sJoin = groupPenalty, tJoin = null, tSkippable = null } = {}) {
  const n = tLens.length;
  const m = sWidths.length;
  const T = tLens.reduce((a, b) => a + b, 0);
  const W = sWidths.reduce((a, b) => a + b, 0);
  if (!n || !m || !T || !W) return [];
  const r = W / T;
  const soft = 0.25 * (W / m);
  const pt = [0];
  for (const x of tLens) pt.push(pt[pt.length - 1] + x);
  const ps = [0];
  for (const x of sWidths) ps.push(ps[ps.length - 1] + x);
  // pj[k] — סך מחירי הצירוף של הגבולות 0..k-1
  const pj = [0];
  for (let k = 0; k < n - 1; k++) pj.push(pj[k] + (tJoin && Number.isFinite(tJoin[k]) ? tJoin[k] : groupPenalty));
  const tSkip = (i) => {
    const base = Math.min(1, (tLens[i] * r) / (W / m));
    return tSkippable && tSkippable[i] === false ? 1 + 4 * base : skipCost * base;
  };
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  const P = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  D[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const d = D[i][j];
      if (d === Infinity) continue;
      const relax = (ni, nj, c) => {
        if (d + c < D[ni][nj]) {
          D[ni][nj] = d + c;
          P[ni][nj] = [i, j];
        }
      };
      if (i < n) relax(i + 1, j, tSkip(i));
      if (j < m) relax(i, j + 1, skipCost * Math.min(1, sWidths[j] / (W / m)));
      for (let a = 1; a <= maxText && i + a <= n; a++) {
        const join = pj[i + a - 1] - pj[i];
        for (let b = 1; b <= maxScan && j + b <= m; b++) {
          const tw = (pt[i + a] - pt[i]) * r;
          const sw = ps[j + b] - ps[j];
          relax(i + a, j + b, Math.abs(Math.log((tw + soft) / (sw + soft))) + join + sJoin * (b - 1));
        }
      }
    }
  }
  const out = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const p = P[i][j];
    if (!p) break;
    out.push({ t0: p[0], t1: i, s0: p[1], s1: j });
    [i, j] = p;
  }
  return out.reverse();
}

/** מחיר צירוף שני קטעים שביניהם גבול "רך" (בתוך אותה שורת טקסט) */
const SOFT_JOIN = 0.03;
/** קטע קצר מזה (בתווים נראים) לא נחתך — נשאר צמוד לשכנו */
const MIN_SEGMENT = 25;
const BOLD_OPEN = /<(?:b|strong)\b[^>]*>/gi;

/**
 * נקודות חיתוך בתוך שורת טקסט אחת ("פסקאות משוערות") לפי עוגנים שבתוכה: אחרי נקודתיים
 * שבסוף משפט (": " — בדפוס כאן מסתיימת פסקה), ולפני תחילת הדגשה (<b>/<strong> — פתיחת
 * פסקה). בתווים נראים, ממוינות, בלי 0 ובלי סוף השורה; קטעים קצרים מ-MIN_SEGMENT לא נוצרים.
 * @param {string} lineText
 * @returns {number[]}
 */
export function softBreaks(lineText) {
  const s = String(lineText ?? '');
  const { vis, len } = visibleMap(s);
  const cuts = new Set();
  for (const m of s.matchAll(BOLD_OPEN)) cuts.add(vis[m.index]);
  // הטקסט הנראה, לחיפוש נקודתיים
  let v = '';
  for (let i = 0; i < s.length; i++) if (vis[i + 1] > vis[i]) v += s[i];
  for (const m of v.matchAll(/:\s+/g)) cuts.add(m.index + m[0].length);
  const out = [];
  for (const c of [...cuts].sort((a, b) => a - b)) {
    if (c < MIN_SEGMENT || len - c < MIN_SEGMENT) continue;
    if (out.length && c - out[out.length - 1] < MIN_SEGMENT) continue;
    out.push(c);
  }
  return out;
}

/**
 * @typedef {object} FlowModel
 * @property {{ line: number, from: number, len: number, nw: number, wl: number[] }[]} paras  קטעי
 *   הטקסט: שורת טקסט, היסט נראה שבו הקטע מתחיל בשורה, אורך נראה, מספר המילים ואורך כל מילה
 *   (בתווים נראים). שורה בלי עוגנים — קטע אחד.
 * @property {{ t0: number, t1: number, s0: number, s1: number }[]} groups  ב-t — אינדקס ב-paras, ב-s — בשורות הצילום
 * @property {number[]} widths רוחב כל שורת צילום
 */

/**
 * בניית מודל ההתאמה לטקסט ולשורות הצילום (בסדר הקריאה, בלי כותרות). כל שורת טקסט לא-ריקה
 * היא פסקה, ובתוכה — קטעים לפי softBreaks. המקרה הנפוץ: כל העמוד בשורה אחת, והעוגנים
 * היחידים הם נקודתיים/הדגשות שבתוכה מול סופי הפסקאות בצילום.
 * @param {string} text
 * @param {{ bbox: number[], stream?: string, paraEnd?: boolean }[]} scanLines
 * @returns {FlowModel|null}
 */
export function buildFlow(text, scanLines) {
  const S = scanLines || [];
  if (!S.length || !S.every((l) => isBox(l?.bbox))) return null;
  const paras = [];
  const tJoin = [];
  const tSkippable = [];
  splitLines(text).forEach((l, i) => {
    if (!l.replace(TAG, '').trim()) return;
    const len = visibleMap(l).len;
    const cuts = [0, ...softBreaks(l), len];
    if (paras.length) tJoin.push(undefined); // גבול "קשה" — שורה חדשה בטקסט
    const { vis } = visibleMap(l);
    const ws = lineWords(l).map((wd) => ({ v: vis[wd.start], n: Math.max(1, vis[wd.end] - vis[wd.start]) }));
    for (let k = 0; k + 1 < cuts.length; k++) {
      if (k > 0) tJoin.push(SOFT_JOIN);
      const wl = ws.filter((x) => x.v >= cuts[k] && x.v < cuts[k + 1]).map((x) => x.n);
      paras.push({ line: i, from: cuts[k], len: cuts[k + 1] - cuts[k], nw: wl.length, wl });
      tSkippable.push(cuts.length === 2);
    }
  });
  if (!paras.length) return null;
  const widths = S.map((l) => Math.max(1, l.bbox[2] - l.bbox[0]));
  const sp = scanParagraphs(S);
  const g = matchParagraphs(
    paras.map((p) => p.len),
    sp.map((p) => widths.slice(p.a, p.b).reduce((a, b) => a + b, 0)),
    { maxText: 8, maxScan: 12, sJoin: 0.06, tJoin, tSkippable },
  );
  const groups = g.map((x) => ({ t0: x.t0, t1: x.t1, s0: x.s0 < sp.length ? sp[x.s0].a : S.length, s1: x.s1 > 0 ? sp[x.s1 - 1].b : 0 }))
    .map((x, k) => (g[k].s0 === g[k].s1 ? { ...x, s0: x.s1, s1: x.s1 } : x));
  const model = { paras, groups, widths };
  // מטמון יישורי-המילים לפי קבוצה (נבנה בעצלות ב-flowCaret); לא-ספיר
  Object.defineProperty(model, 'wordMaps', { value: new Map(), enumerable: false });
  return model;
}

/**
 * יישור מילים לפי רוחב בלבד (בצילום אין טקסט): אורכי מילות הטקסט בתווים מול רוחב מילות
 * הצילום בפיקסלים, בסדר הקריאה. DP עם התאמה 1:1, איחוד 2:1 (מילה בצילום שהן שתיים בטקסט),
 * פיצול 1:2 ודילוג — דפוס המילים הארוכות/הקצרות מתקן את הסחף של הערכה יחסית.
 * @param {number[]} tLens
 * @param {number[]} sWidths
 * @param {{ maxCells?: number, band?: number, joinCost?: number, skipCost?: number }} [o]
 *   band — רוחב הרצועה סביב האלכסון, כחלק מאורך הרצף הארוך
 * @returns {Int32Array|null} לכל מילה בטקסט — אינדקס המילה בצילום (מספר שלילי — דולגה); null כשהקלט
 *   ריק או גדול מדי
 */
export function alignWordWidths(tLens, sWidths, { maxCells = 2_000_000, band = 0.15, joinCost = 0.45, skipCost = 0.9 } = {}) {
  const n = tLens.length;
  const m = sWidths.length;
  if (!n || !m || (n + 1) * (m + 1) > maxCells) return null;
  const T = tLens.reduce((x, y) => x + y, 0);
  const W = sWidths.reduce((x, y) => x + y, 0);
  if (!(T > 0) || !(W > 0)) return null;
  const r = W / T;
  const sm = 0.3 * (W / m);
  // עלות = |log(t·r + sm) − log(w + sm)|; הלוגריתמים (של מילה בודדת ושל זוג סמוך) מחושבים מראש —
  // בלולאה הפנימית רק חיסור (Math.log בכל תא היה רוב זמן הריצה)
  const lt1 = new Float64Array(n);
  const lt2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lt1[i] = Math.log(tLens[i] * r + sm);
    if (i + 1 < n) lt2[i] = Math.log((tLens[i] + tLens[i + 1]) * r + sm);
  }
  const lw1 = new Float64Array(m);
  const lw2 = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    lw1[j] = Math.log(sWidths[j] + sm);
    if (j + 1 < m) lw2[j] = Math.log(sWidths[j] + sWidths[j + 1] + sm);
  }
  // רצועה סביב האלכסון: מילה i בטקסט לא רחוקה מדי מהמקום היחסי שלה בצילום. נשמרת רק הרצועה
  // (שורה i: עמודות lo[i]..hi[i]) — תא מחוץ לה לעולם לא מורחב, ולכן גם לא נשמר. (טבלה מלאה של
  // (n+1)·(m+1) תאים עלתה מאות מילישניות בקבוצה של כאלף מילים — בלחיצת החץ הראשונה בה.)
  const B = Math.max(12, Math.ceil(band * Math.max(n, m)));
  const lo = new Int32Array(n + 1);
  const hi = new Int32Array(n + 1);
  let Wd = 1;
  for (let i = 0; i <= n; i++) {
    const mid = (i * m) / n;
    lo[i] = Math.max(0, Math.floor(mid - B));
    hi[i] = Math.min(m, Math.ceil(mid + B));
    Wd = Math.max(Wd, hi[i] - lo[i] + 1);
  }
  const D = new Float64Array((n + 1) * Wd).fill(Infinity);
  const P = new Uint8Array((n + 1) * Wd);
  // אינדקס התא (i, j) ברצועה, או -1 כשהוא מחוצה לה
  const at = (i, j) => (j >= lo[i] && j <= hi[i] ? i * Wd + j - lo[i] : -1);
  const relax = (k, c, mv) => {
    if (k >= 0 && c < D[k]) {
      D[k] = c;
      P[k] = mv;
    }
  };
  D[0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = lo[i]; j <= hi[i]; j++) {
      const d = D[i * Wd + j - lo[i]];
      if (d === Infinity) continue;
      if (i < n && j < m) relax(at(i + 1, j + 1), d + Math.abs(lt1[i] - lw1[j]), 1);
      if (i + 1 < n && j < m) relax(at(i + 2, j + 1), d + Math.abs(lt2[i] - lw1[j]) + joinCost, 2);
      if (i < n && j + 1 < m) relax(at(i + 1, j + 2), d + Math.abs(lt1[i] - lw2[j]) + joinCost, 3);
      if (i < n) relax(at(i + 1, j), d + skipCost, 4);
      if (j < m) relax(j + 1 <= hi[i] ? i * Wd + j + 1 - lo[i] : -1, d + skipCost, 5);
    }
  }
  const end = at(n, m);
  if (end < 0 || D[end] === Infinity) return null;
  const map = new Int32Array(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const k = at(i, j);
    const mv = k >= 0 ? P[k] : 0;
    if (mv === 1) map[--i] = --j;
    else if (mv === 2) {
      j--;
      map[--i] = j;
      map[--i] = j;
    } else if (mv === 3) {
      j -= 2;
      map[--i] = j;
    } else if (mv === 4) i--;
    else if (mv === 5) j--;
    else break;
  }
  return map;
}

// הקטע (אינדקס ב-paras) בשורת הטקסט line שמכיל את התו הנראה c; -1 כשאין
function segmentAt(model, line, c) {
  let found = -1;
  model.paras.forEach((p, k) => {
    if (p.line === line && (found < 0 || p.from <= c)) found = k;
  });
  return found;
}

// הקבוצה של פסקת טקסט (אינדקס ב-paras), או null
const groupOfPara = (model, pi) => model.groups.find((g) => g.t0 <= pi && pi < g.t1 && g.s1 > g.s0) || null;

/**
 * פסקת טקסט שלא הותאמה לשום פסקה בצילום (למשל כותרת <h2> קצרה שבדפוס היא חלק מהפסקה
 * שאחריה): שורת הצילום שבה מתחילה הקבוצה הבאה שיש לה צילום, או — בסוף העמוד — השורה
 * האחרונה של הקבוצה הקודמת. null כשאין שום קבוצה עם צילום.
 * @param {FlowModel} model
 * @param {number} pi
 * @returns {number|null}
 */
export function fallbackScanIndex(model, pi) {
  const k = model.groups.findIndex((g) => g.t0 <= pi && pi < g.t1);
  if (k < 0) return null;
  for (let j = k + 1; j < model.groups.length; j++) if (model.groups[j].s1 > model.groups[j].s0) return model.groups[j].s0;
  for (let j = k - 1; j >= 0; j--) if (model.groups[j].s1 > model.groups[j].s0) return model.groups[j].s1 - 1;
  return null;
}

/**
 * מקום בצילום של תו נראה c בתוך קבוצה: שורת צילום ו-x (מימין לשמאל).
 * @returns {{ scanIndex: number, x: number }}
 */
function placeInGroup(model, lines, g, c, total) {
  const W = model.widths.slice(g.s0, g.s1).reduce((a, b) => a + b, 0);
  let w = total > 0 ? (Math.max(0, Math.min(c, total)) / total) * W : 0;
  for (let i = g.s0; i < g.s1; i++) {
    if (w <= model.widths[i] || i === g.s1 - 1) {
      const b = lines[i].bbox;
      return { scanIndex: i, x: b[2] - Math.min(w, model.widths[i]) };
    }
    w -= model.widths[i];
  }
  return { scanIndex: g.s0, x: lines[g.s0].bbox[2] };
}

// התו הנראה c בשורה (בקטע pi) → היסט מצטבר בקבוצה, וסך התווים בקבוצה
function groupOffset(model, g, pi, c) {
  let before = 0;
  let total = 0;
  for (let k = g.t0; k < g.t1; k++) {
    if (k < pi) before += model.paras[k].len;
    total += model.paras[k].len;
  }
  const p = model.paras[pi];
  return { at: before + Math.max(0, Math.min(p.len, c - p.from)), total };
}

// כל המילים שזוהו בשורות הקבוצה, בסדר הקריאה; null אם ברבע מהשורות לא זוהו מילים
function groupScanWords(lines, g) {
  const out = [];
  let missing = 0;
  for (let i = g.s0; i < g.s1; i++) {
    const ws = (lines[i]?.words || []).filter((wd) => isBox(wd?.bbox));
    if (!ws.length) {
      // שורה בלי מילים מזוהות (קישוט/רעש) — מדלגים; אם רבות כאלה — אין על מה לסמוך
      missing++;
      continue;
    }
    for (const wd of [...ws].sort((a, b) => b.bbox[2] - a.bbox[2])) out.push({ si: i, bbox: wd.bbox });
  }
  return out.length && missing <= 0.25 * (g.s1 - g.s0) ? out : null;
}

/**
 * האם מספר המילים בטקסט ובצילום של יחידה (קבוצה / שורה) קרובים מספיק כדי לסמוך על מסגרת
 * מילה בה: הפרש של עד מילה אחת, או עד ratio (יחסית). פריסה שלא זוהתה נכון (פירוש סביב,
 * טורים שלא הופרדו, טקסט שהוא רק חלק מהעמוד) נותנת כאן פערים גדולים.
 * @param {number} textWords
 * @param {number} scanWords
 * @param {number} [ratio]
 */
export function countsAgree(textWords, scanWords, ratio = 0.2) {
  if (!(textWords > 0) || !(scanWords > 0)) return false;
  return Math.abs(textWords - scanWords) <= Math.max(1, ratio * Math.max(textWords, scanWords));
}

const groupWordCount = (model, g) => {
  let n = 0;
  for (let k = g.t0; k < g.t1; k++) n += model.paras[k].nw || 0;
  return n;
};

// מספר המילה (שמתחילה בתו הנראה c בשורה, בקטע pi) בתוך הקבוצה
function wordIndexInGroup(model, g, pi, lineText, c) {
  let n = 0;
  for (let k = g.t0; k < pi; k++) n += model.paras[k].nw || 0;
  const { vis } = visibleMap(lineText);
  const p = model.paras[pi];
  for (const wd of lineWords(lineText)) {
    const v = vis[wd.start];
    if (v >= p.from && v < c) n++;
  }
  return n;
}

// יישור המילים של קבוצה (alignWordWidths), שמור במודל — וגם לפי התוכן (אורכי המילים בטקסט +
// טווח שורות הצילום, לכל מערך שורות), כך שמודל חדש אחרי הקלדה (buildFlow רץ מחדש בכל שינוי
// טקסט) לא מחשב מחדש קבוצות שהטקסט שלהן לא השתנה.
/** @type {WeakMap<object, Map<string, Int32Array|null>>} */
const WORD_MAPS = new WeakMap();
function groupWordMap(model, g, sw, lines) {
  const key = `${g.t0}:${g.t1}:${g.s0}:${g.s1}`;
  const cache = model.wordMaps;
  if (cache?.has(key)) return cache.get(key);
  const tl = [];
  for (let k = g.t0; k < g.t1; k++) tl.push(...(model.paras[k].wl || []));
  let byLines = lines && typeof lines === 'object' ? WORD_MAPS.get(lines) : null;
  if (lines && typeof lines === 'object' && !byLines) WORD_MAPS.set(lines, (byLines = new Map()));
  const ck = `${g.s0}:${g.s1}|${tl.join(',')}`;
  let map = byLines?.get(ck);
  if (map === undefined) {
    map = alignWordWidths(tl, sw.map((wd) => wd.bbox[2] - wd.bbox[0]));
    if (byLines) {
      byLines.set(ck, map);
      if (byLines.size > 64) byLines.delete(byLines.keys().next().value);
    }
  }
  cache?.set(key, map);
  return map;
}

/**
 * עקביות היישור אחרי שנבנה: בכל שורת צילום (בקבוצות עם מילים מזוהות) — האם מספר מילות הטקסט
 * שיושרו אליה קרוב למספר המילים שזוהו בה (countsAgree). יישור נכון: כמעט כל השורות; פריסה
 * שגויה (טורים שנקראו בסדר הלא נכון, גושים נפרדים בתוך טור) — הרבה פחות, גם כשסך המילים
 * בקבוצה מסכים. מחשב (ושומר במטמון) את יישורי המילים של כל הקבוצות — מחמם גם את flowCaret.
 * @param {{ bbox: number[], words?: { bbox: number[] }[] }[]} lines
 * @param {FlowModel} model
 * @returns {{ agree: number, total: number }}
 */
export function flowLineAgreement(lines, model) {
  let agree = 0;
  let total = 0;
  for (const g of model?.groups || []) {
    if (!(g.s1 > g.s0)) continue;
    const sw = groupScanWords(lines, g);
    if (!sw || !(groupWordCount(model, g) > 0)) continue;
    const map = groupWordMap(model, g, sw, lines);
    if (!map) continue;
    const hits = new Map();
    for (const j of map) if (j >= 0) hits.set(sw[j].si, (hits.get(sw[j].si) || 0) + 1);
    const per = new Map();
    for (const wd of sw) per.set(wd.si, (per.get(wd.si) || 0) + 1);
    for (const [si, n] of per) {
      total++;
      if (Math.abs((hits.get(si) || 0) - n) <= Math.max(1, 0.2 * n)) agree++;
    }
  }
  return { agree, total };
}

// אינדקס המילה בצילום (מתוך groupScanWords) הקרובה לנקודה x בשורה si
function nearestScanWord(sw, si, x) {
  let best = 0;
  let bd = Infinity;
  sw.forEach((wd, j) => {
    const d = wd.si === si ? (x > wd.bbox[2] ? x - wd.bbox[2] : x < wd.bbox[0] ? wd.bbox[0] - x : 0) : Infinity;
    if (d < bd) [best, bd] = [j, d];
  });
  return best;
}

/**
 * מה לסמן בצילום לסמן במיקום pos (מבנה זהה ל-CaretTrack של caretTrack.js; kind תמיד משוער).
 * @param {string} text
 * @param {number} pos
 * @param {{ bbox: number[], words?: { bbox: number[] }[] }[]} lines
 * @param {FlowModel} model
 */
export function flowCaret(text, pos, lines, model) {
  const c = caretInfo(text, pos);
  const out = { line: c.line, word: c.word, lineWords: c.words.length, lineCount: lineCount(text), scanIndex: null, lineEstimated: false, lineBox: null, wordBox: null, kind: null, confident: false };
  if (!model) return out;
  const { vis } = visibleMap(c.lineText);
  const w = c.word >= 0 ? c.words[c.word] : null;
  const startVis = vis[Math.min(w ? w.start : c.col, vis.length - 1)];
  const endVis = vis[Math.min(w ? w.end : c.col, vis.length - 1)];
  const pi = segmentAt(model, c.line, startVis);
  if (pi < 0) return out;
  const g = groupOfPara(model, pi);
  if (!g) {
    // פסקה בלי מקבילה בצילום — תחילת הקבוצה הבאה; המילה הראשונה (הימנית) בה כהערכה
    const si = fallbackScanIndex(model, pi);
    if (si == null || !isBox(lines[si]?.bbox)) return out;
    out.scanIndex = si;
    out.lineBox = lines[si].bbox;
    const first = (lines[si].words || []).filter((wd) => isBox(wd?.bbox)).sort((a, b) => b.bbox[2] - a.bbox[2])[0];
    if (c.word >= 0) {
      const b = lines[si].bbox;
      out.wordBox = first ? first.bbox : [b[2] - Math.min(b[2] - b[0], b[3] - b[1]), b[1], b[2], b[3]];
      out.kind = 'dashed';
    }
    return out;
  }
  const a = groupOffset(model, g, pi, startVis);
  const b = groupOffset(model, g, pi, endVis);
  const pa = placeInGroup(model, lines, g, a.at, a.total);
  const pb = placeInGroup(model, lines, g, b.at, b.total);
  // מילים שזוהו בצילום בכל שורות הקבוצה: מספר המילה בקבוצה (טקסט) → אותו מספר יחסי בצילום,
  // ממוצע עם ההערכה לפי התווים. בלי מילים מזוהות בכל השורות — רק לפי התווים.
  if (w) {
    const sw = groupScanWords(lines, g);
    const nt = groupWordCount(model, g);
    if (sw && nt > 0) {
      const jt = wordIndexInGroup(model, g, pi, c.lineText, startVis);
      const map = groupWordMap(model, g, sw, lines);
      let j = map && jt < map.length ? map[jt] : -1;
      if (j < 0) {
        const byCount = ((jt + 0.5) * sw.length) / nt - 0.5;
        const byChars = nearestScanWord(sw, pa.scanIndex, (pa.x + pb.x) / 2);
        j = Math.max(0, Math.min(sw.length - 1, Math.round((byCount + byChars) / 2)));
      }
      const hit = sw[j];
      out.confident = countsAgree(nt, sw.length);
      out.scanIndex = hit.si;
      out.lineBox = lines[hit.si].bbox;
      out.wordBox = hit.bbox;
      out.kind = 'dashed';
      return out;
    }
  }
  const line = lines[pa.scanIndex];
  out.scanIndex = pa.scanIndex;
  out.lineBox = line.bbox;
  if (!w) return out;
  const xR = pa.x;
  const xL = pb.scanIndex === pa.scanIndex ? pb.x : line.bbox[0];
  // מילה בצילום שחופפת הכי הרבה לטווח המשוער; בלי מילים — הטווח עצמו
  let best = null;
  let bestOv = 0;
  for (const wd of line.words || []) {
    if (!isBox(wd?.bbox)) continue;
    const ov = Math.min(xR, wd.bbox[2]) - Math.max(xL, wd.bbox[0]);
    const mid = (xR + xL) / 2;
    const score = ov > 0 ? ov : -Math.min(Math.abs(mid - wd.bbox[0]), Math.abs(mid - wd.bbox[2]));
    if (best == null || score > bestOv) [best, bestOv] = [wd, score];
  }
  out.wordBox = best ? best.bbox : [Math.min(xL, xR), line.bbox[1], Math.max(xL, xR), line.bbox[3]];
  out.kind = 'dashed';
  return out;
}

/**
 * היעד בצילום של כל מילה ברשימה (מבנה { off, si, box }), לפי פונקציית המעקב קדימה — כדי
 * שהכיוון ההפוך (לחיצה על הצילום) יהיה בדיוק ההופכי שלה.
 * @param {number[]} offsets היסטי תחילת המילים, בסדר הקריאה
 * @param {(off: number) => { scanIndex: number|null, wordBox: number[]|null }} track
 * @returns {{ off: number, si: number|null, box: number[]|null }[]}
 */
export function scanTargets(offsets, track) {
  return offsets.map((off) => {
    const t = track(off);
    return { off, si: t?.scanIndex ?? null, box: isBox(t?.wordBox) ? t.wordBox : null };
  });
}

const sameBox = (a, b) => a === b || (isBox(a) && isBox(b) && a.every((v, i) => Math.abs(v - b[i]) < 0.01));

/**
 * הכיוון ההפוך של המעקב: לחיצה בנקודה x בשורת הצילום si → המילה בטקסט שהמעקב קדימה מסמן
 * במקום הזה (מתוך scanTargets). מילה שהתיבה שלה מכילה את x; כמה מילים על אותה תיבה (מילה
 * אחת בצילום שהן שתיים בטקסט) — חלוקת התיבה ביניהן מימין לשמאל; x בין המילים — הקרובה.
 * בשורה בלי אף יעד — המילה הראשונה שאחריה (או האחרונה). null כשאין יעדים.
 * @param {{ off: number, si: number|null, box: number[]|null }[]} targets בסדר הקריאה
 * @param {number} si
 * @param {number} x
 * @returns {{ off: number, si: number|null, box: number[]|null }|null}
 */
export function pickTarget(targets, si, x) {
  const all = (targets || []).filter((t) => t.si != null);
  if (!all.length) return null;
  const on = all.filter((t) => t.si === si && isBox(t.box));
  if (!on.length) return all.find((t) => t.si > si) || all[all.length - 1];
  const dist = (b) => (x > b[2] ? x - b[2] : x < b[0] ? b[0] - x : 0);
  // התיבה: המכילה את x (הצרה מביניהן, אם חופפות), אחרת הקרובה
  let best = on[0].box;
  for (const t of on) {
    const d = dist(t.box);
    const bd = dist(best);
    if (d < bd || (d === bd && d === 0 && t.box[2] - t.box[0] < best[2] - best[0])) best = t.box;
  }
  const same = on.filter((t) => sameBox(t.box, best));
  if (same.length === 1) return same[0];
  const w = Math.max(1e-6, best[2] - best[0]);
  const k = Math.floor(((best[2] - Math.max(best[0], Math.min(best[2], x))) / w) * same.length);
  return same[Math.max(0, Math.min(same.length - 1, k))];
}

// היסטי תחילת כל מילות הטקסט בקבוצה, בסדר הקריאה (אותה חלוקה לקטעים כמו ב-buildFlow)
function groupTextOffsets(s, model, g) {
  const ls = splitLines(s);
  const st = lineStarts(s);
  const out = [];
  for (let k = g.t0; k < g.t1; k++) {
    const p = model.paras[k];
    const lt = ls[p.line] ?? '';
    const { vis } = visibleMap(lt);
    const from = p.from ?? 0;
    const to = Number.isFinite(p.len) && p.from != null ? from + p.len : Infinity;
    for (const wd of lineWords(lt)) {
      const v = vis[wd.start];
      if (v >= from && v < to) out.push(st[p.line] + wd.start);
    }
  }
  return out;
}

// יעדי המעקב קדימה של כל מילות הקבוצה, שמורים במודל (המודל נבנה לטקסט אחד)
function groupTargets(s, lines, model, g) {
  const key = `${g.t0}:${g.t1}:${g.s0}:${g.s1}`;
  if (!model.targets) Object.defineProperty(model, 'targets', { value: new Map(), enumerable: false });
  const hit = model.targets.get(key);
  if (hit && hit.text === s && hit.lines === lines) return hit.list;
  const list = scanTargets(groupTextOffsets(s, model, g), (off) => flowCaret(s, off, lines, model));
  model.targets.set(key, { text: s, lines, list });
  return list;
}

/**
 * הכיוון ההפוך: נקודה x בשורת צילום → היסט גולמי בטקסט (תחילת המילה). ההופכי המדויק של
 * flowCaret: המילה בטקסט שהמעקב קדימה מסמן בנקודה הזו (pickTarget). -1 כשאין.
 * @param {string} text
 * @param {{ bbox: number[] }[]} lines
 * @param {FlowModel} model
 * @param {number} scanIndex
 * @param {number} x
 */
export function flowOffsetFromScan(text, lines, model, scanIndex, x) {
  if (!model || !lines?.[scanIndex]) return -1;
  const g = model.groups.find((q) => q.s0 <= scanIndex && scanIndex < q.s1 && q.t1 > q.t0);
  if (!g) {
    // שורת צילום בלי מקבילה בטקסט — תחילת פסקת הטקסט הבאה (או סוף הקודמת)
    const k = model.groups.findIndex((q) => q.s0 <= scanIndex && scanIndex < q.s1);
    if (k < 0) return -1;
    const next = model.groups.slice(k + 1).find((q) => q.t1 > q.t0);
    const prev = [...model.groups.slice(0, k)].reverse().find((q) => q.t1 > q.t0);
    const s = String(text ?? '');
    if (next) return rawOffset(s, model.paras[next.t0].line, model.paras[next.t0].from);
    if (prev) {
      const li = model.paras[prev.t1 - 1].line;
      return lineStarts(s)[li] + (splitLines(s)[li] ?? '').length;
    }
    return -1;
  }
  const s = String(text ?? '');
  const b = lines[scanIndex].bbox;
  const t = pickTarget(groupTargets(s, lines, model, g), scanIndex, Number.isFinite(x) ? x : b[2]);
  if (t) return t.off;
  return rawOffset(s, model.paras[g.t0].line, model.paras[g.t0].from ?? 0);
}

// תו נראה c בשורת הטקסט lineIdx → היסט גולמי בטקסט כולו, בתחילת המילה
function rawOffset(s, lineIdx, c) {
  const lineText = splitLines(s)[lineIdx] ?? '';
  const { vis } = visibleMap(lineText);
  let raw = 0;
  while (raw < lineText.length && vis[raw + 1] <= c) raw++;
  // לתחילת המילה: אחורה עד רווח
  while (raw > 0 && !/\s/.test(lineText[raw - 1])) raw--;
  return lineStarts(s)[lineIdx] + raw;
}
