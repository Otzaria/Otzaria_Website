// עזרים טהורים ללוח-הסריקה של עורך הגהת-העמודים (ScanPanel / ProofScan /
// FramePopover): זום והמרת קואורדינטות, גרירת תיבות, מסגרות (הצעת המחשב,
// מספר-בזרם, סדר-קריאה, בניית הפעולות), סמן-השורה הנוכחית, מיקום החלונית
// והתוויות. בלי DOM ובלי React — נבדק ב-node:test (scanGeometry.test.mjs).
//
// כל הקואורדינטות כאן במרחב הפיקסלים של תמונת-העמוד (כמו בחוזה), חוץ ממה
// שמסומן במפורש "מסך" (פיקסלי-מסך = פיקסלי-תמונה × zoom).
//
// מספר-בזרם (seq) אינו שדה עצמאי: בתוכנת-הספר הוא נגזר מסדר-הקריאה (order) —
// core/page/frames.py: seq_in_stream / reorder_in_stream, ופעולת frame_seq שם
// מזיזה את המסגרת בסדר-הקריאה. לכן גם כאן המספר מחושב מ-order, ו"שינוי מספר"
// = סידור-מחדש של המסגרות (frames_set) + frame_seq שמתעד את הכוונה.

import { autoFrames, headingStream } from './autoFrames.js';
import { MIN_LINE_BOX, FRAME_PAD } from './ops.js';
import { streamChoices } from './view.js';
import { streamInfo, streamName, isFurnitureStream, isStreamKey, keepHeading, FRAME_OBJECT_KINDS, BUILTIN_STREAMS, FURNITURE_STREAMS } from './vocab.js';
import { hash32 } from './sequences.js';
import { FURNITURE_TAB, FURNITURE_TAB_HE } from './textModel.js';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;
// מרחק (פיקסלי-מסך) שממנו לחיצה נחשבת גרירה
export const DRAG_PX = 5;
// תיבה/מסגרת שצוירה: לפחות כך (פיקסלי-מסך) בכל ציר, אחרת זו לחיצה שהחליקה
export const MIN_BOX_PX = 8;
// תיבת-שורה (שורה חדשה / שינוי תיבה): לפחות רוחב×גובה כך בפיקסלי-תמונה — תוכנת-הספר
// דוחה תיבה קטנה מזה (MIN_W, MIN_H ב-book/lineops.py), והעמוד היה נתקע בהמתנה לזיהוי-מחדש.
// הערך מ-ops.js (בדיקת-הפעולות), כדי שהבדיקה בסריקה ובהגשה תמיד יסכימו
export { MIN_LINE_BOX };
// הגבול של frame_seq בחוזה (ops.validateOp)
export const MAX_SEQ = 50;
// ידיות שינוי-הגודל: ארבע פינות וארבעה אמצעי-צלעות (צפון/דרום/מזרח/מערב — ימין = e)
export const CORNERS = ['nw', 'ne', 'sw', 'se'];
export const EDGES = ['n', 's', 'e', 'w'];
export const HANDLES = [...CORNERS, ...EDGES];

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
const contains = (b, [x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// גודל העמוד [W, H]; עמוד בלי גודל תקין — ברירת-מחדל סבירה (לא אמור לקרות)
export function pageSize(view) {
  const s = view?.size;
  return Array.isArray(s) && s[0] > 0 && s[1] > 0 ? [s[0], s[1]] : [1000, 1400];
}

// ---------- זום וקואורדינטות ----------

export function clampZoom(z) {
  const v = Number(z);
  if (!Number.isFinite(v) || v <= 0) return 1;
  return clamp(v, MIN_ZOOM, MAX_ZOOM);
}

// צעד זום אחד (dir > 0 — הגדלה)
export function zoomStep(z, dir) {
  const next = clampZoom(z) * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  return clampZoom(Math.round(next * 1e4) / 1e4);
}

// "התאמה לרוחב": pad = שוליים + מקום לפס-הגלילה (כדי שהופעתו לא תשנה את הזום)
export function fitZoom(viewportWidth, imageWidth, pad = 20) {
  if (!(imageWidth > 0)) return 1;
  const w = Math.max(0, (Number(viewportWidth) || 0) - pad);
  return clampZoom(w / imageWidth || MIN_ZOOM);
}

// נקודת-לקוח (אירוע-עכבר) ← נקודה בתמונה, לפי מלבן ה-SVG על המסך. מלבן
// בגודל אפס (לפני פריסה / סביבת-בדיקות) — לפי הזום.
export function clientToImage(pt, rect, W, H, zoom = 1) {
  const z = clampZoom(zoom);
  const sx = rect?.width > 0 ? W / rect.width : 1 / z;
  const sy = rect?.height > 0 ? H / rect.height : 1 / z;
  return [(pt.clientX - (rect?.left || 0)) * sx, (pt.clientY - (rect?.top || 0)) * sy];
}

// גרירה או לחיצה — לפי המרחק בפיקסלי-מסך בין שתי נקודות-לקוח
export function isDrag(a, b, px = DRAG_PX) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]) >= px;
}

// הגלילה שמשאירה את נקודת-העוגן (בתמונה) מתחת לאותה נקודה בחלון אחרי שינוי זום.
// anchor = {img:[x,y] בתמונה, view:[x,y] בחלון-הגלילה}
export function zoomAnchorScroll(anchor, zoom) {
  return {
    left: Math.max(0, anchor.img[0] * zoom - anchor.view[0]),
    top: Math.max(0, anchor.img[1] * zoom - anchor.view[1]),
  };
}

// עוגן-הזום כשהשינוי אינו מהגלגלת (כפתורים / שינוי רוחב הלוח). vp = {left,
// top, width, height} של חלון-הגלילה, zoom = הזום *הקודם*. בתחילת הדף (גלילה
// 0,0) — הפינה הימנית-העליונה, תחילת הקריאה בעברית (כך "התאמה לרוחב" בטעינה
// לא גוללת את הדף); אחרת — מרכז החלון.
export function defaultZoomAnchor(vp, zoom) {
  const origin = !(vp.left > 0) && !(vp.top > 0);
  const view = origin ? [vp.width, 0] : [vp.width / 2, vp.height / 2];
  return { img: [(vp.left + view[0]) / zoom, (vp.top + view[1]) / zoom], view };
}

// ---------- תיבות ----------

// מלבן משתי פינות (בכל סדר), בלי עיגול
export function normBox(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

// תיבה תקינה לחוזה: מנורמלת, מספרים שלמים, בתוך התמונה (null אם אינה תיבה)
export function clampBox(b, W, H) {
  if (!isBox(b)) return null;
  const [x0, y0, x1, y1] = normBox([b[0], b[1]], [b[2], b[3]]).map(Math.round);
  return [clamp(x0, 0, W), clamp(y0, 0, H), clamp(x1, 0, W), clamp(y1, 0, H)];
}

// האם התיבה לפחות min בכל ציר
export function boxOk(b, min = 1) {
  return isBox(b) && b[2] - b[0] >= min && b[3] - b[1] >= min;
}

// תיבת-שורה שתוכנת-הספר תקבל (לפחות MIN_LINE_BOX בפיקסלי-תמונה)
export function lineBoxOk(b) {
  return isBox(b) && b[2] - b[0] >= MIN_LINE_BOX[0] && b[3] - b[1] >= MIN_LINE_BOX[1];
}

// הזזה בלי לצאת מהתמונה (הגודל נשמר)
export function moveBoxWithin(b, [dx, dy], W, H) {
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  const x0 = clamp(b[0] + dx, 0, Math.max(0, W - w));
  const y0 = clamp(b[1] + dy, 0, Math.max(0, H - h));
  return [x0, y0, x0 + w, y0 + h].map(Math.round);
}

// שינוי-גודל מידית: פינה (nw/ne/sw/se) מזיזה את שתי הצלעות שלה, ידית-צלע (n/s/e/w)
// — רק את הצלע שלה. גרירה מעבר לצלע הנגדית "הופכת" את התיבה.
export function resizeBoxCorner(b, corner, [dx, dy], W, H) {
  let [x0, y0, x1, y1] = b;
  if (corner.includes('w')) x0 += dx;
  if (corner.includes('e')) x1 += dx;
  if (corner.includes('n')) y0 += dy;
  if (corner.includes('s')) y1 += dy;
  return clampBox([x0, y0, x1, y1], W, H);
}

// תוצאת גרירה של ידית שמקבלים: תיבה אמיתית, וכל ציר שהידית מזיזה — לפחות min, או לפחות
// כמו שהיה (תיבה דקה מלכתחילה — שורה או מסגרת של שורה אחת בזום קטן — עדיין משנים את
// הצלעות האחרות שלה). ציר שהידית אינה מזיזה אינו נבדק. min — באותן יחידות של התיבות.
export function resizeOk(orig, box, handle, min = 1) {
  if (!isBox(box) || !(box[2] > box[0]) || !(box[3] > box[1])) return false;
  const h = String(handle || '');
  const was = isBox(orig) ? [orig[2] - orig[0], orig[3] - orig[1]] : [min, min];
  const axisOk = (moves, size, before) => !moves || size >= Math.min(min, before);
  return axisOk(h.includes('w') || h.includes('e'), box[2] - box[0], was[0]) && axisOk(h.includes('n') || h.includes('s'), box[3] - box[1], was[1]);
}

// מרכז הידית: פינה — הפינה; צלע — אמצע הצלע
export function cornerPoint(b, corner) {
  const x = corner.includes('w') ? b[0] : corner.includes('e') ? b[2] : (b[0] + b[2]) / 2;
  const y = corner.includes('n') ? b[1] : corner.includes('s') ? b[3] : (b[1] + b[3]) / 2;
  return [x, y];
}

// הידיות של תיבה נבחרת, בפיקסלי-תמונה (הגודל נקבע בפיקסלי-מסך — אותו גודל בכל זום):
// פינה = ריבוע size; צלע = מלבן לאורך הצלע (long × thick), שמתקצר כשהצלע קצרה (שורה
// דקה) כדי לא להסתיר את ידיות-הפינות — אבל לא מתחת ל-min. הפינות קודם והצלעות אחריהן:
// בחפיפה (תיבה זעירה) ידית-הצלע, שמשנה צלע אחת בלבד, מעל.
export function handleRects(b, zoom = 1, { size = 10, long = 16, thick = 8, min = 6 } = {}) {
  if (!isBox(b)) return [];
  const u = 1 / clampZoom(zoom);
  const wScr = (b[2] - b[0]) / u;
  const hScr = (b[3] - b[1]) / u;
  return HANDLES.map((handle) => {
    const [x, y] = cornerPoint(b, handle);
    let w = size;
    let h = size;
    if (handle === 'n' || handle === 's') {
      w = clamp(wScr - size - 2, min, long);
      h = thick;
    } else if (handle === 'e' || handle === 'w') {
      w = thick;
      h = clamp(hScr - size - 2, min, long);
    }
    return { handle, x: x - (w * u) / 2, y: y - (h * u) / 2, width: w * u, height: h * u };
  });
}

// ---------- מסגרות ----------

export const frameBase = (stream) => String(stream || 'main').replace(/_heading$/, '') || 'main';
export const isObjectFrame = (f) => typeof f?.kind === 'string' && Object.hasOwn(FRAME_OBJECT_KINDS, f.kind);
// זרם-הכותרת של זרם, או null כשאין כזה בתוכנת-הספר (שוליים, ריהוט) — למתג "כותרת"
export { headingStream };

const ord = (f) => (Number.isFinite(f?.order) ? f.order : Infinity);

// מיון יציב לפי order (מסגרת בלי order — בסוף, לפי מקומה ברשימה)
export function byOrder(frames) {
  return (frames || [])
    .map((f, i) => ({ f, i }))
    .sort((a, b) => ord(a.f) - ord(b.f) || a.i - b.i)
    .map((x) => x.f);
}

// order = 1..n לפי הסדר הקיים
export function renumber(frames) {
  return byOrder(frames).map((f, i) => ({ ...f, order: i + 1 }));
}

// {fid → המספר בזרם}: המקום של המסגרת בין מסגרות-הטקסט של אותו זרם-בסיס
// (כותרת נספרת בזרם שלה), בסדר-הקריאה. מסגרת-אובייקט אינה במניין.
export function seqInStream(frames) {
  const out = new Map();
  const n = new Map();
  for (const f of byOrder(frames)) {
    if (isObjectFrame(f)) continue;
    const s = frameBase(f.stream);
    n.set(s, (n.get(s) || 0) + 1);
    out.set(f.fid, n.get(s));
  }
  return out;
}

// כמה מסגרות-טקסט בזרם-הבסיס של stream
export function streamFrameCount(frames, stream) {
  const s = frameBase(stream);
  return (frames || []).filter((f) => !isObjectFrame(f) && frameBase(f.stream) === s).length;
}

// "המסגרת הזאת היא ה-seq בזרם שלה": המקומות שהזרם תופס בסדר-הקריאה נשארים,
// רק מי שיושב בכל אחד מהם משתנה — מסגרות של זרמים אחרים לא זזות.
export function reorderInStream(frames, fid, seq) {
  const fr = renumber(frames);
  const idx = fr.findIndex((f) => f.fid === fid);
  if (idx < 0 || isObjectFrame(fr[idx]) || !Number.isFinite(seq)) return fr;
  const s = frameBase(fr[idx].stream);
  const slots = [];
  fr.forEach((f, i) => {
    if (!isObjectFrame(f) && frameBase(f.stream) === s) slots.push(i);
  });
  const members = slots.map((i) => fr[i]);
  const cur = slots.indexOf(idx);
  const tgt = clamp(Math.trunc(seq) - 1, 0, members.length - 1);
  if (tgt === cur) return fr;
  members.splice(tgt, 0, members.splice(cur, 1)[0]);
  const out = fr.slice();
  slots.forEach((slot, k) => {
    out[slot] = members[k];
  });
  return out.map((f, i) => ({ ...f, order: i + 1 }));
}

// "הקודם/הבא בסדר הקריאה": החלפת מקום עם השכנה (dir < 0 — מוקדם יותר)
export function moveInOrder(frames, fid, dir) {
  const fr = renumber(frames);
  const i = fr.findIndex((f) => f.fid === fid);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= fr.length) return fr;
  [fr[i], fr[j]] = [fr[j], fr[i]];
  return fr.map((f, k) => ({ ...f, order: k + 1 }));
}

export function removeFrame(frames, fid) {
  return renumber((frames || []).filter((f) => f.fid !== fid));
}

// שינוי שדות במסגרת אחת. kind ריק/null — חזרה למסגרת-טקסט.
export function patchFrame(frames, fid, patch) {
  return renumber(
    (frames || []).map((f) => {
      if (f.fid !== fid) return f;
      const next = { ...f, ...patch };
      if (!next.kind) delete next.kind;
      return next;
    })
  );
}

const vOverlap = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
const heightOf = (b) => b[3] - b[1];

// האם המסגרת n נקראת לפני f: זו לצד זו (חפיפה אנכית ≥ חצי מהנמוכה) — הימנית
// קודמת (עברית); אחרת — העליונה קודמת.
export function readsBefore(n, f) {
  const side = vOverlap(n, f) >= 0.5 * Math.min(heightOf(n), heightOf(f));
  if (side) return center(n)[0] > center(f)[0];
  return center(n)[1] < center(f)[1];
}

// המקום (אינדקס בסדר-הקריאה) למסגרת חדשה: לפני המסגרת הראשונה שהיא "נקראת
// לפניה"; אחרת בסוף. נקודת-פתיחה — המתנדב מתקן ב"הקודם/הבא".
export function insertIndex(frames, bbox) {
  const fr = byOrder(frames);
  if (!isBox(bbox)) return fr.length;
  const k = fr.findIndex((f) => isBox(f.bbox) && readsBefore(bbox, f.bbox));
  return k < 0 ? fr.length : k;
}

export function insertFrame(frames, frame) {
  const fr = renumber(frames);
  fr.splice(insertIndex(fr, frame.bbox), 0, frame);
  return fr.map((f, i) => ({ ...f, order: i + 1 }));
}

// מזהה-מסגרת יציב (6 ספרות-הקס, כמו new_fid אצלם) מתוך מפתח — להצעות, כדי
// שחישוב-מחדש של התצוגה ייתן אותם מזהים והבחירה לא "תקפוץ"
export function stableFid(key, taken = new Set()) {
  for (let k = 0; ; k++) {
    const fid = (hash32(k ? `${key}#${k}` : key) & 0xffffff).toString(16).padStart(6, '0');
    if (!taken.has(fid)) {
      taken.add(fid);
      return fid;
    }
  }
}

// "הצעת המחשב": autoFrames.js (טורים לפי כיסוי אופקי, כותרת/פתיח כמסגרת משלהם, שורה
// שנחתכה על פני שני טורים — בחוץ) — עם מזהים יציבים. המסגרות צמודות לשורות שלהן (איחוד
// התיבות + אותו ריפוד קטן של מסגרת שצוירה ביד, FRAME_PAD). הסדר כפי שנקבע שם: בתוך
// כל זרם לפי סדר-הקריאה שלו (רצועה אחר רצועה, ימין ← שמאל), כך שהמספר-בזרם הנגזר מהסדר
// הוא סדר-הקריאה ו"✓ המסגרות נכונות" שולח סדר נכון.
export function suggestedFrames(view) {
  const [W, H] = pageSize(view);
  let n = 0;
  const raw = autoFrames(view || { lines: [] }, () => `tmp${n++}`);
  if (!raw.length) return [];
  const taken = new Set();
  const pad = FRAME_PAD;
  return byOrder(raw).map(({ seq, ...f }, i) => ({
    ...f,
    fid: stableFid(`${view?.page ?? ''}|${f.stream}|${seq}`, taken),
    bbox: clampBox([f.bbox[0] - pad, f.bbox[1] - pad, f.bbox[2] + pad, f.bbox[3] + pad], W, H),
    order: i + 1,
  }));
}

// מה מוצג במצב "מסגרות":
// • יש מסגרות בעמוד (מהתוכנה או מעריכה כאן) — הן, suggested:false;
// • נערכו כאן עד שלא נשארה אף אחת (frames_set ריק / frames_clear) — כלום;
// • אחרת — הצעת המחשב, suggested:true (מקווקוות, "הצעה").
// "נערכו כאן" = frames_confirmed בוליאני בתצוגה — ops.applyOp קובע אותו בכל
// frames_set/frames_clear, ואינו קיים בעמוד שיובא.
export function framesState(view) {
  const human = Array.isArray(view?.frames) ? view.frames.filter((f) => f && isBox(f.bbox)) : [];
  const edited = typeof view?.frames_confirmed === 'boolean';
  if (human.length) return { frames: renumber(human), suggested: false, edited, confirmed: view.frames_confirmed === true };
  if (edited) return { frames: [], suggested: false, edited: true, confirmed: false };
  return { frames: suggestedFrames(view), suggested: true, edited: false, confirmed: false };
}

// מסגרת כפי שנשלחת ב-frames_set (בלי seq ושדות-תצוגה; תיבה תקינה לחוזה)
export function frameForOp(f, W, H) {
  const out = { fid: String(f.fid), stream: f.stream, bbox: clampBox(f.bbox, W, H), order: f.order };
  if (isObjectFrame(f)) out.kind = f.kind;
  return out;
}

export function framesSetOp(page, frames, W, H, extra = null) {
  const value = { frames: renumber(frames).map((f) => frameForOp(f, W, H)) };
  return { kind: 'frames_set', page, value: extra ? { ...value, ...extra } : value };
}

// frame_seq לכל מסגרת-טקסט (או רק ל-fids) — המספר הנגזר מהסדר
export function frameSeqOps(page, frames, fids = null) {
  const seqs = seqInStream(frames);
  const out = [];
  for (const f of renumber(frames)) {
    const s = seqs.get(f.fid);
    if (!s || s > MAX_SEQ || (fids && !fids.includes(f.fid))) continue;
    out.push({ kind: 'frame_seq', page, value: { fid: f.fid, seq: s } });
  }
  return out;
}

// הפעולות של עריכת-מסגרות אחת (קבוצת-Undo אחת):
// • materialise (המסגרות המוצגות הן הצעה) — frames_set של *כל* ההצעות אחרי
//   העריכה (manual:true — כמו "מסגרות מהזיהוי": סדר-הקריאה לפי המסגרות) +
//   frame_seq לכל מסגרת;
// • אחרת — frames_set, ו-frame_seq רק למסגרות ב-seqFids (שינוי מספר-בזרם).
// extra (למשל {confirmed:true}) נכנס ל-value של frames_set.
export function frameEditOps(page, frames, W, H, { materialise = false, extra = null, seqFids = null } = {}) {
  const ext = materialise ? { manual: true, ...(extra || {}) } : extra;
  const ops = [framesSetOp(page, frames, W, H, ext)];
  if (materialise) ops.push(...frameSeqOps(page, frames));
  else if (seqFids?.length) ops.push(...frameSeqOps(page, frames, seqFids));
  return ops;
}

// התווית שעל המסגרת: "ראשי 1", "הערות 2", "ראשי — כותרת 1", "טבלה"
export function frameLabel(view, frame, seq) {
  if (isObjectFrame(frame)) return FRAME_OBJECT_KINDS[frame.kind];
  const s = streamInfo(view, frame?.stream);
  return `${s.he}${s.heading ? ' — כותרת' : ''}${seq ? ` ${seq}` : ''}`;
}

// מסגרת-הטקסט הקטנה ביותר שמרכז השורה בתוכה (כמו _where אצלם)
export function frameOfLine(frames, line) {
  if (!isBox(line?.bbox)) return null;
  const c = center(line.bbox);
  let best = null;
  let bestArea = Infinity;
  for (const f of frames || []) {
    if (isObjectFrame(f) || !isBox(f.bbox) || !contains(f.bbox, c)) continue;
    const a = area(f.bbox);
    if (a < bestArea) {
      best = f;
      bestArea = a;
    }
  }
  return best;
}

const CANON = ['main', 'notes', 'notes2', 'notes3', 'margin'];

// "ריהוט הדף" כבחירה אחת (כמו הלשונית של הריהוט בטקסט — אותו מפתח): כותרת-רצה, מספר
// עמוד, שומר-דף. אינו זרם בחוזה — resolveFrameStream הופך אותו לזרם-ריהוט אמיתי.
export const FURNITURE_CHOICE = FURNITURE_TAB;
const FURNITURE_COLOR = BUILTIN_STREAMS.header.color;

// "כותרת-רצה של ההערות": כותרת שחוזרת בכל עמוד מעל ההערות (שם החיבור שבהערות) — ריהוט,
// ולא "כותרת הערות" (כותרת של פרק או סעיף בתוך ההערות, שנכנסת לספר). אינו זרם בחוזה —
// נשמר כ"כותרת עמוד" (header), כמו כל כותרת-רצה: אינו נכנס לספר, ולמודל-המבנה הוא כותרת-רצה.
export const NOTES_RUNHEAD_CHOICE = '__notes_runhead';
export const NOTES_RUNHEAD_HE = 'כותרת-רצה של ההערות';

// שם הזרם לבחירה: "ריהוט הדף"; כותרת — "כותרת" / "כותרת הערות" (מאוצר-המילים), ולזרם
// שהספר נתן לו שם משלו — "כותרת <השם>" (vocab.streamName)
export function streamLabel(view, key) {
  if (key === FURNITURE_CHOICE) return FURNITURE_TAB_HE;
  if (key === NOTES_RUNHEAD_CHOICE) return NOTES_RUNHEAD_HE;
  return streamName(view, key);
}

// {key, he, color, heading} של בחירה (זרם, כותרת או "ריהוט הדף")
export function choiceInfo(view, key) {
  if (key === FURNITURE_CHOICE) return { key, he: FURNITURE_TAB_HE, color: FURNITURE_COLOR, heading: false };
  if (key === NOTES_RUNHEAD_CHOICE) return { key, he: NOTES_RUNHEAD_HE, color: FURNITURE_COLOR, heading: false };
  const s = streamInfo(view, key);
  return { key, he: streamLabel(view, key), color: s.color, heading: s.heading };
}

// זרם-הריהוט של מסגרת "ריהוט הדף": אם בתוכה שורות-ריהוט (לפי הזרם שלהן, או הזרם
// שיובא) — הזרם הנפוץ ביניהן, כדי שהמסגרת תסכים עם השורות; אחרת לפי המקום בעמוד,
// כמו בתוכנת-הספר (book/rules.py): בחצי העליון — כותרת עמוד, בתחתון — תחתית. ריהוט
// שיש מתחתיו טקסט (כותרת-רצה מעל ההערות, גם בחצי התחתון) — כותרת עמוד: תחתית היא
// מה שבסוף העמוד (מספר עמוד, שומר-דף), לא כותרת שפותחת אזור.
export function furnitureStreamFor(bbox, lines, H) {
  const count = new Map();
  if (isBox(bbox)) {
    for (const l of liveLines(lines)) {
      if (!contains(bbox, center(l.bbox))) continue;
      const s = [l.stream, l._auto?.stream].find((k) => isFurnitureStream(k));
      if (s) count.set(frameBase(s), (count.get(frameBase(s)) || 0) + 1);
    }
  }
  let best = null;
  for (const k of FURNITURE_STREAMS) if ((count.get(k) || 0) > (count.get(best) || 0)) best = k;
  if (best) return best;
  if (isBox(bbox) && textBelow(bbox, lines)) return 'header';
  const cy = isBox(bbox) ? (bbox[1] + bbox[3]) / 2 : 0;
  return cy < (Number(H) || 0) / 2 ? 'header' : 'footer';
}

// יש שורת-טקסט (לא ריהוט) שמתחילה מתחת לתיבה וחופפת לה לרוחב
function textBelow(bbox, lines) {
  return liveLines(lines).some(
    (l) => !isFurnitureStream(l.stream) && !isFurnitureStream(l._auto?.stream) && l.bbox[1] >= bbox[3] - 1 && Math.min(l.bbox[2], bbox[2]) > Math.max(l.bbox[0], bbox[0])
  );
}

// הזרם שנשמר במסגרת עבור בחירה: "ריהוט הדף" — זרם-ריהוט אמיתי (furnitureStreamFor);
// "כותרת-רצה של ההערות" — כותרת עמוד; כל בחירה אחרת — כמות-שהיא
export function resolveFrameStream(choice, bbox, lines, H) {
  if (choice === NOTES_RUNHEAD_CHOICE) return 'header';
  return choice === FURNITURE_CHOICE ? furnitureStreamFor(bbox, lines, H) : choice;
}

// הזרמים לבחירה במסגרת:
//   content  — זרמי-התוכן של העמוד/הספר (+ ראשי, + זרמי המסגרות)
//   headings — וריאנט-הכותרת של כל אחד מהם ("כותרת", "כותרת הערות"…) — לכל זרם-תוכן
//              שיש לו כותרת בתוכנת-הספר (לשוליים אין: margin_heading נדחה שם)
//   furniture — זרמי-הריהוט המדויקים (כותרת עמוד, תחתית, מפריד); "ריהוט הדף" עצמו
//              הוא FURNITURE_CHOICE
//   more / moreHeadings — שאר אוצר-המילים (נדירים) והכותרות שלהם
export function streamChips(view, frames = []) {
  const all = streamChoices(view).filter((s) => !s.key.endsWith('_heading'));
  const known = new Set(all.map((s) => s.key));
  const want = new Set(['main', ...(view?.streams || []).map((s) => frameBase(s.key)), ...(frames || []).map((f) => frameBase(f.stream))]);
  for (const key of want) {
    if (!known.has(key) && isStreamKey(key)) {
      const s = streamInfo(view, key);
      all.push({ key, he: s.he, color: s.color });
      known.add(key);
    }
  }
  for (const key of FURNITURE_STREAMS) {
    if (!known.has(key)) all.push({ key, he: BUILTIN_STREAMS[key].he, color: BUILTIN_STREAMS[key].color });
  }
  const rank = (k) => {
    const i = CANON.indexOf(k);
    return i < 0 ? CANON.length : i;
  };
  const content = [];
  const furniture = [];
  const more = [];
  all.forEach((s) => {
    if (isFurnitureStream(s.key)) furniture.push(s);
    else if (want.has(s.key)) content.push(s);
    else more.push(s);
  });
  const sorted = (list) =>
    list
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
      .map((x) => x.s);
  const headingsOf = (list) =>
    list
      .map((s) => {
        const key = headingStream(s.key);
        return key && key !== s.key ? { key, he: streamLabel(view, key), color: s.color, base: s.key } : null;
      })
      .filter(Boolean);
  const c = sorted(content);
  const m = sorted(more);
  return { content: c, headings: headingsOf(c), furniture, more: m, moreHeadings: headingsOf(m) };
}

// הבחירה ההתחלתית ל"מסגרת חדשה" לפי הלשונית הפעילה בטקסט: לשונית-הריהוט — "ריהוט הדף"
// (הזרם האמיתי נקבע בציור, resolveFrameStream); לשונית של זרם — הזרם
export function drawStreamFor(tabKey) {
  if (tabKey === FURNITURE_TAB) return FURNITURE_CHOICE;
  return isStreamKey(tabKey) ? frameBase(tabKey) : 'main';
}

// ---------- שורות ----------

const liveLines = (lines) => (lines || []).filter((l) => l && isBox(l.bbox) && l.status !== 'removed');

// המרחק מנקודה לתיבה (0 בתוכה)
function distToBox(b, [x, y]) {
  const dx = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0;
  const dy = y < b[1] ? b[1] - y : y > b[3] ? y - b[3] : 0;
  return Math.hypot(dx, dy);
}

// השורה לסמן אחרי לחיצה על הסריקה: הקטנה ביותר שמכילה את הנקודה, אחרת
// הקרובה ביותר. within (תיבת-מסגרת) — רק שורות שמרכזן בתוכה; בלעדיו — רק
// שורה שמכילה את הנקודה. שורות שהוסרו אינן נבחרות.
export function nearestLine(lines, point, within = null) {
  const pool = liveLines(lines).filter((l) => !within || contains(within, center(l.bbox)));
  let best = null;
  let bestArea = Infinity;
  for (const l of pool) {
    if (!contains(l.bbox, point)) continue;
    const a = area(l.bbox);
    if (a < bestArea) {
      best = l;
      bestArea = a;
    }
  }
  if (best || !within) return best;
  let bestD = Infinity;
  for (const l of pool) {
    const d = distToBox(l.bbox, point);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

// מספר-המילה בנקודה לפי תיבות-המילים (words[i].bbox) — המילה שמכילה את x,
// אחרת הקרובה לרוחב. null כשאין תיבות-מילים.
export function wordAtPoint(line, [x]) {
  let best = null;
  let bestD = Infinity;
  (line?.words || []).forEach((w, i) => {
    const b = w?.bbox;
    if (!isBox(b)) return;
    const d = x < b[0] ? b[0] - x : x > b[2] ? x - b[2] : 0;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

// הבחירה במצב "שורות" לפי מה שמותר לעשות בה: פעולות-חוזה רק על שורות מקוריות
// (מזהה חיובי) — שורה שנוצרה כאן (פיצול/איחוד/הוספה) ממתינה לחיתוך בתוכנה.
export function selectionInfo(lines, ids) {
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const sel = [...new Set(ids || [])].map((i) => byId.get(i)).filter(Boolean);
  const isTemp = (l) => !(l.id > 0) || !!l._new;
  const orig = sel.filter((l) => !isTemp(l));
  const live = orig.filter((l) => l.status !== 'removed');
  return {
    count: sel.length,
    live: live.map((l) => l.id),
    removed: orig.filter((l) => l.status === 'removed').map((l) => l.id),
    temp: sel.filter(isTemp).map((l) => l.id),
    canMerge: sel.length === 2 && live.length === 2,
    resizeId: sel.length === 1 && live.length === 1 && isBox(live[0].bbox) ? live[0].id : null,
  };
}

// בחירה בלחיצה/בגרירה: additive (Shift/Ctrl) — הפיכת המצב של כל אחת
export function toggleSelection(current, list, additive) {
  if (!additive) return [...new Set(list || [])];
  const cur = new Set(current || []);
  for (const i of list || []) {
    if (cur.has(i)) cur.delete(i);
    else cur.add(i);
  }
  return [...cur];
}

const overlaps = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);

// שורות-תוכן שאינן נוגעות באף מסגרת: לפי המסגרות הן אינן שייכות לשום זרם, ובסדר-הקריאה
// הן נכנסות רק אחרי כל המסגרות. ריהוט (כותרת-עמוד, תחתית, מפריד) אינו נספר — בלי מסגרת
// הוא נשאר ריהוט. בלי מסגרות בכלל — ריק (אין "מחוץ").
// שורות-הריהוט שאין סביבן מסגרת (כותרת-רצה, מספר עמוד, מפריד — לרוב מהזיהוי האוטומטי):
// במצב "מסגרות" הן מסומנות באפור, כדי שהמתנדב יראה שהן כבר זוהו ולא יצייר להן מסגרת חדשה.
// ← [{id, bbox, stream}] בסדר העמוד
export function furnitureMarks(lines, frames) {
  const boxes = (frames || []).filter((f) => f && !isObjectFrame(f)).map((f) => f.bbox).filter(isBox);
  return liveLines(lines)
    .filter((l) => isFurnitureStream(l.stream) && !boxes.some((b) => contains(b, center(l.bbox))))
    .map((l) => ({ id: l.id, bbox: l.bbox, stream: frameBase(l.stream) }));
}

export function outsideLineIds(lines, frames) {
  const boxes = (frames || []).map((f) => f?.bbox).filter(isBox);
  const out = new Set();
  if (!boxes.length) return out;
  for (const l of liveLines(lines)) {
    if (isFurnitureStream(l.stream)) continue;
    if (!boxes.some((b) => overlaps(l.bbox, b))) out.add(l.id);
  }
  return out;
}

// "השורה שייכת למסגרת הזו" — לשורה שבולטת מהמסגרת (view.straddlingLineIds): מסגרת-הטקסט
// שמכילה את רובה (שטח-החפיפה הגדול ביותר; בשוויון — הראשונה בסדר-הקריאה), והפעולה שמשייכת
// אותה אליה במפורש: stream — תיוג-אדם, צעד-ביטול אחד שיוצא בקובץ-התיקונים כמו כל זרם שנקבע
// ביד. שורת-כותרת נשארת כותרת של הזרם (keepHeading — כמו זרם-מהמסגרת). אחרי זה הסימון
// האדום יורד: שורה שזרמה נקבע ביד נספרת כתיוג, בתוך מסגרת או לא.
// ← {frame, value, op} או null (שורה שנוצרה בתיקון, שהוסרה, או שאינה נוגעת במסגרת-טקסט)
export function straddleClaim(view, lineId, frames) {
  const l = (view?.lines || []).find((x) => x?.id === lineId);
  if (!l || !(l.id > 0) || l._new || l.status === 'removed' || !isBox(l.bbox)) return null;
  let best = null;
  let bestArea = 0;
  for (const f of frames || []) {
    if (!f || f.kind || !isBox(f.bbox)) continue;
    const a = overlapArea(l.bbox, f.bbox);
    if (a > bestArea) {
      best = f;
      bestArea = a;
    }
  }
  if (!best || !isStreamKey(best.stream)) return null;
  const value = keepHeading(best.stream, l._auto?.stream ?? l.stream);
  return { frame: best, value, op: { kind: 'stream', page: view.page, ids: [l.id], value } };
}

// השורות שמוצגות "לזיהוי מחדש": כל שורה שפעולת-חיתוך נגעה בה (_recut מ-
// ops.applyOp — חצאי-פיצול, איחוד, הוספה, תיבה שהשתנתה) + הנעולות מבחוץ
export function recutSet(lines, locked) {
  const lk = locked instanceof Set ? locked : new Set(locked || []);
  const out = new Set();
  for (const l of lines || []) if (l && (l._recut || lk.has(l.id))) out.add(l.id);
  return out;
}

// ---------- סמן השורה הנוכחית ----------

// פס שקוף מעל תיבת השורה של הסמן + חץ קטן בקצה המסגרת שלה (בקצה השורה אם
// אינה במסגרת), בצד שבו השורה מתחילה (ימין; שמאל ללועזית). החץ מחוץ לקצה,
// ואם אין מקום בתמונה — בתוכו. size/gap בפיקסלי-תמונה.
export function caretMarker(view, frames, lineId, { size = 12, gap = 3 } = {}) {
  if (lineId == null) return null;
  const line = (view?.lines || []).find((l) => l?.id === lineId);
  if (!line || !isBox(line.bbox) || line.status === 'removed') return null;
  const [W] = pageSize(view);
  const frame = frameOfLine(frames, line);
  const edgeBox = frame ? frame.bbox : line.bbox;
  const rtl = line.script !== 'latin';
  const cy = (line.bbox[1] + line.bbox[3]) / 2;
  const h = size / 2;
  let arrow;
  if (rtl) {
    const e = edgeBox[2];
    const out = e + gap + size <= W;
    const tip = out ? e + gap : e - gap - size;
    arrow = [[tip, cy], [tip + size, cy - h], [tip + size, cy + h]];
  } else {
    const e = edgeBox[0];
    const out = e - gap - size >= 0;
    const tip = out ? e - gap : e + gap + size;
    arrow = [[tip, cy], [tip - size, cy - h], [tip - size, cy + h]];
  }
  return {
    lineId: line.id,
    band: line.bbox,
    color: streamInfo(view, line.stream).color,
    frameFid: frame?.fid ?? null,
    arrow,
  };
}

// הגלילה שמביאה את התיבה לתצוגה — null אם היא כבר גלויה כולה (תיבה גדולה מהחלון —
// אם חלק ממנה בחלון): גוללים רק כשהשורה באמת חתוכה, לא כשהיא קרובה לקצה — אחרת הסריקה
// "בורחת" מתחת לעכבר. vp = {left, top, width, height} של חלון-הגלילה בפיקסלי-מסך.
// אנכית — למרכז; אופקית — למרכז אם נכנסת כולה (עם שוליים m), אחרת יישור לצד ימין
// (תחילת השורה בעברית).
export function scrollToReveal(bbox, zoom, vp, m = 24) {
  if (!isBox(bbox) || !(vp?.width > 0) || !(vp?.height > 0)) return null;
  const [, y0, , y1] = bbox.map((v) => v * zoom);
  const okY = y1 - y0 <= vp.height ? y0 >= vp.top && y1 <= vp.top + vp.height : y0 < vp.top + vp.height && y1 > vp.top;
  const left = revealLeft(bbox, zoom, vp, m);
  if (okY && left === vp.left) return null;
  const top = okY ? vp.top : Math.max(0, (y0 + y1) / 2 - vp.height / 2);
  return { left: Math.round(left), top: Math.round(top) };
}

// הגלילה האופקית שמביאה את התיבה לחלון — vp.left כשהיא כבר גלויה (תיבה רחבה מהחלון —
// אם חלק ממנה בחלון); אחרת למרכז אם נכנסת כולה (עם שוליים m), ואם לא — יישור לצד
// ימין (תחילת השורה בעברית)
export function revealLeft(bbox, zoom, vp, m = 24) {
  const x0 = bbox[0] * zoom;
  const x1 = bbox[2] * zoom;
  const ok = x1 - x0 <= vp.width ? x0 >= vp.left && x1 <= vp.left + vp.width : x0 < vp.left + vp.width && x1 > vp.left;
  if (ok) return vp.left;
  const fits = x1 - x0 <= vp.width - 2 * m;
  return Math.max(0, fits ? (x0 + x1) / 2 - vp.width / 2 : x1 - vp.width + m);
}

// מעקב אחרי הסמן בטקסט: הגלילה שמעמידה את ראש תיבת-השורה מול השורה של הסמן בלוח
// הטקסט. caretOffset = המרחק (פיקסלי-מסך) מראש חלון-הגלילה של הסריקה עד ראש השורה של
// הסמן (caretY פחות ה-clientY של החלון). השורה נשארת כולה בחלון (שוליים m) גם כשהסמן
// מעל החלון או מתחתיו, והגלילה קטומה לטווח האפשרי (max = {left, top}). אופקית — רק
// אם המילה של הסמן (wordBox; בלעדיה — השורה) אינה בחלון. null — אין מה להזיז.
export function alignScroll(lineBox, zoom, vp, caretOffset, max = null, { wordBox = null, m = 8 } = {}) {
  if (!isBox(lineBox) || !(vp?.width > 0) || !(vp?.height > 0) || !Number.isFinite(caretOffset)) return null;
  const y0 = lineBox[1] * zoom;
  const lh = (lineBox[3] - lineBox[1]) * zoom;
  const want = clamp(caretOffset, m, Math.max(m, vp.height - lh - m));
  const maxTop = Number.isFinite(max?.top) ? Math.max(0, max.top) : Infinity;
  const maxLeft = Number.isFinite(max?.left) ? Math.max(0, max.left) : Infinity;
  const top = clamp(y0 - want, 0, maxTop);
  const left = clamp(revealLeft(isBox(wordBox) ? wordBox : lineBox, zoom, vp), 0, maxLeft);
  if (Math.abs(top - vp.top) < 2 && Math.abs(left - vp.left) < 2) return null;
  return { left: Math.round(left), top: Math.round(top) };
}

// התיבה של מילה i בשורה (words[i].bbox) להדגשה על הסריקה; מילה שידוע לה רק הטווח
// האופקי (גובה אפס) — בגובה השורה. null כשאין מילה כזו או שאין לה תיבה.
export function wordBoxOf(line, i) {
  if (!Number.isInteger(i) || i < 0 || !isBox(line?.bbox)) return null;
  const b = line.words?.[i]?.bbox;
  if (!isBox(b) || !(b[2] > b[0])) return null;
  return b[3] > b[1] ? b : [b[0], line.bbox[1], b[2], line.bbox[3]];
}

// ---------- מיקום החלונית והתוויות (פיקסלי-מסך) ----------

// כמה פיקסלי-מסך נשארים פנויים סביב קווי המסגרת הנבחרת כשממקמים את החלונית שלה —
// הידיות (עד 5 פיקסלים מחוץ לקו) והתווית שבפינה העליונה נשארות גלויות ונגישות
export const POPOVER_CLEAR = 12;
// החלונית מצטמצמת עד הרוחב הזה (השורות שבה נשברות) כדי לשבת לצד המסגרת ולא עליה — בלוח
// צר, כשהטור השני צר מהחלונית. צרה מזה היא כבר לא נוחה לקריאה — אז בתוך המסגרת
export const POPOVER_MIN_WIDTH = 220;

const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// מקום החלונית של מסגרת נבחרת — מחוץ למסגרת, כדי שלא תסתיר את קוויה ואת ידיות שינוי-
// הגודל. הכול בפיקסלי-מסך של שכבת-התוכן: vp = {left, top, width, height} — החלק
// הגלוי של הסריקה (הגלילה ומידות החלון), size = {width, height} של החלונית (הרוחב —
// הטבעי, בלי צמצום).
// סדר ההעדפה:
// 1. לצד המסגרת (קודם הצד שיש בו יותר מקום; מיושרת לראש החלק הגלוי של המסגרת), אחר-כך
//    מעליה/מתחתיה (מיושרת לצד ימין שלה);
// 2. לצד המסגרת, מצומצמת לרוחב שיש שם (לא פחות מ-minWidth) — width בתוצאה: ברוחב הזה
//    מציירים אותה;
// 3. בתוך המסגרת (מסגרת גדולה מהחלון), בפינה של החלק הגלוי, הרחק מהקווים (clear);
// 4. אין מקום נקי — המקום שמסתיר הכי מעט מהקווים.
// הניקוד: קודם כמה מהחלונית על "טבעת" הקווים והידיות, אחר-כך כמה על המסגרת כולה. העיגול
// לפיקסל שלם — תמיד הרחק מהמסגרת: חצי פיקסל של עיגול לא "מכניס" את החלונית לטבעת.
// החלונית תמיד בתוך החלון (שוליים margin). מחזיר {left, top, side}, ו-width כשצומצמה.
export function popoverBeside(bbox, zoom, vp, size, { clear = POPOVER_CLEAR, margin = 6, minWidth = POPOVER_MIN_WIDTH } = {}) {
  const F = bbox.map((v) => v * zoom);
  const w = Math.max(0, size?.width || 0);
  const h = Math.max(0, size?.height || 0);
  const V = [vp.left + margin, vp.top + margin, vp.left + vp.width - margin, vp.top + vp.height - margin];
  const cx = (x, ww = w, round = Math.round) => round(clamp(x, V[0], Math.max(V[0], V[2] - ww)));
  const cy = (y, round = Math.round) => round(clamp(y, V[1], Math.max(V[1], V[3] - h)));
  const outer = [F[0] - clear, F[1] - clear, F[2] + clear, F[3] + clear];
  const inner = [F[0] + clear, F[1] + clear, F[2] - clear, F[3] - clear];
  const innerOk = inner[2] > inner[0] && inner[3] > inner[1];
  const ring = (r) => overlapArea(r, outer) - (innerOk ? overlapArea(r, inner) : 0);

  const sideTop = cy(Math.max(F[1], V[1]));
  const endLeft = cx(F[2] - w);
  const room = { left: outer[0] - V[0], right: V[2] - outer[2] };
  const sides = ['left', 'right'].sort((a, b) => room[b] - room[a]);
  const besideAt = (side, ww) => ({
    side,
    left: side === 'left' ? cx(outer[0] - ww, ww, Math.floor) : cx(outer[2], ww, Math.ceil),
    top: sideTop,
    width: ww,
  });
  const beside = sides.map((s) => besideAt(s, w));
  const vertical = [
    { side: 'above', left: endLeft, top: cy(outer[1] - h, Math.floor), room: outer[1] - V[1] },
    { side: 'below', left: endLeft, top: cy(outer[3], Math.ceil), room: V[3] - outer[3] },
  ].sort((a, b) => b.room - a.room);
  // לצד המסגרת, מצומצמת לרוחב שיש שם — רק כשהוא צר מהחלונית ולא צר מדי
  const narrow = sides
    .map((s) => ({ s, ww: Math.floor(Math.min(w, room[s])) }))
    .filter(({ ww }) => ww >= minWidth && ww < w)
    .map(({ s, ww }) => ({ ...besideAt(s, ww), narrowed: true }));
  // בתוך המסגרת: בחלק הגלוי שלה, צמוד לפינה (קודם שמאל — סוף השורות בעברית — ולמעלה)
  const lo = [Math.max(inner[0], V[0]), Math.max(inner[1], V[1])];
  const hi = [Math.min(inner[2], V[2]), Math.min(inner[3], V[3])];
  const inside = [
    { left: cx(lo[0], w, Math.ceil), top: cy(lo[1], Math.ceil) },
    { left: cx(lo[0], w, Math.ceil), top: cy(hi[1] - h, Math.floor) },
    { left: cx(hi[0] - w, w, Math.floor), top: cy(lo[1], Math.ceil) },
    { left: cx(hi[0] - w, w, Math.floor), top: cy(hi[1] - h, Math.floor) },
  ].map((p) => ({ ...p, side: 'inside' }));

  let best = null;
  [...beside, ...vertical, ...narrow, ...inside].forEach((c, i) => {
    const r = [c.left, c.top, c.left + (c.width ?? w), c.top + h];
    const score = [Math.round(ring(r)), Math.round(overlapArea(r, F)), i];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && i < best.score[2])))) {
      best = { c, score };
    }
  });
  const out = { left: best.c.left, top: best.c.top, side: best.c.side };
  if (best.c.narrowed) out.width = best.c.width;
  return out;
}

// עוגן התווית שבפינה הימנית-עליונה של המסגרת: על קו המסגרת (translate(-100%,-50%));
// מסגרת בראש התמונה — בתוכה (inside), שלא תיחתך
export function badgeAnchor(bbox, zoom, minTop = 12) {
  const x = Math.round(bbox[2] * zoom);
  const y = Math.round(bbox[1] * zoom);
  return { x, y, inside: y < minTop };
}
