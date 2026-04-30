import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'

export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id } = await params

    const plugin = await Plugin.findOne({ _id: id, isApproved: true, isHidden: false }).lean()
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const pluginId = plugin._id.toString()
    return NextResponse.json({
      id: pluginId,
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
      image: plugin.image && plugin.image.ext ? `/api/plugins/${pluginId}/image` : null,
      screenshots: (plugin.screenshots || []).map((_, index) => `/api/plugins/${pluginId}/screenshots/${index}`),
      downloadUrl: `/api/plugins/${pluginId}/download`,
      homepage: plugin.homepage || '',
      installInstructions: plugin.installInstructions || [],
      downloadCount: plugin.downloadCount || 0
    })
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return NextResponse.json({ error: 'Failed to fetch plugin' }, { status: 500 })
  }
}
