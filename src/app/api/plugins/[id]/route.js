import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { formatVersionForPublic } from '@/lib/pluginVersions'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginSuspended, suspensionFields } from '@/lib/pluginVisibility'

// תומך גם בגרסה ארכיונית ספציפית דרך /api/plugins/<id>@<version>.
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // תוסף מושהה נשלף כאן במכוון (בלי סינון ההשהיה) — הוא נגיש בקישור ישיר
    // למעלה התוסף ולמנהלי התוספים בלבד, והגישה נבדקת מיד לאחר מכן.
    const plugin = await Plugin.findOne({ _id: id, isApproved: true, isHidden: false }).lean()
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (isPluginSuspended(plugin)) {
      const session = await getServerSession(authOptions)
      const isAdmin = hasPluginsAccess(session?.user?.role)
      const isOwner = plugin.authorId?.toString() === session?.user?.id
      if (!canAccessSuspended({ isAdmin, isOwner })) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
    }

    // קטגוריות החנות הגלויות שהתוסף משובץ בהן (אדיטיבי — לפירורי לחם וצ'יפים בדף התוסף)
    const categories = await PluginCategory.find({ isVisible: true, pluginIds: id })
      .sort({ order: 1 })
      .select('slug name')
      .lean()

    const livePublic = {
      ...formatPluginForPublic(plugin, {
        categories: categories.map((category) => ({ slug: category.slug, name: category.name }))
      }),
      // מצב ההשהיה — מגיע רק למי שרשאי לראות תוסף מושהה (הבדיקה למעלה),
      // ומאפשר לדף התוסף להציג את שלט ההשהיה ואת כפתור ההחזרה לחנות.
      ...suspensionFields(plugin)
    }

    // גרסה ארכיונית ספציפית (שאינה הגרסה החיה).
    if (version && version !== plugin.version) {
      const entry = (plugin.versions || []).find((v) => v.version === version)
      if (!entry) {
        return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
      }
      return NextResponse.json(formatVersionForPublic(livePublic, plugin, entry))
    }

    return NextResponse.json(livePublic)
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return NextResponse.json({ error: 'Failed to fetch plugin' }, { status: 500 })
  }
}
