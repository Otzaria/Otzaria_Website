import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// POST - ביטול אישור תוסף (העברה חזרה לממתינים)
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }
    
    await dbConnect()
    const { id } = await params
    
    const plugin = await Plugin.findById(id)
    
    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      )
    }
    
    // ביטול האישור
    plugin.isApproved = false
    plugin.approvedBy = null
    plugin.approvedAt = null
    
    await plugin.save()
    
    return NextResponse.json({
      success: true,
      plugin,
      message: 'Plugin approval revoked successfully'
    })
  } catch (error) {
    console.error('Error unapproving plugin:', error)
    return NextResponse.json(
      { error: 'Failed to unapprove plugin' },
      { status: 500 }
    )
  }
}
