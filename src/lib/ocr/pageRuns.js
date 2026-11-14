// רצפי מספרי עמודים ("runs") — ייצוג דחוס של קבוצת עמודים: [[1, 40], [43, 43], [50, 120]].
// לוגיקה טהורה בלי imports — בטוחה לדפדפן ולשרת. טסטים: pageRuns.test.mjs.
//
// השימוש: נתיב ה-status של OCR לספר שלם מחזיר לכל מצב (existingTextMode) את רצפי העמודים
// שיעובדו (countOcrPages עם withRuns), והטופס סופר מהם כמה עמודים בטווח "מעמוד / עד עמוד" שנבחר —
// מיד, בלי בקשה לשרת בכל הקשה. ברוב הספרים זה רצף אחד או כמה בודדים.

/**
 * מספרי עמודים (בכל סדר, אפשר כפילויות) → רצפים ממוינים וזרים [from, to] (כולל).
 * ערכים שאינם מספר שלם חיובי — מתעלמים מהם.
 * @param {Iterable<number>} pageNumbers
 * @returns {Array<[number, number]>}
 */
export function pageRunsOf(pageNumbers) {
  const nums = [...new Set([...(pageNumbers || [])].filter((n) => Number.isSafeInteger(n) && n >= 1))].sort((a, b) => a - b)
  const runs = []
  for (const n of nums) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  return runs
}

/**
 * כמה עמודים ברצפים נמצאים בטווח (range: { from, to } כולל, או null = הכל).
 * רצף פגום (לא זוג מספרים) — מתעלמים ממנו.
 * @param {Array<[number, number]>} runs
 * @param {{ from: number, to: number } | null} range
 */
export function countPagesInRuns(runs, range) {
  let total = 0
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!Array.isArray(run) || run.length !== 2) continue
    const [a, b] = run
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue
    const start = range ? Math.max(a, range.from) : a
    const end = range ? Math.min(b, range.to) : b
    if (end >= start) total += end - start + 1
  }
  return total
}
