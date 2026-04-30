import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { readPluginAsset } from '@/lib/pluginStorage'

// GET /api/plugins/[id]/screenshots/[index] - הגשת צילום מסך מהדיסק
export async function GET(request, { params }) {
  try {
    const { id, index } = await params
    const idx = Number.parseInt(index, 10)
    if (!Number.isInteger(idx) || idx < 0) {
      return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
    }

    await dbConnect()
    const plugin = await Plugin.findById(id).select('screenshots').lean()
    if (!plugin || !plugin.screenshots || !plugin.screenshots[idx]) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }
    const meta = plugin.screenshots[idx]
    const buf = await readPluginAsset(id, `screenshots/${idx}${meta.ext}`)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': meta.contentType || 'application/octet-stream',
        'Content-Length': buf.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
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
