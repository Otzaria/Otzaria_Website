// סיומת .js מפורשת — הקובץ נטען גם ע"י node --test (ESM ללא רזולוציית webpack)
import { compareVersions } from './pluginManifest.js'

// בחירת גרסת התוסף המתאימה לגרסת אוצריא נתונה.
//
// לכל גרסת תוסף (החיה וכל אחת מההיסטוריות) יש טווח תאימות:
//   compatibleWith = minAppVersion מה-manifest (גרסת אוצריא המינימלית)
//   maxAppVersion  = גרסת אוצריא המקסימלית, null = ללא תקרה
// הרזולוציה בוחרת את גרסת התוסף הגבוהה ביותר שגרסת האוצריא של המשתמש נופלת
// בטווח שלה — כך שמשתמש בגרסת אוצריא ישנה מקבל את הבילד האחרון שעוד תמך בו.

// שם פרמטר ה-query שדרכו נשלחת גרסת אוצריא (ב-/latest ובהורדה).
export const APP_VERSION_PARAM = 'appVersion'

// עותק מקומי של PLUGIN_VERSION_RE מ-pluginSubmission (X[.Y[.Z[.W]]] עם סיומת
// prerelease/build אופציונלית). מוגדר כאן ולא מיובא כדי למנוע ייבוא מעגלי —
// pluginSubmission נשען על המודול הזה.
// נבדק: לינארי — {0,3} חסום וקידומת '-'/'+' חובה לסיומת, אין נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
const APP_VERSION_RE = /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$/

export function isValidAppVersion(value) {
  const v = (value || '').toString().trim()
  return v.length > 0 && v.length <= 30 && APP_VERSION_RE.test(v)
}

// רשומת הגרסה החיה (הגרסה האחרונה שפורסמה), באותו מבנה כמו רשומה ארכיונית.
export function buildLiveVersionEntry(plugin) {
  const pluginId = plugin._id.toString()
  return {
    version: plugin.version,
    status: plugin.status,
    compatibleWith: plugin.compatibleWith || '',
    maxAppVersion: plugin.maxAppVersion || null,
    requiresNetwork: plugin.requiresNetwork === true,
    pluginFileName: plugin.pluginFileName || '',
    pluginFileExt: plugin.pluginFileExt || '.otzplugin',
    pluginFileSize: plugin.pluginFileSize || 0,
    releasedAt: plugin.updatedAt ? new Date(plugin.updatedAt).toISOString().split('T')[0] : null,
    downloadUrl: `/api/plugins/${pluginId}/download`,
    supportsDirectInstall: (plugin.pluginFileExt || '').toLowerCase() === '.otzplugin',
    isLatest: true
  }
}

// רשומה אחידה לכל גרסה — החיה וההיסטוריות — עם פרטי התאימות והקובץ שלה,
// ממוינת מהגרסה הגבוהה לנמוכה. משמשת גם לרזולוציה וגם לבניית תשובות ה-API.
export function buildVersionEntries(plugin) {
  const pluginId = plugin._id.toString()

  const archived = (plugin.versions || []).map((v) => ({
    version: v.version,
    status: v.status,
    compatibleWith: v.compatibleWith || '',
    maxAppVersion: v.maxAppVersion || null,
    requiresNetwork: v.requiresNetwork === true,
    pluginFileName: v.pluginFileName || '',
    pluginFileExt: v.pluginFileExt || '.otzplugin',
    pluginFileSize: v.pluginFileSize || 0,
    releasedAt: v.archivedAt ? new Date(v.archivedAt).toISOString().split('T')[0] : null,
    downloadUrl: `/api/plugins/${pluginId}@${v.version}/download`,
    supportsDirectInstall: (v.pluginFileExt || '.otzplugin').toLowerCase() === '.otzplugin',
    isLatest: false
  }))

  return [buildLiveVersionEntry(plugin), ...archived]
    .sort((a, b) => compareVersions(b.version, a.version))
}

// האם גרסת אוצריא נופלת בטווח התאימות של רשומת גרסה.
// שדה חסר = גבול פתוח: תוספים היסטוריים שאורכבו לפני שנשמרו שדות התאימות
// יגיעו עם compatibleWith ריק, ואין לפסול אותם בגלל נתון חסר.
export function isCompatibleWithApp(entry, appVersion) {
  try {
    if (entry.compatibleWith && compareVersions(appVersion, entry.compatibleWith) < 0) return false
    if (entry.maxAppVersion && compareVersions(appVersion, entry.maxAppVersion) > 0) return false
    return true
  } catch {
    // מספר גרסה פגום באחת הרשומות — לא מתאימים אותה במקום להפיל את הבקשה
    return false
  }
}

// גרסת התוסף הגבוהה ביותר התואמת לגרסת אוצריא נתונה, או null אם אין כזו.
export function resolveCompatibleVersion(plugin, appVersion) {
  return buildVersionEntries(plugin).find((entry) => isCompatibleWithApp(entry, appVersion)) || null
}

// האם לתוסף (מסמך DB) יש גרסה כלשהי התומכת בגרסת אוצריא. לסינון *לפני* עימוד
// בנתיבים מעומדים, כדי ש-total ומספר הפריטים בעמוד יהיו נכונים.
export function hasCompatibleVersion(plugin, appVersion) {
  if (!appVersion) return true
  return resolveCompatibleVersion(plugin, appVersion) !== null
}

// ── שכבת ה-API הציבורי ─────────────────────────────────────────────────
// קריאת פרמטר appVersion מ-query string של נתיב ציבורי.
// invalid=true מסמן ערך שנשלח ואינו תקין — הקורא יחזיר 400 במקום להתעלם בשקט.
export function readAppVersionParam(searchParams) {
  const raw = (searchParams.get(APP_VERSION_PARAM) || '').trim()
  if (!raw) return { appVersion: null, invalid: false }
  if (!isValidAppVersion(raw)) return { appVersion: null, invalid: true }
  return { appVersion: raw, invalid: false }
}

export function invalidAppVersionMessage() {
  return `Invalid ${APP_VERSION_PARAM} - expected a version like 0.9.94`
}

// מחיל בחירת גרסה תואמת על ייצוג ציבורי של תוסף (פלט formatPluginForPublic):
// שדות הגרסה מוחלפים בערכי הגרסה התואמת הגבוהה ביותר, כך שצרכן שמציג את התוסף
// ומתקין מ-downloadUrl מקבל אוטומטית את הגרסה שתעבוד אצלו. מחזיר null אם אין
// אף גרסה תואמת (הקורא מסנן), ואת האובייקט כמו-שהוא כשלא נשלח appVersion.
// נשען על השדה versions שכבר ממוין מהגבוה לנמוך.
export function resolveForAppVersion(publicPlugin, appVersion) {
  if (!appVersion) return publicPlugin
  const versions = publicPlugin.versions || []
  const best = versions.find((v) => isCompatibleWithApp(v, appVersion))
  if (!best) return null

  const latest = versions[0] || best
  return {
    ...publicPlugin,
    version: best.version,
    status: best.status,
    compatibleWith: best.compatibleWith,
    maxAppVersion: best.maxAppVersion,
    requiresNetwork: best.requiresNetwork,
    pluginFileSize: best.pluginFileSize,
    downloadUrl: best.downloadUrl,
    supportsDirectInstall: best.supportsDirectInstall,
    // מועד פרסום הגרסה המוצגת (updatedAt/fileUpdatedAt נשארים של התוסף עצמו)
    releasedAt: best.releasedAt,
    // מטא-דאטה של הרזולוציה — מאפשר לצרכן להסביר למשתמש מה הוא רואה
    resolvedForAppVersion: appVersion,
    isLatestVersion: best.isLatest === true,
    latestVersion: latest.version,
    newerIncompatibleVersion:
      compareVersions(latest.version, best.version) > 0 ? latest.version : null
  }
}

// resolveForAppVersion על רשימה, כולל סינון תוספים ללא גרסה תואמת.
export function resolveListForAppVersion(list, appVersion) {
  if (!appVersion) return list
  return list.map((item) => resolveForAppVersion(item, appVersion)).filter(Boolean)
}
