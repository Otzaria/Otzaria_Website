import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { getStoreSettings } from '@/models/StoreSettings'
import { formatPluginForPublic } from '@/lib/pluginSubmission'

// GET - קבלת כל התוספים המאושרים, עם סינון אופציונלי.
// סדר: "התוספים הנבחרים" (StoreSettings.featuredPluginIds, בסדר האצירה) ראשונים,
// אחריהם השאר מהחדש לישן. הנבחרים מסומנים isPinned:true — שם השדה נשמר
// לתאימות לאחור עם תוסף החנות שבתוך אוצריא וצרכנים חיצוניים.
export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const query = { isApproved: true, isHidden: false }
    if (tag && tag !== 'all') query.tags = tag
    if (status && status !== 'all') query.status = status
    if (search) query.$text = { $search: search }

    const [plugins, settings] = await Promise.all([
      Plugin.find(query)
        .sort({ createdAt: -1 })
        .select('-__v -pendingUpdate -pendingChangeSummary')
        .lean(),
      getStoreSettings()
    ])

    // מיון נבחרים-ראשונים: מיפוי מזהה→מיקום ברשימת הנבחרים, יציב עבור השאר
    const featuredRank = new Map(
      settings.featuredPluginIds.map((id, index) => [id.toString(), index])
    )
    plugins.sort((a, b) => {
      const rankA = featuredRank.get(a._id.toString()) ?? Infinity
      const rankB = featuredRank.get(b._id.toString()) ?? Infinity
      if (rankA !== rankB) return rankA - rankB
      return new Date(b.createdAt) - new Date(a.createdAt)
    })

    return NextResponse.json(
      plugins.map((plugin) =>
        formatPluginForPublic(plugin, { isFeatured: featuredRank.has(plugin._id.toString()) })
      )
    )
  } catch (error) {
    console.error('Error fetching plugins:', error)
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 })
  }
}
