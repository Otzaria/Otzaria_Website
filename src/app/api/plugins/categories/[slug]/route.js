import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { fetchPublicPluginsByIds, orderCategoryPlugins, resolveSortMode } from '@/lib/pluginStore'
import {
  readAppVersionParam,
  invalidAppVersionMessage,
  hasCompatibleVersion,
  resolveForAppVersion
} from '@/lib/pluginCompatibility'
import { badRequest, notFound, serverError } from '@/lib/apiResponse'

// נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// GET /api/plugins/categories/[slug]?limit=&offset=&appVersion= — דף קטגוריה ציבורי.
// עם appVersion: כל תוסף מוחזר בגרסה התואמת הגבוהה ביותר, ותוספים ללא גרסה
// תואמת מושמטים — כולל מ-total ומהעימוד.
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { slug } = await params

    if (!SLUG_RE.test(slug || '')) {
      return notFound('Category not found')
    }

    const category = await PluginCategory.findOne({ slug, isVisible: true }).lean()
    if (!category) {
      return notFound('Category not found')
    }

    const { searchParams } = new URL(request.url)
    const limitRaw = parseInt(searchParams.get('limit') || '', 10)
    const offsetRaw = parseInt(searchParams.get('offset') || '', 10)
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : null
    const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
    const { appVersion, invalid } = readAppVersionParam(searchParams)
    if (invalid) {
      return badRequest(invalidAppVersionMessage())
    }

    const pluginsById = await fetchPublicPluginsByIds(category.pluginIds || [])
    let ordered = orderCategoryPlugins(category, pluginsById)
    // סינון תאימות לפני העימוד, כדי ש-total והעמוד ישקפו את מה שיוחזר בפועל
    if (appVersion) {
      ordered = ordered.filter((plugin) => hasCompatibleVersion(plugin, appVersion))
    }
    const page = limit === null ? ordered.slice(offset) : ordered.slice(offset, offset + limit)

    return NextResponse.json(
      {
        id: category._id.toString(),
        slug: category.slug,
        name: category.name,
        description: category.description || '',
        icon: category.icon || '',
        // אופן המיון — כדי שדף הקטגוריה יוכל לציין "מסודר לפי דירוג"
        sortMode: resolveSortMode(category),
        plugins: page.map((plugin) => resolveForAppVersion(formatPluginForPublic(plugin), appVersion)),
        total: ordered.length
      },
      // TTL קצר: פשרה מכוונת בין עומס-שרת ל"תוסף שהושהה/חזר ממשיך להיות מוצג לא-מעודכן" לזמן קצר
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } }
    )
  } catch (error) {
    console.error('Error fetching plugin category:', error)
    return serverError('Failed to fetch category')
  }
}
