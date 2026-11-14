// העלאת תוסף חדש לחנות. מוגן בהתחברות ב-proxy (src/lib/protected-routes.js) — אורח מופנה לדף
// ההתחברות לפני שהעמוד נטען. העמוד עצמו לא קורא session: הנתון היחיד שנטען כאן — מאגר התגיות
// הקיימות בחנות — ציבורי וזהה לכל צופה.
//
// מאגר התגיות (להצעות בשדה התגיות): נשלף בשרת רק עם שדה tags של התוספים הציבוריים (כ-2KB אחרי
// חישוב), במקום שהדפדפן יוריד את כל /api/plugins (מאות KB) רק כדי לחלץ ממנו תגיות.
// מטמון: כמו plugins/all — Data Cache עם תגית PLUGINS_PUBLIC (ביטול מיידי מכל route שמשנה תוסף)
// + חלון גיבוי קצר. ראו src/lib/cacheTags.js.
import { unstable_cache as nextCache } from 'next/cache'
import dbConnect from '@/lib/db'
import PluginModel from '@/models/Plugin'
import { PUBLIC_PLUGIN_FILTER } from '@/lib/pluginStore'
import { buildTagSuggestionPool } from '@/lib/pluginTags'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import { getServicePluginConfig } from '@/lib/servicePlugins/config'
import type { TagCount } from '@/components/plugins/listing/TagFilterChips'
import UploadPluginPageClient from './UploadPluginPageClient'

// ליטרל מספרי בכוונה — ראו plugins/all/page.tsx. לעדכן יחד עם REVALIDATE_SECONDS.PLUGINS_PUBLIC.
export const revalidate = 600

async function loadTagPoolUncached(): Promise<TagCount[]> {
  await dbConnect()
  const plugins = await PluginModel.find(PUBLIC_PLUGIN_FILTER).select('tags -_id').lean()
  // אותו חישוב כמו בצד הלקוח (usePluginTagSuggestions) — נרמול, איחוד כתיבים ומיון לפי שכיחות
  return buildTagSuggestionPool(plugins) as TagCount[]
}

const loadTagPool = nextCache(loadTagPoolUncached, ['plugins-tag-pool'], {
  tags: [CACHE_TAGS.PLUGINS_PUBLIC],
  revalidate: REVALIDATE_SECONDS.PLUGINS_PUBLIC
})

export default async function UploadPluginPage() {
  // כישלון (DB לא זמין) — null: השדה טוען את ההצעות בעצמו בפוקוס, כמו בחלון העריכה
  let tagPool: TagCount[] | null = null
  try {
    tagPool = await loadTagPool()
  } catch (error) {
    console.error('Error loading plugin tag pool:', error)
  }
  // הדגל נקרא מ-env של השרת (זהה בבנייה ובריצה בפריסה); כבוי — התיבה לא מוצגת והשרת מתעלם מהשדה
  return <UploadPluginPageClient tagPool={tagPool} serviceEnabled={getServicePluginConfig().enabled} />
}
