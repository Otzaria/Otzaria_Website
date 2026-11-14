import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { createDraft } from '@/lib/servicePlugins/reviews'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, readJsonBody, json,
  failureResponse, errorResponse, tooManyRequests,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// יצירת הגשה (טיוטה) — מבנה הבקשה במדריך המפתח.
export async function POST(request, { params }) {
  if (!isEnabled()) return disabledResponse()
  const csrf = rejectCrossSite(request)
  if (csrf) return csrf
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session)
  if (denied) return denied
  const { pluginId } = await params
  if (!isObjectIdString(pluginId)) return notFoundResponse()
  // כל טיוטה מאפשרת עד מאות MiB של העלאות; ביטול מוחק אותן, אך הקצב עדיין מוגבל
  if (!checkRateLimit(String(session.user.id), 'service-plugin-draft', 10, 'hour')) return tooManyRequests()
  try {
    const body = await readJsonBody(request)
    await dbConnect()
    const plugin = await Plugin.findById(pluginId).select('authorId hasService isHidden isSuspended pluginUid version serviceState').lean()
    if (!plugin) return notFoundResponse()
    const result = await createDraft({ plugin, user: { _id: session.user.id }, body })
    if (!result.ok) return failureResponse(result)
    return json({ reviewId: String(result.review._id), uploads: result.uploads }, 201)
  } catch (err) {
    return errorResponse(err, 'create draft')
  }
}
