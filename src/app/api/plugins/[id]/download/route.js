import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginInstallToken from '@/models/PluginInstallToken'
import { openPluginAsset, openVersionAsset, PLUGIN_FILE_BASENAME } from '@/lib/pluginStorage'
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginOwner, isPluginSuspended } from '@/lib/pluginVisibility'
import { APP_VERSION_PARAM, isValidAppVersion, resolveCompatibleVersion, lowestSupportedAppVersion } from '@/lib/pluginCompatibility'
import { isServicePlugin, resolveServicePluginFile } from '@/lib/servicePlugins/existingPaths'
import { fileHandleStream } from '@/lib/fileHandleStream'
import { openReviewAssetStream } from '@/lib/servicePlugins/storage'

// GET /api/plugins/[id]/download - הורדת קובץ התוסף.
// תומך גם בהורדת גרסה ספציפית דרך /api/plugins/<id>@<version>/download או ?version=<version>,
// וגם בבחירת גרסה אוטומטית לפי גרסת אוצריא דרך ?appVersion=0.9.94 — מוריד את
// הגרסה הגבוהה ביותר של התוסף שתומכת בגרסת האפליקציה הזו (ראו pluginCompatibility).
// רק תוספים מאושרים פתוחים לציבור; מנהלי תוספים יכולים להוריד גם תוספים לא מאושרים.
// תוסף מושהה (isSuspended) אינו ניתן להורדה כלל — למעט למעלה ולמנהלי התוספים.
export async function GET(request, { params }) {
  try {
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'

    // ?version=<גרסת תוסף> — בדיוק הגרסה הזו (חיה או ארכיונית), 404 כשאינה קיימת
    const pinnedVersion = searchParams.get('version')
    if (pinnedVersion !== null) {
      if (version || includePending || searchParams.get(APP_VERSION_PARAM)) {
        return NextResponse.json(
          { error: `Cannot combine version with @version, pending=1 or ${APP_VERSION_PARAM}` },
          { status: 400 }
        )
      }
      if (!pinnedVersion.trim()) {
        return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
      }
    }

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
    const installToken = request.method === 'GET' ? searchParams.get('it') : null
    if (installToken && /^[A-Za-z0-9_-]{20,64}$/.test(installToken)) {
      PluginInstallToken.updateOne(
        { token: installToken, downloadedAt: null },
        { downloadedAt: new Date() }
      ).catch(e => console.error('Failed to mark install token download:', e))
    }

    const session = await getServerSession(authOptions)
    const isAdmin = hasPluginsAccess(session?.user)
    const isOwner = isPluginOwner(plugin, session?.user?.id)

    // תוסף מושהה — גם בקישור ישיר ההורדה פתוחה רק למעלה ולמנהלי התוספים
    if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // רזולוציה לפי גרסת אוצריא: הופכת את appVersion לגרסת תוסף קונקרטית.
    // resolvedVersion=null פירושו "הגרסה החיה" — ממשיך לזרימה הרגילה למטה.
    let resolvedVersion = version || pinnedVersion
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
            maxAppVersion: plugin.maxAppVersion || null,
            // הרצפה הנמוכה מכל הגרסאות — מה שהמשתמש צריך כדי להריץ גרסה כלשהי,
            // להבדיל מ-compatibleWith שהוא דרישת הגרסה האחרונה בלבד.
            minSupportedAppVersion: lowestSupportedAppVersion(plugin)
          },
          { status: 404 }
        )
      }
      resolvedVersion = match.isLatest ? null : match.version
    }

    const privateAsset = includePending || !plugin.isApproved || isPluginSuspended(plugin)
    if (isServicePlugin(plugin)) {
      return serviceFileResponse(request, plugin, {
        version: resolvedVersion, includePending, canPreview: isAdmin || isOwner, privateAsset,
      })
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
      let asset
      try {
        asset = await openVersionAsset(id, resolvedVersion, `${PLUGIN_FILE_BASENAME}${entry.pluginFileExt || '.otzplugin'}`)
      } catch (err) {
        if (err?.code === 'ENOENT') return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
        throw err
      }
      return await localFileResponse(request, asset, {
        fileName: entry.pluginFileName || plugin.pluginFileName,
        fileExt: entry.pluginFileExt || plugin.pluginFileExt,
        version: resolvedVersion,
        privateAsset,
        recordDownload: plugin.isApproved ? () => plugin.incrementDownload(resolvedVersion) : null,
        rememberHash: !entry.pluginFileSha256 && ((sha256) => rememberFileSha256(
          { _id: plugin._id, versions: { $elemMatch: { version: resolvedVersion, pluginFileSha256: null } } },
          { 'versions.$.pluginFileSha256': sha256 }
        )),
      })
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

    let asset
    try {
      asset = await openPluginAsset(id, filename, { pending: usePendingAsset })
    } catch (err) {
      if (err?.code === 'ENOENT') return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
      throw err
    }

    return await localFileResponse(request, asset, {
      fileName, fileExt, privateAsset,
      version: includePending ? (source?.version || plugin.version) : plugin.version,
      recordDownload: !includePending && plugin.isApproved ? () => plugin.incrementDownload() : null,
      rememberHash: !includePending && !plugin.pluginFileSha256 && ((sha256) => rememberFileSha256(
        {
          _id: plugin._id, version: plugin.version, pluginFileSha256: null,
          ...(plugin.fileUpdatedAt ? { fileUpdatedAt: plugin.fileUpdatedAt } : {}),
        },
        { pluginFileSha256: sha256 }
      )),
    })
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json({ error: 'Failed to download plugin' }, { status: 500 })
  }
}

// טווח אחד מספיק להמשך הורדה. טווחים מרובים וסוגי טווח אחרים מקבלים
// את הקובץ השלם, וכך גם If-Range ישן לאחר החלפת קובץ.
function requestedByteRange(request, { size, etag }) {
  const ifRange = request.headers.get('If-Range')
  if (ifRange && ifRange !== etag) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get('Range') || '')
  if (!match || (!match[1] && !match[2])) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  return start >= size || end < start ? false : { start, end }
}

async function localFileResponse(request, asset, { fileName, fileExt, version, recordDownload, rememberHash, privateAsset }) {
  let handedOff = false
  try {
    const headers = {
      'Accept-Ranges': 'bytes',
      ETag: asset.etag,
      ...(privateAsset ? { 'Cache-Control': 'private, no-store' } : {}),
    }
    if (request.method === 'HEAD') {
      return pluginFileResponse(null, fileName, fileExt, version, asset.size, 200, headers)
    }
    const range = requestedByteRange(request, asset)
    if (range === false) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${asset.size}` },
      })
    }
    const start = range?.start ?? 0
    const size = range ? range.end - start + 1 : asset.size
    if (range) headers['Content-Range'] = `bytes ${start}-${range.end}/${asset.size}`

    // סופרים העברת קובץ מלאה. גם בדיקת הטווח הזולה bytes=0-0
    // לא קוראת את כל הקובץ לצורך השלמת hash היסטורי.
    const fullFile = !range || size === asset.size
    if (rememberHash && fullFile) await rememberHash(await asset.sha256())
    if (recordDownload && fullFile) {
      recordDownload().catch(e => console.error('Failed to increment download count:', e))
    }
    const stream = fileHandleStream(asset.handle, size, { start, chunkSize: 64 * 1024 })
    const response = pluginFileResponse(stream, fileName, fileExt, version, size, range ? 206 : 200, headers)
    handedOff = true
    return response
  } finally {
    if (!handedOff) await asset.handle.close().catch(() => {})
  }
}

// תוסף שירות: הקובץ מוגש רק מאחסון הבדיקות — אין pending, וגרסה היסטורית רק עם reviewId.
async function serviceFileResponse(request, plugin, { version, includePending, canPreview, privateAsset }) {
  if (includePending || (!plugin.isApproved && !canPreview)) {
    return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
  }
  const historical = Boolean(version && version !== plugin.version)
  const file = resolveServicePluginFile(plugin, { version })
  const asset = file ? await openReviewAssetStream(file.reviewId, 'plugin') : null
  if (!asset) {
    return NextResponse.json({ error: historical ? 'Plugin version not found' : 'Plugin not found' }, { status: 404 })
  }
  const headers = privateAsset ? { 'Cache-Control': 'private, no-store' } : {}
  if (request.method === 'HEAD') {
    await asset.stream.cancel()
    return pluginFileResponse(null, file.fileName, '.otzplugin', file.version, asset.size, 200, headers)
  }
  if (plugin.isApproved) {
    plugin.incrementDownload(historical ? file.version : undefined).catch(e => console.error('Failed to increment download count:', e))
  }
  return pluginFileResponse(asset.stream, file.fileName, '.otzplugin', file.version, asset.size, 200, headers)
}

// קובץ ישן בלי טביעה: נשמרת בהורדה הראשונה. העלאה חדשה כבר שומרת טביעה, ולכן התנאי null
// מונע דריסה של קובץ שהוחלף בינתיים.
async function rememberFileSha256(filter, set) {
  try {
    const res = await Plugin.updateOne(filter, { $set: set })
    if (res?.modifiedCount) {
      invalidatePluginSearchIndex()
      revalidateNow(CACHE_TAGS.PLUGINS_PUBLIC)
    }
  } catch (e) {
    // ההורדה עצמה לא תלויה בטביעה — ננסה שוב בהורדה הבאה
    console.error('Failed to store plugin file sha256:', e)
  }
}

// בניית תגובת הורדה עם Content-Disposition התומך בשמות קובץ בעברית/Unicode (RFC 5987).
// encodeURIComponent לא מקודד את ! ' ( ) * - מקודדים ידנית כדי לעמוד ב-RFC 3986.
// X-Plugin-Version מציין איזו גרסה הוגשה בפועל — נחוץ למי שהוריד דרך ?appVersion=
// ולא ידע מראש איזו גרסה ייבחר עבורו.
function pluginFileResponse(body, fileName, fileExt, servedVersion, size, status = 200, extraHeaders = {}) {
  const rawName = fileName || `plugin${fileExt}`
  const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encodedName = encodeURIComponent(rawName)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

  return new NextResponse(body, {
    status,
    headers: {
      ...extraHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      'Content-Length': size.toString(),
      'X-Content-Type-Options': 'nosniff',
      ...(servedVersion ? { 'X-Plugin-Version': servedVersion } : {})
    }
  })
}
