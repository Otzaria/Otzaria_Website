// פרופיל הקרנה של תמונת עמוד שלמה → שורות ומילים (לוגיקה טהורה). מחבר את חלקי
// projectionProfile: סף אחד לכל העמוד, קיטום שוליים כהים של הסורק, detectLines על
// השורות, ו-detectWordGaps לכל שורה. מקבל בתי RGBA (getImageData של תמונה מוקטנת) ומחזיר
// את התוצאה בפיקסלים הטבעיים של התמונה (מחולק ב-scale) — בצורה ש-trackingSource.fromProfile
// מקבל. הצד שקורא ל-canvas: src/hooks/useScanLines.js.

import { grayToInk, detectLines, detectWordGaps } from './projectionProfile.js';

/** שורה עם יותר "מילים" מזה היא רעש (ציור, כתם, קישוט) — נשמרת רק כשורה */
export const MAX_WORDS_PER_LINE = 40;

const round2 = (v) => Math.round(v * 100) / 100;

/** צד הטביעה (FP_SIZE×FP_SIZE ערכי אפור) */
export const FP_SIZE = 16;
/** הפרש ממוצע (רמות אפור) שמעליו — תמונה אחרת. אותה תמונה באותה דרך חישוב: ~0; עמודים שונים
 * מאותו ספר: 2.3 ומעלה (נמדד על 45 עמודים) */
export const FP_TOLERANCE = 1.2;

/**
 * טביעת אצבע זולה של תמונה: ממוצע האפור בכל תא של רשת FP_SIZE×FP_SIZE (ערכים שלמים 0..255).
 * הקורא מעביר בתי RGBA (בדרך כלל ציור התמונה ל-canvas בגודל FP_SIZE×FP_SIZE — אז כל תא פיקסל).
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w
 * @param {number} h
 * @returns {number[]|null}
 */
export function grayFingerprint(rgba, w, h) {
  if (!(w > 0) || !(h > 0) || !rgba || rgba.length < w * h * 4) return null;
  const N = FP_SIZE;
  const sum = new Float64Array(N * N);
  const cnt = new Uint32Array(N * N);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(N - 1, Math.floor((y * N) / h));
    for (let x = 0; x < w; x++) {
      const g = gy * N + Math.min(N - 1, Math.floor((x * N) / w));
      const i = (y * w + x) * 4;
      sum[g] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      cnt[g]++;
    }
  }
  return Array.from(sum, (v, i) => (cnt[i] ? Math.round(v / cnt[i]) : 255));
}

/** הפרש ממוצע בין שתי טביעות (Infinity כשאינן תקינות / באורך שונה) */
export function fingerprintDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * האם פרופיל שמור (לפי כתובת) עדיין שייך לתמונה שנטענה: ממדיה הטבעיים זהים (עד פיקסל — עיגול
 * בהקטנה), וכשיש טביעת אצבע לשתיהן — גם היא (תמונה שהוחלפה באחרת באותן מידות). כתובת שלא
 * השתנתה אבל התמונה בה הוחלפה (העלאה מחדש / חיתוך) → פרופיל ישן לזרוק.
 * @param {{ size?: unknown, fp?: unknown }|null|undefined} profile
 * @param {number} w
 * @param {number} h
 * @param {number[]|null} [fp] טביעת התמונה שנטענה (grayFingerprint)
 */
export function profileFitsImage(profile, w, h, fp = null) {
  const s = profile?.size;
  if (!Array.isArray(s) || s.length !== 2 || !(w > 0) || !(h > 0)) return false;
  if (!(Math.abs(Number(s[0]) - w) <= 1 && Math.abs(Number(s[1]) - h) <= 1)) return false;
  if (Array.isArray(fp) && Array.isArray(profile?.fp)) return fingerprintDistance(profile.fp, fp) <= FP_TOLERANCE;
  return true;
}

/**
 * פי כמה להקטין את התמונה לפני הניתוח: רוחב עד maxWidth ושטח עד maxPixels. לא מגדילים.
 * @param {number} w
 * @param {number} h
 * @param {{ maxWidth?: number, maxPixels?: number }} [opts]
 * @returns {number} 0 < scale ≤ 1
 */
export function analysisScale(w, h, { maxWidth = 1400, maxPixels = 2_000_000 } = {}) {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(1, maxWidth / w, Math.sqrt(maxPixels / (w * h)));
}

// כמה עמודות/שורות "מלאות" (דיו ביותר מ-ratio מהאורך) יש ברצף מכל קצה — פס הצל של הסורק
function solidEdges(ink, len, ratio) {
  const n = ink.length;
  let a = 0;
  while (a < n && ink[a] > ratio * len) a++;
  let b = n;
  while (b > a && ink[b - 1] > ratio * len) b--;
  return [a, b];
}

// ריצות של ערכים "ריקים" (≤ limit) במערך: [{ a, b }] (b לא כולל)
function emptyRuns(arr, limit, from = 0, to = arr.length) {
  const out = [];
  for (let i = from; i < to; ) {
    if (arr[i] > limit) {
      i++;
      continue;
    }
    let e = i;
    while (e < to && arr[e] <= limit) e++;
    out.push({ a: i, b: e });
    i = e;
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * חלוקת גוף העמוד לגושים אופקיים לפי רווחים לבנים גדולים (כותרת עליונה, גוף, ריהוט):
 * רווח של שורות ריקות לכל הרוחב, גבוה פי gapRatio מהרווח החציוני בין שורות.
 * @param {ArrayLike<number>} rows דיו לכל שורת פיקסלים בתוך הגוף
 * @param {{ gapRatio?: number, minGap?: number }} [o]
 * @returns {{ y0: number, y1: number }[]} יחסית לתחילת המערך
 */
export function splitBlocks(rows, { gapRatio = 2.5, minGap = 6 } = {}) {
  const n = rows.length;
  const runs = emptyRuns(rows, 0).filter((r) => r.a > 0 && r.b < n);
  const big = Math.max(minGap, gapRatio * median(runs.map((r) => r.b - r.a)));
  const blocks = [];
  let y = 0;
  for (const r of runs) {
    if (r.b - r.a < big) continue;
    if (r.a > y) blocks.push({ y0: y, y1: r.a });
    y = r.b;
  }
  if (n > y) blocks.push({ y0: y, y1: n });
  return blocks;
}

/**
 * תעלה אנכית בין שני טורים: הרצף הרחב ביותר של עמודות כמעט ריקות במרכז הגוש
 * (בין lo ל-hi מהרוחב). null — אין שני טורים.
 * @param {ArrayLike<number>} cols דיו לכל עמודה בגוש
 * @param {number} height גובה הגוש
 * @param {{ lo?: number, hi?: number, inkRatio?: number, minWidth?: number }} [o]
 * @returns {{ x0: number, x1: number }|null} יחסית לתחילת המערך
 */
export function findGutter(cols, height, { lo = 0.25, hi = 0.75, inkRatio = 0.02, minWidth = 4 } = {}) {
  const n = cols.length;
  if (n < 20 || !(height > 0)) return null;
  const runs = emptyRuns(cols, inkRatio * height, Math.floor(lo * n), Math.ceil(hi * n));
  let best = null;
  for (const r of runs) if (!best || r.b - r.a > best.b - best.a) best = r;
  if (!best || best.b - best.a < Math.max(minWidth, 0.006 * n)) best = narrowGutter(cols, height, { lo, hi });
  return best && bothSidesInked(cols, best) ? { x0: best.a, x1: best.b } : null;
}

// שני הצדדים של התעלה צריכים להכיל טקסט של ממש
function bothSidesInked(cols, g) {
  let left = 0;
  let right = 0;
  for (let x = 0; x < g.a; x++) left += cols[x];
  for (let x = g.b; x < cols.length; x++) right += cols[x];
  const total = left + right;
  return total > 0 && left >= 0.15 * total && right >= 0.15 * total;
}

/**
 * תעלה צרה (או מעט "מלוכלכת" — עמוד מוטה קלות, אות שבולטת לתוכה): עמק עמוק בפרופיל
 * העמודות (ממוצע נע של 3), שהדיו בתחתיתו עד maxRatio מהגובה ועד valleyRatio מהדיו הרגיל
 * בעמודות הטקסט. הרוחב — העמודות סביב התחתית שהדיו בהן עד פי 2 מהתחתית (או 1% מהגובה).
 * @param {ArrayLike<number>} cols
 * @param {number} height
 * @param {{ lo?: number, hi?: number, maxRatio?: number, valleyRatio?: number, minWidth?: number }} [o]
 * @returns {{ a: number, b: number }|null}
 */
export function narrowGutter(cols, height, { lo = 0.25, hi = 0.75, maxRatio = 0.06, valleyRatio = 0.25, minWidth = 3 } = {}) {
  const n = cols.length;
  if (n < 20 || !(height > 0)) return null;
  const sm = new Float64Array(n);
  for (let x = 0; x < n; x++) sm[x] = (cols[Math.max(0, x - 1)] + cols[x] + cols[Math.min(n - 1, x + 1)]) / 3;
  const a0 = Math.floor(lo * n);
  const b0 = Math.ceil(hi * n);
  let at = -1;
  for (let x = a0; x < b0; x++) if (at < 0 || sm[x] < sm[at]) at = x;
  if (at < 0) return null;
  const typ = median(Array.from(sm.slice(Math.floor(0.1 * n), Math.ceil(0.9 * n))).filter((v) => v > 0));
  const floor = sm[at];
  if (!(typ > 0) || floor > maxRatio * height || floor > valleyRatio * typ) return null;
  const lim = Math.max(2 * floor, 0.01 * height);
  let a = at;
  let b = at + 1;
  while (a > a0 && sm[a - 1] <= lim) a--;
  while (b < b0 && sm[b] <= lim) b++;
  return b - a >= minWidth ? { a, b } : null;
}

/**
 * סוף פסקה בטור: שורה שמסתיימת (בצד שמאל, RTL) הרבה לפני הקצה השמאלי הרגיל של הטור.
 * @param {{ bbox: number[] }[]} lines שורות של טור אחד
 * @param {number} [ratio] כמה מרוחב הטור חסר בצד שמאל כדי להיחשב סוף פסקה
 * @returns {boolean[]}
 */
export function paragraphEnds(lines, ratio = 0.12) {
  if (!lines.length) return [];
  const xs0 = lines.map((l) => l.bbox[0]).sort((a, b) => a - b);
  const xs1 = lines.map((l) => l.bbox[2]).sort((a, b) => a - b);
  const left = xs0[Math.floor(0.2 * (xs0.length - 1))];
  const right = xs1[Math.floor(0.8 * (xs1.length - 1))];
  const w = right - left;
  if (!(w > 0)) return lines.map(() => false);
  return lines.map((l) => l.bbox[0] - left > ratio * w);
}

/**
 * כותרת עליונה משותפת בראש שני הטורים: בכל טור, עד maxLines שורות ראשונות שאחריהן רווח
 * גדול פי gapRatio מהרווח החציוני בטור, והגוף שאחרי הרווח מתחיל בשני הטורים באותו גובה
 * בערך. מחזיר כמה שורות להוציא מכל טור, או null.
 * @param {{ bbox: number[] }[]} right
 * @param {{ bbox: number[] }[]} left
 * @param {{ gapRatio?: number, maxLines?: number }} [o]
 * @returns {{ right: number, left: number }|null}
 */
export function headerLines(right, left, { gapRatio = 2, maxLines = 3 } = {}) {
  const cut = (ls) => {
    if (ls.length < maxLines + 2) return 0;
    const gaps = ls.slice(1).map((l, i) => l.bbox[1] - ls[i].bbox[3]);
    const med = Math.max(1, median(gaps));
    for (let k = 0; k < maxLines; k++) if (gaps[k] > gapRatio * med) return k + 1;
    return 0;
  };
  const r = cut(right);
  const l = cut(left);
  if (!r || !l) return null;
  const lh = median([...right, ...left].map((x) => x.bbox[3] - x.bbox[1]));
  return Math.abs(right[r].bbox[1] - left[l].bbox[1]) <= 2 * lh ? { right: r, left: l } : null;
}

/**
 * @typedef {{ bbox: [number, number, number, number], words: [number, number][], stream?: string, paraEnd?: boolean }} ProfileLine
 * @typedef {{ size: [number, number], lines: ProfileLine[], threshold: number }} ScanProfile
 */

/**
 * ניתוח עמוד: שורות (ומילים בכל שורה) מתוך בתי RGBA.
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w רוחב התמונה שנותחה
 * @param {number} h גובה התמונה שנותחה
 * @param {{ scale?: number, edgeRatio?: number, lineOpts?: object }} [opts]
 *   scale — היחס בין התמונה שנותחה לטבעית (analysisScale); edgeRatio — עמודה/שורה שהדיו בה
 *   מעל היחס הזה באורכה נחשבת לשוליים כהים ונחתכת
 * @returns {ScanProfile}
 */
export function profileFromRgba(rgba, w, h, { scale = 1, edgeRatio = 0.5, lineOpts = {} } = {}) {
  const k = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const size = /** @type {[number, number]} */ ([Math.round(w / k), Math.round(h / k)]);
  if (!(w > 0) || !(h > 0) || !rgba || rgba.length < w * h * 4) return { size, lines: [], threshold: 128 };

  const all = grayToInk(rgba, w, h);
  const t = all.threshold;
  const [cx0, cx1] = solidEdges(all.cols, h, edgeRatio);
  const [ry0, ry1] = solidEdges(all.rows, w, edgeRatio);
  if (cx1 - cx0 < 8 || ry1 - ry0 < 8) return { size, lines: [], threshold: t };
  const rect = { x: cx0, y: ry0, w: cx1 - cx0, h: ry1 - ry0 };

  const body = grayToInk(rgba, w, h, rect, { threshold: t });
  const sc = (v) => round2(v / k);

  // שורות (ומילים) בתוך מלבן אחד — טור, או גוש ברוחב מלא
  const linesIn = (r) => {
    const ink = grayToInk(rgba, w, h, r, { threshold: t });
    const out = [];
    for (const b of detectLines(ink.rows, { ...lineOpts, offset: r.y })) {
      const lh = b.y1 - b.y0;
      const li = grayToInk(rgba, w, h, { x: r.x, y: b.y0, w: r.w, h: lh }, { threshold: t });
      const spans = detectWordGaps(li.cols, { lineHeight: lh, offset: r.x });
      if (!spans.length) continue;
      const x0 = Math.min(...spans.map((s) => s.x0));
      const x1 = Math.max(...spans.map((s) => s.x1));
      out.push({
        bbox: /** @type {[number, number, number, number]} */ ([sc(x0), sc(b.y0), sc(x1), sc(b.y1)]),
        words: spans.length <= MAX_WORDS_PER_LINE ? spans.map((s) => /** @type {[number, number]} */ ([sc(s.x0), sc(s.x1)])) : [],
      });
    }
    return out;
  };
  const withParas = (ls, stream) => {
    const ends = paragraphEnds(ls);
    return ls.map((l, i) => ({ ...l, stream, paraEnd: ends[i] }));
  };

  // גושים אופקיים; בכל גוש — שני טורים אם יש תעלה באמצע. סדר הקריאה: גוש אחרי גוש,
  // ובגוש של שני טורים — הימני כולו ואחריו השמאלי.
  // גוש נחשב לשני טורים רק אם בכל צד יש לפחות 3 שורות (כותרת עליונה עם רווח באמצע אינה טורים)
  const blocks = splitBlocks(body.rows).map((b) => {
    const r = { x: rect.x, y: rect.y + b.y0, w: rect.w, h: b.y1 - b.y0 };
    const g = findGutter(grayToInk(rgba, w, h, r, { threshold: t }).cols, r.h);
    if (g) {
      const R = linesIn({ x: r.x + g.x1, y: r.y, w: r.w - g.x1, h: r.h });
      const L = linesIn({ x: r.x, y: r.y, w: g.x0, h: r.h });
      if (R.length >= 3 && L.length >= 3) return { r, cols: { R, L } };
    }
    return { r, cols: null };
  });
  const firstCols = blocks.findIndex((b) => b.cols);
  const lastCols = blocks.length - 1 - [...blocks].reverse().findIndex((b) => b.cols);

  /** @type {ProfileLine[]} */
  const lines = [];
  blocks.forEach(({ r, cols }, i) => {
    if (cols) {
      const { R, L } = cols;
      // כותרת עליונה שלא הופרדה ברווח גדול: השורה הראשונה בשני הטורים, באותו גובה,
      // ואחריה רווח גדול מהרגיל — מוציאים אותה מהטורים
      const hd = i === firstCols ? headerLines(R, L) : null;
      if (hd) {
        const head = [...R.splice(0, hd.right), ...L.splice(0, hd.left)];
        lines.push(...head.map((l) => ({ ...l, stream: 'header', paraEnd: false })));
      }
      lines.push(...withParas(R, 'right'), ...withParas(L, 'left'));
      return;
    }
    const ls = linesIn(r);
    // גוש קצר ברוחב מלא מעל/מתחת לטורים — כותרת עליונה / שורה תחתונה, לא חלק מהטקסט
    const short = ls.length > 0 && ls.length <= 2;
    const stream = firstCols >= 0 && i < firstCols && short ? 'header' : firstCols >= 0 && i > lastCols && short ? 'footer' : 'main';
    lines.push(...withParas(ls, stream));
  });
  return { size, lines, threshold: t };
}
