import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { searchPlugins } from '@/lib/pluginSearchIndex'
import { getCategoriesForPlugins } from '@/lib/pluginStore'
import { formatPluginForPublic, ALLOWED_PLUGIN_STATUSES } from '@/lib/pluginSubmission'
import {
  readAppVersionParam,
  invalidAppVersionMessage,
  hasCompatibleVersion,
  resolveForAppVersion
} from '@/lib/pluginCompatibility'

const MAX_QUERY_LENGTH = 120

// GET /api/plugins/search?q=&limit=&offset=&status=&tag=&appVersion= — החיפוש החכם.
// דירוג: רלוונטיות טקסטואלית (שם > תגיות > תיאור קצר > מפתח > תיאור) משוקללת
// בפופולריות והצמדה. ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md פרק 8.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH)
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    // הגבלת קצב — נתיב ציבורי "זול להצפה" (אותו דפוס כמו חיפוש הספרייה)
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    if (!checkRateLimit(ip, 'plugin-search', 60, 'minute')) {
      return NextResponse.json({ error: 'יותר מדי בקשות חיפוש. נסו שוב בעוד רגע.' }, { status: 429 })
    }

    const limitRaw = parseInt(searchParams.get('limit') || '', 10)
    const offsetRaw = parseInt(searchParams.get('offset') || '', 10)
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20
    const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0
    const status = searchParams.get('status')
    const tag = searchParams.get('tag')
    const { appVersion, invalid } = readAppVersionParam(searchParams)
    if (invalid) {
      return NextResponse.json({ error: invalidAppVersionMessage() }, { status: 400 })
    }

    await dbConnect()
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

    return NextResponse.json(
      {
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
      },
      { headers: { 'Cache-Control': 'public, max-age=30' } }
    )
  } catch (error) {
    console.error('Error searching plugins:', error)
    return NextResponse.json({ error: 'Failed to search plugins' }, { status: 500 })
  }
}
