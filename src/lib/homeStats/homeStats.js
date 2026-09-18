// homeStats — לוגיקה טהורה לאזור "אוצריא במספרים" בדף הבית.
//
// אין כאן fetch/DB — רק בחירה, ולידציה ועיצוב של נתונים שכבר נשלפו
// (השליפה עצמה ב-sources.js). כל נתון לא תקין הופך ל-null, והעיגול שלו
// פשוט לא מוצג — אף פעם לא מציגים 0 או ערך משוער.

export const LIBRARY_STATS_ASSET = 'library_stats.json'

// תגיות release של מסד הנתונים: v28-20260910220310 וכו'. שאר ה-releases
// במאגר (lines-snapshot-sha256-…, pipeline-result-run-…, patch-…) אינם גרסאות DB.
const DB_RELEASE_TAG_RE = /^v\d+-/

/** מספר שלם חיובי ממש (לא 0, לא שבר, לא מחרוזת). */
export function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function releaseTime(release) {
  const time = Date.parse(release?.published_at || release?.created_at || '')
  return Number.isNaN(time) ? 0 : time
}

/**
 * בוחר מרשימת ה-releases של SeforimLibrary את ה-release היציב העדכני ביותר
 * שיש בו library_stats.json, ומחזיר את כתובת ההורדה של הקובץ (או null).
 * מדלג על טיוטות, על prerelease (למשל v26) ועל releases שאינם גרסת DB.
 */
export function pickLibraryStatsAssetUrl(releases) {
  if (!Array.isArray(releases)) return null

  const candidates = releases
    .filter((release) =>
      release &&
      release.draft !== true &&
      release.prerelease !== true &&
      typeof release.tag_name === 'string' &&
      DB_RELEASE_TAG_RE.test(release.tag_name)
    )
    .map((release) => ({
      release,
      asset: Array.isArray(release.assets)
        ? release.assets.find((asset) => asset?.name === LIBRARY_STATS_ASSET)
        : undefined
    }))
    .filter(({ asset }) => typeof asset?.browser_download_url === 'string' && asset.browser_download_url)
    // סדר ה-API של GitHub הוא לפי created_at ולא בהכרח לפי פרסום — ממיינים במפורש
    .sort((a, b) => releaseTime(b.release) - releaseTime(a.release))

  return candidates.length > 0 ? candidates[0].asset.browser_download_url : null
}

/**
 * ולידציה של library_stats.json. כל שדה נבדק בנפרד: שדה לא תקין הופך ל-null
 * בלי לפסול את האחרים. schema_version שאינו 1 — כל הקובץ נחשב לא מוכר.
 */
export function parseLibraryStats(json) {
  const empty = { books: null, links: null, lines: null }
  if (!json || typeof json !== 'object' || json.schema_version !== 1) return empty
  return {
    books: isPositiveInteger(json.books) ? json.books : null,
    links: isPositiveInteger(json.links) ? json.links : null,
    lines: isPositiveInteger(json.lines) ? json.lines : null
  }
}

/**
 * מספר הורדות האפליקציה מתוך overview.json של otzaria-download-tracker —
 * רק המאגר הנוכחי Otzaria/otzaria (by_source.otzaria, כולל גרסאות בטא), בכוונה
 * בלי המאגר הקודם Sivan22/otzaria שנכלל ב-by_category.app.
 */
export function extractAppDownloads(overview) {
  const value = overview?.summary?.by_source?.otzaria
  return isPositiveInteger(value) ? value : null
}

/**
 * עיצוב מספר מדויק עם מפריד אלפים (7367 → "7,367"). ידני ודטרמיניסטי בכוונה —
 * בלי toLocaleString/Intl שתלויים ב-locale של השרת/הדפדפן, כדי שה-HTML מהשרת
 * וה-hydration בדפדפן יפיקו בדיוק אותה מחרוזת.
 */
export function formatExactNumber(value) {
  if (!Number.isFinite(value)) return ''
  const negative = value < 0
  const digits = String(Math.trunc(Math.abs(value)))
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i
    out += digits[i]
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ','
  }
  return negative ? `-${out}` : out
}

// סדר העיגולים באזור — קבוע כאן, לא ברכיב
export const STAT_DEFINITIONS = [
  { key: 'books', icon: 'menu_book', label: 'ספרים' },
  { key: 'links', icon: 'link', label: 'קישורים בין ספרים' },
  { key: 'lines', icon: 'format_list_numbered', label: 'פסקאות' },
  { key: 'downloads', icon: 'download', label: 'הורדות' },
  { key: 'plugins', icon: 'extension', label: 'תוספים' }
]

/**
 * ממפה את הנתונים שנאספו לרשימת עיגולים להצגה, לפי הסדר הקבוע. נתון חסר/
 * לא תקין (null, 0, שלילי, לא שלם) — העיגול שלו מושמט לגמרי.
 */
export function buildStatItems(values) {
  const source = values || {}
  return STAT_DEFINITIONS
    .filter((def) => isPositiveInteger(source[def.key]))
    .map((def) => ({ ...def, value: source[def.key] }))
}
