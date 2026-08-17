import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginRating from '@/models/PluginRating'
import { requirePluginsAdmin } from '@/lib/adminAuth'
import { recomputePluginRating } from '@/lib/pluginRatingStore'

// מודרציית דירוגים למנהלי תוספים.
//   GET   — כל הדירוגים של תוסף (כולל מוסתרים), מהחדש לישן
//   PATCH — { ratingId, action: 'hide' | 'unhide' }
// דירוג מוסתר נשאר במסד (כמו בשאר המערכת — הסתרה ולא מחיקה) אך אינו נספר
// בממוצע, בהתפלגות ובציון המיון.

const RATING_ACTIONS = ['hide', 'unhide']

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)
}

export async function GET(request, { params }) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id)
      .select('name ratingCount ratingAvg ratingScore ratingVerifiedCount ratingBreakdown')
      .lean()
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const ratings = await PluginRating.find({ pluginId: id })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('userId', 'name email')
      .populate('hiddenBy', 'name')
      .lean()

    return NextResponse.json({
      plugin: {
        id: plugin._id.toString(),
        name: plugin.name,
        ratingCount: plugin.ratingCount || 0,
        ratingAvg: plugin.ratingAvg || 0,
        ratingVerifiedCount: plugin.ratingVerifiedCount || 0,
        ratingBreakdown: plugin.ratingBreakdown || [0, 0, 0, 0, 0],
        // הציון המוחלק — פנימי, אך מוצג בניהול כדי להסביר את סדר התצוגה בחנות
        ratingScore: plugin.ratingScore ?? null
      },
      ratings: ratings.map((rating) => ({
        id: rating._id.toString(),
        value: rating.value,
        verifiedInstall: rating.verifiedInstall === true,
        pluginVersion: rating.pluginVersion || '',
        isHidden: rating.isHidden === true,
        hiddenByName: rating.hiddenBy?.name || null,
        hiddenAt: rating.hiddenAt || null,
        userName: rating.userId?.name || 'משתמש שנמחק',
        userEmail: rating.userId?.email || '',
        createdAt: rating.createdAt,
        updatedAt: rating.updatedAt
      }))
    })
  } catch (error) {
    console.error('Error fetching plugin ratings:', error)
    return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { ratingId, action } = body || {}
    if (!isValidObjectId(ratingId) || !RATING_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    await dbConnect()
    const hide = action === 'hide'
    const updated = await PluginRating.findOneAndUpdate(
      { _id: ratingId, pluginId: id },
      hide
        ? { $set: { isHidden: true, hiddenBy: auth.session.user.id, hiddenAt: new Date() } }
        : { $set: { isHidden: false, hiddenBy: null, hiddenAt: null } }
    )
    if (!updated) {
      return NextResponse.json({ error: 'הדירוג לא נמצא' }, { status: 404 })
    }

    const aggregate = await recomputePluginRating(id)
    return NextResponse.json({
      success: true,
      message: hide ? 'הדירוג הוסתר ואינו נספר בממוצע' : 'הדירוג הוחזר ונספר שוב בממוצע',
      aggregate: {
        ratingCount: aggregate.ratingCount,
        ratingAvg: aggregate.ratingAvg,
        ratingVerifiedCount: aggregate.ratingVerifiedCount,
        ratingBreakdown: aggregate.ratingBreakdown,
        ratingScore: aggregate.ratingScore
      }
    })
  } catch (error) {
    console.error('Error moderating plugin rating:', error)
    return NextResponse.json({ error: 'Failed to moderate rating' }, { status: 500 })
  }
}
