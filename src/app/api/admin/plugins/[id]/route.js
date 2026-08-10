import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import mongoose from 'mongoose'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import PluginCategory from '@/models/PluginCategory'
import StoreSettings from '@/models/StoreSettings'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { sendPluginApprovalNotification } from '@/lib/emailService'
import {
  deletePendingPluginDir,
  deletePluginDir,
  ensurePluginDir,
  getPendingPluginDir,
  removePluginAsset,
  clearImageOptCache
} from '@/lib/pluginStorage'
import { archiveCurrentVersion } from '@/lib/pluginVersions'
import { compareVersions } from '@/lib/pluginManifest'
import path from 'path'
import { promises as fs } from 'fs'
import { hasPluginsAccess } from '@/lib/roles'

// וידוא הרשאת מנהל תוספים
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !hasPluginsAccess(session.user?.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { ok: true, session }
}

// PATCH /api/admin/plugins/[id]  body: { action: 'approve' | 'unapprove' }
// באישור נתמך גם categoryIds אופציונלי — שיבוץ התוסף לקטגוריות החנות מיד עם האישור.
// (פעולות pin/unpin בוטלו ב-31/07/2026 — הוחלפו ב"תוספים נבחרים" ב-store-settings.)
export async function PATCH(request, { params }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const action = body?.action
    if (!['approve', 'unapprove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id).populate('authorId', 'name email')
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (action === 'approve') {
      const approvalEmailData = {
        recipientEmail: plugin.authorId?.email || '',
        recipientName: plugin.authorId?.name || plugin.author || '',
        pluginId: plugin._id.toString(),
        pluginName: plugin.name,
        version: plugin.version,
        status: plugin.status,
        submissionType: plugin.pendingUpdate ? 'update' : (plugin.submissionType || 'new')
      }

      if (plugin.pendingUpdate) {
        const pending = plugin.pendingUpdate
        const pluginId = plugin._id.toString()
        const pluginDir = await ensurePluginDir(pluginId)

        // עליית גרסה ממש → מארכבים את הגרסה החיה היוצאת להיסטוריה לפני הדריסה.
        // עדכון באותה גרסה (תיקון ללא שינוי מספר) דורס ואינו נשמר בהיסטוריה.
        if (compareVersions(pending.version, plugin.version) > 0) {
          try {
            await archiveCurrentVersion(plugin)
          } catch (archiveErr) {
            console.error('Failed to archive outgoing plugin version:', archiveErr)
            // הארכוב הוא תנאי הכרחי לפיצ'ר הגרסאות — בלעדיו תאבד הגרסה הקיימת
            // ומשתמשים בגרסת אוצריא ישנה לא יוכלו לקבל את הגרסה התואמת הקודמת.
            // לכן לא מאשרים ולא דורסים אם הארכוב נכשל.
            return NextResponse.json(
              { error: 'שמירת הגרסה הקודמת בהיסטוריה נכשלה. העדכון לא אושר כדי לא לאבד את הגרסה הקיימת.' },
              { status: 500 }
            )
          }
        }

        plugin.name = pending.name
        plugin.shortDescription = pending.shortDescription
        plugin.description = pending.description
        plugin.version = pending.version
        plugin.status = pending.status
        plugin.author = pending.author
        plugin.compatibleWith = pending.compatibleWith
        plugin.maxAppVersion = pending.maxAppVersion || null
        plugin.requiresNetwork = pending.requiresNetwork === true
        plugin.tags = pending.tags || []
        plugin.homepage = pending.homepage || ''
        plugin.pluginFileName = pending.pluginFileName
        plugin.pluginFileExt = pending.pluginFileExt
        plugin.pluginFileSize = pending.pluginFileSize || 0

        if (pending.assetSources?.pluginFile === 'pending') {
          const source = path.join(getPendingPluginDir(pluginId), `plugin${pending.pluginFileExt}`)
          const target = path.join(pluginDir, `plugin${pending.pluginFileExt}`)
          await fs.rm(target, { force: true })
          await fs.rename(source, target)
          // קובץ התוסף הוחלף בפועל — מעדכן את תאריך העדכון המוצג בחנות
          plugin.fileUpdatedAt = new Date()
        }

        if (pending.assetSources?.image === 'none') {
          if (plugin.image?.ext) {
            await removePluginAsset(pluginId, `image${plugin.image.ext}`).catch(() => {})
          }
          await clearImageOptCache(pluginId)
          plugin.image = { ext: null, contentType: null }
        } else if (pending.assetSources?.image === 'pending') {
          if (plugin.image?.ext) {
            await removePluginAsset(pluginId, `image${plugin.image.ext}`).catch(() => {})
          }
          await clearImageOptCache(pluginId)
          const source = path.join(getPendingPluginDir(pluginId), `image${pending.image.ext}`)
          const target = path.join(pluginDir, `image${pending.image.ext}`)
          await fs.rm(target, { force: true })
          await fs.rename(source, target)
          plugin.image = pending.image
        }

        if (pending.assetSources?.screenshots === 'none') {
          for (let index = 0; index < (plugin.screenshots || []).length; index += 1) {
            const screenshot = plugin.screenshots[index]
            if (screenshot?.ext) {
              await removePluginAsset(pluginId, path.join('screenshots', `${index}${screenshot.ext}`)).catch(() => {})
            }
          }
          plugin.screenshots = []
        } else if (pending.assetSources?.screenshots === 'pending') {
          for (let index = 0; index < (plugin.screenshots || []).length; index += 1) {
            const screenshot = plugin.screenshots[index]
            if (screenshot?.ext) {
              await removePluginAsset(pluginId, path.join('screenshots', `${index}${screenshot.ext}`)).catch(() => {})
            }
          }
          for (let index = 0; index < (pending.screenshots || []).length; index += 1) {
            const screenshot = pending.screenshots[index]
            const source = path.join(getPendingPluginDir(pluginId), 'screenshots', `${index}${screenshot.ext}`)
            const target = path.join(pluginDir, 'screenshots', `${index}${screenshot.ext}`)
            await fs.rm(target, { force: true })
            await fs.rename(source, target)
          }
          plugin.screenshots = pending.screenshots || []
        }

        plugin.pendingUpdate = null
        plugin.pendingChangeSummary = []
        plugin.submissionType = 'new'
        plugin.isApproved = true
        plugin.approvedBy = auth.session.user.id
        plugin.approvedAt = new Date()
        await plugin.save()
        await deletePendingPluginDir(pluginId).catch(() => {})

        approvalEmailData.pluginName = plugin.name
        approvalEmailData.version = plugin.version
        approvalEmailData.status = plugin.status
      } else {
        await plugin.approve(auth.session.user.id)
      }

      // שיבוץ אופציונלי לקטגוריות החנות מיד עם האישור (המנהל המאשר בוחר היכן לשכן).
      // היעדר השדה = התנהגות זהה לעבר; קליינטים ישנים אינם נשברים.
      if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
        const validIds = body.categoryIds.filter(
          (catId) => typeof catId === 'string' && mongoose.Types.ObjectId.isValid(catId)
        )
        if (validIds.length > 0) {
          await PluginCategory.updateMany(
            { _id: { $in: validIds } },
            { $addToSet: { pluginIds: plugin._id } }
          )
        }
      }

      // הוספה אופציונלית ל"נבחרים" בדף הבית — אטומית ($addToSet) בצד השרת,
      // כדי לא לדרוס עריכות מקבילות של רשימת הנבחרים ע"י מנהל אחר.
      if (body.addToFeatured === true) {
        await StoreSettings.updateOne(
          { key: 'store' },
          {
            $addToSet: { featuredPluginIds: plugin._id },
            $setOnInsert: { homeTitle: '', homeSubtitle: '' }
          },
          { upsert: true }
        )
      }

      try {
        await sendPluginApprovalNotification(approvalEmailData)
      } catch (emailError) {
        console.error('Failed to send plugin approval notification:', emailError)
      }
    } else {
      plugin.isApproved = false
      plugin.approvedBy = null
      plugin.approvedAt = null
      // מכוון: ביטול אישור אינו מסיר מקטגוריות ומהנבחרים — השיבוץ נשמר לקראת
      // אישור מחדש (ציבורית התוסף ממילא מסונן כל עוד אינו מאושר).
      await plugin.save()
    }

    invalidatePluginSearchIndex()
    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Plugin approved successfully' : 'Plugin approval revoked successfully',
      plugin
    })
  } catch (error) {
    console.error('Error updating plugin status:', error)
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 })
  }
}

// DELETE /api/admin/plugins/[id] - דחייה / מחיקה (כולל קבצים מהדיסק)
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params

    await dbConnect()
    const plugin = await Plugin.findById(id)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (plugin.isApproved && plugin.pendingUpdate) {
      plugin.pendingUpdate = null
      plugin.pendingChangeSummary = []
      plugin.submissionType = 'new'
      await plugin.save()
      await deletePendingPluginDir(id).catch((fsErr) => {
        console.error('Failed to delete pending plugin storage dir:', fsErr)
      })
      return NextResponse.json({
        success: true,
        message: 'Pending plugin update rejected successfully'
      })
    }

    try {
      await deletePluginDir(id)
    } catch (fsErr) {
      console.error('Failed to delete plugin storage dir:', fsErr)
    }

    await Plugin.findByIdAndDelete(id)

    // ניקוי עקבי: הסרת התוסף שנמחק מכל קטגוריה ומרשימת הנבחרים של דף הבית
    await PluginCategory.updateMany({ pluginIds: id }, { $pull: { pluginIds: id } }).catch((err) => {
      console.error('Failed to remove deleted plugin from categories:', err)
    })
    await StoreSettings.updateOne({ key: 'store' }, { $pull: { featuredPluginIds: id } }).catch((err) => {
      console.error('Failed to remove deleted plugin from featured list:', err)
    })
    invalidatePluginSearchIndex()

    return NextResponse.json({
      success: true,
      message: 'Plugin rejected and deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting plugin:', error)
    return NextResponse.json({ error: 'Failed to delete plugin' }, { status: 500 })
  }
}
