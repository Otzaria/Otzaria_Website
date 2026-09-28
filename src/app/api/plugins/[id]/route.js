import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import { findPluginForDetail, buildPluginDetailPayload } from '@/lib/pluginDetail'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'
import { notFound, serverError } from '@/lib/apiResponse'

// תומך גם בגרסה ארכיונית ספציפית דרך /api/plugins/<id>@<version>.
// בניית התשובה משותפת עם דף התוסף (רינדור-שרת) — ראו src/lib/pluginDetail.js.
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return notFound('Plugin not found')
    }

    // תוסף מושהה נשלף כאן במכוון (בלי סינון ההשהיה) — הוא נגיש בקישור ישיר
    // למעלה התוסף ולמנהלי התוספים בלבד, והגישה נבדקת מיד לאחר מכן.
    const plugin = await findPluginForDetail(id)
    if (!plugin) {
      return notFound('Plugin not found')
    }

    if (isPluginSuspended(plugin)) {
      const session = await getServerSession(authOptions)
      const isAdmin = hasPluginsAccess(session?.user?.role)
      const isOwner = plugin.authorId?.toString() === session?.user?.id
      if (!canAccessSuspended({ isAdmin, isOwner })) {
        return notFound('Plugin not found')
      }
    }

    const payload = await buildPluginDetailPayload(plugin, id, version)
    if (!payload) {
      return notFound('Plugin version not found')
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return serverError('Failed to fetch plugin')
  }
}
