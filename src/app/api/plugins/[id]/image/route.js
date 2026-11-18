import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fsp } from 'fs'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, readPluginCardThumbnail, IMAGE_BASENAME, getOptCachePath } from '@/lib/pluginStorage'
import { canAccessSuspended, isPluginOwner, isPluginSuspended } from '@/lib/pluginVisibility'
import { notFound, serverError } from '@/lib/apiResponse'
import { isAdmin as isAdminUser } from '@/lib/roles'

// GET /api/plugins/[id]/image - הגשת תמונת התוסף מהדיסק
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includePending = searchParams.get('pending') === '1'
    const card = searchParams.get('size') === 'card'
    await dbConnect()
    const plugin = await Plugin.findById(id).select('image isApproved isHidden isSuspended authorId pendingUpdate').lean()
    if (!plugin || plugin.isHidden) {
      return notFound('Image not found')
    }

    const isPublic = !includePending && plugin.isApproved && !isPluginSuspended(plugin)
    if (!isPublic) {
      const session = await getServerSession(authOptions)
      const isAdmin = isAdminUser(session?.user)
      const isOwner = isPluginOwner(plugin, session?.user?.id)

      if (includePending && (!plugin.pendingUpdate || (!isAdmin && !isOwner))) {
        return notFound('Image not found')
      }
      if (!includePending && !plugin.isApproved && !isAdmin && !isOwner) {
        return notFound('Image not found')
      }
      if (isPluginSuspended(plugin) && !canAccessSuspended({ isAdmin, isOwner })) {
        return notFound('Image not found')
      }
    }

    const source = includePending ? plugin.pendingUpdate : null
    const assetSource = includePending ? (source?.assetSources?.image || (source?.image ? 'live' : 'none')) : 'live'
    const image = includePending ? (source?.image ?? null) : plugin.image
    if (!image || !image.ext || assetSource === 'none') {
      return notFound('Image not found')
    }
    const options = { pending: assetSource === 'pending' }
    let serveBuf
    let serveContentType = 'image/webp'
    if (card) {
      try {
        serveBuf = await readPluginCardThumbnail(id, image.ext, options)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    const cardReady = Boolean(serveBuf)
    if (!serveBuf && !includePending && image.contentType !== 'image/gif') {
      try {
        serveBuf = await fsp.readFile(getOptCachePath(id))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    if (!serveBuf) {
      serveBuf = await readPluginAsset(id, `${IMAGE_BASENAME}${image.ext}`, options)
      serveContentType = image.contentType || 'application/octet-stream'
    }

    return new NextResponse(serveBuf, {
      headers: {
        'Content-Type': serveContentType,
        'Content-Length': serveBuf.length.toString(),
        'Cache-Control': !isPublic
          ? 'private, no-store'
          : card && !cardReady
            ? 'public, max-age=300'
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
