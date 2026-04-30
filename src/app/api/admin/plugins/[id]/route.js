import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { deletePluginDir } from '@/lib/pluginStorage'

// וידוא הרשאת מנהל
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'admin') {
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
    if (!['approve', 'unapprove'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    if (action === 'approve') {
      await plugin.approve(auth.session.user.id)
    } else {
      plugin.isApproved = false
      plugin.approvedBy = null
      plugin.approvedAt = null
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

    // מחיקה מהדיסק תחילה; כשל כאן לא יחסום את מחיקת המסמך, אבל יירשם.
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
