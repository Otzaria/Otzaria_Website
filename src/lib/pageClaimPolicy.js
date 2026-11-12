// מדיניות תפיסת עמודים בעריכת ספרים (/library/books) — לוגיקה טהורה, משותפת לשרת ולדפדפן.
// טסטים: pageClaimPolicy.test.mjs.
//
// שני כללים:
// 1. מכסה — מתנדב מחזיק לכל היותר MAX_ACTIVE_PAGE_CLAIMS עמודים "בטיפול" בו-זמנית
//    (בכל הספרים יחד). ספר אישי (פרטי / בבעלות המשתמש) אינו נספר ואינו מוגבל.
// 2. שחרור אוטומטי — עמוד בטיפול שלא נערך PAGE_RELEASE_AFTER_DAYS ימים חוזר להיות פנוי.
//    "נערך" = updatedAt של העמוד: כל שמירה (גם שמירה אוטומטית) מאפסת את השעון, כך שמי
//    שעובד בפועל לא מאבד את העמוד. ספר אישי אינו משתחרר.
//    תזכורת במייל נשלחת אחרי PAGE_REMIND_AFTER_DAYS ימים בלי עריכה.

export const MAX_ACTIVE_PAGE_CLAIMS = 5
export const PAGE_RELEASE_AFTER_DAYS = 5
export const PAGE_REMIND_AFTER_DAYS = 3

export const DAY_MS = 24 * 60 * 60 * 1000

export const CLAIM_LIMIT_ERROR_CODE = 'CLAIM_LIMIT_REACHED'

/** ספר אישי: פרטי או בבעלות משתמש. עמודיו אינם נספרים במכסה ואינם משתחררים. */
export function isPersonalBook(book) {
  return !!(book && (book.isPrivate || book.ownerId))
}

function toTime(value) {
  if (value == null || value === '') return NaN
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : NaN
}

/** עמוד שהפעילות האחרונה בו לפני (או בדיוק ב-) הגבול הזה — משתחרר */
export function pageReleaseCutoff(now = new Date()) {
  return new Date(toTime(now) - PAGE_RELEASE_AFTER_DAYS * DAY_MS)
}

/** עמוד שהפעילות האחרונה בו לפני הגבול הזה — מקבל תזכורת */
export function pageRemindCutoff(now = new Date()) {
  return new Date(toTime(now) - PAGE_REMIND_AFTER_DAYS * DAY_MS)
}

/** מועד השחרור האוטומטי לפי הפעילות האחרונה, או null כשאין תאריך תקין */
export function autoReleaseAt(lastActivityAt) {
  const time = toTime(lastActivityAt)
  return Number.isFinite(time) ? new Date(time + PAGE_RELEASE_AFTER_DAYS * DAY_MS) : null
}

/** האם תוקף התפיסה פג (העמוד אמור להשתחרר). תאריך חסר/לא תקין — לא פג. */
export function isClaimExpired(lastActivityAt, now = new Date()) {
  const releaseAt = autoReleaseAt(lastActivityAt)
  return releaseAt != null && releaseAt.getTime() <= toTime(now)
}

/** האם מותר לתפוס עמוד נוסף כשכבר מחזיקים activeCount עמודים */
export function canClaimAnotherPage(activeCount) {
  const count = Number(activeCount)
  return !Number.isFinite(count) || count < MAX_ACTIVE_PAGE_CLAIMS
}

/** "יום אחד" / "יומיים" / "3 ימים" */
export function hebrewDays(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n === 1) return 'יום אחד'
  if (n === 2) return 'יומיים'
  return `${n} ימים`
}

/** הודעת השגיאה כשמנסים לתפוס עמוד מעבר למכסה */
export function claimLimitMessage() {
  return `אפשר להחזיק עד ${MAX_ACTIVE_PAGE_CLAIMS} עמודים בטיפול בו-זמנית. ` +
    'כדי לתפוס עמוד חדש, סיים או שחרר אחד מהעמודים שבטיפולך.'
}

/** הסבר הכללים — מופיע בחלון אישור התפיסה */
export function claimRulesText() {
  return `אפשר להחזיק עד ${MAX_ACTIVE_PAGE_CLAIMS} עמודים בטיפול בו-זמנית. ` +
    `עמוד שלא נערך ${hebrewDays(PAGE_RELEASE_AFTER_DAYS)} משתחרר אוטומטית.`
}
