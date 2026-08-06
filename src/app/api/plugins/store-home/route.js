import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { getStoreSettings } from '@/models/StoreSettings'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import {
  PUBLIC_PLUGIN_FILTER,
  fetchPublicPluginsByIds,
  orderByIds,
  formatCategorySummary
} from '@/lib/pluginStore'

// GET /api/plugins/store-home — כל דף הבית של החנות בקריאה אחת:
// טקסטים + תוספים נבחרים + קטגוריות (עם שורת תוספים לקטגוריות דף-הבית).
export async function GET() {
  try {
    await dbConnect()

    const [settings, categories, totalPublicPlugins] = await Promise.all([
      getStoreSettings(),
      PluginCategory.find({ isVisible: true }).sort({ order: 1 }).lean(),
      Plugin.countDocuments(PUBLIC_PLUGIN_FILTER)
    ])

    // שאילפת תוספים אחת מרוכזת: נבחרים + כל המשובצים בקטגוריות
    // (נדרשים כולם כדי ש-pluginCount ו-homeLimit ייספרו על ציבוריים בלבד)
    const neededIds = [
      ...settings.featuredPluginIds,
      ...categories.flatMap((category) => category.pluginIds || [])
    ]
    const pluginsById = await fetchPublicPluginsByIds(neededIds)

    const featured = orderByIds(settings.featuredPluginIds, pluginsById)
      .map((plugin) => formatPluginForPublic(plugin, { isFeatured: true }))

    const categoriesPayload = categories.map((category) => {
      const publicPlugins = orderByIds(category.pluginIds || [], pluginsById)
      return {
        ...formatCategorySummary(category, publicPlugins.length),
        showOnHome: category.showOnHome === true,
        plugins: category.showOnHome
          ? publicPlugins.slice(0, category.homeLimit || 6).map((plugin) => formatPluginForPublic(plugin))
          : []
      }
    })

    return NextResponse.json(
      {
        settings: {
          homeTitle: settings.homeTitle || '',
          homeSubtitle: settings.homeSubtitle || ''
        },
        featured,
        categories: categoriesPayload,
        totalPublicPlugins
      },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Error fetching store home:', error)
    return NextResponse.json({ error: 'Failed to fetch store home' }, { status: 500 })
  }
}
