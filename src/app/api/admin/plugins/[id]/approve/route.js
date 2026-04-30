import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// POST - אישור תוסף
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
    
    await plugin.approve(session.user.id)
    
    return NextResponse.json({
      success: true,
      message: 'Plugin approved successfully',
      plugin
    })
  } catch (error) {
    console.error('Error approving plugin:', error)
    return NextResponse.json(
      { error: 'Failed to approve plugin' },
      { status: 500 }
    )
  }
}
