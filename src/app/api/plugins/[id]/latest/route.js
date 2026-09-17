import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { parsePluginRef } from '@/lib/pluginRef'
import { PUBLIC_PLUGIN_FILTER } from '@/lib/pluginStore'
import {
  APP_VERSION_PARAM,
  isValidAppVersion,
  buildLiveVersionEntry,
  resolveCompatibleVersion,
  lowestSupportedAppVersion
} from '@/lib/pluginCompatibility'
import { badRequest, notFound, serverError } from '@/lib/apiResponse'

// GET /api/plugins/<id>/latest
//   → הגרסה האחרונה (החיה) של התוסף.
// GET /api/plugins/<id>/latest?appVersion=0.9.94
//   → הגרסה הגבוהה ביותר של התוסף התומכת בגרסת אוצריא שנשלחה (החיה או היסטורית).
//     404 אם אין אף גרסה בטווח, עם פרטי הגרסה החיה כדי שהקורא יוכל להסביר למה.
//
// נתיב ציבורי וקל-משקל, מיועד לצרכנים חיצוניים (האפליקציה, תוסף החנות, סקריפטים):
// מחזיר מטא-דאטה של גרסה + קישור הורדה, בלי התיאור המלא, התמונות והקטגוריות.
//
// שדות התאימות לכל גרסה: compatibleWith = גרסת אוצריא מינימלית,
// maxAppVersion = מקסימלית (null = ללא תקרה).
export async function GET(request, { params }) {
  try {
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return notFound('Plugin not found')
    }
    // /latest בוחר גרסה בעצמו — בקשה לגרסה מפורשת בנתיב היא שגיאת שימוש.
    if (version) {
      return badRequest(`Cannot request a specific version from /latest; use ?${APP_VERSION_PARAM}=<app version> or /api/plugins/<id>@<version>`)
    }

    const appVersionRaw = (new URL(request.url).searchParams.get(APP_VERSION_PARAM) || '').trim()
    if (appVersionRaw && !isValidAppVersion(appVersionRaw)) {
      return badRequest(`Invalid ${APP_VERSION_PARAM} - expected a version like 0.9.94`)
    }

    await dbConnect()
    // תוסף מושהה אינו נחשף בנתיב הציבורי הזה (ראו pluginVisibility)
    const plugin = await Plugin.findOne({ _id: id, ...PUBLIC_PLUGIN_FILTER })
      .select('name slug version status compatibleWith maxAppVersion requiresNetwork pluginFileExt pluginFileSize versions updatedAt')
      .lean()
    if (!plugin) {
      return notFound('Plugin not found')
    }

    const identity = {
      id: plugin._id.toString(),
      name: plugin.name,
      slug: plugin.slug,
      // הגרסה האחרונה שפורסמה, בלי קשר לתאימות
      latestVersion: plugin.version,
      appVersion: appVersionRaw || null
    }

    // ללא appVersion: הגרסה החיה. עם appVersion: הגבוהה ביותר שתומכת בה.
    const selected = appVersionRaw
      ? resolveCompatibleVersion(plugin, appVersionRaw)
      : buildLiveVersionEntry(plugin)

    if (!selected) {
      return NextResponse.json(
        {
          ...identity,
          error: 'No plugin version supports the requested app version',
          // טווח התאימות של הגרסה החיה — עוזר להציג "דרושה אוצריא X ומעלה"
          compatibleWith: plugin.compatibleWith || '',
          maxAppVersion: plugin.maxAppVersion || null,
          // כמו ב-404 של download — הרצפה הנמוכה מכל הגרסאות, להסבר מלא למשתמש
          minSupportedAppVersion: lowestSupportedAppVersion(plugin)
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        ...identity,
        version: selected.version,
        status: selected.status,
        compatibleWith: selected.compatibleWith,
        maxAppVersion: selected.maxAppVersion,
        requiresNetwork: selected.requiresNetwork,
        pluginFileSize: selected.pluginFileSize,
        releasedAt: selected.releasedAt,
        downloadUrl: selected.downloadUrl,
        supportsDirectInstall: selected.supportsDirectInstall,
        isLatest: selected.isLatest
      },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } }
    )
  } catch (error) {
    console.error('Error resolving latest plugin version:', error)
    return serverError('Failed to resolve plugin version')
  }
}
