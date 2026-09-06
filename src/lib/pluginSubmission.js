import path from 'path'
import { buildVersionEntries } from './pluginCompatibility'
import { ratingFieldsForPublic } from './pluginRating'

export const PLUGIN_LIMITS = {
  // שם התוסף מוצג בראש לשונית התוסף ב"כלים" — מעבר ל-14 תווים גולש מהכרטיסייה.
  name: 14,
  shortDescription: 150,
  description: 10_000,
  version: 30,
  author: 100,
  compatibleWith: 100,
  homepage: 500,
  tag: 40
}

export const ALLOWED_PLUGIN_STATUSES = ['stable', 'beta', 'experimental']
export const PLUGIN_STATUS_LABELS = {
  stable: 'יציב',
  beta: 'בטא',
  experimental: 'ניסיוני'
}
// פורמט גרסה מחמיר: major.minor.patch בלבד (+build metadata אופציונלי). זהה
// לרגקס באוצריא (plugin_manifest_validator.dart) ובוולידטור ה-CI. prerelease
// (-rc1) ו-4 רמות אסורים: compareCoreVersions באוצריא מתעלם מהם, כך שהיו
// נחשבים שווים לגרסה המלאה ושוברים זיהוי עדכונים.
// שימו לב: compareVersions כאן (pluginManifest.js) הוא semver מלא — הוא כן מבחין
// בין "1.0.0.1" ל-"1.0.0" ובין prerelease לשחרור, בשונה מאוצריא ומהוולידטור.
// הרגקס הוא מה שמונע מהפער להתבטא, כי גרסאות כאלה נחסמות בכניסה.
export const PLUGIN_VERSION_RE = /^\d+\.\d+\.\d+(?:\+.*)?$/
export const MIN_SUPPORTED_APP_VERSION = '0.9.89'

export function formatPluginStatus(status) {
  return PLUGIN_STATUS_LABELS[status] || 'לא ידוע'
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseJsonArrayField(value, fieldName) {
  if (!value) return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${fieldName} format`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${fieldName} format`)
  }
  return parsed
}

export function normalizeTags(rawTags) {
  return rawTags
    .map(tag => String(tag).trim())
    .filter(Boolean)
    .slice(0, 30)
}

export function assertPluginTextLimits(data) {
  if (data.name.length > PLUGIN_LIMITS.name) {
    throw new Error(`שם התוסף חייב להכיל לכל היותר ${PLUGIN_LIMITS.name} תווים`)
  }
  if (data.shortDescription.length > PLUGIN_LIMITS.shortDescription) {
    throw new Error(`תיאור קצר חייב להכיל לכל היותר ${PLUGIN_LIMITS.shortDescription} תווים`)
  }
  if (data.description.length > PLUGIN_LIMITS.description) {
    throw new Error(`תיאור מלא חייב להכיל לכל היותר ${PLUGIN_LIMITS.description} תווים`)
  }
  if (data.version.length > PLUGIN_LIMITS.version) {
    throw new Error(`גרסה חייבת להכיל לכל היותר ${PLUGIN_LIMITS.version} תווים`)
  }
  if (data.author.length > PLUGIN_LIMITS.author) {
    throw new Error(`שם המחבר חייב להכיל לכל היותר ${PLUGIN_LIMITS.author} תווים`)
  }
  if (data.compatibleWith.length > PLUGIN_LIMITS.compatibleWith) {
    throw new Error(`תאימות חייבת להכיל לכל היותר ${PLUGIN_LIMITS.compatibleWith} תווים`)
  }
  if ((data.homepage || '').length > PLUGIN_LIMITS.homepage) {
    throw new Error(`כתובת האתר חייבת להכיל לכל היותר ${PLUGIN_LIMITS.homepage} תווים`)
  }
  if ((data.tags || []).some(tag => tag.length > PLUGIN_LIMITS.tag)) {
    throw new Error(`כל תג חייב להכיל לכל היותר ${PLUGIN_LIMITS.tag} תווים`)
  }
}

export function getLivePluginData(plugin) {
  return {
    name: plugin.name,
    shortDescription: plugin.shortDescription,
    description: plugin.description,
    version: plugin.version,
    status: plugin.status,
    author: plugin.author,
    compatibleWith: plugin.compatibleWith,
    maxAppVersion: plugin.maxAppVersion || null,
    requiresNetwork: plugin.requiresNetwork === true,
    tags: plugin.tags || [],
    homepage: plugin.homepage || '',
    pluginFileName: plugin.pluginFileName || '',
    pluginFileExt: plugin.pluginFileExt || '.otzplugin',
    pluginFileSize: plugin.pluginFileSize || 0,
    image: plugin.image?.ext ? { ext: plugin.image.ext, contentType: plugin.image.contentType || null } : null,
    screenshots: (plugin.screenshots || []).map((screenshot) => ({
      ext: screenshot.ext,
      contentType: screenshot.contentType || null
    }))
  }
}

export function getEditableSource(plugin) {
  const source = plugin.pendingUpdate || getLivePluginData(plugin)
  // נירמול שדות שעשויים להיות חסרים ב-pendingUpdate שנשמרו לפני הוספת השדה ל-schema
  return {
    ...source,
    requiresNetwork: source.requiresNetwork === true
  }
}

// בונה את רשימת כל הגרסאות הזמינות (החיה + ההיסטוריות), כל אחת עם פרטי התאימות
// וקישור ההורדה שלה, ממוינת מהגבוהה לנמוכה. מאפשר לצרכן (תוסף החנות) לבחור את
// הגרסה הגבוהה ביותר התואמת לגרסת אוצריא של המשתמש (או להסתמך על
// GET /api/plugins/<id>/latest?appVersion=... שעושה את הבחירה בצד השרת).
// שדות הקובץ הפנימיים (שם/סיומת) מסוננים — הם דרושים רק לרזולוציית ההורדה.
function buildVersionsList(plugin) {
  return buildVersionEntries(plugin).map((entry) => ({
    version: entry.version,
    status: entry.status,
    compatibleWith: entry.compatibleWith,
    maxAppVersion: entry.maxAppVersion,
    requiresNetwork: entry.requiresNetwork,
    pluginFileSize: entry.pluginFileSize,
    downloadUrl: entry.downloadUrl,
    releasedAt: entry.releasedAt,
    supportsDirectInstall: entry.supportsDirectInstall,
    isLatest: entry.isLatest
  }))
}

// תאריך העדכון המוצג בחנות — מתי קובץ התוסף עצמו השתנה בפועל, לא אישורים/עריכות
// מטא-דאטה. לתוספים ישנים ללא fileUpdatedAt: הארכוב האחרון בהיסטוריית הגרסאות
// (רגע החלפת הקובץ בעליית גרסה), אחרת התאריך המקורי מהייבוא, אחרת מועד ההעלאה.
function resolveFileUpdatedDate(plugin) {
  const iso = (d) => new Date(d).toISOString().split('T')[0]
  if (plugin.fileUpdatedAt) return iso(plugin.fileUpdatedAt)
  const lastArchived = (plugin.versions || [])
    .map((v) => v.archivedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0]
  if (lastArchived) return iso(lastArchived)
  if (plugin.originalDate) return plugin.originalDate
  return iso(plugin.createdAt || plugin.updatedAt)
}

export function formatPluginForPublic(plugin, options = {}) {
  const pluginId = plugin._id.toString()
  const source = options.usePending ? getEditableSource(plugin) : getLivePluginData(plugin)
  return {
    id: pluginId,
    // מזהה ה-manifest — משמש את טופס הדיווח באתר (אותו מזהה שהאפליקציה שולחת)
    pluginUid: plugin.pluginUid || null,
    authorId: plugin.authorId?.toString?.() || plugin.authorId || null,
    name: source.name,
    slug: plugin.slug,
    shortDescription: source.shortDescription,
    description: source.description,
    version: source.version,
    status: source.status,
    author: source.author,
    updatedAt: plugin.updatedAt.toISOString().split('T')[0],
    originalDate: plugin.originalDate || plugin.updatedAt.toISOString().split('T')[0],
    // מועד השינוי האחרון של קובץ התוסף בפועל — זה התאריך שמוצג בחנות כ"עודכן"
    fileUpdatedAt: resolveFileUpdatedDate(plugin),
    compatibleWith: source.compatibleWith,
    maxAppVersion: source.maxAppVersion || null,
    requiresNetwork: source.requiresNetwork === true,
    tags: source.tags || [],
    image: source.image?.ext ? `/api/plugins/${pluginId}/image${options.usePending ? '?pending=1' : ''}` : null,
    screenshots: (source.screenshots || []).map((_, index) => `/api/plugins/${pluginId}/screenshots/${index}${options.usePending ? '?pending=1' : ''}`),
    downloadUrl: `/api/plugins/${pluginId}/download`,
    homepage: source.homepage || '',
    downloadCount: plugin.downloadCount || 0,
    // דירוגים: הממוצע האמיתי, מספר המדרגים, כמה מהם מאומתים וההתפלגות.
    // ratingScore (הציון המוחלק שלפיו ממוינת החנות) אינו נחשף — פנימי למיון.
    ...ratingFieldsForPublic(plugin),
    // גודל קובץ התוסף בבייטים (0 = לא ידוע, לתוספים ותיקים שטרם עברו backfill)
    pluginFileSize: source.pluginFileSize || 0,
    supportsDirectInstall: (source.pluginFileExt || '').toLowerCase() === '.otzplugin',
    // תאימות לאחור: השדה נשאר בשם isPinned אך משמעותו כיום "נבחר" (featured).
    // רק נתיבים שיודעים את רשימת הנבחרים מעבירים options.isFeatured.
    isPinned: options.isFeatured === true,
    // כל הגרסאות הזמינות (חיה + היסטוריה) עם פרטי תאימות וקישורי הורדה.
    versions: buildVersionsList(plugin),
    // קטגוריות החנות של התוסף — מצורף רק כשהקורא חישב והעביר אותן (אדיטיבי;
    // נתיבים שאינם מעבירים פשוט לא כוללים את השדה, כמו GET /api/plugins הוותיק)
    ...(options.categories ? { categories: options.categories } : {})
  }
}

// הערה: buildChangeSummary ו-formatValue הוסרו (02/08/2026) — קוד מת מאז ביטול
// זרימת ה-pendingUpdate ("עדכון תוספים ללא אישור מנהל"). שדות pendingUpdate/
// pendingChangeSummary נשארו במודל רק לתמיכה במסמכים ישנים שטרם אושרו.

export function pendingAssetPath(fileName) {
  return path.join('pending', fileName)
}
