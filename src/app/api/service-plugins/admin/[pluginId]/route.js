import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import ServicePluginReview from '@/models/ServicePluginReview'
import { hasPluginsAccess } from '@/lib/roles'
import { adminStart, adminRetry, adminEmergency, cancelReview, rollback } from '@/lib/servicePlugins/reviews'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, readJsonBody, json,
  failureResponse, errorResponse, toObjectId,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

const ACTIONS = ['start', 'cancel', 'retry', 'emergency', 'rollback']

// פעולות מנהל: start (= אישור פרסום מותנה), cancel, retry, emergency (חריגת 21 יום), rollback.
export async function POST(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const csrf = rejectCrossSite(request)
  if (csrf) return csrf
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session, hasPluginsAccess)
  if (denied) return denied
  const { pluginId } = await params
  if (!isObjectIdString(pluginId)) return notFoundResponse()
  try {
    const body = await readJsonBody(request)
    const { action, jobId, reason } = body
    if (!ACTIONS.includes(action)) return json({ error: 'פעולה לא מוכרת', code: 'invalid_action' }, 400)
    if (jobId !== undefined && jobId !== null && !isObjectIdString(jobId)) return json({ error: 'מזהה הגשה לא תקין', code: 'invalid_job' }, 400)
    await dbConnect()
    const plugin = await Plugin.findById(pluginId).select('-downloadsByVersion').lean()
    if (!plugin?.hasService) return notFoundResponse()
    const admin = { _id: toObjectId(session.user.id) }

    let result
    if (action === 'emergency') {
      result = await adminEmergency({ plugin, admin, reason })
    } else if (action === 'rollback') {
      result = await rollback({ plugin })
    } else {
      const reviewId = jobId || plugin.serviceState?.activeReviewId
      const review = reviewId ? await ServicePluginReview.findOne({ _id: reviewId, pluginId: plugin._id }).lean() : null
      if (!review) return json({ error: 'ההגשה לא נמצאה', code: 'not_found' }, 404)
      if (action === 'start') result = await adminStart({ plugin, review, admin })
      else if (action === 'retry') result = await adminRetry({ review })
      else result = await cancelReview({ review, by: admin._id, reason: typeof reason === 'string' ? reason : 'בוטל בידי מנהל', asAdmin: true })
    }
    if (!result.ok) return failureResponse(result)
    return json(result)
  } catch (err) {
    return errorResponse(err, 'admin action')
  }
}
