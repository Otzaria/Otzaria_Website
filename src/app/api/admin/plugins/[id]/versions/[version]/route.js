import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { deleteVersionDir } from '@/lib/pluginStorage'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse'

// DELETE /api/admin/plugins/[id]/versions/[version]
// מחיקת גרסה ארכיונית ספציפית (קובץ + רשומת מטא-דאטה). לא ניתן למחוק את הגרסה
// החיה הנוכחית — היא אינה חלק מההיסטוריה אלא הגרסה הפעילה של התוסף.
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, hasPluginsAccess)
    if (denied) return denied

    const { id: rawId, version: rawVersion } = await params
    const { id } = parsePluginRef(rawId)
    // הגרסה מגיעה כסגמנט נתיב נפרד; מאמתים אותה דרך אותו פירוק (id דמה@version).
    const { version } = parsePluginRef(`000000000000000000000000@${rawVersion}`)
    if (!id || !version) {
      return badRequest('Invalid request')
    }

    await dbConnect()
    const plugin = await Plugin.findById(id)
    if (!plugin) {
      return notFound('Plugin not found')
    }

    if (version === plugin.version) {
      return badRequest('לא ניתן למחוק את הגרסה הנוכחית של התוסף')
    }

    const exists = (plugin.versions || []).some((v) => v.version === version)
    if (!exists) {
      return notFound('Plugin version not found')
    }

    plugin.versions = (plugin.versions || []).filter((v) => v.version !== version)
    await plugin.save()
    // רשימת הגרסאות נחשפת בפורמט הציבורי → רענון אינדקס החיפוש (המסמכים בקאש)
    invalidatePluginSearchIndex()
    revalidateNow(CACHE_TAGS.PLUGINS_PUBLIC)

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
    return serverError('Failed to delete plugin version')
  }
}
