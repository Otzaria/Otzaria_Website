import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { formatPluginForPublic } from '@/lib/pluginSubmission'

export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id } = await params

    const plugin = await Plugin.findOne({ _id: id, isApproved: true, isHidden: false }).lean()
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    return NextResponse.json(formatPluginForPublic(plugin))
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return NextResponse.json({ error: 'Failed to fetch plugin' }, { status: 500 })
  }
}
