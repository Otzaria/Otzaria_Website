import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { hasPluginsAccess } from '@/lib/roles'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags'
import {
  SUSPEND_ACTIONS,
  applySuspension,
  suspensionError,
  suspensionFields
} from '@/lib/pluginVisibility'
import { unauthorized, forbidden, badRequest, notFound, serverError } from '@/lib/apiResponse'

// PATCH /api/plugins/[id]/suspend  body: { action: 'suspend' | 'resume' }
// השהיה/החזרה של תוסף לחנות ע"י מעלה התוסף בלבד (מנהל — בממשק הניהול).
// תוסף מושהה אינו מופיע בחנות ואינו ניתן להורדה — למעט למעלה ולמנהלי התוספים
// בקישור ישיר. השהיית מנהל גוברת: המעלה אינו יכול להחזיר תוסף שהושהה בניהול.
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return unauthorized('Unauthorized - Please login')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return badRequest('Invalid JSON body')
    }

    const action = body?.action
    if (!SUSPEND_ACTIONS.includes(action)) {
      return badRequest('Invalid action')
    }

    const { id } = await params
    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return notFound('Plugin not found')
    }

    // נתיב המעלה בלבד. מנהל משהה ומחזיר דרך ממשק הניהול
    // (PATCH /api/admin/plugins/[id]) — כמו בעריכת תוסף.
    const isOwner = plugin.authorId?.toString() === session.user?.id
    if (!isOwner) {
      return forbidden(
        hasPluginsAccess(session.user?.role)
          ? 'השהיית תוסף כמנהל זמינה רק בממשק הניהול.'
          : 'Forbidden - You do not have permission to suspend this plugin'
      )
    }

    const error = suspensionError(plugin, action, { isAdmin: false })
    if (error) {
      return badRequest(error)
    }

    applySuspension(plugin, action, { userId: session.user.id, isAdmin: false })
    await plugin.save()
    invalidatePluginSearchIndex()
    revalidateNow(CACHE_TAGS.PLUGINS_PUBLIC)

    return NextResponse.json({
      success: true,
      message: action === 'suspend'
        ? 'התוסף הושהה והוסר מהחנות.'
        : 'התוסף הוחזר לחנות.',
      ...suspensionFields(plugin)
    })
  } catch (err) {
    console.error('Error updating plugin suspension:', err)
    return serverError('Failed to update plugin suspension')
  }
}
