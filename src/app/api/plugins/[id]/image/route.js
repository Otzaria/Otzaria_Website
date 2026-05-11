import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fsp } from 'fs'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, IMAGE_BASENAME, optimizeImageBuffer, getOptCachePath } from '@/lib/pluginStorage'

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

    let serveBuf = buf
    let serveContentType = image.contentType || 'application/octet-stream'

    // אופטימיזציה + cache לדיסק רק לתמונות חיות (לא pending), לא GIF
    if (!includePending && image.contentType !== 'image/gif') {
      const cachePath = getOptCachePath(id)
      let fromCache = false
      try {
        serveBuf = await fsp.readFile(cachePath)
        serveContentType = 'image/webp'
        fromCache = true
      } catch { /* cache miss */ }

      if (!fromCache) {
        try {
          const optimized = await optimizeImageBuffer(buf, { maxWidth: 1200, quality: 82 })
          serveBuf = optimized
          serveContentType = 'image/webp'
          // כתיבה async לדיסק — לא חוסמת את התגובה
          fsp.writeFile(cachePath, optimized).catch(() => {})
        } catch { /* fallback to original */ }
      }
    }

    return new NextResponse(serveBuf, {
      headers: {
        'Content-Type': serveContentType,
        'Content-Length': serveBuf.length.toString(),
        'Cache-Control': includePending
          ? 'private, no-store'
          : 'public, max-age=604800, stale-while-revalidate=2592000',
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
