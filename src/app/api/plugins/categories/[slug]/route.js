import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { fetchPublicPluginsByIds, orderByIds } from '@/lib/pluginStore'
import {
  readAppVersionParam,
  invalidAppVersionMessage,
  hasCompatibleVersion,
  resolveForAppVersion
} from '@/lib/pluginCompatibility'

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
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const category = await PluginCategory.findOne({ slug, isVisible: true }).lean()
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const limitRaw = parseInt(searchParams.get('limit') || '', 10)
    const offsetRaw = parseInt(searchParams.get('offset') || '', 10)
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : null
    const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
    const { appVersion, invalid } = readAppVersionParam(searchParams)
    if (invalid) {
      return NextResponse.json({ error: invalidAppVersionMessage() }, { status: 400 })
    }

    const pluginsById = await fetchPublicPluginsByIds(category.pluginIds || [])
    let ordered = orderByIds(category.pluginIds || [], pluginsById)
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
        plugins: page.map((plugin) => resolveForAppVersion(formatPluginForPublic(plugin), appVersion)),
        total: ordered.length
      },
      // no-cache: אימות מול השרת בכל טעינה — תוסף שהושהה/חזר מתעדכן מיד בריענון רגיל
      { headers: { 'Cache-Control': 'no-cache' } }
    )
  } catch (error) {
    console.error('Error fetching plugin category:', error)
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 })
  }
}
