import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

// GET - קבלת כל התוספים המאושרים
export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    
    let query = { isApproved: true, isHidden: false }
    
    // סינון לפי תגית
    if (tag && tag !== 'all') {
      query.tags = tag
    }
    
    // סינון לפי סטטוס
    if (status && status !== 'all') {
      query.status = status
    }
    
    // חיפוש טקסט
    if (search) {
      query.$text = { $search: search }
    }
    
    const plugins = await Plugin.find(query)
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean()
    
    // המרת התוספים לפורמט המתאים
    const formattedPlugins = plugins.map(plugin => ({
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
    }))
    
    return NextResponse.json(formattedPlugins)
  } catch (error) {
    console.error('Error fetching plugins:', error)
    return NextResponse.json(
      { error: 'Failed to fetch plugins' },
      { status: 500 }
    )
  }
}
