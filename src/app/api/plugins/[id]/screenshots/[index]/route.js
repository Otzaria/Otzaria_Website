import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset } from '@/lib/pluginStorage'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'

// GET /api/plugins/[id]/screenshots/[index] - הגשת צילום מסך מהדיסק
export async function GET(request, { params }) {
  try {
    const { id, index } = await params
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    const idx = Number.parseInt(index, 10)
    if (!Number.isInteger(idx) || idx < 0) {
      return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id).select('screenshots isApproved isHidden isSuspended authorId pendingUpdate').lean()
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'admin'
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (includePending) {
      if (!plugin.pendingUpdate || (!isAdmin && !isOwner)) {
        return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
      }
    } else if (!plugin.isApproved && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    // תוסף מושהה — נכסיו מוגשים רק למעלה ולמנהל, כמו הדף וההורדה עצמם
    if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    const source = includePending ? plugin.pendingUpdate : null
    const assetSource = includePending
      ? (source?.assetSources?.screenshots || ((source?.screenshots || []).length ? 'live' : 'none'))
      : 'live'
    const screenshots = includePending ? (source?.screenshots || []) : (plugin.screenshots || [])

    if (assetSource === 'none' || !screenshots[idx]) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }
    const meta = screenshots[idx]
    const buf = await readPluginAsset(id, `screenshots/${idx}${meta.ext}`, { pending: assetSource === 'pending' })
    return new NextResponse(buf, {
      headers: {
        'Content-Type': meta.contentType || 'application/octet-stream',
        'Content-Length': buf.length.toString(),
        'Cache-Control': includePending ? 'private, no-store' : 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }
    console.error('Error serving plugin screenshot:', error)
    return NextResponse.json({ error: 'Failed to serve screenshot' }, { status: 500 })
  }
}
