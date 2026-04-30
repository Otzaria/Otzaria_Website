import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

function format(plugin) {
  const id = plugin._id.toString()
  return {
    id,
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
    image: plugin.image && plugin.image.ext ? `/api/plugins/${id}/image` : null,
    screenshots: (plugin.screenshots || []).map((_, index) => `/api/plugins/${id}/screenshots/${index}`),
    downloadUrl: `/api/plugins/${id}/download`,
    homepage: plugin.homepage || '',
    installInstructions: plugin.installInstructions || [],
    downloadCount: plugin.downloadCount || 0
  }
}

// GET - קבלת כל התוספים המאושרים, עם סינון אופציונלי
export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const query = { isApproved: true, isHidden: false }
    if (tag && tag !== 'all') query.tags = tag
    if (status && status !== 'all') query.status = status
    if (search) query.$text = { $search: search }

    const plugins = await Plugin.find(query)
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean()

    return NextResponse.json(plugins.map(format))
  } catch (error) {
    console.error('Error fetching plugins:', error)
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 })
  }
}
