// הגיאומטריה של עורך-המסגרות — טהור (בלי DOM), לבדיקות ולעורך.
//
// מסגרת = בדיוק הצורה של החוזה (docs/76 §4.3, §5.3): {fid, kind, role, box:[x0,y0,x1,y1], stream, ord, cont,
// obj?, src}. הקואורדינטות בפיקסלים של תמונת-העמוד.
//
// * hitTest / cursorFor — מה יש מתחת לעכבר: קצה או פינה של מסגרת (שינוי-גודל, ה-8), גוף מסגרת (הזזה),
//   או מקום ריק (ציור מסגרת חדשה, ה-9). מסגרות מקוננות: הקטנה ביותר מנצחת, כדי שאפשר יהיה לתפוס אותה.
// * moveBox / resizeBox — הגרירה עצמה, בתוך גבולות העמוד.
// * applyOrder — מצב "סדר הקריאה" (O): המסגרות שנלחצו מקבלות 1…k, והשאר אחריהן בסדר הקודם שלהן
//   (כמו endOrder בתחנה).
// * moveInOrder / moveToPlace / moveInStream — סדר-הקריאה תוך כדי עבודה על מסגרת, בלי מצב נפרד.
// * withRole — תפקיד חדש למסגרת, עם הכללים: אובייקט = kind "object"; ריהוט ואובייקט — בלי זרם ובלי "ממשיך".

import { FRAME_ROLES } from '../../../lib/trainingProof/vocab.js';

export const MIN_SIZE = 8; // הצלע הקטנה ביותר של מסגרת, בפיקסלי-עמוד
export const NO_STREAM_ROLES = ['furniture', 'object'];

export const normRect = (ax, ay, bx, by) => [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];

export function clampBox([x0, y0, x1, y1], W, H) {
  const c = (v, n) => Math.max(0, Math.min(n, v));
  return [c(x0, W), c(y0, H), c(x1, W), c(y1, H)];
}

// עיגול לעשירית פיקסל — כך נשמר בשרת ובקובץ-ההחזרה
export const roundBox = (box) => box.map((v) => Math.round(v * 10) / 10);

const inside = (p, [x0, y0, x1, y1], tol = 0) => p.x >= x0 - tol && p.x <= x1 + tol && p.y >= y0 - tol && p.y <= y1 + tol;
const area = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0);

// p = {x, y} בפיקסלי-עמוד; tol — מרחק-התפיסה של קצה, בפיקסלי-עמוד (בעורך: 8 פיקסלי-מסך מומרים).
// מחזיר {fid, ed:{l,r,t,b}, edge} או null
export function hitTest(frames, p, tol) {
  const cands = frames.filter((f) => inside(p, f.box, tol)).sort((a, b) => area(a.box) - area(b.box));
  for (const f of cands) {
    const [x0, y0, x1, y1] = f.box;
    // מסגרת צרה מפעמיים מרחק-התפיסה: הקצוות לא חופפים, הקרוב מנצח
    const tx = Math.min(tol, (x1 - x0) / 3);
    const ty = Math.min(tol, (y1 - y0) / 3);
    const inX = p.x >= x0 - tol && p.x <= x1 + tol;
    const inY = p.y >= y0 - tol && p.y <= y1 + tol;
    const ed = {
      l: inY && Math.abs(p.x - x0) <= Math.max(tx, x0 > p.x ? tol : 0),
      r: inY && Math.abs(p.x - x1) <= Math.max(tx, x1 < p.x ? tol : 0),
      t: inX && Math.abs(p.y - y0) <= Math.max(ty, y0 > p.y ? tol : 0),
      b: inX && Math.abs(p.y - y1) <= Math.max(ty, y1 < p.y ? tol : 0),
    };
    const edge = ed.l || ed.r || ed.t || ed.b;
    if (edge || inside(p, f.box)) return { fid: f.fid, ed, edge };
  }
  return null;
}

// הסמן לפי מה שמתחת לעכבר. mode: edit | order | readOnly
export function cursorFor(hit, mode = 'edit') {
  if (mode === 'order') return hit ? 'pointer' : 'default';
  if (mode === 'readOnly') return hit ? 'pointer' : 'default';
  if (!hit) return 'crosshair';
  if (!hit.edge) return 'move';
  const { l, r, t, b } = hit.ed;
  if ((t && l) || (b && r)) return 'nwse-resize';
  if ((t && r) || (b && l)) return 'nesw-resize';
  return l || r ? 'ew-resize' : 'ns-resize';
}

// הזזה של כל המסגרת בתוך העמוד
export function moveBox([x0, y0, x1, y1], dx, dy, W, H) {
  const w = x1 - x0;
  const h = y1 - y0;
  const nx = Math.max(0, Math.min(W - w, x0 + dx));
  const ny = Math.max(0, Math.min(H - h, y0 + dy));
  return [nx, ny, nx + w, ny + h];
}

// שינוי-גודל מהקצוות שב-ed. הקצה לא עובר את הקצה שמולו (נשאר לפחות MIN_SIZE), ולא יוצא מהעמוד
export function resizeBox([x0, y0, x1, y1], ed, dx, dy, W, H, min = MIN_SIZE) {
  let a = x0;
  let b = y0;
  let c = x1;
  let d = y1;
  if (ed.l) a = Math.max(0, Math.min(x1 - min, x0 + dx));
  if (ed.r) c = Math.min(W, Math.max(x0 + min, x1 + dx));
  if (ed.t) b = Math.max(0, Math.min(y1 - min, y0 + dy));
  if (ed.b) d = Math.min(H, Math.max(y0 + min, y1 + dy));
  return [a, b, c, d];
}

export const bigEnough = ([x0, y0, x1, y1], min = MIN_SIZE) => x1 - x0 >= min && y1 - y0 >= min;

// תפקיד חדש למסגרת, עם הכללים של החוזה
export function withRole(f, role, { obj = null } = {}) {
  if (!FRAME_ROLES.includes(role)) return f;
  const g = { ...f, role, src: 'human' };
  if (role === 'object') {
    g.kind = 'object';
    g.obj = obj || f.obj || 'other';
  } else {
    g.kind = 'text';
    delete g.obj;
    delete g.caption_of;
  }
  if (NO_STREAM_ROLES.includes(role)) {
    g.stream = null;
    g.cont = false;
  }
  return g;
}

// המסגרות לפי סדר-הקריאה: לפי המספר, ומסגרת בלי מספר — בסוף, מלמעלה למטה
export const readingOrder = (frames) => [...frames].sort((a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || a.box[1] - b.box[1]);

// המספר במסגרת בתוך הזרם שלה ("פנים 2"), לפי סדר-הקריאה. Map(fid → מספר)
export function streamSeq(frames) {
  const out = new Map();
  const n = {};
  const byOrd = readingOrder(frames);
  for (const f of byOrd) {
    if (!f.stream) continue;
    n[f.stream] = (n[f.stream] || 0) + 1;
    out.set(f.fid, n[f.stream]);
  }
  return out;
}

// מזהה למסגרת חדשה מהאתר: n1, n2… (docs/76 §5.3), ייחודי בעמוד
export function nextFid(frames) {
  let k = 0;
  for (const f of frames) {
    const m = /^n(\d+)$/.exec(f.fid);
    if (m) k = Math.max(k, +m[1]);
  }
  return `n${k + 1}`;
}

// מספר הבא בסדר-הקריאה (מסגרת חדשה נכנסת בסוף)
export const nextOrd = (frames) => Math.max(0, ...frames.map((f) => f.ord ?? 0)) + 1;

// סדר-הקריאה רציף (1…n) בלי לשנות את הסדר היחסי; מסגרת בלי מספר נשארת בלי
export function renumber(frames) {
  const ord = [...frames].filter((f) => f.ord != null).sort((a, b) => a.ord - b.ord);
  const map = new Map(ord.map((f, i) => [f.fid, i + 1]));
  return frames.map((f) => (f.ord == null ? f : map.get(f.fid) === f.ord ? f : { ...f, ord: map.get(f.fid) }));
}

// מצב "סדר הקריאה": clicked = רשימת fid לפי סדר הלחיצות. הנלחצות — 1…k; השאר אחריהן בסדר הקודם שלהן
// (סדר קודם, ובלעדיו — מלמעלה למטה)
export function applyOrder(frames, clicked) {
  if (!clicked.length) return frames;
  const pos = new Map(clicked.map((fid, i) => [fid, i + 1]));
  const rest = frames
    .filter((f) => !pos.has(f.fid))
    .sort((a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || a.box[1] - b.box[1] || b.box[2] - a.box[2]);
  let n = clicked.length;
  const restOrd = new Map(rest.map((f) => [f.fid, ++n]));
  return frames.map((f) => {
    const o = pos.get(f.fid) ?? restOrd.get(f.fid);
    return o === f.ord ? f : { ...f, ord: o, src: 'human' };
  });
}

// סדר-הקריאה תוך כדי עבודה על המסגרת — בלי לעבור למצב "סדר הקריאה" (כמו בתחנה ובתוכנת-הספר: "סדר: הקודם/הבא"
// ו"מספר בזרם −/+" בחלונית של המסגרת). אחרי כל הזזה כל המסגרות ממוספרות 1…n לפי הסדר החדש; מסגרת שהמספר
// שלה השתנה — "שונה ביד".
function withOrder(frames, list) {
  const pos = new Map(list.map((f, i) => [f.fid, i + 1]));
  return frames.map((f) => (pos.get(f.fid) === f.ord ? f : { ...f, ord: pos.get(f.fid), src: 'human' }));
}

// המסגרת fid למקום place (1…n) בסדר-הקריאה של העמוד; השאר זזות מקום אחד
export function moveToPlace(frames, fid, place) {
  const list = readingOrder(frames);
  const i = list.findIndex((f) => f.fid === fid);
  if (i < 0) return frames;
  const k = Math.max(0, Math.min(list.length - 1, Math.round(place) - 1));
  const [f] = list.splice(i, 1);
  list.splice(k, 0, f);
  return withOrder(frames, list);
}

// מוקדם יותר (d = -1) / מאוחר יותר (d = 1) בסדר-הקריאה של העמוד — החלפה עם השכנה
export function moveInOrder(frames, fid, d) {
  const i = readingOrder(frames).findIndex((f) => f.fid === fid);
  return i < 0 ? frames : moveToPlace(frames, fid, i + 1 + d);
}

// הקודמת / הבאה בתוך הזרם ("פנים 2" ← "פנים 1"): החלפת מקום בסדר-הקריאה עם המסגרת הקודמת/הבאה של אותו זרם
export function moveInStream(frames, fid, d) {
  const list = readingOrder(frames);
  const f = list.find((z) => z.fid === fid);
  if (!f?.stream) return frames;
  const same = list.filter((z) => z.stream === f.stream);
  const o = same[same.indexOf(f) + d];
  if (!o) return frames;
  const a = list.indexOf(f);
  const b = list.indexOf(o);
  [list[a], list[b]] = [list[b], list[a]];
  return withOrder(frames, list);
}

// "שונה ביד": מסגרת שהמתנדב נגע בה עוברת מקווקו לרציף
export const touched = (f) => ({ ...f, src: 'human' });
