import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset, IMAGE_BASENAME } from '@/lib/pluginStorage'

// GET /api/plugins/[id]/image - הגשת תמונת התוסף מהדיסק
export async function GET(request, { params }) {
  try {
    const { id } = await params
    await dbConnect()
    const plugin = await Plugin.findById(id).select('image').lean()
    if (!plugin || !plugin.image || !plugin.image.ext) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    const buf = await readPluginAsset(id, `${IMAGE_BASENAME}${plugin.image.ext}`)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': plugin.image.contentType || 'application/octet-stream',
        'Content-Length': buf.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
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
