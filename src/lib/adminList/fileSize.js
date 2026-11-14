// גודל קובץ — נוסח אחד לכל ממשק הניהול: "512 B", "48 KB", "1.5 MB", "2 GB".
// עד מגה — מספר שלם; ממגה ומעלה — ספרה אחת אחרי הנקודה, בלי ".0". יחידות KB/MB (מוכרות יותר מ-ק"ב).
//
// הטקסט עטוף בתווי בידוד כיוון (LRI … PDI): "48 KB" בתוך משפט עברי, ובמיוחד בתוך סוגריים, התהפך
// ל-"(KB 48)". הבידוד שומר על הסדר בכל מקום — בטקסט רגיל, ב-title, בהודעה קופצת — בלי לדרוש <bdi>.
// (קובץ .js ולא ייבוא מ-formatFileSize.ts של החנות: node:test לא טוען .ts.)

/** פתיחת בידוד משמאל-לימין (LEFT-TO-RIGHT ISOLATE) */
export const LRI = '\u2066'
/** סגירת בידוד (POP DIRECTIONAL ISOLATE) */
export const PDI = '\u2069'

const UNITS = ['KB', 'MB', 'GB', 'TB']
const KIB = 1024

/** KB — שלם; מגה ומעלה — ספרה אחת, בלי ".0" */
const rounded = (value, unitIndex) => (unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10)

/**
 * גודל קובץ קריא, מבודד כיוון. ערך חסר / לא מספר / שלילי — מחרוזת ריקה (המסך מחליט מה להציג).
 * @param {number | string | null | undefined} bytes
 * @returns {string}
 */
export function fileSizeText(bytes) {
  if (bytes == null || bytes === '') return ''
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < KIB) return `${LRI}${Math.round(n)} B${PDI}`
  let value = n / KIB
  let unit = 0
  while (unit < UNITS.length - 1 && rounded(value, unit) >= KIB) {
    value /= KIB
    unit += 1
  }
  return `${LRI}${rounded(value, unit)} ${UNITS[unit]}${PDI}`
}
