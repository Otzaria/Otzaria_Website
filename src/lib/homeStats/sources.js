// sources — שליפת הנתונים לאזור "אוצריא במספרים" בדף הבית (שרת בלבד).
//
// כל פונקציה כאן עמידה לתקלות באופן עצמאי: כישלון (רשת, rate limit של GitHub,
// DB לא זמין, JSON לא צפוי) מחזיר null לאותו נתון בלבד ולא זורק לעולם — כך
// שתקלה במקור אחד מסתירה רק את העיגול שלו ולא מפילה את דף הבית.
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
import { pickLibraryStatsAssetUrl, parseLibraryStats, extractAppDownloads } from './homeStats.js'

// רענון כל ~10 דקות (דרישת המשתמש) — זהה לחלון של DownloadSection
export const HOME_STATS_REVALIDATE_SECONDS = 600

const SEFORIM_RELEASES_URL = 'https://api.github.com/repos/Otzaria/SeforimLibrary/releases?per_page=100'
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

/** ספרים/קישורים/פסקאות מתוך library_stats.json של ה-release היציב האחרון. */
export async function getLibraryStats() {
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

/** מספר הורדות האפליקציה ממעקב ההורדות (otzaria-download-tracker). */
export async function getAppDownloads() {
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
export async function getPublicPluginsCount() {
  try {
    const count = await countPublicPlugins()
    return Number.isSafeInteger(count) && count > 0 ? count : null
  } catch (error) {
    console.error('Failed to count public plugins:', error)
    return null
  }
}
