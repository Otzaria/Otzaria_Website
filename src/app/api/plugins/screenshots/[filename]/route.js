import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - הגשת צילום מסך של תוסף ממסד הנתונים
// הפורמט: /api/plugins/screenshots/[pluginId]-[index]
export async function GET(request, { params }) {
  try {
    const { filename } = await params
    
    // פירוק ה-filename ל-pluginId ו-index
    const parts = filename.split('-')
    const pluginId = parts[0]
    const index = parseInt(parts[1] || '0')
    
    await dbConnect()
    
    const plugin = await Plugin.findById(pluginId).select('screenshots').lean()
    
    if (!plugin || !plugin.screenshots || !plugin.screenshots[index]) {
      return NextResponse.json(
        { error: 'Screenshot not found' },
        { status: 404 }
      )
    }
    
    const screenshot = plugin.screenshots[index]
    
    // החזרת צילום המסך ממסד הנתונים
    return new NextResponse(screenshot.data.buffer, {
      headers: {
        'Content-Type': screenshot.contentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (error) {
    console.error('Error serving screenshot:', error)
    return NextResponse.json(
      { error: 'Failed to serve screenshot' },
      { status: 500 }
    )
  }
}
