// דיווחים על עמודים — האזור בצילום שבו נמצא הטקסט המדווח (לוגיקה טהורה, imports יחסיים — node:test).
// האזור מחושב בעורך בזמן הדיווח (src/lib/editor/reportScanCrop.js, ממקור המעקב שכבר נטען שם)
// ונשמר בדיווח כשבר מגודל התמונה (0..1), כך שמסך הניהול מציג רק את החלק הזה מהצילום.
// אין מיקום אמין → אין אזור (null), והדיווח נשמר כרגיל בלעדיו.

/** מקורות המעקב (כמו SourceKind ב-src/lib/editor/trackingSource.js) */
export const CROP_SOURCES = Object.freeze(['layout', 'proof', 'local', 'profile', 'manual'])
/** 'word' — המילים המסומנות זוהו במדויק (יש mark); 'line' — רק השורות */
export const CROP_LEVELS = Object.freeze(['word', 'line'])

/** אזור גבוה מזה (חלק מגובה העמוד) כבר אינו "המקום המדויק" — לא שומרים */
export const MAX_CROP_HEIGHT = 0.5

const EPS = 1e-6
const round4 = (n) => Math.round(n * 10000) / 10000
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1]

/** מלבן {x,y,w,h} בשברים (0..1) — או null אם אינו תקין */
function normRect(r) {
  if (!r || typeof r !== 'object') return null
  const { x, y, w, h } = r
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return null
  if (x + w > 1 + EPS || y + h > 1 + EPS) return null
  return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) }
}

/**
 * בדיקת האזור שהדפדפן שלח. לא תקין → null (מתעלמים ממנו; הדיווח עצמו לא נכשל).
 * @param {unknown} raw
 * @returns {CropRect|null}
 */
export function normalizeCropRect(raw) {
  const rect = normRect(raw)
  if (!rect) return null
  const r = /** @type {any} */ (raw)
  if (!CROP_SOURCES.includes(r.source) || !CROP_LEVELS.includes(r.level)) return null
  if (rect.h > MAX_CROP_HEIGHT + EPS) return null
  const mark = r.mark == null ? null : normRect(r.mark)
  // סימון המילים — רק ברמת מילה, ורק אם הוא בתוך האזור
  const inside = mark && mark.x >= rect.x - EPS && mark.y >= rect.y - EPS
    && mark.x + mark.w <= rect.x + rect.w + 1e-3 && mark.y + mark.h <= rect.y + rect.h + 1e-3
  return { ...rect, source: r.source, level: r.level === 'word' && inside ? 'word' : 'line', mark: r.level === 'word' && inside ? mark : null }
}

/** האיחוד של כמה מסגרות [x0,y0,x1,y1] */
export function unionBoxes(boxes) {
  const ok = (boxes || []).filter(isBox)
  if (!ok.length) return null
  return [
    Math.min(...ok.map((b) => b[0])),
    Math.min(...ok.map((b) => b[1])),
    Math.max(...ok.map((b) => b[2])),
    Math.max(...ok.map((b) => b[3])),
  ]
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/**
 * מסגרות השורות (והמילים) בפיקסלי התמונה → האזור לשמירה: כל רוחב השורות (קריא יותר ממילה
 * בודדת), עם שוליים — חלק מגובה שורה למעלה ולמטה ומעט רוחב לכל צד — חתוך לגבולות התמונה.
 * @param {{ lineBoxes: number[][], wordBoxes?: number[][]|null, size: [number, number]|null|undefined,
 *   source: string, padLines?: number, padX?: number }} input
 *   padLines — השוליים האנכיים ביחס לגובה שורה חציוני; padX — השוליים האופקיים ביחס לרוחב התמונה
 * @returns {CropRect|null}
 */
export function cropFromBoxes({ lineBoxes, wordBoxes = null, size, source, padLines = 0.6, padX = 0.02 }) {
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isFinite(n) && n > 0)) return null
  const [W, H] = size
  const lines = (lineBoxes || []).filter(isBox)
  const box = unionBoxes(lines)
  if (!box) return null
  const lineH = median(lines.map((b) => b[3] - b[1]))
  const py = lineH * padLines
  const px = W * padX
  const x0 = Math.max(0, box[0] - px)
  const y0 = Math.max(0, box[1] - py)
  const x1 = Math.min(W, box[2] + px)
  const y1 = Math.min(H, box[3] + py)
  if (x1 <= x0 || y1 <= y0) return null
  const words = wordBoxes ? unionBoxes(wordBoxes) : null
  const clampBox = (b) => [Math.max(x0, b[0]), Math.max(y0, b[1]), Math.min(x1, b[2]), Math.min(y1, b[3])]
  const wb = words ? clampBox(words) : null
  const mark = wb && wb[2] > wb[0] && wb[3] > wb[1] ? { x: wb[0] / W, y: wb[1] / H, w: (wb[2] - wb[0]) / W, h: (wb[3] - wb[1]) / H } : null
  return normalizeCropRect({
    x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H,
    source, level: mark ? 'word' : 'line', mark,
  })
}

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} FracRect
 * @typedef {FracRect & { source: string, level: 'word'|'line', mark: FracRect|null }} CropRect
 */
