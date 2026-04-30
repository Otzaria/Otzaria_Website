import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - הגשת תמונת תוסף ממסד הנתונים
export async function GET(request, { params }) {
  try {
    const { filename } = await params
    
    // filename הוא למעשה ה-ID של התוסף
    await dbConnect()
    
    const plugin = await Plugin.findById(filename).select('imageData imageContentType').lean()
    
    if (!plugin || !plugin.imageData) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }
    
    // החזרת התמונה ממסד הנתונים
    return new NextResponse(plugin.imageData.buffer, {
      headers: {
        'Content-Type': plugin.imageContentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (error) {
    console.error('Error serving image:', error)
    return NextResponse.json(
      { error: 'Failed to serve image' },
      { status: 500 }
    )
  }
}
