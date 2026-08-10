import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginInstallToken from '@/models/PluginInstallToken'
import { readPluginAsset, readVersionAsset, PLUGIN_FILE_BASENAME } from '@/lib/pluginStorage'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { APP_VERSION_PARAM, isValidAppVersion, resolveCompatibleVersion } from '@/lib/pluginCompatibility'

// GET /api/plugins/[id]/download - הורדת קובץ התוסף.
// תומך גם בהורדת גרסה ארכיונית ספציפית דרך /api/plugins/<id>@<version>/download,
// וגם בבחירת גרסה אוטומטית לפי גרסת אוצריא דרך ?appVersion=0.9.94 — מוריד את
// הגרסה הגבוהה ביותר של התוסף שתומכת בגרסת האפליקציה הזו (ראו pluginCompatibility).
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

    // ?appVersion=<גרסת אוצריא> — השרת בוחר את גרסת התוסף המתאימה.
    const appVersionRaw = (searchParams.get(APP_VERSION_PARAM) || '').trim()
    if (appVersionRaw) {
      if (version) {
        return NextResponse.json(
          { error: `Cannot combine an explicit @version with ${APP_VERSION_PARAM}` },
          { status: 400 }
        )
      }
      if (includePending) {
        return NextResponse.json(
          { error: `Cannot combine pending=1 with ${APP_VERSION_PARAM}` },
          { status: 400 }
        )
      }
      if (!isValidAppVersion(appVersionRaw)) {
        return NextResponse.json(
          { error: `Invalid ${APP_VERSION_PARAM} - expected a version like 0.9.94` },
          { status: 400 }
        )
      }
    }

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

    // רזולוציה לפי גרסת אוצריא: הופכת את appVersion לגרסת תוסף קונקרטית.
    // resolvedVersion=null פירושו "הגרסה החיה" — ממשיך לזרימה הרגילה למטה.
    let resolvedVersion = version
    if (appVersionRaw) {
      if (!plugin.isApproved && !isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      const match = resolveCompatibleVersion(plugin, appVersionRaw)
      if (!match) {
        return NextResponse.json(
          {
            error: 'No plugin version supports the requested app version',
            appVersion: appVersionRaw,
            latestVersion: plugin.version,
            compatibleWith: plugin.compatibleWith || '',
            maxAppVersion: plugin.maxAppVersion || null
          },
          { status: 404 }
        )
      }
      resolvedVersion = match.isLatest ? null : match.version
    }

    // בקשה לגרסה ארכיונית ספציפית (שאינה הגרסה החיה הנוכחית).
    if (resolvedVersion && resolvedVersion !== plugin.version) {
      if (!plugin.isApproved && !isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      }
      const entry = (plugin.versions || []).find((v) => v.version === resolvedVersion)
      if (!entry) {
        return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
      }
      let archiveBuf
      try {
        archiveBuf = await readVersionAsset(id, resolvedVersion, `${PLUGIN_FILE_BASENAME}${entry.pluginFileExt || '.otzplugin'}`)
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
        }
        throw err
      }
      if (plugin.isApproved) {
        plugin.incrementDownload(resolvedVersion).catch(e => console.error('Failed to increment download count:', e))
      }
      return pluginFileResponse(
        archiveBuf,
        entry.pluginFileName || plugin.pluginFileName,
        entry.pluginFileExt || plugin.pluginFileExt,
        resolvedVersion
      )
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

    const servedVersion = includePending ? (source?.version || plugin.version) : plugin.version
    return pluginFileResponse(buf, fileName, fileExt, servedVersion)
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json({ error: 'Failed to download plugin' }, { status: 500 })
  }
}

// בניית תגובת הורדה עם Content-Disposition התומך בשמות קובץ בעברית/Unicode (RFC 5987).
// encodeURIComponent לא מקודד את ! ' ( ) * - מקודדים ידנית כדי לעמוד ב-RFC 3986.
// X-Plugin-Version מציין איזו גרסה הוגשה בפועל — נחוץ למי שהוריד דרך ?appVersion=
// ולא ידע מראש איזו גרסה ייבחר עבורו.
function pluginFileResponse(buf, fileName, fileExt, servedVersion) {
  const rawName = fileName || `plugin${fileExt}`
  const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encodedName = encodeURIComponent(rawName)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      'Content-Length': buf.length.toString(),
      'X-Content-Type-Options': 'nosniff',
      ...(servedVersion ? { 'X-Plugin-Version': servedVersion } : {})
    }
  })
}
