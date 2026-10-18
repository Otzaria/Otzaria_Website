// sources — שליפת הנתונים לשורת המספרים שבמסך הפתיחה של דף הבית (שרת בלבד).
//
// כל פונקציה כאן עמידה לתקלות באופן עצמאי: כישלון (רשת, rate limit של GitHub,
// DB לא זמין, JSON לא צפוי) מחזיר null לאותו נתון בלבד ולא זורק לעולם — כך
// שתקלה במקור אחד מסתירה רק את הנתון שלו ולא מפילה את דף הבית.
//
// מטמון: אף מקור לא נקרא בכל ביקור. קריאות ה-HTTP החיצוניות עוברות דרך ה-Data
// Cache של Next (fetch עם next.revalidate — אותו דפוס כמו DownloadSection.tsx),
// וספירת התוספים עטופה ב-unstable_cache עם תגית PLUGINS_PUBLIC, כך שכל שינוי
// מנהל בתוסף (אישור/השעיה/הסתרה — ראו cacheTags.js) מבטל גם אותה מיד.
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { PUBLIC_PLUGIN_FILTER } from '@/lib/pluginStore'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import { pickLibraryStatsAssetUrl, parseLibraryStats, extractAppDownloads, withTimeout } from './homeStats.js'

// רענון כל ~10 דקות (דרישת המשתמש) — זהה לחלון של DownloadSection
export const HOME_STATS_REVALIDATE_SECONDS = 600

// כמה לחכות לכל מקור לפני שמוותרים עליו (null — הנתון שלו פשוט לא מוצג). שורת המספרים
// מוצגת בבת אחת כשכל המקורות הוכרעו, ולכן המקור האיטי ביותר קובע מתי היא מופיעה: בלי
// הגבלה, MongoDB לא זמין עיכב אותה ב-30 שניות (serverSelectionTimeoutMS של db.js, שבכוונה
// לא שונה — הוא משרת את כל האתר). 3 שניות: הרבה מעל זמן תגובה רגיל (מטמון/GitHub/DB
// תקינים עונים בעשרות-מאות מילישניות), ומתחת לסף שבו המשתמש מרגיש "שהשורה לא נטענת".
export const HOME_STATS_SOURCE_TIMEOUT_MS = 3000

const limit = (promise, name, fallback) =>
  withTimeout(promise, HOME_STATS_SOURCE_TIMEOUT_MS, fallback, () => {
    console.warn(`Home stats: ${name} timed out after ${HOME_STATS_SOURCE_TIMEOUT_MS}ms`)
  })

// per_page=10 ולא 100: התגובה המלאה שוקלת ~600KB (גוף ה-release notes) בשביל כתובת אחת.
// ב-10 האחרונים יש תמיד release יציב עם library_stats.json (נבדק: אותה תוצאה כמו ב-100,
// ושניים כאלה בין העשרה); אם לא — pickLibraryStatsAssetUrl מחזיר null והנתון פשוט לא מוצג.
const SEFORIM_RELEASES_URL = 'https://api.github.com/repos/Otzaria/SeforimLibrary/releases?per_page=10'
const DOWNLOAD_TRACKER_OVERVIEW_URL =
  'https://raw.githubusercontent.com/Otzaria/otzaria-download-tracker/main/site/data/overview.json'

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers,
    next: { revalidate: HOME_STATS_REVALIDATE_SECONDS }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

/** ספרים/קישורים מתוך library_stats.json של ה-release היציב האחרון. */
export function getLibraryStats() {
  return limit(loadLibraryStats(), 'library stats', parseLibraryStats(null))
}

async function loadLibraryStats() {
  try {
    const releases = await fetchJson(SEFORIM_RELEASES_URL, {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Otzaria-Website'
    })
    const assetUrl = pickLibraryStatsAssetUrl(releases)
    if (!assetUrl) return parseLibraryStats(null)
    return parseLibraryStats(await fetchJson(assetUrl, { 'User-Agent': 'Otzaria-Website' }))
  } catch (error) {
    console.error('Failed to load library stats:', error)
    return parseLibraryStats(null)
  }
}

/**
 * מספר הורדות האפליקציה ממעקב ההורדות (otzaria-download-tracker). לא getAppDownloads
 * בכוונה — זה שם של פונקציה אחרת ב-githubReleases, שמחזירה קישורי הורדה.
 */
export function getAppDownloadCount() {
  return limit(loadAppDownloads(), 'app downloads', null)
}

async function loadAppDownloads() {
  try {
    return extractAppDownloads(await fetchJson(DOWNLOAD_TRACKER_OVERVIEW_URL))
  } catch (error) {
    console.error('Failed to load app downloads:', error)
    return null
  }
}

// אותו סינון בדיוק כמו החנות הציבורית (PUBLIC_PLUGIN_FILTER — משותף לדף
// /plugins, /plugins/all ולכל נתיבי ה-API הציבוריים), כדי שהמספר יתאים למה
// שמשתמש רגיל רואה בחנות.
const countPublicPlugins = nextCache(
  async () => {
    await dbConnect()
    return Plugin.countDocuments(PUBLIC_PLUGIN_FILTER)
  },
  ['home-stats-public-plugins-count'],
  {
    tags: [CACHE_TAGS.PLUGINS_PUBLIC],
    revalidate: REVALIDATE_SECONDS.PLUGINS_PUBLIC
  }
)

/** מספר התוספים הגלויים למשתמשים בחנות. */
export function getPublicPluginsCount() {
  return limit(loadPublicPluginsCount(), 'public plugins count', null)
}

async function loadPublicPluginsCount() {
  try {
    const count = await countPublicPlugins()
    return Number.isSafeInteger(count) && count > 0 ? count : null
  } catch (error) {
    console.error('Failed to count public plugins:', error)
    return null
  }
}
