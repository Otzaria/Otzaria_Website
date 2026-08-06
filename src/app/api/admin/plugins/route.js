import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { hasPluginsAccess } from '@/lib/roles'

// GET /api/admin/plugins?status=pending|approved
// מאחד את שתי רשימות הניהול תחת ראוט אחד.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !hasPluginsAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') || 'pending').toLowerCase()

    if (!['pending', 'approved'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    await dbConnect()

    const query = status === 'pending'
      ? {
          isHidden: false,
          $or: [
            { isApproved: false },
            { pendingUpdate: { $ne: null } }
          ]
        }
      : { isHidden: false, isApproved: true }

    const cursor = Plugin.find(query)
      .sort({ createdAt: -1 })
      .populate('authorId', 'name email')
      .populate('lastSubmittedBy', 'name email')
      .select('-__v -downloadsByVersion')

    if (status === 'approved') cursor.populate('approvedBy', 'name email')

    const plugins = await cursor.lean()
    return NextResponse.json(plugins)
  } catch (error) {
    console.error('Error fetching admin plugins:', error)
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 })
  }
}
