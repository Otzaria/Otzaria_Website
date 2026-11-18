// פתיחת העורך מתוך מסך הדיווחים (?report=<id>) — לוגיקה טהורה (reportFocusLogic.test.js): קריאת המזהה
// מהכתובת, בחירת השדות לחיפוש, וההודעה שמוצגת למשתמש. האיתור עצמו — src/lib/pageReports/locateMarker.js.

import { locateReportInFields } from '@/lib/pageReports/locateMarker'
import { buildErrorMarker } from '@/lib/pageReports/rules'

const OBJECT_ID = /^[a-f0-9]{24}$/i

/** מזהה הדיווח מתוך ה-query של הכתובת (?report=<id>), או null */
export function reportIdFromSearch(search) {
  let id = null
  try {
    id = new URLSearchParams(typeof search === 'string' ? search : '').get('report')
  } catch {
    return null
  }
  return id && OBJECT_ID.test(id) ? id : null
}

/** האם הדיווח שייך לעמוד שפתוח בעורך (ספר לפי slug או שם; ה-bookPath בכתובת יכול להגיע מקודד) */
export function reportMatchesPage(report, bookPath, pageNumber) {
  if (!report) return false
  let decoded = String(bookPath ?? '')
  try { decoded = decodeURIComponent(decoded) } catch { /* נשאר כמו שהוא */ }
  return Number(report.pageNumber) === Number(pageNumber) && (report.bookPath === decoded || report.bookPath === String(bookPath))
}

/**
 * איתור בשדות העורך — רשימת { column, value } מתוך השדות שבמסך.
 * @param {Array<{ column: string|null, value: string }>} fields column: data-column ('right'/'left') או null
 */
export function locateInEditorFields(fields, report) {
  const list = (Array.isArray(fields) ? fields : []).map((f) => ({
    column: f.column === 'right' || f.column === 'left' ? f.column : 'content',
    value: typeof f.value === 'string' ? f.value : '',
  }))
  return locateReportInFields(list, report)
}

/** הסימון כפי שהוא מוצג בהודעה */
export function reportMarkerLabel(report) {
  return buildErrorMarker(report?.original ?? '', report?.proposed ?? '')
}

/**
 * ההודעה בפס הדיווח.
 * @param {{ phase: 'loading'|'found'|'missing'|'otherPage'|'error'|'applied', count?: number, error?: string, done?: string }} state
 * @returns {{ tone: 'info'|'warning'|'error', text: string }}
 */
export function reportFocusNotice(state) {
  switch (state?.phase) {
    case 'loading':
      return { tone: 'info', text: 'מחפשים את הסימון של הדיווח בטקסט…' }
    case 'found':
      return {
        tone: 'info',
        text: state.count > 1
          ? `הסימון של הדיווח מסומן בטקסט (יש ${state.count} סימונים זהים בעמוד — סומן זה שמתאים למיקום שדווח).`
          : 'הסימון של הדיווח מסומן בטקסט.',
      }
    case 'missing':
      return { tone: 'warning', text: 'הסימון של הדיווח לא נמצא בטקסט העמוד. ייתכן שכבר טופל או נערך.' }
    case 'applied':
      return { tone: 'info', text: `${state.done || 'בוצע.'} אפשר לבטל עם Ctrl+Z.` }
    case 'otherPage':
      return { tone: 'warning', text: 'הדיווח שבכתובת שייך לעמוד אחר.' }
    default:
      return { tone: 'error', text: state?.error || 'טעינת הדיווח נכשלה.' }
  }
}

/** איפה הפס: למטה, אלא אם הסימון בחצי התחתון של המסך — אז למעלה, כדי לא להסתיר אותו */
export function barPlacement(markerY, viewportHeight) {
  if (!Number.isFinite(markerY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return 'bottom'
  return markerY > viewportHeight / 2 ? 'top' : 'bottom'
}
