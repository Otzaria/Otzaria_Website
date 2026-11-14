import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { hasPluginsAccess } from '@/lib/roles'
import { forbidden } from '@/lib/apiResponse'
import { getManageView } from '@/lib/servicePlugins/views'
import { isPluginOwner } from '@/lib/servicePlugins/reviews'
import { isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, json, errorResponse, NO_STORE } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session)
  if (denied) return denied
  const { pluginId } = await params
  if (!isObjectIdString(pluginId)) return notFoundResponse()
  try {
    await dbConnect()
    const plugin = await Plugin.findById(pluginId).select('-downloadsByVersion').lean()
    if (!plugin) return notFoundResponse()
    const viewerIsOwner = isPluginOwner(plugin, session.user.id)
    if (!viewerIsOwner && !hasPluginsAccess(session.user)) {
      const res = forbidden()
      res.headers.set('cache-control', NO_STORE['cache-control'])
      return res
    }
    return json({ ...(await getManageView(plugin, { enabled: true })), viewerIsOwner })
  } catch (err) {
    return errorResponse(err, 'manage')
  }
}
