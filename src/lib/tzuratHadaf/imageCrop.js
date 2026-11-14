// צורת הדף — גאומטריית החיתוכים מהסריקה (טהור): החלון סביב תיבת הפריט במסלול המהיר, והתיבה עצמה
// כשברים בתוך החלון (כדי שהלקוח יצייר מסגרת על החיתוך).

import { fracBox } from './common.js';

// ריפוד: שורה מעל ומתחת (≈ 1.5 × גובה התיבה), פעמיים הרוחב לכל צד; וגודל מינימלי לחלון
export const PAD_Y_LINES = 1.5;
export const PAD_X_WIDTHS = 2;
export const MIN_PAD_X = 60;
export const MIN_PAD_Y = 30;
export const MIN_CROP_W = 520;
export const MIN_CROP_H = 140;
// ?ctx=1 — הקשר רחב יותר (שלוש שורות לכל צד)
export const CTX_FACTOR = 3;
// תמונה ממוזערת (?thumb=1)
export const THUMB_W = 400;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// מרחיב קטע [a, a+len) לאורך מינימלי סביב מרכזו, בתוך [0, max)
function grow(a, len, min, max) {
  if (len >= min || max <= min) {
    const s = clamp(a, 0, max);
    return [s, clamp(len, 1, max - s)];
  }
  const c = a + len / 2;
  let s = Math.round(c - min / 2);
  s = clamp(s, 0, max - min);
  return [s, min];
}

/**
 * box — שברים מהסריקה; W,H — מידות הסריקה בפיקסלים. ← {left, top, width, height} בפיקסלים, או null.
 */
export function cropRect(box, W, H, { ctx = false } = {}) {
  const b = fracBox(box);
  if (!b || !(W > 0) || !(H > 0)) return null;
  const bx = b.x * W;
  const by = b.y * H;
  const bw = b.w * W;
  const bh = b.h * H;
  const f = ctx ? CTX_FACTOR : 1;
  const padX = Math.max(MIN_PAD_X, PAD_X_WIDTHS * bw) * (ctx ? 1.5 : 1);
  const padY = Math.max(MIN_PAD_Y, PAD_Y_LINES * bh) * f;
  let left = Math.floor(clamp(bx - padX, 0, W - 1));
  let top = Math.floor(clamp(by - padY, 0, H - 1));
  let right = Math.ceil(clamp(bx + bw + padX, left + 1, W));
  let bottom = Math.ceil(clamp(by + bh + padY, top + 1, H));
  const [l2, w2] = grow(left, right - left, Math.min(MIN_CROP_W, W), W);
  const [t2, h2] = grow(top, bottom - top, Math.min(MIN_CROP_H, H), H);
  left = l2;
  top = t2;
  right = left + w2;
  bottom = top + h2;
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** התיבה (שברים מהסריקה) כשברים בתוך החיתוך */
export function relBox(box, crop, W, H) {
  const b = fracBox(box);
  if (!b || !crop) return null;
  const r = (v) => Math.round(v * 10000) / 10000;
  const x = (b.x * W - crop.left) / crop.width;
  const y = (b.y * H - crop.top) / crop.height;
  const x2 = ((b.x + b.w) * W - crop.left) / crop.width;
  const y2 = ((b.y + b.h) * H - crop.top) / crop.height;
  const cx = clamp(x, 0, 1);
  const cy = clamp(y, 0, 1);
  return { x: r(cx), y: r(cy), w: r(clamp(x2, 0, 1) - cx), h: r(clamp(y2, 0, 1) - cy) };
}

// רשת החיתוכים: 1/200 מהתמונה. החיתוך מתרחב לרשת (התחלה כלפי מטה, סוף כלפי מעלה) — כך יש מספר סופי של
// חיתוכים אפשריים לעמוד, והם נשמרים בדיסק (imageServe.pageImage) במקום לפענח את הסריקה בכל בקשה
export const CROP_GRID = 200;

export function quantizeBox(b) {
  const g = CROP_GRID;
  const x0 = Math.floor(b.x * g + 1e-9) / g;
  const y0 = Math.floor(b.y * g + 1e-9) / g;
  const x1 = Math.min(1, Math.ceil((b.x + b.w) * g - 1e-9) / g);
  const y1 = Math.min(1, Math.ceil((b.y + b.h) * g - 1e-9) / g);
  return { x: x0, y: y0, w: Math.max(1 / g, x1 - x0), h: Math.max(1 / g, y1 - y0) };
}

/** חיתוך מבוקש בשברים (x,y,w,h מהכתובת) ← {left, top, width, height} בפיקסלים, null (בלי חיתוך) או {error} */
export function fracCrop(params, W, H) {
  const get = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]);
  const raw = ['x', 'y', 'w', 'h'].map(get);
  if (raw.every((v) => v === null || v === undefined || v === '')) return null;
  const [x, y, w, h] = raw.map((v) => Number(v));
  const b0 = fracBox({ x, y, w, h });
  if (!b0 || !(W > 0) || !(H > 0)) return { error: 'חיתוך לא תקין' };
  const b = quantizeBox(b0);
  const left = Math.floor(b.x * W);
  const top = Math.floor(b.y * H);
  return {
    left,
    top,
    width: Math.max(1, Math.min(W - left, Math.ceil(b.w * W))),
    height: Math.max(1, Math.min(H - top, Math.ceil(b.h * H))),
  };
}
