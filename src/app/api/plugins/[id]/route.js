import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - קבלת תוסף בודד
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id } = await params
    
    const plugin = await Plugin.findOne({
      _id: id,
      isApproved: true,
      isHidden: false
    }).lean()
    
    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      )
    }
    
    // המרת התוסף לפורמט המתאים
    const formattedPlugin = {
      id: plugin._id.toString(),
      name: plugin.name,
      slug: plugin.slug,
      shortDescription: plugin.shortDescription,
      description: plugin.description,
      version: plugin.version,
      status: plugin.status,
      author: plugin.author,
      updatedAt: plugin.updatedAt.toISOString().split('T')[0],
      originalDate: plugin.originalDate || plugin.updatedAt.toISOString().split('T')[0],
      compatibleWith: plugin.compatibleWith,
      tags: plugin.tags || [],
      image: plugin.imageData ? `/api/plugins/images/${plugin._id}` : null,
      screenshots: plugin.screenshots?.map((_, index) => `/api/plugins/screenshots/${plugin._id}-${index}`) || [],
      downloadUrl: `/api/plugins/${plugin._id}/download`,
      homepage: plugin.homepage || '',
      installInstructions: plugin.installInstructions || [],
      downloadCount: plugin.downloadCount || 0
    }
    
    return NextResponse.json(formattedPlugin)
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return NextResponse.json(
      { error: 'Failed to fetch plugin' },
      { status: 500 }
    )
  }
}
