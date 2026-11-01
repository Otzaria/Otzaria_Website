// פרופיל הקרנה: זיהוי שורות ומרווחי מילים מתוך סכומי "דיו" לשורה/לעמודה (לוגיקה טהורה).
// מקבל מערכים, לא canvas — הקורא שולף getImageData ומעביר כאן את הבתים (grayToInk).
// מתאים לעמוד נקי בכתב אחיד; ניקוד וטעמים (כתמים דקים מעל/מתחת לשורה) מתמזגים בשורה
// הסמוכה ולא נספרים כשורה לעצמם.

/**
 * @typedef {{ y0: number, y1: number, ink: number }} Band  y1 לא כולל; ink = סכום הדיו בפס
 * @typedef {{ x0: number, x1: number }} Span  x1 לא כולל
 */

const num = (v, d) => (Number.isFinite(v) ? v : d);

function quantile(arr, q) {
  const s = Array.from(arr).filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

/** החלקה בממוצע נע ברדיוס r */
export function smooth(values, r = 1) {
  const n = values.length;
  const out = new Float64Array(n);
  const R = Math.max(0, Math.trunc(r));
  if (!R) {
    for (let i = 0; i < n; i++) out[i] = values[i];
    return out;
  }
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + num(values[i], 0);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - R);
    const b = Math.min(n, i + R + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/** סף Otsu על היסטוגרמה של 256 רמות אפור */
export function otsuThreshold(hist) {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  if (!total) return 128;
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > best) {
      best = v;
      t = i;
    }
  }
  return t;
}

/**
 * בתי RGBA (getImageData) → סכומי דיו לכל שורה ולכל עמודה בתוך rect, אחרי סף (Otsu אם לא
 * ניתן). פיקסל שקוף נחשב לבן. rect נקטם לגבולות התמונה.
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w רוחב התמונה
 * @param {number} h גובה התמונה
 * @param {{ x: number, y: number, w: number, h: number }} [rect]
 * @param {{ threshold?: number }} [opts] threshold — רמת אפור (עד וכולל = דיו)
 * @returns {{ rows: Float64Array, cols: Float64Array, threshold: number, rect: { x: number, y: number, w: number, h: number } }}
 */
export function grayToInk(rgba, w, h, rect = { x: 0, y: 0, w, h }, { threshold } = {}) {
  const rx = Math.trunc(num(rect?.x, 0));
  const ry = Math.trunc(num(rect?.y, 0));
  const x0 = Math.max(0, rx);
  const y0 = Math.max(0, ry);
  const x1 = Math.min(w, rx + Math.max(0, Math.trunc(num(rect?.w, w))));
  const y1 = Math.min(h, ry + Math.max(0, Math.trunc(num(rect?.h, h))));
  const rw = Math.max(0, x1 - x0);
  const rh = Math.max(0, y1 - y0);
  const gray = new Uint8Array(rw * rh);
  const hist = new Float64Array(256);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const p = ((y + y0) * w + (x + x0)) * 4;
      const a = (rgba[p + 3] ?? 255) / 255;
      const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      const g = Math.round(lum * a + 255 * (1 - a));
      gray[y * rw + x] = g;
      hist[g]++;
    }
  }
  const t = Number.isFinite(threshold) ? /** @type {number} */ (threshold) : otsuThreshold(hist);
  const rows = new Float64Array(rh);
  const cols = new Float64Array(rw);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (gray[y * rw + x] <= t) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  return { rows, cols, threshold: t, rect: { x: x0, y: y0, w: rw, h: rh } };
}

/**
 * פסי השורות מפרופיל אופקי (דיו לכל שורת פיקסלים).
 * @param {ArrayLike<number>} rowInk
 * @param {{ smoothRadius?: number, ratio?: number, minInk?: number, minHeight?: number,
 *   speckRatio?: number, offset?: number }} [opts]
 *   ratio — הסף כשבר מאחוזון 90 של הפרופיל; speckRatio — פס נמוך מזה (ביחס לגובה החציוני)
 *   הוא ניקוד/כתם ומתמזג בשכן הקרוב; minHeight — פס נמוך מזה שלא התמזג נזרק;
 *   offset — מוסף ל-y (כשהפרופיל נחתך מתוך rect)
 * @returns {Band[]}
 */
export function detectLines(rowInk, { smoothRadius = 1, ratio = 0.12, minInk = 0, minHeight = 3, speckRatio = 0.4, offset = 0 } = {}) {
  const n = rowInk?.length || 0;
  if (!n) return [];
  const s = smooth(rowInk, smoothRadius);
  const t = Math.max(minInk, ratio * quantile(s, 0.9), 1e-9);
  /** @type {Band[]} */
  let bands = [];
  for (let y = 0; y < n; ) {
    if (s[y] <= t) {
      y++;
      continue;
    }
    let e = y;
    let ink = 0;
    while (e < n && s[e] > t) ink += num(rowInk[e++], 0);
    bands.push({ y0: y, y1: e, ink });
    y = e;
  }
  if (!bands.length) return [];

  // ניקוד/טעמים: פס נמוך מתמזג בשכן הקרוב (אם המרווח אליו לא גדול מגובה שורה)
  const heights = bands.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
  const tall = heights.filter((x) => x >= minHeight);
  const med = (tall.length ? tall : heights)[Math.floor((tall.length ? tall : heights).length / 2)];
  let changed = true;
  while (changed && bands.length > 1) {
    changed = false;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (b.y1 - b.y0 >= speckRatio * med) continue;
      const up = i > 0 ? b.y0 - bands[i - 1].y1 : Infinity;
      const dn = i + 1 < bands.length ? bands[i + 1].y0 - b.y1 : Infinity;
      const k = up <= dn ? i - 1 : i + 1;
      if (Math.min(up, dn) > med) continue;
      const o = bands[k];
      bands[Math.min(i, k)] = { y0: Math.min(o.y0, b.y0), y1: Math.max(o.y1, b.y1), ink: o.ink + b.ink };
      bands.splice(Math.max(i, k), 1);
      changed = true;
      break;
    }
  }
  bands = bands.filter((b) => b.y1 - b.y0 >= minHeight);
  return bands.map((b) => ({ y0: b.y0 + offset, y1: b.y1 + offset, ink: b.ink }));
}

/**
 * טווחי המילים בשורה מפרופיל אנכי (דיו לכל עמודה), ממוינים מימין לשמאל (x יורד).
 * @param {ArrayLike<number>} colInk
 * @param {{ minGap?: number, lineHeight?: number, inkThreshold?: number, offset?: number }} [opts]
 *   minGap — רוחב מרווח מינימלי בין מילים; בלעדיו — 0.25 × lineHeight, ובלעדיו — אדפטיבי
 *   (פי 2 מהמרווח החציוני בתוך השורה, לפחות 2)
 * @returns {Span[]}
 */
export function detectWordGaps(colInk, { minGap, lineHeight, inkThreshold = 0, offset = 0 } = {}) {
  const n = colInk?.length || 0;
  /** @type {Span[]} */
  const runs = [];
  for (let x = 0; x < n; ) {
    if (!(num(colInk[x], 0) > inkThreshold)) {
      x++;
      continue;
    }
    let e = x;
    while (e < n && num(colInk[e], 0) > inkThreshold) e++;
    runs.push({ x0: x, x1: e });
    x = e;
  }
  if (!runs.length) return [];
  const gaps = [];
  for (let i = 1; i < runs.length; i++) gaps.push(runs[i].x0 - runs[i - 1].x1);
  let g = minGap;
  if (!Number.isFinite(g)) {
    if (Number.isFinite(lineHeight) && /** @type {number} */ (lineHeight) > 0) g = 0.25 * /** @type {number} */ (lineHeight);
    else {
      const s = [...gaps].sort((a, b) => a - b);
      g = Math.max(2, 2 * (s.length ? s[Math.floor(s.length / 2)] : 0));
      // כל המרווחים דומים (מילה אחת עם רווחי-אותיות, או מילים במרווח אחיד) — מבחינים לפי הקפיצה
      if (s.length && s[s.length - 1] < g) g = s[s.length - 1] >= 2 * s[0] && s[0] > 0 ? s[s.length - 1] : Infinity;
    }
  }
  /** @type {Span[]} */
  const words = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    if (gaps[i - 1] >= /** @type {number} */ (g)) words.push({ ...runs[i] });
    else words[words.length - 1].x1 = runs[i].x1;
  }
  return words.map((w) => ({ x0: w.x0 + offset, x1: w.x1 + offset })).sort((a, b) => b.x0 - a.x0);
}
