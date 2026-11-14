import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import { loadOwnedReview, sealDraft } from '@/lib/servicePlugins/reviews'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, json, failureResponse,
  errorResponse,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// הקפאת ההגשה: כל הקבצים התקבלו ובדיקת ה-SDK עברה → ממתין לבחירת מנהל.
export async function POST(request, { params }) {
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
    const result = await sealDraft({ review: loaded.review, plugin: loaded.plugin })
    if (!result.ok) {
      const res = failureResponse(result)
      if (result.status === 503) res.headers.set('retry-after', '60')
      return res
    }
    return json({ status: result.status, digest: result.digest })
  } catch (err) {
    return errorResponse(err, 'seal')
  }
}
