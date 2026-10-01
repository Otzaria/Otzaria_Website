// לוגיקה טהורה של גרף ההספק השבועי (WeeklyProgressArea.jsx): סימוני ציר Y,
// מיקום הנקודות ונתיב העקומה. מחליף את Recharts (כ-91KB gzip) בגרף של 7 נקודות.
// כל הקואורדינטות במערכת 0..100 (viewBox של ה-SVG, שנמתח לגודל הקופסה).

const EPS = 1e-9
const TICK_COUNT = 5

// שלב "עגול" לפי אותו אלגוריתם של Recharts (getFormatStep, allowDecimals=false)
function formatStep(roughStep, correction) {
  if (roughStep <= 0) return 0
  const digitCount = Math.floor(Math.log10(roughStep) + EPS) + 1
  const digitValue = 10 ** digitCount
  const ratioScale = digitCount !== 1 ? 0.05 : 0.1
  const amended = (Math.ceil(roughStep / digitValue / ratioScale - EPS) + correction) * ratioScale
  return Math.ceil(amended * digitValue - EPS)
}

/**
 * חמישה סימוני ציר Y שלמים מ-0 ומעלה, זהים לאלה ש-Recharts חישב לתחום [0, max]
 * (tickCount=5, allowDecimals=false) — למשל max=129 -> [0, 35, 70, 105, 140].
 */
export function niceTicks(max) {
  if (!(max > 0)) return [0, 1, 2, 3, 4]
  for (let correction = 0; correction < 100; correction++) {
    const step = formatStep(max / (TICK_COUNT - 1), correction)
    if (step <= 0) break
    const upCount = Math.ceil(max / step - EPS)
    if (upCount + 1 > TICK_COUNT) continue
    return Array.from({ length: TICK_COUNT }, (_, i) => i * step)
  }
  return [0, max]
}

/** נקודות הגרף: x מתפרס על כל הרוחב (הראשונה בקצה אחד, האחרונה בשני), y הפוך (0 למטה). */
export function chartPoints(values, yMax) {
  const n = values.length
  return values.map((value, i) => ({
    x: n > 1 ? (i / (n - 1)) * 100 : 50,
    y: yMax > 0 ? 100 - (Math.max(0, value) / yMax) * 100 : 100
  }))
}

const sign = (x) => (x < 0 ? -1 : 1)

// שיפועי d3.curveMonotoneX (Steffen) — עקומה חלקה שאינה חורגת מעל/מתחת לנקודות
function slope3(x0, y0, x1, y1, x2, y2) {
  const h0 = x1 - x0
  const h1 = x2 - x1
  const s0 = (y1 - y0) / (h0 || (h1 < 0 && -0))
  const s1 = (y2 - y1) / (h1 || (h0 < 0 && -0))
  const p = (s0 * h1 + s1 * h0) / (h0 + h1)
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
}

function slope2(x0, y0, x1, y1, t) {
  const h = x1 - x0
  return h ? ((3 * (y1 - y0)) / h - t) / 2 : t
}

const fmt = (n) => String(Math.round(n * 1000) / 1000)

function bezier(p0, p1, t0, t1) {
  const dx = (p1.x - p0.x) / 3
  return `C${fmt(p0.x + dx)},${fmt(p0.y + dx * t0)},${fmt(p1.x - dx)},${fmt(p1.y - dx * t1)},${fmt(p1.x)},${fmt(p1.y)}`
}

/** נתיב SVG של הקו (monotone X, כמו type="monotone" ב-Recharts). */
export function linePath(points) {
  if (points.length === 0) return ''
  const [first] = points
  let d = `M${fmt(first.x)},${fmt(first.y)}`
  if (points.length === 1) return d
  if (points.length === 2) return `${d}L${fmt(points[1].x)},${fmt(points[1].y)}`

  const tangents = new Array(points.length)
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1]
    tangents[i] = slope3(a.x, a.y, b.x, b.y, c.x, c.y)
  }
  tangents[0] = slope2(points[0].x, points[0].y, points[1].x, points[1].y, tangents[1])
  const last = points.length - 1
  tangents[last] = slope2(points[last - 1].x, points[last - 1].y, points[last].x, points[last].y, tangents[last - 1])

  for (let i = 0; i < last; i++) {
    d += bezier(points[i], points[i + 1], tangents[i], tangents[i + 1])
  }
  return d
}

/** נתיב השטח: הקו, ומשם סגירה אל ציר ה-0 (תחתית הגרף). */
export function areaPath(points) {
  if (points.length < 2) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)}L${fmt(last.x)},100L${fmt(first.x)},100Z`
}

/** אינדקס הנקודה הקרובה ביותר לשבר רוחב (0..1) של אזור הגרף. */
export function nearestIndex(fraction, count) {
  if (count <= 1) return 0
  const f = Math.min(1, Math.max(0, fraction))
  return Math.round(f * (count - 1))
}
