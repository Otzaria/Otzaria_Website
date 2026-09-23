import { createReadStream, promises as fs } from 'fs'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { resolvePluginAssetPath, resolveVersionAssetPath, COMPANION_BASENAME } from '@/lib/pluginStorage'
import { parsePluginRef } from '@/lib/pluginRef'
import { hasPluginsAccess } from '@/lib/roles'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'
import { attachmentDisposition } from '@/lib/contentDisposition'

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
      return notFound('Plugin not found')
    }

    await dbConnect()

    const plugin = await Plugin.findById(id)
    if (!plugin || plugin.isHidden) {
      return notFound('Plugin not found')
    }

    const session = await getServerSession(authOptions)
    const isAdmin = hasPluginsAccess(session?.user?.role)
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
      return notFound('Plugin not found')
    }
    if (!plugin.isApproved && !isAdmin && !isOwner) {
      return notFound('Plugin not found')
    }

    // בקשה לגרסה ארכיונית ספציפית (שאינה הגרסה החיה)
    const entry = version && version !== plugin.version
      ? (plugin.versions || []).find((v) => v.version === version)
      : null
    if (version && version !== plugin.version && !entry) {
      return notFound('Companion installer not found')
    }
    const companion = entry ? entry.companion : plugin.companion
    if (!companion?.present) {
      return notFound('Companion installer not found')
    }

    const fileName = `${COMPANION_BASENAME}${companion.ext}`
    const target = entry
      ? resolveVersionAssetPath(id, version, fileName)
      : resolvePluginAssetPath(id, fileName)

    const size = await statSize(target)
    if (size === null) {
      return notFound('Companion installer not found')
    }

    // תוסף שאינו פומבי נגיש כאן רק בזכות ה-session (מנהל/בעלים) — אסור שיישמר
    // במטמון משותף. גם הגרסה הפומבית אינה נשמרת: קובץ של מאות MB שאינו מתקין
    // בר-הצגה אין טעם להחזיק ב-CDN, וזה תואם להורדת התוסף.
    return companionStreamResponse(target, size, companion)
  } catch (error) {
    console.error('Error downloading companion installer:', error)
    return NextResponse.json({ error: 'Failed to download companion installer' }, { status: 500 })
  }
}

function notFound(message) {
  return NextResponse.json({ error: message }, { status: 404 })
}

// גודל הקובץ, או null אם אינו קיים. שאר השגיאות ממשיכות למעלה.
async function statSize(target) {
  try {
    return (await fs.stat(target)).size
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

// המתקין מוגש כ-stream ולא נקרא לזיכרון: הוא עד 150MB, והורדות מקבילות היו
// מצטברות ב-heap של תהליך השרת.
// application/octet-stream + nosniff בכל מקרה: לדפדפן אין שום עסק לנחש טיפוס
// של מתקין.
function companionStreamResponse(target, size, companion) {
  const body = Readable.toWeb(createReadStream(target))
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': attachmentDisposition(companion.fileName || `companion${companion.ext || ''}`),
      'Content-Length': size.toString(),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // הגיבוב של הקובץ שמוגש — מאפשר אימות בלי לפתוח את דף התוסף
      ...(companion.sha256 ? { 'X-Companion-SHA256': companion.sha256 } : {})
    }
  })
}
