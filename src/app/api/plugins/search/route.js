import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import { checkSharedRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { runPluginSearch, MAX_PLUGIN_SEARCH_QUERY_LENGTH } from '@/lib/pluginSearchResults'
import { readAppVersionParam, invalidAppVersionMessage } from '@/lib/pluginCompatibility'

// GET /api/plugins/search?q=&limit=&offset=&status=&tag=&appVersion= — החיפוש החכם.
// החיפוש ובניית התשובה משותפים עם דף תוצאות החיפוש — ראו src/lib/pluginSearchResults.js.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') || '').trim().slice(0, MAX_PLUGIN_SEARCH_QUERY_LENGTH)
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    // הגבלת קצב — נתיב ציבורי "זול להצפה" (אותו דפוס כמו חיפוש הספרייה)
    const ip = getClientIp(request)
    if (!checkSharedRateLimit(ip, 'plugin-search', 60, 'minute')) {
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
    const body = await runPluginSearch({ query, limit, offset, status, tag, appVersion })

    return NextResponse.json(
      body,
      // TTL קצר: פשרה מכוונת בין עומס-שרת ל"תוסף שהושהה ממשיך להופיע" לזמן קצר
      { headers: { 'Cache-Control': 'public, max-age=20, stale-while-revalidate=60' } }
    )
  } catch (error) {
    console.error('Error searching plugins:', error)
    return NextResponse.json({ error: 'Failed to search plugins' }, { status: 500 })
  }
}
