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
  orderCategoryPlugins,
  formatCategorySummary
} from '@/lib/pluginStore'
import {
  readAppVersionParam,
  invalidAppVersionMessage,
  hasCompatibleVersion,
  resolveForAppVersion
} from '@/lib/pluginCompatibility'

// GET /api/plugins/store-home?appVersion= — כל דף הבית של החנות בקריאה אחת:
// טקסטים + תוספים נבחרים + קטגוריות (עם שורת תוספים לקטגוריות דף-הבית).
//
// עם appVersion: כל תוסף מוחזר בגרסה התואמת הגבוהה ביותר, ותוספים שאין להם אף
// גרסה תואמת מושמטים — גם מהמונים (pluginCount, totalPublicPlugins), אחרת
// המספרים בחנות היו מבטיחים תוספים שלא ניתן להתקין.
export async function GET(request) {
  try {
    await dbConnect()

    const { appVersion, invalid } = readAppVersionParam(new URL(request.url).searchParams)
    if (invalid) {
      return NextResponse.json({ error: invalidAppVersionMessage() }, { status: 400 })
    }

    const [settings, categories, totalPublicPlugins] = await Promise.all([
      getStoreSettings(),
      PluginCategory.find({ isVisible: true }).sort({ order: 1 }).lean(),
      countPublicPlugins(appVersion)
    ])

    // שאילפת תוספים אחת מרוכזת: נבחרים + כל המשובצים בקטגוריות
    // (נדרשים כולם כדי ש-pluginCount ו-homeLimit ייספרו על ציבוריים בלבד)
    const neededIds = [
      ...settings.featuredPluginIds,
      ...categories.flatMap((category) => category.pluginIds || [])
    ]
    const pluginsById = await fetchPublicPluginsByIds(neededIds)

    // סינון התאימות מתבצע על המסמכים, לפני חיתוך homeLimit וספירת pluginCount
    const compatible = (plugins) =>
      appVersion ? plugins.filter((plugin) => hasCompatibleVersion(plugin, appVersion)) : plugins

    // התוספים הנבחרים נשארים בסדר הידני של המנהל — זו בחירה עריכותית ולא
    // פופולריות, ולכן הדירוגים אינם ממיינים אותה.
    const featured = compatible(orderByIds(settings.featuredPluginIds, pluginsById))
      .map((plugin) => resolveForAppVersion(formatPluginForPublic(plugin, { isFeatured: true }), appVersion))

    const categoriesPayload = categories.map((category) => {
      // שורת דף-הבית מציגה את ראש הקטגוריה — ולכן באותו מיון בדיוק כמו דף הקטגוריה
      const publicPlugins = compatible(orderCategoryPlugins(category, pluginsById))
      return {
        ...formatCategorySummary(category, publicPlugins.length),
        showOnHome: category.showOnHome === true,
        plugins: category.showOnHome
          ? publicPlugins
            .slice(0, category.homeLimit || 6)
            .map((plugin) => resolveForAppVersion(formatPluginForPublic(plugin), appVersion))
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
      // no-cache (ולא max-age): הדפדפן שומר אך מאמת מול השרת בכל טעינה, כדי
      // שהשהיית תוסף/החזרתו תשתקף מיד בריענון רגיל ולא רק ברענון עמוק.
      { headers: { 'Cache-Control': 'no-cache' } }
    )
  } catch (error) {
    console.error('Error fetching store home:', error)
    return NextResponse.json({ error: 'Failed to fetch store home' }, { status: 500 })
  }
}

// מספר התוספים הציבוריים. ללא appVersion — ספירה ישירה ב-DB. עם appVersion אין
// דרך לנסח את התאימות כשאילתה (הטווח נבדק על כל רשומת גרסה בנפרד), ולכן נשלפים
// שדות התאימות בלבד — בלי התיאורים שבתוך versions — והספירה מתבצעת בזיכרון.
async function countPublicPlugins(appVersion) {
  if (!appVersion) return Plugin.countDocuments(PUBLIC_PLUGIN_FILTER)

  const docs = await Plugin.find(PUBLIC_PLUGIN_FILTER)
    .select('version compatibleWith maxAppVersion versions.version versions.compatibleWith versions.maxAppVersion')
    .lean()
  return docs.filter((doc) => hasCompatibleVersion(doc, appVersion)).length
}
