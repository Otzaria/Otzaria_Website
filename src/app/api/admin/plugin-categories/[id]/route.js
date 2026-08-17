import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import PluginCategory from '@/models/PluginCategory'
import Plugin from '@/models/Plugin'
import { requirePluginsAdmin } from '@/lib/adminAuth'
import {
  PLUGIN_PREVIEW_FIELDS,
  validateCategoryData,
  formatAdminCategory
} from '@/lib/pluginCategoryAdmin'

const MAX_PLUGINS_PER_CATEGORY = 500

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)
}

// ולידציה של רשימת מזהי תוספים: ObjectId תקין + קיום בפועל.
// מותר לשבץ תוסף שטרם אושר (מסונן ציבורית עד אישורו).
async function validatePluginIds(pluginIds) {
  if (!Array.isArray(pluginIds)) return { error: 'pluginIds חייב להיות מערך' }
  if (pluginIds.length > MAX_PLUGINS_PER_CATEGORY) {
    return { error: `לא ניתן לשבץ יותר מ-${MAX_PLUGINS_PER_CATEGORY} תוספים בקטגוריה` }
  }
  if (!pluginIds.every(isValidObjectId)) return { error: 'מזהה תוסף לא תקין' }

  const unique = [...new Set(pluginIds)]
  const existing = await Plugin.countDocuments({ _id: { $in: unique } })
  if (existing !== unique.length) return { error: 'אחד או יותר מהתוספים אינו קיים' }
  return { ids: unique }
}

async function reloadCategory(id) {
  const category = await PluginCategory.findById(id)
    .populate('pluginIds', PLUGIN_PREVIEW_FIELDS)
    .lean()
  return category ? formatAdminCategory(category) : null
}

// PATCH /api/admin/plugin-categories/[id]
// body: { action: 'update'|'reorder'|'setPlugins'|'addPlugin'|'removePlugin', ... }
export async function PATCH(request, { params }) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    await dbConnect()
    const category = await PluginCategory.findById(id)
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    switch (body.action) {
      case 'update': {
        const data = body.data || {}
        const errors = validateCategoryData(data, { partial: true })
        if (errors.length) {
          return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
        }

        if (data.name !== undefined) category.name = String(data.name).trim()
        if (data.slug !== undefined) category.slug = String(data.slug).trim().toLowerCase()
        if (data.description !== undefined) category.description = String(data.description).trim()
        if (data.icon !== undefined) category.icon = String(data.icon).trim()
        if (data.showOnHome !== undefined) category.showOnHome = data.showOnHome === true
        if (data.homeLimit !== undefined) category.homeLimit = Number(data.homeLimit)
        if (data.sortMode !== undefined) category.sortMode = data.sortMode
        if (data.manualTopCount !== undefined) category.manualTopCount = Number(data.manualTopCount)
        if (data.isVisible !== undefined) category.isVisible = data.isVisible === true

        try {
          await category.save()
        } catch (saveError) {
          if (saveError?.code === 11000) {
            return NextResponse.json({ error: 'כבר קיימת קטגוריה עם שם או slug זהים' }, { status: 409 })
          }
          throw saveError
        }
        break
      }

      case 'reorder': {
        const targetOrder = Number(body.order)
        if (!Number.isInteger(targetOrder) || targetOrder < 0) {
          return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
        }
        // שיבוץ מחדש 0..N-1 של כל הקטגוריות עם הקטגוריה במיקום המבוקש
        const all = await PluginCategory.find({}).sort({ order: 1 }).select('_id').lean()
        const rest = all.filter((c) => c._id.toString() !== id)
        const clamped = Math.min(targetOrder, rest.length)
        const newOrder = [...rest.slice(0, clamped), { _id: category._id }, ...rest.slice(clamped)]
        await PluginCategory.bulkWrite(
          newOrder.map((c, index) => ({
            updateOne: { filter: { _id: c._id }, update: { $set: { order: index } } }
          }))
        )
        break
      }

      case 'setPlugins': {
        const validated = await validatePluginIds(body.pluginIds)
        if (validated.error) {
          return NextResponse.json({ error: validated.error }, { status: 400 })
        }
        category.pluginIds = validated.ids
        await category.save()
        break
      }

      case 'addPlugin': {
        if (!isValidObjectId(body.pluginId)) {
          return NextResponse.json({ error: 'מזהה תוסף לא תקין' }, { status: 400 })
        }
        const exists = await Plugin.exists({ _id: body.pluginId })
        if (!exists) {
          return NextResponse.json({ error: 'התוסף אינו קיים' }, { status: 400 })
        }
        if (category.pluginIds.length >= MAX_PLUGINS_PER_CATEGORY) {
          return NextResponse.json({ error: 'הקטגוריה מלאה' }, { status: 400 })
        }
        await PluginCategory.updateOne({ _id: id }, { $addToSet: { pluginIds: body.pluginId } })
        break
      }

      case 'removePlugin': {
        if (!isValidObjectId(body.pluginId)) {
          return NextResponse.json({ error: 'מזהה תוסף לא תקין' }, { status: 400 })
        }
        await PluginCategory.updateOne({ _id: id }, { $pull: { pluginIds: body.pluginId } })
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, category: await reloadCategory(id) })
  } catch (error) {
    console.error('Error updating plugin category:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

// DELETE /api/admin/plugin-categories/[id] — מחיקת קטגוריה.
// אינה נוגעת בתוספים עצמם — הם רק "משתחררים" מהשיבוץ.
export async function DELETE(request, { params }) {
  try {
    const auth = await requirePluginsAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    await dbConnect()
    const category = await PluginCategory.findByIdAndDelete(id)
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Error deleting plugin category:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
