import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import { loadOwnedReview, cancelReview } from '@/lib/servicePlugins/reviews'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, json, failureResponse,
  errorResponse, toObjectId,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// ביטול בידי הבעלים — רק טיוטה או הגשה שממתינה לבחירת מנהל.
export async function DELETE(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const csrf = rejectCrossSite(request)
  if (csrf) return csrf
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session)
  if (denied) return denied
  const { pluginId, reviewId } = await params
  if (!isObjectIdString(pluginId) || !isObjectIdString(reviewId)) return notFoundResponse()
  try {
    await dbConnect()
    const loaded = await loadOwnedReview({ pluginId, reviewId, userId: session.user.id })
    if (!loaded.ok) return failureResponse(loaded)
    const result = await cancelReview({ review: loaded.review, by: toObjectId(session.user.id), reason: 'בוטל בידי המפתח' })
    if (!result.ok) return failureResponse(result)
    return json({ status: result.status })
  } catch (err) {
    return errorResponse(err, 'cancel draft')
  }
}
