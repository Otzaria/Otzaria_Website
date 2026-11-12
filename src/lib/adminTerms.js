// ניסוח משותף לכל מסכי הניהול (העלאות, ספרים…) — מספרים, ספירת ספרים ותאריכים. לוגיקה טהורה.
// היה ב-adminUploads/uploadTerms.js, ומסך הספרים ייבא משם; עכשיו כאן, וכל מסך מייבא מהמקום המשותף.

/** מספר בעברית עם מפרידי אלפים */
export function formatNumber(n) {
  return Number(n || 0).toLocaleString('he-IL')
}

/** "ספר אחד" / "12 ספרים" */
export function booksCountText(n) {
  return n === 1 ? 'ספר אחד' : `${formatNumber(n)} ספרים`
}

const DAY_MS = 24 * 60 * 60 * 1000
// הימים והשעות לפי שעון ירושלים — כך השרת (UTC) והדפדפן מחשבים אותו "היום" ואותה שעה
const TIME_ZONE = 'Asia/Jerusalem'
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const DATE_FORMAT = new Intl.DateTimeFormat('he-IL', { timeZone: TIME_ZONE, day: 'numeric', month: 'numeric', year: 'numeric' })
const FULL_FORMAT = new Intl.DateTimeFormat('he-IL', { timeZone: TIME_ZONE, dateStyle: 'long', timeStyle: 'short' })

/** מספר היום בלוח השנה לפי שעון ירושלים (ימים מאז 1970) */
export function calendarDay(ms) {
  const [y, m, d] = DAY_FORMAT.format(ms).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

const toTime = (date) => {
  if (date === null || date === undefined || date === '') return NaN
  return new Date(date).getTime()
}

/**
 * מתי — קצר ונקרא במבט: "היום", "אתמול", "לפני יומיים", "לפני 5 ימים", ומשבוע ומעלה — התאריך.
 * לפי לוח השנה בשעון ירושלים. תאריך לא תקין — "".
 * @param {string | number | Date | null | undefined} date
 * @param {number} [now]
 */
export function ageText(date, now = Date.now()) {
  const ms = toTime(date)
  if (!Number.isFinite(ms)) return ''
  const days = calendarDay(now) - calendarDay(ms)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days === 2) return 'לפני יומיים'
  if (days < 7) return `לפני ${days} ימים`
  return DATE_FORMAT.format(ms)
}

/** התאריך המלא, עם שעה, בשעון ירושלים — לריחוף ולקורא מסך ("2 בנובמבר 2026 בשעה 14:05"). לא תקין — "" */
export function fullDateText(date) {
  const ms = toTime(date)
  return Number.isFinite(ms) ? FULL_FORMAT.format(ms) : ''
}
