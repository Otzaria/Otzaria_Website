import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, IMAGE_BASENAME } from '@/lib/pluginStorage'

// GET /api/plugins/[id]/image - הגשת תמונת התוסף מהדיסק
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    await dbConnect()
    const plugin = await Plugin.findById(id).select('image isApproved isHidden authorId pendingUpdate').lean()
    if (!plugin || plugin.isHidden) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'admin'
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (includePending) {
      if (!plugin.pendingUpdate || (!isAdmin && !isOwner)) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 })
      }
    } else if (!plugin.isApproved && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const source = includePending ? plugin.pendingUpdate : null
    const assetSource = includePending ? (source?.assetSources?.image || (source?.image ? 'live' : 'none')) : 'live'
    const image = includePending ? (source?.image ?? null) : plugin.image
    if (!image || !image.ext || assetSource === 'none') {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    const buf = await readPluginAsset(id, `${IMAGE_BASENAME}${image.ext}`, { pending: assetSource === 'pending' })
    return new NextResponse(buf, {
      headers: {
        'Content-Type': image.contentType || 'application/octet-stream',
        'Content-Length': buf.length.toString(),
        'Cache-Control': includePending ? 'private, no-store' : 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    console.error('Error serving plugin image:', error)
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 })
  }
}
