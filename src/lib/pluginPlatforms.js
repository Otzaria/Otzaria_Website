// פלטפורמות נתמכות של תוסף — מודול טהור ובטוח-ללקוח (כמו pluginStatus.js).
//
// מקור השדה: "platforms" ב-manifest.json של התוסף (אופציונלי). שדה חסר = התוסף
// לא הגביל את עצמו, ונחשב זמין בכל הפלטפורמות. בדיקת הצורה של השדה (ערכים
// חוקיים, ללא כפילויות, לא ריק) והסקת הפלטפורמות מהקוד הן כללי תאימות-למפרט,
// ולכן הן בוולידטור החיצוני (otzaria-plugin-validator, src/platforms.js) — כאן
// רק נרמול לשמירה ותוויות/סינון לתצוגה.
//
// הערכים זהים ל-Platform.operatingSystem של Dart, כלומר למה שאוצריא מוסרת לתוסף
// ב-payload.app.platform / app.getInfo, ולערכי ה-enum של platform ב-AppReport.

export const PLUGIN_PLATFORM_IDS = ['windows', 'linux', 'macos', 'android', 'ios']

const PLATFORM_ID_SET = new Set(PLUGIN_PLATFORM_IDS)

// icon: שמות מתוך גופן האייקונים המקומי (scripts/icon-font.manifest.json).
export const PLUGIN_PLATFORMS = [
  { id: 'windows', label: 'Windows', icon: 'desktop_windows' },
  { id: 'linux', label: 'Linux', icon: 'terminal' },
  { id: 'macos', label: 'macOS', icon: 'laptop_mac' },
  { id: 'android', label: 'Android', icon: 'phone_android' },
  { id: 'ios', label: 'iOS', icon: 'phone_iphone' }
]

const PLATFORM_BY_ID = new Map(PLUGIN_PLATFORMS.map((p) => [p.id, p]))

export function getPlatformInfo(id) {
  return PLATFORM_BY_ID.get(id) || null
}

export function isPluginPlatform(value) {
  return typeof value === 'string' && PLATFORM_ID_SET.has(value)
}

// הערך שנשמר במסד: רק ערכים מוכרים, בלי כפילויות, בסדר הקנוני. [] = לא הוגבל
// (שדה חסר, או ערך שאינו מערך). הנרמול סלחני בכוונה — ערך פגום נחסם בשלב
// הוולידציה, וכאן רק מוודאים שזבל לא נשמר.
export function normalizeManifestPlatforms(raw) {
  if (!Array.isArray(raw)) return []
  const set = new Set(raw.filter(isPluginPlatform))
  return PLUGIN_PLATFORM_IDS.filter((id) => set.has(id))
}

// האם התוסף מוגבל לחלק מהפלטפורמות (ולכן כדאי להציג תגיות). רשימה מלאה
// שקולה ל"לא הוגבל".
export function hasPlatformRestriction(platforms) {
  const list = normalizeManifestPlatforms(platforms)
  return list.length > 0 && list.length < PLUGIN_PLATFORM_IDS.length
}

// האם תוסף זמין בפלטפורמה. 'all' / ערך לא מוכר = ללא סינון.
export function pluginSupportsPlatform(plugin, platform) {
  if (!isPluginPlatform(platform)) return true
  const list = normalizeManifestPlatforms(plugin?.platforms)
  return list.length === 0 || list.includes(platform)
}

// ערך ?platform= מה-URL: מזהה פלטפורמה, 'all', או null כשלא צוין/לא תקין.
export function parsePlatformParam(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'all') return 'all'
  return isPluginPlatform(v) ? v : null
}

// זיהוי הפלטפורמה של הגולש מ-User-Agent, כברירת מחדל לסינון החנות. הסדר חשוב:
// UA של אנדרואיד מכיל "Linux", ו-UA של iPad בגרסאות חדשות מתחזה ל-Mac (ולכן
// מזוהה כ-macos — עדיף על פני הסתרת תוספים שאינם תומכים ב-iOS בטעות).
export function detectPlatformFromUserAgent(ua) {
  if (typeof ua !== 'string' || ua === '') return null
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/windows/i.test(ua)) return 'windows'
  if (/macintosh|mac os x/i.test(ua)) return 'macos'
  if (/cros/i.test(ua)) return null
  if (/linux|x11/i.test(ua)) return 'linux'
  return null
}

// הסינון ההתחלתי בדף "כל התוספים": ?platform= מפורש גובר, אחרת זיהוי מה-UA,
// אחרת 'all'. fromUrl מסמן אם לשמר את הערך ב-URL (זיהוי אוטומטי אינו נכתב ל-URL,
// כדי שקישור שיתופי לא "ינעל" פלטפורמה שהמשתמש לא בחר).
export function initialPlatformFilter(param, userAgent) {
  const fromParam = parsePlatformParam(param)
  if (fromParam) return { platform: fromParam, fromUrl: true }
  return { platform: detectPlatformFromUserAgent(userAgent) || 'all', fromUrl: false }
}
