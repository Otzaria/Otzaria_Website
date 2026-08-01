import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { deleteVersionDir } from '@/lib/pluginStorage'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !hasPluginsAccess(session.user?.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { ok: true, session }
}

// DELETE /api/admin/plugins/[id]/versions/[version]
// מחיקת גרסה ארכיונית ספציפית (קובץ + רשומת מטא-דאטה). לא ניתן למחוק את הגרסה
// החיה הנוכחית — היא אינה חלק מההיסטוריה אלא הגרסה הפעילה של התוסף.
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { id: rawId, version: rawVersion } = await params
    const { id } = parsePluginRef(rawId)
    // הגרסה מגיעה כסגמנט נתיב נפרד; מאמתים אותה דרך אותו פירוק (id דמה@version).
    const { version } = parsePluginRef(`000000000000000000000000@${rawVersion}`)
    if (!id || !version) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (version === plugin.version) {
      return NextResponse.json(
        { error: 'לא ניתן למחוק את הגרסה הנוכחית של התוסף' },
        { status: 400 }
      )
    }

    const exists = (plugin.versions || []).some((v) => v.version === version)
    if (!exists) {
      return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
    }

    plugin.versions = (plugin.versions || []).filter((v) => v.version !== version)
    await plugin.save()
    // רשימת הגרסאות נחשפת בפורמט הציבורי → רענון אינדקס החיפוש (המסמכים בקאש)
    invalidatePluginSearchIndex()

    try {
      await deleteVersionDir(id, version)
    } catch (fsErr) {
      console.error('Failed to delete version storage dir:', fsErr)
    }

    return NextResponse.json({
      success: true,
      message: `גרסה ${version} נמחקה בהצלחה`
    })
  } catch (error) {
    console.error('Error deleting plugin version:', error)
    return NextResponse.json({ error: 'Failed to delete plugin version' }, { status: 500 })
  }
}
