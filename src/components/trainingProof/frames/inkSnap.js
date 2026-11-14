// הצמדה לדיו (docs/75 ה-10) — טהור: בלי DOM ובלי מסד, כדי שירוץ בדפדפן, בבדיקות ובשרת.
//
// האלגוריתם הוא זה של תחנת-המסגרות (src/station/frames.js, "הצמדה לדיו", שהועתק שם מ-framesnap.js
// של העורך), כדי שמסגרת שמצוירת באתר תיצמד בדיוק כמו בתחנה:
//   1. הדיו מסווג לרכיבים: אות · סימן קטן ליד אות (ניקוד, נקודה) · כתם · פס-סורק בשולי-הדף · קו/איור.
//   2. נבנות שתי רשתות של תאים בני CELL פיקסלים: "טקסט" (אותיות + הסימנים שלידן) ו"אובייקט" (כל הדיו
//      חוץ מכתמים ופס-סורק). מסגרת-טקסט נצמדת לרשת-הטקסט, מסגרת-אובייקט — לרשת-האובייקט.
//   3. כל קצה של המסגרת זז אל הרווח הלבן הקרוב (בתוך חלון של כשתי שורות), ומשאיר ריווח PAD.
// הקואורדינטות תמיד בפיקסלים של תמונת-העמוד (כמו בחוזה, docs/76 §2).

export const CELL = 4;
const NOISE = 0.01;
const GAP_REL = 0.1;
const PAD = 4;
// רוחב-הניתוח: תמונה רחבה מזה מוקטנת לפני הסיווג (מהירות), והרשת נשארת בגודל-המקור
export const ANALYZE_W = 1400;

// סף Otsu על היסטוגרמה של 256 גוונים
export function otsu(hist, tot) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let w = 0;
  let mu = 0;
  let best = -1;
  const bs = new Float64Array(256);
  for (let t = 0; t < 256; t++) {
    w += hist[t];
    mu += t * hist[t];
    const d = w * (tot - w);
    bs[t] = d > 0 ? (sum * w - mu * tot) ** 2 / d : 0;
    if (bs[t] > best) best = bs[t];
  }
  const top = [];
  for (let t = 0; t < 256; t++) if (bs[t] >= best * 0.999) top.push(t);
  return top.length ? Math.round(top.reduce((a, b) => a + b, 0) / top.length) + 1 : 128;
}

// RGBA (ImageData.data) → גווני-אפור
export function grayOf(rgba, n = rgba.length >> 2) {
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) gray[i] = (rgba[4 * i] + rgba[4 * i + 1] + rgba[4 * i + 2]) / 3;
  return gray;
}

// gray — Uint8Array w×h, מוקטן ביחס s מתמונה בגודל W×H. מחזיר את שתי הרשתות בגודל-המקור:
// {w, h, text, obj, xh} — w×h תאים, text/obj = Uint8Array (1 = יש דיו בתא), xh = גובה-אות חציוני בפיקסלים
export function inkGrids(gray, w, h, s, W, H) {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const thr = Math.min(otsu(hist, gray.length), 200);
  const lab = new Int32Array(w * h);
  const par = [0];
  const find = (a) => {
    while (par[a] !== a) {
      par[a] = par[par[a]];
      a = par[a];
    }
    return a;
  };
  const unite = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) {
      if (a < b) par[b] = a;
      else par[a] = b;
    }
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (gray[i] >= thr) continue;
      const nb = [];
      if (x > 0 && lab[i - 1]) nb.push(lab[i - 1]);
      if (y > 0) {
        const j = i - w;
        if (lab[j]) nb.push(lab[j]);
        if (x > 0 && lab[j - 1]) nb.push(lab[j - 1]);
        if (x < w - 1 && lab[j + 1]) nb.push(lab[j + 1]);
      }
      if (!nb.length) {
        const k = par.length;
        par.push(k);
        lab[i] = k;
      } else {
        lab[i] = nb[0];
        for (let q = 1; q < nb.length; q++) unite(nb[0], nb[q]);
      }
    }
  const n = par.length;
  const x0 = new Int32Array(n).fill(w);
  const y0 = new Int32Array(n).fill(h);
  const x1 = new Int32Array(n);
  const y1 = new Int32Array(n);
  const ar = new Int32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!lab[i]) continue;
      const r = find(lab[i]);
      lab[i] = r;
      ar[r]++;
      if (x < x0[r]) x0[r] = x;
      if (x + 1 > x1[r]) x1[r] = x + 1;
      if (y < y0[r]) y0[r] = y;
      if (y + 1 > y1[r]) y1[r] = y + 1;
    }
  const roots = [];
  for (let r = 1; r < n; r++) if (ar[r]) roots.push(r);
  const hs = roots
    .filter((r) => ar[r] >= 8 && y1[r] - y0[r] >= 4 && y1[r] - y0[r] < 0.05 * h && x1[r] - x0[r] < 0.2 * w)
    .map((r) => y1[r] - y0[r])
    .sort((a, b) => a - b);
  const xh = hs.length ? hs[hs.length >> 1] : 12;
  // 0 = לא בשימוש · 1 = אות · 2 = סימן קטן (נשאר רק ליד אות) · 3 = דיו של אובייקט בלבד (קו, איור)
  const cls = new Uint8Array(n);
  for (const r of roots) {
    const hh = y1[r] - y0[r];
    const ww = x1[r] - x0[r];
    const border = x0[r] <= 1 || y0[r] <= 1 || x1[r] >= w - 1 || y1[r] >= h - 1;
    if (ar[r] < Math.max(6, 0.03 * xh * xh)) continue; // כתם, אבק
    if (border && (hh > 0.2 * h || ww > 0.2 * w || hh > 3 * xh || ww > 3 * xh)) continue; // פס-הסורק, צל-הכריכה
    const rule = ww >= 8 * xh && hh <= 0.6 * xh;
    const vrule = hh >= 8 * xh && ww <= 0.6 * xh;
    const fig = hh > 4 * xh && ww > 4 * xh;
    const thin = hh > 3 * ww && hh > 2 * xh; // קו-עט/שבר-פס אנכי — לא אות
    cls[r] = rule || vrule || fig || thin ? 3 : hh >= 0.5 * xh ? 1 : 2;
  }
  // אות נשארת אות רק בתוך שורה: ≥3 רכיבים זה ליד זה (הרחבה לרוחב של 0.65 גובה-אות לכל צד), או בגובה של אות של ממש
  const dd = Math.max(1, Math.round(0.65 * xh));
  const wide = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (cls[lab[y * w + x]] === 1) last = x;
      if (x - last <= dd) wide[y * w + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (cls[lab[y * w + x]] === 1) last = x;
      if (last - x <= dd) wide[y * w + x] = 1;
    }
  }
  const line = new Int32Array(w * h);
  const lpar = [0];
  const lfind = (a) => {
    while (lpar[a] !== a) {
      lpar[a] = lpar[lpar[a]];
      a = lpar[a];
    }
    return a;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // רכיבים בשכנות-4
      const i = y * w + x;
      if (!wide[i]) continue;
      const a = x > 0 ? line[i - 1] : 0;
      const b = y > 0 ? line[i - w] : 0;
      if (!a && !b) {
        const k2 = lpar.length;
        lpar.push(k2);
        line[i] = k2;
      } else if (a && b) {
        const ra = lfind(a);
        const rb = lfind(b);
        line[i] = Math.min(ra, rb);
        if (ra !== rb) lpar[Math.max(ra, rb)] = Math.min(ra, rb);
      } else line[i] = a || b;
    }
  const nl = lpar.length - 1;
  const lineAt = (x, y) => {
    const v = line[y * w + x];
    return v ? lfind(v) : 0;
  };
  const cnt = new Int32Array(nl + 1);
  const tall = new Int32Array(nl + 1);
  const lof = new Int32Array(n);
  const lx0 = new Int32Array(nl + 1).fill(w);
  const lx1 = new Int32Array(nl + 1);
  for (const r of roots)
    if (cls[r] === 1) {
      const l = lineAt((x0[r] + x1[r]) >> 1, (y0[r] + y1[r]) >> 1);
      lof[r] = l;
      cnt[l]++;
      if (y1[r] - y0[r] >= 0.8 * xh) tall[l]++;
      if (x0[r] < lx0[l]) lx0[l] = x0[r];
      if (x1[r] > lx1[l]) lx1[l] = x1[r];
    }
  for (const r of roots)
    if (cls[r] === 1) {
      const l = lof[r];
      // רוחב השורה מתוך האותיות עצמן: ערימה אנכית של שברי-פס בשולי-הסריקה איננה שורה
      if ((cnt[l] >= 3 || tall[l] === cnt[l]) && lx1[l] - lx0[l] >= 1.5 * xh) continue;
      cls[r] = y1[r] - y0[r] >= 0.8 * xh ? 3 : 0; // לבד, בגובה-אות — אולי סימן/קישוט (לאובייקט); קטן — לכלוך
    }
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  const k = 1 / s / CELL;
  const cell = (x, y) => Math.min(gh - 1, (y * k) | 0) * gw + Math.min(gw - 1, (x * k) | 0);
  const tg = new Uint8Array(gw * gh);
  const og = new Uint8Array(gw * gh);
  const letter = new Uint8Array(gw * gh);
  for (let i = 0; i < lab.length; i++) {
    const c = cls[lab[i]];
    if (!c) continue;
    const j = cell(i % w, (i / w) | 0);
    og[j] = 1;
    if (c === 1) {
      tg[j] = 1;
      letter[j] = 1;
    }
  }
  // סימן קטן נכנס לרשת-הטקסט רק כשיש אות במרחק גובה-אות אחד (ניקוד, נקודה); בלי אות לידו — זה לכלוך
  const ps = new Int32Array((gw + 1) * (gh + 1));
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++)
      ps[(y + 1) * (gw + 1) + x + 1] = letter[y * gw + x] + ps[y * (gw + 1) + x + 1] + ps[(y + 1) * (gw + 1) + x] - ps[y * (gw + 1) + x];
  const any = (a, b, c, d) => {
    a = Math.max(0, a);
    b = Math.max(0, b);
    c = Math.min(gw, c);
    d = Math.min(gh, d);
    return c > a && d > b && ps[d * (gw + 1) + c] - ps[b * (gw + 1) + c] - ps[d * (gw + 1) + a] + ps[b * (gw + 1) + a] > 0;
  };
  const rr = Math.ceil(xh * k);
  const rx = Math.max(1, Math.ceil(0.4 * xh * k));
  const near = new Uint8Array(n);
  for (const r of roots)
    if (cls[r] === 2)
      near[r] = any(((x0[r] * k) | 0) - rx, ((y0[r] * k) | 0) - rr, Math.ceil(x1[r] * k) + rx, Math.ceil(y1[r] * k) + rr) ? 1 : 0;
  for (let i = 0; i < lab.length; i++) if (near[lab[i]]) tg[cell(i % w, (i / w) | 0)] = 1;
  return { w: gw, h: gh, text: tg, obj: og, xh: xh / s };
}

// הרשתות מתמונה בגודל W×H שכבר הוקטנה ל-w×h (ImageData.data של canvas)
export function gridsFromRGBA(rgba, w, h, W, H) {
  return inkGrids(grayOf(rgba, w * h), w, h, w / W, W, H);
}

// גודל-הניתוח לתמונה W×H
export function analyzeSize(W, H) {
  const s = Math.min(1, ANALYZE_W / W);
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)), s };
}

function whiteRuns(white) {
  const out = [];
  let i = 0;
  const n = white.length;
  while (i < n) {
    if (white[i]) {
      let j = i;
      while (j < n && white[j]) j++;
      out.push([i, j]);
      i = j;
    } else i++;
  }
  return out;
}

// הקצה הבא לאורך פרופיל (מונה-דיו לכל עמודה/שורה ברשת): הגבול הקרוב של רווח לבן, בתוך חלון win
function snapEdge(profile, pos, inner, win, minRun, span, floor = 0) {
  const n = profile.length;
  const thr = Math.max(1, Math.floor(NOISE * Math.max(1, span)), Math.floor(floor));
  const white = Array.from(profile, (v) => v <= thr);
  let best = null;
  for (const [a, b] of whiteRuns(white)) {
    if (b - a < minRun && a !== 0 && b !== n) continue;
    const c = inner > 0 ? b : a;
    if ((inner > 0 && c >= n) || (inner < 0 && c <= 0)) continue;
    if (Math.abs(c - pos) > win && !(a <= pos && pos <= b)) continue;
    if (best === null || Math.abs(c - pos) < best[0]) best = [Math.abs(c - pos), c];
  }
  return best === null ? pos : best[1];
}

const ALL_SIDES = { l: true, t: true, r: true, b: true };

// מסגרת [x0,y0,x1,y1] → המסגרת הצמודה לדיו (מעוגלת). grid — מ-inkGrids; isObj — מסגרת-אובייקט;
// pageH — גובה העמוד (לגובה-שורה משוער); sides — אילו קצוות מותר להזיז (בשינוי-גודל: רק אלה שנגררו).
// בלי grid, או מסגרת קטנה מתא — המסגרת חוזרת כמות-שהיא (מעוגלת)
export function snapBox(grid, box, { isObj = false, pageH = null, sides = ALL_SIDES } = {}) {
  const r = Math.round;
  if (!grid) return box.map(r);
  let src = isObj ? grid.obj : grid.text;
  if (!isObj) {
    // אין אף אות בתוך המסגרת (מספר-עמוד לבד) — לפי כל הדיו, כמו אובייקט
    const gw0 = grid.w;
    const c0 = (v) => Math.max(0, Math.min(v, gw0));
    const ys = Math.max(0, (box[1] / CELL) | 0);
    const ye = Math.min(grid.h, Math.ceil(box[3] / CELL));
    let hit = false;
    for (let y = ys; y < ye && !hit; y++)
      for (let x = c0((box[0] / CELL) | 0); x < c0(Math.ceil(box[2] / CELL)); x++)
        if (src[y * gw0 + x]) {
          hit = true;
          break;
        }
    if (!hit) src = grid.obj;
  }
  const gw = grid.w;
  const gh = grid.h;
  const get = (y, x) => src[y * gw + x];
  const lh = Math.max(CELL, (pageH ?? gh * CELL) / 60);
  const [x0, y0, x1, y1] = box;
  const c = (v, n) => Math.max(0, Math.min(n, r(v / CELL)));
  const cx0 = c(x0, gw);
  const cx1 = c(x1, gw);
  const cy0 = c(y0, gh);
  const cy1 = c(y1, gh);
  if (cx1 - cx0 < 2 || cy1 - cy0 < 2) return box.map(r);
  const wx = Math.max(2, r((2.0 * lh) / CELL));
  const wy = Math.max(2, r((1.0 * lh) / CELL));
  const mrx = Math.max(2, r((0.3 * lh) / CELL));
  const colp = new Int32Array(gw);
  for (let y = cy0; y < cy1; y++) for (let x = 0; x < gw; x++) colp[x] += get(y, x);
  let nx0 = sides.l ? snapEdge(colp, cx0, +1, wx, mrx, cy1 - cy0) : cx0;
  let nx1 = sides.r ? snapEdge(colp, cx1, -1, wx, mrx, cy1 - cy0) : cx1;
  if (nx1 - nx0 < 2) {
    nx0 = cx0;
    nx1 = cx1;
  }
  const rowp = new Int32Array(gh);
  for (let y = 0; y < gh; y++) for (let x = nx0; x < nx1; x++) rowp[y] += get(y, x);
  const band = Array.from(rowp.slice(cy0, cy1))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const m = band.length;
  const med = m ? (m % 2 ? band[(m - 1) >> 1] : (band[m / 2 - 1] + band[m / 2]) / 2) : 0;
  let ny0 = sides.t ? snapEdge(rowp, cy0, +1, wy, 1, nx1 - nx0, GAP_REL * med) : cy0;
  let ny1 = sides.b ? snapEdge(rowp, cy1, -1, wy, 1, nx1 - nx0, GAP_REL * med) : cy1;
  if (ny1 - ny0 < 2) {
    ny0 = cy0;
    ny1 = cy1;
  }
  const W = gw * CELL;
  const H = gh * CELL;
  const out = [
    nx0 !== cx0 ? nx0 * CELL - PAD : r(x0),
    ny0 !== cy0 ? ny0 * CELL - PAD : r(y0),
    nx1 !== cx1 ? nx1 * CELL + PAD : r(x1),
    ny1 !== cy1 ? ny1 * CELL + PAD : r(y1),
  ];
  return [
    Math.max(0, Math.min(W, out[0])),
    Math.max(0, Math.min(H, out[1])),
    Math.max(0, Math.min(W, out[2])),
    Math.max(0, Math.min(H, out[3])),
  ];
}

// הצמדה של הצעת-המודל בטעינה: אותה הצמדה, אבל בזהירות — אם המסגרת הייתה מאבדת יותר ממחצית הרוחב או הגובה
// (למשל פסים שחורים שהסיווג רואה כ"קו" ולא כאותיות), ההצעה נשארת כמו שהיא. המתנדב רואה אותה ומחליט
export const LOAD_KEEP = 0.5;
export function snapProposal(grid, box, opts = {}) {
  const out = snapBox(grid, box, opts);
  const w0 = box[2] - box[0];
  const h0 = box[3] - box[1];
  if (out[2] - out[0] < LOAD_KEEP * w0 || out[3] - out[1] < LOAD_KEEP * h0) return box.slice();
  return out;
}
