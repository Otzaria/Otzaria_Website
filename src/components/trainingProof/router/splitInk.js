// חלוקת שורה למילים לפי הרווחים בדיו — בדפדפן, לשורה שהגיעה מהתחנה בלי מילים
// (docs/76 §4.2: "כמו splitBoxes בתחנה"; התוצאה חוזרת עם words_src: "site"). טהור:
// מקבל מערך גווני-אפור (0 = שחור, 255 = לבן) בגודל w×h ומחזיר תיבות [x0,y0,x1,y1]
// מימין לשמאל (k=0 = המילה הימנית, הראשונה בקריאה).
//
// הדרך: סף אוטסו ← ספירת פיקסלי-דיו בכל עמודה ← רצפי עמודות ריקות. רווח שרוחבו
// לפחות gapRatio מגובה-הדיו של השורה = רווח בין מילים; רווח צר יותר = בין אותיות.
// לכל מילה — גם הגבול העליון והתחתון של הדיו שבה.

// סף אוטסו על היסטוגרמה של 256 גוונים
export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

// RGBA (ImageData.data) → אפור
export function toGray(rgba, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    // שקיפות = לבן
    const a = rgba[j + 3] / 255;
    const v = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    out[i] = Math.round(v * a + 255 * (1 - a));
  }
  return out;
}

export function splitByInk(gray, w, h, { gapRatio = 0.28, minGap = 3, minInk = 1, minWidth = 2 } = {}) {
  if (!w || !h || gray.length < w * h) return [];
  const thr = Math.min(otsu(gray), 200);
  const col = new Array(w).fill(0);
  const rowAny = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] <= thr) {
        col[x]++;
        rowAny[y]++;
      }
    }
  }
  // גובה-הדיו של השורה (בלי שורות-פיקסלים כמעט ריקות) — קנה-המידה לרווח בין מילים
  const rowsWithInk = rowAny.filter((n) => n >= Math.max(1, w * 0.01)).length || h;
  const wordGap = Math.max(minGap, Math.round(rowsWithInk * gapRatio));

  // רצפי עמודות עם דיו, ומיזוג רצפים שהרווח ביניהם צר מרווח-מילה
  const runs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const ink = x < w && col[x] >= minInk;
    if (ink && start < 0) start = x;
    if (!ink && start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  const words = [];
  for (const r of runs) {
    const last = words[words.length - 1];
    if (last && r[0] - last[1] < wordGap) last[1] = r[1];
    else words.push([...r]);
  }
  return words
    .filter(([a, b]) => b - a >= minWidth)
    .map(([x0, x1]) => {
      let y0 = h;
      let y1 = 0;
      for (let y = 0; y < h; y++) {
        for (let x = x0; x < x1; x++) {
          if (gray[y * w + x] <= thr) {
            if (y < y0) y0 = y;
            if (y + 1 > y1) y1 = y + 1;
            break;
          }
        }
      }
      return [x0, y0 < y1 ? y0 : 0, x1, y0 < y1 ? y1 : h];
    })
    .reverse(); // מימין לשמאל
}
