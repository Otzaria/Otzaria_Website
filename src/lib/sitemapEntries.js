// בניית רשומות ה-sitemap (src/app/sitemap.ts) — לוגיקה טהורה, בלי DB.
// הקורא שולף את הנתונים ומעביר לכאן; כך הבנייה עצמה נבדקת בטסט.

export const SITE_URL = 'https://otzaria.org'

// דפים ציבוריים קבועים (לא דורשים התחברות — ראו src/lib/protected-routes.js).
// דפים שסומנו noindex (התחברות, חיפוש בחנות) לא נכנסים כאן בכוונה.
export const STATIC_PATHS = [
  '/',
  '/about',
  '/faq',
  '/donate',
  '/privacy',
  '/license',
  '/offline',
  '/docs',
  '/docs/development',
  '/docs/page-proof',
  '/docs/tzurat-hadaf',
  '/plugins',
  '/plugins/all',
  '/library',
  '/library/editingtools',
  '/library/license',
]

function toDate(value) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

// docSlugs — slugs של דפי המדריך (/docs/<slug>); plugins — [{ id, updatedAt }];
// categories — [{ slug, updatedAt }]. כפילויות נזרקות (הראשון נשמר).
/**
 * @param {{
 *   docSlugs?: string[],
 *   plugins?: { id: string | null, updatedAt?: string | Date | null }[],
 *   categories?: { slug: string, updatedAt?: string | Date | null }[]
 * }} [data]
 * @returns {{ url: string, lastModified?: Date }[]}
 */
export function buildSitemapEntries({ docSlugs = [], plugins = [], categories = [] } = {}) {
  const entries = [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path === '/' ? '' : path}` })),
    ...docSlugs
      .filter(Boolean)
      .map((slug) => ({ url: `${SITE_URL}/docs/${encodeURIComponent(slug)}` })),
    ...categories
      .filter((category) => category?.slug)
      .map((category) => ({
        url: `${SITE_URL}/plugins/category/${encodeURIComponent(category.slug)}`,
        lastModified: toDate(category.updatedAt)
      })),
    ...plugins
      .filter((plugin) => plugin?.id)
      .map((plugin) => ({
        url: `${SITE_URL}/plugins/${encodeURIComponent(plugin.id)}`,
        lastModified: toDate(plugin.updatedAt)
      }))
  ]

  const seen = new Set()
  return entries
    .filter((entry) => (seen.has(entry.url) ? false : seen.add(entry.url)))
    .map((entry) => (entry.lastModified ? entry : { url: entry.url }))
}
