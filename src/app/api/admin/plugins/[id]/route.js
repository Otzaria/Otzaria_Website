import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginApprovalNotification } from '@/lib/emailService'
import {
  deletePendingPluginDir,
  deletePluginDir,
  ensurePluginDir,
  getPendingPluginDir,
  removePluginAsset,
  clearImageOptCache
} from '@/lib/pluginStorage'
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
// מאחד את פעולות approve / unapprove.
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
    if (!['approve', 'unapprove', 'pin', 'unpin'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id).populate('authorId', 'name email')
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (action === 'pin' || action === 'unpin') {
      if (!plugin.isApproved) {
        return NextResponse.json({ error: 'Only approved plugins can be pinned' }, { status: 400 })
      }
      plugin.isPinned = action === 'pin'
      plugin.pinnedAt = action === 'pin' ? new Date() : null
      await plugin.save()
      return NextResponse.json({
        success: true,
        message: action === 'pin' ? 'Plugin pinned successfully' : 'Plugin unpinned successfully',
        plugin
      })
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

        plugin.name = pending.name
        plugin.shortDescription = pending.shortDescription
        plugin.description = pending.description
        plugin.version = pending.version
        plugin.status = pending.status
        plugin.author = pending.author
        plugin.compatibleWith = pending.compatibleWith
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

      try {
        await sendPluginApprovalNotification(approvalEmailData)
      } catch (emailError) {
        console.error('Failed to send plugin approval notification:', emailError)
      }
    } else {
      plugin.isApproved = false
      plugin.approvedBy = null
      plugin.approvedAt = null
      plugin.isPinned = false
      plugin.pinnedAt = null
      await plugin.save()
    }

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

    return NextResponse.json({
      success: true,
      message: 'Plugin rejected and deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting plugin:', error)
    return NextResponse.json({ error: 'Failed to delete plugin' }, { status: 500 })
  }
}
