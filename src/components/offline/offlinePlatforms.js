// לוגיקה טהורה של אזור ההורדה ב-/offline (בלי React/DOM) — נבדקת ב-offlinePlatforms.test.js.

/** המערכות שהכלי זמין להן */
export const OFFLINE_PLATFORM_KEYS = ['windows', 'macos']

/** הכרטיס שמוצג כשהמערכת לא זוהתה כאחת מהנתמכות (טלפון, Linux, לא ידוע — וגם ברינדור השרת) */
export const DEFAULT_OFFLINE_PLATFORM = 'windows'

/**
 * איזה כרטיס הורדה מוצג (אחד בלבד), והאם הוא באמת המחשב של המבקר.
 * os — ערך data-os (lib/detectOs.js), או null לפני הזיהוי / בשרת.
 * matched=false — ברירת המחדל: כרטיס Windows, בלי התג "המחשב שלך".
 * חייב להתאים ל-CSS שב-OfflineUpdateDownloadClient (in-data-[os=macos]:...), שמחליט מה מוצג
 * בציור הראשון: macOS רק כש-data-os="macos", ו-Windows בכל מקרה אחר.
 */
export function resolveShownPlatform(os) {
  return OFFLINE_PLATFORM_KEYS.includes(os)
    ? { key: os, matched: true }
    : { key: DEFAULT_OFFLINE_PLATFORM, matched: false }
}

/** המערכת השנייה — לקישור המשני "יש לך Mac?" מתחת לכרטיס */
export function otherPlatform(key) {
  return key === 'macos' ? 'windows' : 'macos'
}

/** גודל קובץ לתצוגה: "18.7 MB" (מ-100MB — בלי ספרה אחרי הנקודה); null כשאין גודל */
export function formatSize(bytes) {
  if (!bytes || bytes < 0) return null
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

// אזור זמן קבוע: אחרת השרת (UTC) והדפדפן (ירושלים) עלולים להציג יום שונה — ואי-התאמת hydration
const RELEASE_DATE_FORMAT = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jerusalem'
})

/** תאריך הפרסום של הגרסה: "12 באוקטובר 2026"; null כשהתאריך חסר או שגוי */
export function formatReleaseDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return RELEASE_DATE_FORMAT.format(date)
}
