// דף "כל התוספים" — הרשימה השטוחה המלאה עם סינון מקומי (חיפוש/סטטוס/תגית).
// זהו בפועל דף החנות הקודם בהעברה (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.2).
//
// Server Component: הרשימה המלאה נשלפת ישירות מה-DB (אותה לוגיקה בדיוק כמו
// /api/plugins, ראו src/app/api/plugins/route.js, בלי פרמטרי query — כמו
// שדף זה קרא לו עד כה: fetch בלי tag/status/search/appVersion) בזמן הרינדור.
// הסינון עצמו (חיפוש/סטטוס/תגית) נשאר לגמרי בצד הלקוח (AllPluginsClient),
// כולל שימור המצב ב-URL.
//
// מטמון: כמו plugins/page.tsx — Data Cache עם תגית PLUGINS_PUBLIC + חלון
// גיבוי קצר, וביטול מיידי (revalidateTag) מכל route שמשנה תוסף. ראו
// src/lib/cacheTags.js להסבר המלא (כולל למה downloadCount לא מקבל תגית).
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import PluginModel from '@/models/Plugin'
import { getStoreSettings } from '@/models/StoreSettings'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { PUBLIC_PLUGIN_FILTER } from '@/lib/pluginStore'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import AllPluginsClient from './AllPluginsClient'
import type { Plugin } from '@/components/plugins/types'

export const revalidate = REVALIDATE_SECONDS.PLUGINS_PUBLIC

async function loadAllPluginsUncached(): Promise<Plugin[]> {
  await dbConnect()

  const [plugins, settings] = await Promise.all([
    PluginModel.find(PUBLIC_PLUGIN_FILTER)
      .sort({ createdAt: -1 })
      .select('-__v -pendingUpdate -pendingChangeSummary')
      .lean(),
    getStoreSettings()
  ])

  // מיון נבחרים-ראשונים: מיפוי מזהה→מיקום ברשימת הנבחרים, יציב עבור השאר
  const featuredRank = new Map(
    settings.featuredPluginIds.map((id: { toString(): string }, index: number) => [id.toString(), index])
  )
  plugins.sort((a, b) => {
    const rankA = featuredRank.get(a._id.toString()) ?? Infinity
    const rankB = featuredRank.get(b._id.toString()) ?? Infinity
    if (rankA !== rankB) return (rankA as number) - (rankB as number)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return plugins.map((plugin) =>
    formatPluginForPublic(plugin, { isFeatured: featuredRank.has(plugin._id.toString()) }) as Plugin
  )
}

const loadAllPlugins = nextCache(loadAllPluginsUncached, ['plugins-all'], {
  tags: [CACHE_TAGS.PLUGINS_PUBLIC, CACHE_TAGS.STORE_SETTINGS],
  revalidate: REVALIDATE_SECONDS.PLUGINS_PUBLIC
})

export default async function AllPluginsPage() {
  let plugins: Plugin[] = []
  try {
    plugins = await loadAllPlugins()
  } catch (error) {
    console.error('Error loading plugins:', error)
  }

  return <AllPluginsClient plugins={plugins} />
}
