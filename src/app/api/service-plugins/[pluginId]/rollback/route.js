import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { forbidden } from '@/lib/apiResponse'
import { isPluginOwner, rollback } from '@/lib/servicePlugins/reviews'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, json, failureResponse,
  errorResponse, NO_STORE,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// חזרה לגרסת השירות הקודמת בידי הבעלים.
export async function POST(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const csrf = rejectCrossSite(request)
  if (csrf) return csrf
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session)
  if (denied) return denied
  const { pluginId } = await params
  if (!isObjectIdString(pluginId)) return notFoundResponse()
  try {
    await dbConnect()
    const plugin = await Plugin.findById(pluginId).select('-downloadsByVersion').lean()
    if (!plugin) return notFoundResponse()
    if (!isPluginOwner(plugin, session.user.id)) {
      const res = forbidden()
      res.headers.set('cache-control', NO_STORE['cache-control'])
      return res
    }
    const result = await rollback({ plugin })
    if (!result.ok) return failureResponse(result)
    return json(result)
  } catch (err) {
    return errorResponse(err, 'rollback')
  }
}
