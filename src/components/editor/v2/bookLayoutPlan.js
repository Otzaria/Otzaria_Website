// עימוד ספר בתצוגה המעוצבת — החלק הטהור (בלי DOM): "חלון" בתחילת פסקה וסיום משולש.
// המדידה וההחלה על ה-DOM — bookLayout.js. כאן: קיבוץ מלבנים לשורות מסך, המילה הראשונה,
// מועמדי צורת הסיומת, הניקוד שלהם ומחרוזת ה-polygon של ה-shape-outside.
//
// סיום משולש: השורות האחרונות של הפסקה מצטמצמות בהדרגה וממורכזות (כמו בספרים ישנים), כך
// שאין שורה אחרונה עם מילה בודדת. m שורות מקור (הטקסט שבהן, ביחידות "שורה מלאה" = (m-1)+r)
// נפרסות על k שורות ברוחב 1 - j*s (j = 1..k) — מכאן הצעד s; הבחירה הסופית לפי מדידה בפועל.

/** הזחה קטנה של כל מדרגה ב-shape: Chrome בודק חדירת צורה לשורה מעט מעבר לגובה השורה */
export const BOOK_EPS = 2

/** טווח הצעד (חלק מהרוחב שכל שורת סיומת מאבדת) ורוחב מינימלי לשורה האחרונה */
export const TAIL_LIMITS = Object.freeze({ minStep: 0.06, maxStep: 0.26, idealStep: 0.13, minLast: 0.22 })

/** פחות מילים בשורה מלאה מזה — בלי סיום משולש */
export const MIN_WORDS_PER_LINE = 5.5

/** מילה ראשונה רחבה מזה (חלק מרוחב השורה) — בלי חלון */
export const WINDOW_MAX_FRACTION = 0.5

/**
 * מלבנים (יחסית לראש השורה הלוגית) → שורות מסך: { c: מרכז אנכי, l, r }, מלמעלה למטה.
 * מלבן ששייך לשורה הנוכחית אם מרכזו קרוב (פחות מחצי גובה שורה) למרכז השורה.
 * @param {{ top: number, bottom: number, left: number, right: number }[]} rects
 * @param {number} lh
 */
export function clusterRows(rects, lh) {
  const items = rects
    .filter((x) => x.right - x.left >= 0.5 && x.bottom > x.top)
    .map((x) => ({ c: (x.top + x.bottom) / 2, l: x.left, r: x.right }))
    .sort((a, b) => a.c - b.c)
  /** @type {{ c: number, l: number, r: number, cs: number[] }[]} */
  const rows = []
  for (const it of items) {
    const row = rows[rows.length - 1]
    if (row && it.c - row.c < lh / 2) {
      row.l = Math.min(row.l, it.l)
      row.r = Math.max(row.r, it.r)
      row.cs.push(it.c)
      // מרכז השורה = החציון (טקסט קטן/גדול בשורה לא מזיז אותו)
      const s = [...row.cs].sort((a, b) => a - b)
      row.c = s[Math.floor(s.length / 2)]
    } else rows.push({ c: it.c, l: it.l, r: it.r, cs: [it.c] })
  }
  return rows.map(({ c, l, r }) => ({ c, l, r }))
}

/**
 * המילה הראשונה של הפסקה: [start, end) — מתחילת המילה עד תחילת המילה השנייה (כולל הרווח),
 * כי זה הרוחב שהשורה השנייה צריכה להיכנס בו. אין מילה שנייה — null.
 * @param {string} text טקסט התצוגה של השורה הלוגית
 */
export function firstWordSpan(text) {
  const m = /^(\s*)(\S+)(\s+)(?=\S)/u.exec(text)
  if (!m) return null
  return { start: m[1].length, wordEnd: m[1].length + m[2].length, end: m[0].length }
}

/**
 * מועמדי הסיומת, מהמבטיח לפחות מבטיח.
 * @param {number} n מספר שורות המסך של הפסקה
 * @param {number} r מילוי השורה האחרונה (0..1)
 * @param {number} firstAllowed השורה (1-based) הראשונה שמותר לה להיות חלק מהסיומת
 * @param {number} wordsPerLine הערכה גסה של מילים בשורה מלאה
 * @returns {{ m: number, k: number, s: number, target: number }[]}
 */
export function tailCandidates(n, r, firstAllowed, wordsPerLine) {
  if (!(n >= 2) || !(r >= 0)) return []
  // לוח צר מדי (פחות מ-~5.5 מילים בשורה): שורות סיומת של 2–3 מילים נמתחות ביישור — בלי משפך
  if (wordsPerLine < MIN_WORDS_PER_LINE) return []
  let target = n >= 9 ? 4 : n >= 5 ? 3 : 2
  if (wordsPerLine < 7) target = Math.min(target, 2)
  else if (wordsPerLine < 10) target = Math.min(target, 3)
  const out = []
  for (let m = 1; m <= Math.min(5, n); m++) {
    if (n - m + 1 < firstAllowed) break
    for (const k of [m, m + 1]) {
      if (k < 2 || k > 5 || Math.abs(k - target) > 1) continue
      const R = (m - 1) + Math.min(1, r)
      const s0 = (2 * (k - R)) / (k * (k + 1))
      if (s0 > 0.34 || s0 < 0.03) continue
      // הצעד הנומינלי (מעט קטן — שבירה במילים שלמות מאבדת קצת רוחב בכל שורה), בתוך הטווח
      const s = Math.min(TAIL_LIMITS.maxStep - 0.02, Math.max(TAIL_LIMITS.minStep + 0.01, s0 * 0.9))
      if (1 - k * s < TAIL_LIMITS.minLast) continue
      out.push({ m, k, s, target, pri: Math.abs(k - target) + Math.abs(s0 - TAIL_LIMITS.idealStep) * 5 })
    }
  }
  return out.sort((a, b) => a.pri - b.pri).map(({ m, k, s, target }) => ({ m, k, s, target }))
}

/** צעד תקף לכיוונון עדין */
export const stepOk = (k, s) => s >= TAIL_LIMITS.minStep && s <= TAIL_LIMITS.maxStep && 1 - k * s >= TAIL_LIMITS.minLast

/**
 * ניקוד של צורה שהוחלה ונמדדה (נמוך = טוב; 100 ומעלה = פסול).
 * @param {{ k: number, s: number, target: number }} c
 * @param {{ start: number, rows: number, lastFill: number, gapEm: number }} measured
 *   rows — מספר שורות המסך אחרי ההחלה; lastFill — מילוי השורה האחרונה ביחס לרוחב שהיה זמין לה;
 *   gapEm — הרווח הגדול בין מילים בשורות הסיומת (em), 0 בלי יישור לשני הצדדים
 */
export function scoreTail(c, { start, rows, lastFill, gapEm }) {
  // יותר שורות מהצפוי = שורה ברוחב מלא אחרי המשפך → פסול. פחות = מדרגה אחרונה לא בשימוש → מותר
  const used = Math.max(1, Math.min(c.k, rows - start))
  const bad = rows > start + c.k || used < 2
  const sc = (bad ? 100 : 0) + (c.k - used) * 0.8 + Math.max(0, 0.45 - lastFill) * 20 +
    Math.max(0, gapEm - 0.45) * 16 + Math.abs(c.s - TAIL_LIMITS.idealStep) * 6 + Math.abs(c.k - c.target) * 0.6
  return { sc, used }
}

/**
 * polygon מדורג ל-shape-outside של float בגובה k שורות: בכל שורה j הצורה נכנסת step*j
 * פנימה מהקצה החיצוני. physical — הצד הפיזי של ה-float ('right' / 'left').
 * @param {'right'|'left'} physical
 * @param {number} width רוחב ה-float (>= step*k)
 * @param {number} step
 * @param {number} k
 * @param {number} lh
 * @param {number} [eps]
 */
export function stepPolygon(physical, width, step, k, lh, eps = BOOK_EPS) {
  const px = (v) => `${Math.round(v * 100) / 100}px`
  const edge = physical === 'right' ? width : 0
  const inner = (j) => (physical === 'right' ? width - step * j : step * j)
  const pts = [`${px(edge)} ${px(eps)}`]
  for (let j = 1; j <= k; j++) pts.push(`${px(inner(j))} ${px((j - 1) * lh + eps)}`, `${px(inner(j))} ${px(j * lh)}`)
  pts.push(`${px(edge)} ${px(k * lh)}`)
  return `polygon(${pts.join(',')})`
}
