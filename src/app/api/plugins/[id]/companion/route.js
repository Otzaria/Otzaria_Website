import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, readVersionAsset, COMPANION_BASENAME } from '@/lib/pluginStorage'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'

// GET /api/plugins/[id]/companion — הורדת מתקין התוכנה הנלווית של התוסף.
// תומך בגרסה ארכיונית דרך /api/plugins/<id>@<version>/companion, ואז מוגש
// המתקין שאורכב עם אותה גרסה ולא זה של הגרסה החיה.
//
// בדיקות הגישה זהות להורדת התוסף (download/route.js): רק תוסף מאושר פתוח
// לציבור, ותוסף מושהה נגיש למעלה ולמנהלי התוספים בלבד. אין כאן מונה הורדות
// נפרד: ההורדה הזאת היא חלק מהתקנת אותו תוסף, ומונה אחד מספר.
//
// שימו לב: האתר אינו מריץ את הקובץ ואינו יכול להריץ אותו — דפדפן לא מריץ קובץ
// שהורד. הוא מוגש כהורדה, והמשתמש מריץ אותו בעצמו.
export async function GET(request, { params }) {
  try {
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const isAdmin = hasPluginsAccess(session?.user?.role)
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    if (!plugin.isApproved && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    // בקשה לגרסה ארכיונית ספציפית (שאינה הגרסה החיה)
    if (version && version !== plugin.version) {
      const entry = (plugin.versions || []).find((v) => v.version === version)
      if (!entry?.companion?.present) {
        return NextResponse.json({ error: 'Companion installer not found' }, { status: 404 })
      }
      const buf = await readAsset(() =>
        readVersionAsset(id, version, `${COMPANION_BASENAME}${entry.companion.ext}`)
      )
      if (!buf) {
        return NextResponse.json({ error: 'Companion installer not found' }, { status: 404 })
      }
      return companionFileResponse(buf, entry.companion)
    }

    if (!plugin.companion?.present) {
      return NextResponse.json({ error: 'Companion installer not found' }, { status: 404 })
    }
    const buf = await readAsset(() =>
      readPluginAsset(id, `${COMPANION_BASENAME}${plugin.companion.ext}`)
    )
    if (!buf) {
      return NextResponse.json({ error: 'Companion installer not found' }, { status: 404 })
    }
    return companionFileResponse(buf, plugin.companion)
  } catch (error) {
    console.error('Error downloading companion installer:', error)
    return NextResponse.json({ error: 'Failed to download companion installer' }, { status: 500 })
  }
}

// קורא נכס מהדיסק ומחזיר null אם אינו קיים. שאר השגיאות ממשיכות למעלה.
async function readAsset(read) {
  try {
    return await read()
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

// application/octet-stream + nosniff בכל מקרה: לדפדפן אין שום עסק לנחש טיפוס
// של מתקין. Content-Disposition תומך בשמות בעברית (RFC 5987), כמו בהורדת התוסף.
function companionFileResponse(buf, companion) {
  const rawName = companion.fileName || `companion${companion.ext || ''}`
  const asciiFallback = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encodedName = encodeURIComponent(rawName)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      'Content-Length': buf.length.toString(),
      'X-Content-Type-Options': 'nosniff',
      // הגיבוב של הקובץ שמוגש — מאפשר אימות בלי לפתוח את דף התוסף
      ...(companion.sha256 ? { 'X-Companion-SHA256': companion.sha256 } : {})
    }
  })
}
