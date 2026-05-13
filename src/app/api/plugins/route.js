import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { formatPluginForPublic } from '@/lib/pluginSubmission'

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
      .sort({ isPinned: -1, pinnedAt: -1, createdAt: -1 })
      .select('-__v -pendingUpdate -pendingChangeSummary')
      .lean()

    return NextResponse.json(plugins.map((plugin) => formatPluginForPublic(plugin)))
  } catch (error) {
    console.error('Error fetching plugins:', error)
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 })
  }
}
