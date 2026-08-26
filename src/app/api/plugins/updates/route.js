import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { PUBLIC_PLUGIN_FILTER } from '@/lib/pluginStore'
import { APP_VERSION_PARAM, isValidAppVersion } from '@/lib/pluginCompatibility'
import { parseUpdateRequestList, resolvePluginUpdates, MAX_UPDATE_REQUESTS } from '@/lib/pluginUpdates'

// GET /api/plugins/updates?appVersion=0.9.97&plugins=<uid>@<installedVer>,...
//   → בדיקת עדכונים ב-batch עבור אפליקציית אוצריא: לכל תוסף מותקן (מזוהה לפי
//     pluginUid מה-manifest) האם קיימת גרסה תואמת חדשה יותר, וקישור הורדה
//     מוצמד-גרסה. uid שאינו בחנות (או מוסתר/מושהה) מושמט מהתשובה בשקט.
//
// נתיב ציבורי שאפליקציות קוראות לו מחזורית — מוגבל-קצב ועד 100 תוספים לבקשה.
export async function GET(request) {
  try {
    const ip = getClientIp(request)
    if (!checkRateLimit(ip, 'plugin-updates', 30, 'minute')) {
      return NextResponse.json({ error: 'Too many update checks. Try again later.' }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const appVersion = (searchParams.get(APP_VERSION_PARAM) || '').trim()
    if (!isValidAppVersion(appVersion)) {
      return NextResponse.json(
        { error: `Invalid or missing ${APP_VERSION_PARAM} - expected a version like 0.9.94` },
        { status: 400 }
      )
    }

    const { requests } = parseUpdateRequestList(searchParams.get('plugins'))
    if (!requests) {
      return NextResponse.json(
        { error: `Invalid plugins parameter - expected up to ${MAX_UPDATE_REQUESTS} entries of <uid>@<installedVersion>` },
        { status: 400 }
      )
    }

    await dbConnect()
    const plugins = await Plugin.find({
      pluginUid: { $in: requests.map((r) => r.uid) },
      ...PUBLIC_PLUGIN_FILTER
    })
      .select('pluginUid version status compatibleWith maxAppVersion requiresNetwork pluginFileExt pluginFileSize versions updatedAt')
      .lean()

    const updates = resolvePluginUpdates(plugins, requests, appVersion)
    return NextResponse.json(
      { appVersion, updates },
      // בלי cache — השהיית תוסף צריכה להעלים אותו מהתשובה מיד
      { headers: { 'Cache-Control': 'no-cache' } }
    )
  } catch (error) {
    console.error('Error checking plugin updates:', error)
    return NextResponse.json({ error: 'Failed to check plugin updates' }, { status: 500 })
  }
}
