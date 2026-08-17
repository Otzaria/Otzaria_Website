import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { NOT_SUSPENDED_FILTER } from '@/lib/pluginVisibility'
import { compareByRating } from '@/lib/pluginRating'

// עזרי שליפה משותפים לנתיבי החנות הציבוריים (store-home, categories, search).
// כלל הברזל: ציבורית מוצגים רק תוספים isApproved && !isHidden && !isSuspended;
// מזהי "רפאים" (תוסף שנמחק/הוסתר/מושהה/אינו מאושר) מדולגים בשקט ואינם נספרים.

export const PUBLIC_PLUGIN_FILTER = { isApproved: true, isHidden: false, ...NOT_SUSPENDED_FILTER }

// שליפת תוספים ציבוריים לפי מזהים — מחזיר Map<idString, pluginDoc>
export async function fetchPublicPluginsByIds(ids) {
  const unique = [...new Set(ids.map((id) => id.toString()))]
  if (unique.length === 0) return new Map()
  const plugins = await Plugin.find({ _id: { $in: unique }, ...PUBLIC_PLUGIN_FILTER })
    .select('-__v -pendingUpdate -pendingChangeSummary')
    .lean()
  return new Map(plugins.map((plugin) => [plugin._id.toString(), plugin]))
}

// סידור לפי סדר המזהים השמור (הסדר הידני של המנהל), תוך דילוג על "רפאים"
export function orderByIds(ids, pluginsById) {
  const seen = new Set()
  const ordered = []
  for (const id of ids) {
    const key = id.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const plugin = pluginsById.get(key)
    if (plugin) ordered.push(plugin)
  }
  return ordered
}

// מצב המיון של קטגוריה, כולל מסמכים ותיקים שנוצרו לפני הוספת השדה
// (נעדר = 'rating', כדי שהדירוגים ישפיעו גם על קטגוריות קיימות).
export function resolveSortMode(category) {
  return category?.sortMode === 'manual' ? 'manual' : 'rating'
}

// סדר התצוגה של קטגוריה — היברידי: ראש הרשימה נשאר האוצרות הידנית של המנהל
// (manualTopCount הראשונים), וכל השאר ממוינים לפי ציון הדירוג. כך דירוגים
// מקדמים תוספים טובים בלי לדרוס קיבוע מכוון.
// "רפאים" (תוסף שנמחק/הוסתר/מושהה/אינו מאושר) מדולגים בשקט, כמו ב-orderByIds.
export function orderCategoryPlugins(category, pluginsById) {
  const ids = category?.pluginIds || []
  const ordered = orderByIds(ids, pluginsById)
  if (resolveSortMode(category) === 'manual') return ordered

  // הקיבוע נמדד על התוספים שיוצגו בפועל, ולא על מזהי הרפאים שביניהם
  const pinnedCount = Math.min(Math.max(Number(category?.manualTopCount) || 0, 0), ordered.length)
  const pinned = ordered.slice(0, pinnedCount)
  const rest = ordered.slice(pinnedCount).sort(compareByRating)
  return [...pinned, ...rest]
}

export function formatCategorySummary(category, pluginCount) {
  return {
    id: category._id.toString(),
    slug: category.slug,
    name: category.name,
    description: category.description || '',
    icon: category.icon || '',
    pluginCount
  }
}

// הקטגוריות הגלויות (isVisible) של תוסף — לצירוף בתשובות ציבוריות.
// מחזיר Map<pluginId, [{slug, name}]> עבור כמה תוספים בשאילתה אחת.
export async function getCategoriesForPlugins(pluginIds) {
  const ids = pluginIds.map((id) => id.toString())
  const result = new Map(ids.map((id) => [id, []]))
  if (ids.length === 0) return result

  const categories = await PluginCategory.find({ isVisible: true, pluginIds: { $in: ids } })
    .sort({ order: 1 })
    .select('slug name pluginIds')
    .lean()

  for (const category of categories) {
    for (const pid of category.pluginIds) {
      const key = pid.toString()
      if (result.has(key)) {
        result.get(key).push({ slug: category.slug, name: category.name })
      }
    }
  }
  return result
}
