import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { getStoreSettings } from '@/models/StoreSettings'
import { requirePluginsAdmin } from '@/lib/adminAuth'

// GET /api/admin/plugin-store/unplaced — כל התוספים המאושרים (ולא מוסתרים)
// שאינם משובצים בשום קטגוריה. "מסך העבודה" לניקוי ה-backlog.
// נבחר (featured) שאינו בקטגוריה נשאר ברשימה (עם דגל isFeatured) — נבחרוּת
// אינה תחליף לשיבוץ, ותוסף נבחר יכול ורצוי שיהיה גם בקטגוריות.
export async function GET() {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    await dbConnect()

    const [categories, settings, plugins] = await Promise.all([
      PluginCategory.find({}).select('pluginIds').lean(),
      getStoreSettings(),
      // תוסף מושהה אינו מוצג ב"מסך העבודה" — הוא ממילא אינו בחנות כרגע,
      // ויחזור לרשימה מאליו כשההשהיה תוסר.
      Plugin.find({ isApproved: true, isHidden: false, isSuspended: { $ne: true } })
        .sort({ createdAt: -1 })
        .select('_id name version status tags downloadCount image createdAt')
        .lean()
    ])

    const categorized = new Set(
      categories.flatMap((category) => (category.pluginIds || []).map((id) => id.toString()))
    )
    const featured = new Set(settings.featuredPluginIds.map((id) => id.toString()))

    const unplaced = plugins
      .filter((plugin) => !categorized.has(plugin._id.toString()))
      .map((plugin) => ({
        id: plugin._id.toString(),
        name: plugin.name,
        version: plugin.version,
        status: plugin.status,
        tags: plugin.tags || [],
        downloadCount: plugin.downloadCount || 0,
        image: plugin.image?.ext ? `/api/plugins/${plugin._id}/image` : null,
        createdAt: plugin.createdAt,
        isFeatured: featured.has(plugin._id.toString())
      }))

    return NextResponse.json({ total: unplaced.length, plugins: unplaced })
  } catch (error) {
    console.error('Error fetching unplaced plugins:', error)
    return NextResponse.json({ error: 'Failed to fetch unplaced plugins' }, { status: 500 })
  }
}
