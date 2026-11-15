// דיווח טעות בספר → האזור בצילום שבו נמצא הטקסט המסומן (לוגיקה טהורה). מריץ את אותו מעקב
// שהעורך מריץ לסמן (trackCaret) על תחילת הבחירה ועל סופה, ומחזיר אזור רק כששני הקצוות
// מוקמו בשורה משלהם בצילום (לא משוערת) ובביטחון — אחרת null, ולא נשמר דבר.

import { linesForColumn, lineAlignmentFor, trackCaret } from './caretTrack.js'
import { cropFromBoxes } from '../pageReports/cropRect.js'

/**
 * @param {{ text: string, start: number, end: number, source: import('./trackingSource.js').TrackSource|null,
 *   column?: 'content'|'right'|'left', twoColumns?: boolean, wordLevel?: boolean }} input
 *   text — ערך השדה שבו סומן (לפני הכנסת הסימון); start/end — הבחירה בו
 * @returns {import('../pageReports/cropRect.js').CropRect|null}
 */
export function reportScanCrop({ text, start, end, source, column = 'content', twoColumns = false, wordLevel = true }) {
  if (!source || !source.source || typeof text !== 'string' || !text) return null
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) return null
  const picked = linesForColumn(source, { twoColumns, column })
  const lines = picked.lines
  if (!lines.length) return null
  const useWords = wordLevel && picked.wordLevel
  const alignment = lineAlignmentFor(text, lines)
  // הקצה האחרון — התו האחרון שבבחירה (end בלעדי); בחירה ריקה — נקודת ההוספה
  const last = end > start ? end - 1 : start
  const a = trackCaret(text, start, lines, { alignment, wordLevel: useWords })
  const b = last === start ? a : trackCaret(text, last, lines, { alignment, wordLevel: useWords })
  const reliable = (t) => t && t.scanIndex != null && !t.lineEstimated && t.confident && t.lineBox
  if (!reliable(a) || !reliable(b)) return null
  const from = Math.min(a.scanIndex, b.scanIndex)
  const to = Math.max(a.scanIndex, b.scanIndex)
  const lineBoxes = lines.slice(from, to + 1).map((l) => l.bbox)
  // מסגרת המילים — רק כשהבחירה בשורה אחת ושני הקצוות קיבלו מסגרת מילה מדויקת
  const sameLine = a.scanIndex === b.scanIndex
  const wordBoxes = sameLine && useWords && a.wordBox && b.wordBox && a.kind === 'solid' && b.kind === 'solid' ? [a.wordBox, b.wordBox] : null
  return cropFromBoxes({ lineBoxes, wordBoxes, size: source.size, source: source.source })
}
