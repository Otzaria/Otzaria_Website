import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { getStoreSettings } from '@/models/StoreSettings'
import { requirePluginsAdmin } from '@/lib/adminAuth'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'

const LIMITS = { homeTitle: 80, homeSubtitle: 200, featured: 100 }

function formatSettings(settings, pluginsById) {
  return {
    featuredPluginIds: settings.featuredPluginIds.map((id) => id.toString()),
    featuredPlugins: settings.featuredPluginIds
      .map((id) => pluginsById.get(id.toString()))
      .filter(Boolean)
      .map((plugin) => ({
        id: plugin._id.toString(),
        name: plugin.name,
        version: plugin.version,
        status: plugin.status,
        isApproved: plugin.isApproved === true,
        isHidden: plugin.isHidden === true,
        isSuspended: plugin.isSuspended === true,
        downloadCount: plugin.downloadCount || 0,
        image: plugin.image?.ext ? `/api/plugins/${plugin._id}/image` : null
      })),
    homeTitle: settings.homeTitle || '',
    homeSubtitle: settings.homeSubtitle || '',
    updatedAt: settings.updatedAt
  }
}

async function loadFeaturedPlugins(settings) {
  const ids = settings.featuredPluginIds.map((id) => id.toString())
  if (ids.length === 0) return new Map()
  const plugins = await Plugin.find({ _id: { $in: ids } })
    .select('_id name version status isApproved isHidden isSuspended downloadCount image')
    .lean()
  return new Map(plugins.map((plugin) => [plugin._id.toString(), plugin]))
}

// GET /api/admin/store-settings — הגדרות דף הבית של החנות + פרטי הנבחרים
export async function GET() {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    await dbConnect()
    const settings = await getStoreSettings()
    return NextResponse.json(formatSettings(settings, await loadFeaturedPlugins(settings)))
  } catch (error) {
    console.error('Error fetching store settings:', error)
    return NextResponse.json({ error: 'Failed to fetch store settings' }, { status: 500 })
  }
}

// PATCH /api/admin/store-settings — עדכון; כל השדות אופציונליים:
// { featuredPluginIds?: [], homeTitle?: '', homeSubtitle?: '' }
// או פעולה אטומית: { action: 'addFeatured', pluginId } — הוספה לסוף הנבחרים
// ב-$addToSet, בלי לדרוס שינויים מקבילים של מנהל אחר (בניגוד לדריסת רשימה מלאה).
export async function PATCH(request) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    await dbConnect()
    const settings = await getStoreSettings()

    if (body.action === 'addFeatured') {
      if (typeof body.pluginId !== 'string' || !mongoose.Types.ObjectId.isValid(body.pluginId)) {
        return NextResponse.json({ error: 'מזהה תוסף לא תקין' }, { status: 400 })
      }
      const exists = await Plugin.exists({ _id: body.pluginId })
      if (!exists) {
        return NextResponse.json({ error: 'התוסף אינו קיים' }, { status: 400 })
      }
      if (settings.featuredPluginIds.length >= LIMITS.featured) {
        return NextResponse.json({ error: `לכל היותר ${LIMITS.featured} תוספים נבחרים` }, { status: 400 })
      }
      const StoreSettings = settings.constructor
      await StoreSettings.updateOne(
        { key: 'store' },
        { $addToSet: { featuredPluginIds: body.pluginId }, $set: { updatedBy: auth.session.user.id } }
      )
      invalidatePluginSearchIndex()
      const fresh = await getStoreSettings()
      return NextResponse.json({
        success: true,
        settings: formatSettings(fresh, await loadFeaturedPlugins(fresh))
      })
    }

    if (body.featuredPluginIds !== undefined) {
      if (!Array.isArray(body.featuredPluginIds)) {
        return NextResponse.json({ error: 'featuredPluginIds חייב להיות מערך' }, { status: 400 })
      }
      if (body.featuredPluginIds.length > LIMITS.featured) {
        return NextResponse.json({ error: `לכל היותר ${LIMITS.featured} תוספים נבחרים` }, { status: 400 })
      }
      if (!body.featuredPluginIds.every((id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))) {
        return NextResponse.json({ error: 'מזהה תוסף לא תקין' }, { status: 400 })
      }
      const unique = [...new Set(body.featuredPluginIds)]
      const existing = await Plugin.countDocuments({ _id: { $in: unique } })
      if (existing !== unique.length) {
        return NextResponse.json({ error: 'אחד או יותר מהתוספים אינו קיים' }, { status: 400 })
      }
      settings.featuredPluginIds = unique
    }

    if (body.homeTitle !== undefined) {
      const homeTitle = String(body.homeTitle).trim()
      if (homeTitle.length > LIMITS.homeTitle) {
        return NextResponse.json({ error: `כותרת דף הבית — לכל היותר ${LIMITS.homeTitle} תווים` }, { status: 400 })
      }
      settings.homeTitle = homeTitle
    }

    if (body.homeSubtitle !== undefined) {
      const homeSubtitle = String(body.homeSubtitle).trim()
      if (homeSubtitle.length > LIMITS.homeSubtitle) {
        return NextResponse.json({ error: `תת-כותרת דף הבית — לכל היותר ${LIMITS.homeSubtitle} תווים` }, { status: 400 })
      }
      settings.homeSubtitle = homeSubtitle
    }

    settings.updatedBy = auth.session.user.id
    await settings.save()
    // רשימת הנבחרים משפיעה על דירוג החיפוש (isFeatured בקאש האינדקס)
    invalidatePluginSearchIndex()

    return NextResponse.json({
      success: true,
      settings: formatSettings(settings, await loadFeaturedPlugins(settings))
    })
  } catch (error) {
    console.error('Error updating store settings:', error)
    return NextResponse.json({ error: 'Failed to update store settings' }, { status: 500 })
  }
}
