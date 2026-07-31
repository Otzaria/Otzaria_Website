import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginInstallToken from '@/models/PluginInstallToken'
import { readPluginAsset, readVersionAsset, PLUGIN_FILE_BASENAME } from '@/lib/pluginStorage'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'

// GET /api/plugins/[id]/download - הורדת קובץ התוסף.
// תומך גם בהורדת גרסה ארכיונית ספציפית דרך /api/plugins/<id>@<version>/download.
// רק תוספים מאושרים פתוחים לציבור; מנהלי תוספים יכולים להוריד גם תוספים לא מאושרים.
export async function GET(request, { params }) {
  try {
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // it=<token> — סימון על טוקן התקנה ישירה שבקשת ההורדה הגיעה מהאפליקציה.
    // fire-and-forget: לעולם לא מכשיל או מעכב את ההורדה עצמה.
    const installToken = searchParams.get('it')
    if (installToken && /^[A-Za-z0-9_-]{20,64}$/.test(installToken)) {
      PluginInstallToken.updateOne(
        { token: installToken, downloadedAt: null },
        { downloadedAt: new Date() }
      ).catch(e => console.error('Failed to mark install token download:', e))
    }

    const session = await getServerSession(authOptions)
    const isAdmin = hasPluginsAccess(session?.user?.role)
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    // בקשה לגרסה ארכיונית ספציפית (שאינה הגרסה החיה הנוכחית).
    if (version && version !== plugin.version) {
      if (!plugin.isApproved && !isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      const entry = (plugin.versions || []).find((v) => v.version === version)
      if (!entry) {
        return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
      }
      let archiveBuf
      try {
        archiveBuf = await readVersionAsset(id, version, `${PLUGIN_FILE_BASENAME}${entry.pluginFileExt || '.otzplugin'}`)
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
        }
        throw err
      }
      if (plugin.isApproved) {
        plugin.incrementDownload(version).catch(e => console.error('Failed to increment download count:', e))
      }
      return pluginFileResponse(archiveBuf, entry.pluginFileName || plugin.pluginFileName, entry.pluginFileExt || plugin.pluginFileExt)
    }

    if (includePending) {
      if (!plugin.pendingUpdate || (!isAdmin && !isOwner)) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
    } else if (!plugin.isApproved && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const source = includePending ? plugin.pendingUpdate : null
    const usePendingAsset = includePending && source?.assetSources?.pluginFile === 'pending'
    const fileExt = includePending ? (source?.pluginFileExt || plugin.pluginFileExt) : plugin.pluginFileExt
    const fileName = includePending ? (source?.pluginFileName || plugin.pluginFileName) : plugin.pluginFileName
    const filename = `${PLUGIN_FILE_BASENAME}${fileExt}`

    let buf
    try {
      buf = await readPluginAsset(id, filename, { pending: usePendingAsset })
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      throw err
    }

    if (!includePending && plugin.isApproved) {
      // עדכון מונה הורדות רק לתוספים פומביים, לא בעת בדיקת מנהל
      plugin.incrementDownload().catch(e => console.error('Failed to increment download count:', e))
    }

    return pluginFileResponse(buf, fileName, fileExt)
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json({ error: 'Failed to download plugin' }, { status: 500 })
  }
}

// בניית תגובת הורדה עם Content-Disposition התומך בשמות קובץ בעברית/Unicode (RFC 5987).
// encodeURIComponent לא מקודד את ! ' ( ) * - מקודדים ידנית כדי לעמוד ב-RFC 3986.
function pluginFileResponse(buf, fileName, fileExt) {
  const rawName = fileName || `plugin${fileExt}`
  const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encodedName = encodeURIComponent(rawName)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      'Content-Length': buf.length.toString(),
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
