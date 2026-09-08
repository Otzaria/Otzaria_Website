// דף קטגוריה בחנות התוספים (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.3):
// כותרת (אייקון + שם + תיאור + מונה), פירורי לחם, וגריד כרטיסים בסדר
// הידני שנקבע בניהול. slug לא קיים/מוסתר → עמוד "לא נמצאה" ידידותי.
//
// Server Component: הנתונים נשלפים ישירות מה-DB (אותה לוגיקה בדיוק כמו
// /api/plugins/categories/[slug], ראו src/app/api/plugins/categories/[slug]/route.js)
// בזמן הרינדור. ה-route עצמו משאיר Cache-Control: no-cache כדי שהשהיית תוסף
// תשתקף מיד — force-dynamic כאן שומר על אותה ערבות: כל בקשה מריצה שאילתה
// מחדש, בלי caching/ISR.
export const dynamic = 'force-dynamic'

import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { fetchPublicPluginsByIds, orderCategoryPlugins, resolveSortMode } from '@/lib/pluginStore'
import PluginCategoryClient from './PluginCategoryClient'
import type { Plugin } from '@/components/plugins/types'
import type { CategoryData } from './types'

// זהה בדיוק ל-SLUG_RE של ה-route (לא ניתן לייבא אותו משם — route.js לא מייצא
// אותו, ואסור לגעת ב-route). נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע
// נסיגה קטסטרופלית.
// eslint-disable-next-line security/detect-unsafe-regex
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function loadCategoryData(slug: string): Promise<CategoryData | null> {
  if (!SLUG_RE.test(slug || '')) return null

  await dbConnect()
  const category = await PluginCategory.findOne({ slug, isVisible: true }).lean()
  if (!category) return null

  const pluginsById = await fetchPublicPluginsByIds(category.pluginIds || [])
  const ordered = orderCategoryPlugins(category, pluginsById)

  return {
    id: category._id.toString(),
    slug: category.slug,
    name: category.name,
    description: category.description || '',
    icon: category.icon || '',
    sortMode: resolveSortMode(category),
    plugins: ordered.map((plugin) => formatPluginForPublic(plugin) as Plugin),
    total: ordered.length
  }
}

export default async function PluginCategoryPage({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let category: CategoryData | null = null
  let notFound = false
  try {
    category = await loadCategoryData(slug)
    if (!category) notFound = true
  } catch (error) {
    console.error('Error loading plugin category:', error)
    notFound = true
  }

  return <PluginCategoryClient category={category} notFound={notFound} />
}
