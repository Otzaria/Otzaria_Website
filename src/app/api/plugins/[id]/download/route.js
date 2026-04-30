import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - הורדת קובץ תוסף
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id } = await params
    
    const plugin = await Plugin.findOne({
      _id: id,
      isApproved: true,
      isHidden: false
    })
    
    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      )
    }
    
    if (!plugin.pluginData) {
      return NextResponse.json(
        { error: 'Plugin file not found' },
        { status: 404 }
      )
    }
    
    // עדכון מונה ההורדות (async, לא חוסם)
    plugin.incrementDownload().catch(err => console.error('Failed to increment download count:', err))
    
    // החזרת הקובץ
    return new NextResponse(plugin.pluginData, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${plugin.pluginFileName}"`,
        'Content-Length': plugin.pluginData.length.toString()
      }
    })
  } catch (error) {
    console.error('Error downloading plugin:', error)
    return NextResponse.json(
      { error: 'Failed to download plugin' },
      { status: 500 }
    )
  }
}
