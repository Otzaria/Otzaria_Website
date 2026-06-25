import { NextResponse } from 'next/server'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { formatPluginForPublic } from '@/lib/pluginSubmission'
import { formatVersionForPublic } from '@/lib/pluginVersions'
import { parsePluginRef } from '@/lib/pluginRef'

// תומך גם בגרסה ארכיונית ספציפית דרך /api/plugins/<id>@<version>.
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id: rawId } = await params
    const { id, version } = parsePluginRef(rawId)
    if (!id || version === false) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const plugin = await Plugin.findOne({ _id: id, isApproved: true, isHidden: false }).lean()
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const livePublic = formatPluginForPublic(plugin)

    // גרסה ארכיונית ספציפית (שאינה הגרסה החיה).
    if (version && version !== plugin.version) {
      const entry = (plugin.versions || []).find((v) => v.version === version)
      if (!entry) {
        return NextResponse.json({ error: 'Plugin version not found' }, { status: 404 })
      }
      return NextResponse.json(formatVersionForPublic(livePublic, plugin, entry))
    }

    return NextResponse.json(livePublic)
  } catch (error) {
    console.error('Error fetching plugin:', error)
    return NextResponse.json({ error: 'Failed to fetch plugin' }, { status: 500 })
  }
}
