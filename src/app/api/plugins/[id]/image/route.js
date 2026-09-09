import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fsp } from 'fs'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, IMAGE_BASENAME, optimizeImageBuffer, getOptCachePath } from '@/lib/pluginStorage'
import { canAccessSuspended, isPluginSuspended } from '@/lib/pluginVisibility'
import { notFound, serverError } from '@/lib/apiResponse'

// GET /api/plugins/[id]/image - הגשת תמונת התוסף מהדיסק
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    await dbConnect()
    const plugin = await Plugin.findById(id).select('image isApproved isHidden isSuspended authorId pendingUpdate').lean()
    if (!plugin || plugin.isHidden) {
      return notFound('Image not found')
    }

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'admin'
    const isOwner = plugin.authorId?.toString() === session?.user?.id

    if (includePending) {
      if (!plugin.pendingUpdate || (!isAdmin && !isOwner)) {
        return notFound('Image not found')
      }
    } else if (!plugin.isApproved && !isAdmin && !isOwner) {
      return notFound('Image not found')
    }

    // תוסף מושהה — נכסיו מוגשים רק למעלה ולמנהל, כמו הדף וההורדה עצמם
    if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
      return notFound('Image not found')
    }

    const source = includePending ? plugin.pendingUpdate : null
    const assetSource = includePending ? (source?.assetSources?.image || (source?.image ? 'live' : 'none')) : 'live'
    const image = includePending ? (source?.image ?? null) : plugin.image
    if (!image || !image.ext || assetSource === 'none') {
      return notFound('Image not found')
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
          : 'public, max-age=3600, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return notFound('Image not found')
    }
    console.error('Error serving plugin image:', error)
    return serverError('Failed to serve image')
  }
}
