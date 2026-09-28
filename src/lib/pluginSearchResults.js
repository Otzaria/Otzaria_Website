// הרצת החיפוש החכם ובניית גוף התשובה — משותף בין GET /api/plugins/search
// לבין דף תוצאות החיפוש (src/app/plugins/search/page.tsx), שמרנדר בשרת את
// עמוד התוצאות הראשון כדי שלא ימתין ל-fetch אחרי ה-hydration.
// פענוח הפרמטרים, ולידציה ו-rate limit נשארים אצל הקורא.
import { searchPlugins } from '@/lib/pluginSearchIndex'
import { getCategoriesForPlugins } from '@/lib/pluginStore'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { ALLOWED_PLUGIN_STATUSES } from '@/lib/pluginStatus'
import { hasCompatibleVersion, resolveForAppVersion } from '@/lib/pluginCompatibility'

export const MAX_PLUGIN_SEARCH_QUERY_LENGTH = 120

// דירוג: רלוונטיות טקסטואלית (שם > תגיות > תיאור קצר > מפתח > תיאור) משוקללת
// בפופולריות והצמדה. ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md פרק 8.
// דורש dbConnect() קודם (בניית האינדקס שולפת מה-DB).
export async function runPluginSearch({ query, limit, offset, status = null, tag = null, appVersion = null }) {
  let { results, relaxed } = await searchPlugins(query)

  // סינונים אופציונליים — אחרי החיפוש, על המסמכים עצמם
  if (status && ALLOWED_PLUGIN_STATUSES.includes(status)) {
    results = results.filter(({ doc }) => doc.status === status)
  }
  if (tag) {
    results = results.filter(({ doc }) => (doc.tags || []).includes(tag))
  }
  // סינון תאימות לפני העימוד — אחרת total והעמוד היו נספרים על תוספים
  // שממילא היו מושמטים מהתשובה
  if (appVersion) {
    results = results.filter(({ doc }) => hasCompatibleVersion(doc, appVersion))
  }

  const total = results.length
  const page = results.slice(offset, offset + limit)

  // העשרת קטגוריות בשאילתה אחת לכל העמוד
  const categoriesByPlugin = await getCategoriesForPlugins(page.map(({ doc }) => doc._id))

  return {
    query,
    total,
    relaxed,
    // resolveForAppVersion לא יחזיר null כאן — הסינון למעלה כבר הבטיח תאימות
    results: page.map(({ doc, score, matchedFields }) => ({
      ...resolveForAppVersion(
        formatPluginForPublic(doc, { isFeatured: doc.isFeatured === true }),
        appVersion
      ),
      score: Math.round(score * 100) / 100,
      matchedFields,
      categories: categoriesByPlugin.get(doc._id.toString()) || []
    }))
  }
}
