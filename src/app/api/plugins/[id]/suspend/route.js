import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { hasPluginsAccess } from '@/lib/roles'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import {
  SUSPEND_ACTIONS,
  applySuspension,
  suspensionError,
  suspensionFields
} from '@/lib/pluginVisibility'

// PATCH /api/plugins/[id]/suspend  body: { action: 'suspend' | 'resume' }
// השהיה/החזרה של תוסף לחנות ע"י מעלה התוסף בלבד (מנהל — בממשק הניהול).
// תוסף מושהה אינו מופיע בחנות ואינו ניתן להורדה — למעט למעלה ולמנהלי התוספים
// בקישור ישיר. השהיית מנהל גוברת: המעלה אינו יכול להחזיר תוסף שהושהה בניהול.
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized - Please login' }, { status: 401 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const action = body?.action
    if (!SUSPEND_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { id } = await params
    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // נתיב המעלה בלבד. מנהל משהה ומחזיר דרך ממשק הניהול
    // (PATCH /api/admin/plugins/[id]) — כמו בעריכת תוסף.
    const isOwner = plugin.authorId?.toString() === session.user?.id
    if (!isOwner) {
      return NextResponse.json(
        {
          error: hasPluginsAccess(session.user?.role)
            ? 'השהיית תוסף כמנהל זמינה רק בממשק הניהול.'
            : 'Forbidden - You do not have permission to suspend this plugin'
        },
        { status: 403 }
      )
    }

    const error = suspensionError(plugin, action, { isAdmin: false })
    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    applySuspension(plugin, action, { userId: session.user.id, isAdmin: false })
    await plugin.save()
    invalidatePluginSearchIndex()

    return NextResponse.json({
      success: true,
      message: action === 'suspend'
        ? 'התוסף הושהה והוסר מהחנות.'
        : 'התוסף הוחזר לחנות.',
      ...suspensionFields(plugin)
    })
  } catch (err) {
    console.error('Error updating plugin suspension:', err)
    return NextResponse.json({ error: 'Failed to update plugin suspension' }, { status: 500 })
  }
}
