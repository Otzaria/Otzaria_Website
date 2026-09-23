// סיומת .js מפורשת — הקובץ נטען גם ע"י node --test (ESM ללא רזולוציית webpack)
import { compareVersions } from './semverCompare.js'

// ===== השירות שמאחורי התוכנה הנלווית =====
// תוסף שדורש תוכנה נלווית (ראו src/lib/pluginCompanion.js) אינו עובד אצל מי
// שהתוכנה אינה מותקנת אצלו. ההצהרה כאן היא מה שמאפשר לצרכן — אוצריא, "עדכוני
// אוצריא", חנות התוספים למחשב — *לא להציג* תוסף כזה למי שהשירות שמאחוריו חסר.
//
// **מי מחליט:** לא האתר. דפדפן אינו יכול לדעת אילו תוכנות מותקנות על המחשב,
// ולכן החנות רק מצהירה — `service.id` ו-`service.minVersion` — והצרכן, שהוא
// היחיד שיודע מה מותקן, מוסר את רשימת השירותים שלו בפרמטר `installedServices`
// ומקבל רשימה מסוננת. איך הצרכן מזהה התקנה (מפתח רישום, קובץ, פנייה על
// loopback) הוא עניינו — החנות אינה מגדירה את זה ואינה יכולה לאמת אותו.

// מזהה שירות: slug יציב באותיות קטנות, כמו מזהה תוסף. ללא רווחים, פסיקים ו-@
// שמשמשים מפרידים בפרמטר.
// נבדק: לינארי — מחלקת תווים פשוטה עם כמת חסום, אין נסיגה קטסטרופלית
const SERVICE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/

// גרסת השירות שמשווים לפיה חייבת להיות ברת-השוואה מספרית (בניגוד ל-
// companion.version, שהוא טקסט תצוגה ומותר בו כמעט הכול) — אחרת "מותקנת גרסה
// מספקת" אינה שאלה שאפשר לענות עליה.
// מפוצל לשני ביטויים (ליבה מספרית + prerelease) במקום ביטוי מורכב אחד:
// eslint-security פוסל ביטוי עם יותר מכמת אחד, וכאן אין צורך בו.
const SERVICE_VERSION_CORE_RE = /^[0-9][0-9.]{0,23}$/
const SERVICE_VERSION_PRERELEASE_RE = /^[A-Za-z0-9.]{1,20}$/

// תקרת האורך הכוללת — זהה ל-maxlength של service.minVersion במודל. בלעדיה
// הצירוף של שני הביטויים מתיר עד 45 תווים, וה-save נכשל ב-500 במקום 400.
export const MAX_SERVICE_VERSION_LENGTH = 40

function isServiceVersion(value) {
  if (value.length > MAX_SERVICE_VERSION_LENGTH) return false
  const dash = value.indexOf('-')
  const core = dash === -1 ? value : value.slice(0, dash)
  if (!SERVICE_VERSION_CORE_RE.test(core)) return false
  // '1..2' ו-'1.' עוברים את מחלקת התווים אבל אינם גרסה — compareVersions
  // היה מקבל מהם NaN ומשווה שקר.
  if (core.endsWith('.') || core.includes('..')) return false
  return dash === -1 || SERVICE_VERSION_PRERELEASE_RE.test(value.slice(dash + 1))
}

// תקרה לרשימת השירותים המותקנים שצרכן שולח. אותה תקרה כמו בבדיקת העדכונים
// (MAX_UPDATE_REQUESTS) — מחשב אחד לא מתקין יותר מזה שירותים נלווים.
export const MAX_INSTALLED_SERVICES = 100

export function normalizeServiceId(value) {
  return (value || '').toString().trim().toLowerCase()
}

// רשומת השירות מתוך שדות הטופס. זורק Error בעברית — הקוראים מחזירים את המסר
// כמו שהוא למעלה התוסף, כמו ב-buildCompanionMeta.
//
// hideUnlessInstalled בלי מזהה שירות הוא בקשה בלתי-אפשרית: אי אפשר לבדוק
// התקנה של משהו שאין לו שם. לכן זו שגיאה ולא התעלמות שקטה.
export function buildCompanionService({ id, minVersion, hideUnlessInstalled } = {}) {
  const serviceId = normalizeServiceId(id)
  const hide = hideUnlessInstalled === true

  if (!serviceId) {
    if (hide) {
      throw new Error('כדי להסתיר את התוסף ממי שהתוכנה אינה מותקנת אצלו יש למלא מזהה שירות')
    }
    return { id: '', minVersion: '', hideUnlessInstalled: false }
  }

  if (!SERVICE_ID_RE.test(serviceId)) {
    throw new Error(
      'מזהה השירות יכול להכיל אותיות אנגליות קטנות, ספרות, נקודות, מקפים וקו תחתון בלבד (2 עד 64 תווים)'
    )
  }

  const version = (minVersion || '').toString().trim()
  if (version && !isServiceVersion(version)) {
    throw new Error('גרסת השירות המזערית חייבת להיות מספרית, למשל 1.2.0')
  }

  return { id: serviceId, minVersion: version, hideUnlessInstalled: hide }
}

// רשומת השירות מתוך תת-מסמך מונגו (או ברירת מחדל ריקה).
export function serviceFromDoc(service) {
  return {
    id: normalizeServiceId(service?.id),
    minVersion: (service?.minVersion || '').toString(),
    hideUnlessInstalled: service?.hideUnlessInstalled === true
  }
}

// הייצוג הציבורי של ההצהרה. null כשאין מזהה שירות — כך שצרכן בודק שדה אחד.
export function serializeServiceForPublic(service) {
  const normalized = serviceFromDoc(service)
  if (!normalized.id) return null
  return {
    id: normalized.id,
    minVersion: normalized.minVersion,
    // "אל תציג אותי למי שהשירות אינו מותקן אצלו". הצרכן שאינו מוסר
    // installedServices מתעלם מזה — ראו filterByInstalledServices.
    hideUnlessInstalled: normalized.hideUnlessInstalled
  }
}

// פירוק פרמטר installedServices ("id@ver,id,id@ver,..."). פריט בלי @ פירושו
// "מותקן, גרסה לא ידועה" — לגיטימי לשירות שאינו מנהל גרסאות.
//
// פריט לא-תקין פוסל את הבקשה כולה (400 אצל הקורא), כמו ב-parseUpdateRequestList:
// קלט כזה מעיד על לקוח שבור, וסינון חלקי בשקט היה מציג דווקא את התוספים
// שההצהרה נועדה להסתיר.
export function parseInstalledServices(raw) {
  if (raw === null || raw === undefined) return { services: null, invalid: false }

  const items = (raw || '').toString().split(',').map((s) => s.trim()).filter(Boolean)
  if (items.length > MAX_INSTALLED_SERVICES) return { services: null, invalid: true }

  // רשימה ריקה מפורשת = "לא מותקן אצלי שום שירות", ולא "אל תסנן".
  const services = new Map()
  for (const item of items) {
    const at = item.lastIndexOf('@')
    const id = normalizeServiceId(at === -1 ? item : item.slice(0, at))
    const version = at === -1 ? '' : item.slice(at + 1).trim()

    if (!SERVICE_ID_RE.test(id)) return { services: null, invalid: true }
    if (at !== -1 && !isServiceVersion(version)) return { services: null, invalid: true }

    // גרסה גבוהה יותר גוברת, אם לקוח מסר את אותו שירות פעמיים
    const existing = services.get(id)
    if (existing === undefined || (version && (!existing || compareVersions(version, existing) > 0))) {
      services.set(id, version)
    }
  }
  return { services, invalid: false }
}

export const INSTALLED_SERVICES_PARAM = 'installedServices'

// קריאת הפרמטר מתוך URLSearchParams — החתימה מקבילה ל-readAppVersionParam
// ב-pluginCompatibility.js, כדי שנתיב שמשתמש בשניהם ייראה אחיד.
export function readInstalledServicesParam(searchParams) {
  return parseInstalledServices(searchParams.get(INSTALLED_SERVICES_PARAM))
}

export function invalidInstalledServicesMessage() {
  return `Invalid installedServices parameter - expected up to ${MAX_INSTALLED_SERVICES} entries of <serviceId> or <serviceId>@<version>`
}

/**
 * האם התוסף מוצג לצרכן שזו רשימת השירותים המותקנים אצלו.
 *
 * `installed === null` פירושו "הצרכן לא מסר מה מותקן אצלו" — ואז אין על מה
 * לסנן והתוסף מוצג. רק צרכן שמסר רשימה מקבל סינון, כדי שהתנהגות ברירת המחדל
 * של כל צרכן קיים לא תשתנה מתחתיו.
 */
export function isVisibleForInstalledServices(companion, installed) {
  const service = companion?.service
  if (!service?.hideUnlessInstalled || !service.id) return true
  if (!installed) return true

  if (!installed.has(service.id)) return false

  // גרסה מזערית מוצהרת שהצרכן לא מסר לה גרסה מותקנת — אי אפשר לאשר, ולכן
  // לא מציגים. זו הטעות הזולה מהשתיים: המשתמש לא רואה תוסף שאולי היה עובד,
  // במקום להתקין תוסף שבוודאות לא יעבוד.
  if (!service.minVersion) return true
  const installedVersion = installed.get(service.id)
  if (!installedVersion) return false
  return compareVersions(installedVersion, service.minVersion) >= 0
}

/**
 * סינון רשימת תוספים בייצוג הציבורי (כל אחד עם שדה companion, או בלעדיו)
 * לפי השירותים המותקנים אצל הצרכן.
 */
export function filterByInstalledServices(plugins, installed) {
  if (!installed) return plugins || []
  return (plugins || []).filter((plugin) => isVisibleForInstalledServices(plugin?.companion, installed))
}
