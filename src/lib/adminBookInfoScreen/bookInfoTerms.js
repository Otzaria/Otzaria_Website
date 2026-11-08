// "פרטי ספרים" (/library/admin/book-info) — הניסוחים: שמות השדות, המצבים של בקשת מיזוג, ספירות.
// לוגיקה טהורה (נבדק ב-bookInfoTerms.test.mjs).

import { formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'

export const BOOK_INFO_TITLE = adminScreenTitle('book-info')
// "ב‑GitHub" — עם מקף שאינו שובר (U+2011), כדי שהשורה לא תישבר באמצע המילה
export const GH = 'ב‑GitHub'
export const BOOK_INFO_DESCRIPTION = `שינויים שמשתמשים הציעו בפרטי ספרים — שם, מחבר, דור ותקופה. כל שינוי נפתח כבקשת מיזוג ${GH}, ואתה מאשר אותו שם: מיזוג (Merge) מפרסם את השינוי בקובץ הספרייה, וסגירה (Close) דוחה אותו. המצב כאן מתעדכן לבד.`

export const VIEW_LABELS = { open: 'פתוחות', all: 'כל הבקשות', legacy: 'הצעות ישנות' }

export const LIBRARY_FILE_URL = 'https://github.com/Otzaria/otzaria-library/blob/main/ForDB/book_info.csv'
export const EXPORT_CSV_URL = '/api/admin/book-info/export-csv'
export const EXPORT_CSV_NAME = 'book_info.csv'
export const EXPORT_LABEL = 'הורד את קובץ פרטי הספרים (CSV)'

export const FIELD_LABELS = {
  bookName: 'שם הספר',
  authorName: 'שם המחבר',
  generationName: 'דור המחבר',
  subGenerationName: 'דור משנה',
  startYear: 'תחילת התקופה',
  endYear: 'סיום התקופה',
}

export const fieldLabel = (field) => FIELD_LABELS[field] || field

/** ערך ריק בשדה (null / undefined / "" / רווחים) */
export const isEmptyValue = (value) => value === null || value === undefined || String(value).trim() === ''

/** ערך שדה לתצוגה; ריק — "אין" (במילים — לא "—", שליד חץ וקו חוצה נקרא כמו "=") */
export function formatValue(value) {
  if (isEmptyValue(value)) return 'אין'
  return String(value)
}

/**
 * המצבים של בקשת מיזוג (BookInfoChangeSet.status) — שם, גוון התג, הסבר קצר (לריחוף ולקורא המסך), ו"מה עושים"
 * כשהמצב דורש טיפול. לפי מילון השמות: "ממתין למיזוג" → "ממתין לפרסום", "מוזג" → "פורסם", "נסגר" → "סגור",
 * "נדרשת בדיקה" → "דורש בדיקה". stuck — לא מצב בשרת: "בפתיחה" שנמשך יותר מדי (isStuck).
 */
export const STATUS = {
  publishing: { label: 'בפתיחה', tone: 'info', hint: `הבקשה נפתחת עכשיו ${GH}.` },
  stuck: {
    label: 'תקוע בפתיחה', tone: 'error', hint: `הבקשה התחילה להיפתח ${GH} ולא הסתיימה.`,
    todo: `בדוק ${GH} אם הבקשה נפתחה. אם לא — בקש מהמשתמש לשלוח את השינוי שוב.`,
  },
  open: { label: 'ממתין לפרסום', tone: 'primary', hint: `הבקשה פתוחה ${GH}. כדי לפרסם את השינוי — מזג אותה שם.` },
  conflict: {
    label: 'דורש בדיקה', tone: 'error', hint: 'הקובץ השתנה מאז שהבקשה נפתחה, ואי אפשר למזג אותה כמו שהיא.',
    todo: `פתח את הבקשה ${GH}: תקן אותה ומזג, או סגור אותה.`,
  },
  modified: {
    label: `נערך ${GH}`, tone: 'warning', hint: `מישהו שינה את הבקשה ישירות ${GH}.`,
    todo: `פתח את הבקשה ${GH} ובדוק את השינוי לפני שתמזג.`,
  },
  merged: { label: 'פורסם', tone: 'success', hint: 'הבקשה מוזגה, והשינוי נמצא בקובץ.' },
  closed: { label: 'סגור', tone: 'neutral', hint: `הבקשה נסגרה ${GH} בלי מיזוג.` },
  failed: {
    label: 'נכשל', tone: 'error', hint: `הבקשה לא נפתחה ${GH}, ולכן אין מה למזג.`,
    todo: 'אין כאן מה לאשר. אם השינוי עדיין נחוץ — בקש מהמשתמש לשלוח אותו שוב.',
  },
}

/** הסדר שבו המצבים מופיעים בבורר */
export const STATUS_ORDER = ['conflict', 'modified', 'stuck', 'failed', 'publishing', 'open', 'merged', 'closed']

/** מצבים שמנהל יכול לטפל בהם ("צריכות בדיקה"). "נכשל" — לא: אין בקשה לטפל בה, ההסבר כתוב בשורה */
export const ATTENTION_STATUSES = ['conflict', 'modified', 'stuck']

/** בקשה ש"בפתיחה" יותר מזה — תקועה (פתיחה רגילה לוקחת שניות עד דקות ספורות) */
export const STUCK_AFTER_MS = 15 * 60 * 1000

export const statusInfo = (status) => STATUS[status] || STATUS.failed

/**
 * הסיבה שהשרת כתב (lastError) בעברית פשוטה. הטקסט המקורי — ב"פרטים" (raw), כשהוא שונה.
 * @param {string | null | undefined} lastError
 * @returns {{ text: string, raw: string | null } | null}
 */
export function explainError(lastError) {
  const raw = String(lastError || '').trim()
  if (!raw) return null
  const known = [
    [/הענף אינו תואם|הענף השתנה/, `מישהו שינה את הבקשה ${GH} אחרי שנפתחה.`],
    [/הפרסום לא הושלם/, `הבקשה לא נפתחה ${GH} עד הסוף.`],
    [/כבר קיים בקובץ/, 'השינוי כבר נמצא בקובץ, ואין מה לפרסם.'],
    [/הספר הוסר|הספר אינו בקובץ/, 'הספר כבר לא נמצא בקובץ הספרייה.'],
    [/מתבצע סנכרון/, 'הבדיקה מול GitHub הייתה באמצע. זה יסתדר לבד בבדיקה הבאה.'],
    [/לא ניתן לבנות/, 'הקובץ השתנה, ולא הצלחנו לעדכן את הבקשה לפיו.'],
    [/זהות|זהויות/, 'הספר השתנה בקובץ (שם או מחבר), ולא הצלחנו להתאים אליו את השינוי.'],
  ]
  const match = known.find(([re]) => re.test(raw))
  if (match) return { text: match[1], raw }
  if (!/[֐-׿]/.test(raw)) return { text: `תקלה טכנית ${GH}.`, raw }
  return { text: raw, raw: null }
}

/** "בקשה אחת" / "12 בקשות" */
export function requestsCountText(n) {
  return n === 1 ? 'בקשה אחת' : `${formatNumber(n)} בקשות`
}

/** "הצעה אחת" / "3 הצעות" */
export function suggestionsCountText(n) {
  return n === 1 ? 'הצעה אחת' : `${formatNumber(n)} הצעות`
}

/** "שדה אחד" / "3 שדות" */
export function fieldsCountText(n) {
  return n === 1 ? 'שדה אחד' : `${formatNumber(n)} שדות`
}

/** ההודעה מעל הרשימה כשיש בקשות שצריך לבדוק */
export const ATTENTION_BODY = `לכל אחת כתוב בשורה מה קרה ומה לעשות. הטיפול עצמו נעשה ${GH}.`

export function attentionText(n) {
  return n === 1 ? 'בקשה אחת צריכה בדיקה' : `${formatNumber(n)} בקשות צריכות בדיקה`
}

/** ההסבר בלשונית "הצעות ישנות" */
export const LEGACY_DESCRIPTION = 'הצעות שנשלחו לפני שכל שינוי נפתח כבקשת מיזוג. סמן את השדות שתרצה לטפל בהם, ואז פתח מהם בקשת מיזוג (בשם מי שהציע) או מחק אותם. הצעה שאין בה שינוי מול הקובץ מסומנת — אותה אפשר רק למחוק.'

export const LEGACY_PENDING_LINE = 'תימחק בעוד כמה שניות'

/** "פותח בקשות מיזוג… 2 מתוך 5" */
export function publishProgressText({ done, total }) {
  return `פותח בקשות מיזוג… ${formatNumber(done)} מתוך ${formatNumber(total)}`
}

/** הסיכום אחרי פתיחת כמה בקשות */
export function publishResultText({ ok, failed, stopped }) {
  const parts = [ok === 0 ? 'לא נפתחו בקשות' : ok === 1 ? 'נפתחה בקשת מיזוג אחת' : `נפתחו ${formatNumber(ok)} בקשות מיזוג`]
  if (failed > 0) parts.push(failed === 1 ? 'הצעה אחת לא נפתחה — הסיבה כתובה בה' : `${formatNumber(failed)} הצעות לא נפתחו — הסיבה כתובה בכל אחת`)
  if (stopped) parts.push('הפעולה נעצרה')
  return `${parts.join(' · ')}.`
}

/** חלון האישור לפני מחיקה של כמה הצעות ישנות */
export function bulkDeleteConfirm(n) {
  return {
    title: n === 1 ? 'למחוק לצמיתות הצעה אחת?' : `למחוק לצמיתות ${formatNumber(n)} הצעות?`,
    body: 'רק השדות המסומנים יימחקו, ולא ייפתחו מהם בקשות מיזוג. הצעה שכל השדות שלה מסומנים — תימחק כולה.',
    confirmLabel: n === 1 ? 'מחק לצמיתות' : `מחק ${formatNumber(n)} לצמיתות`,
    cancelLabel: 'בטל',
  }
}

/**
 * השם של "מחק" בכרטיס — בדיוק מה שיימחק: אין סימון או הכול מסומן — ההצעה כולה; חלק — השדות המסומנים.
 * @param {number} checked כמה שדות מסומנים @param {number} total כמה שדות בהצעה
 */
export function deleteLabel(checked, total) {
  if (checked === 0 || checked >= total) return 'מחק את ההצעה'
  return checked === 1 ? 'מחק את השדה המסומן' : `מחק את ${formatNumber(checked)} השדות המסומנים`
}

/** "פתח בקשת מיזוג" בכרטיס — עם מספר השדות כשלא כולם מסומנים */
export function publishLabel(checked, total) {
  if (checked === 0 || checked >= total) return 'פתח בקשת מיזוג'
  return `פתח בקשת מיזוג (${fieldsCountText(checked)})`
}
