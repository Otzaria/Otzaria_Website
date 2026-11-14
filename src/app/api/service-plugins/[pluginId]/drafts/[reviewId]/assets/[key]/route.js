import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import { ASSET_KEYS } from '@/lib/servicePlugins/policy'
import { loadOwnedReview, assetSlot, recordAssetUpload } from '@/lib/servicePlugins/reviews'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  writeReviewAssetStream, deleteReviewFiles, AssetExistsError, SizeMismatchError, UploadAbortedError, StorageUnavailableError,
} from '@/lib/servicePlugins/storage'
import {
  isEnabled, disabledResponse, notFoundResponse, isObjectIdString, sessionGate, rejectCrossSite, json, failureResponse,
  errorResponse, shabbatBlock, tooManyRequests,
} from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'
// מתקין עד 256MiB בחיבור איטי
export const maxDuration = 900

function storageFailure(err) {
  if (err instanceof AssetExistsError) return json({ error: err.message, code: err.code }, 409)
  if (err instanceof SizeMismatchError) return json({ error: err.message, code: err.code }, 400)
  if (err instanceof UploadAbortedError) return json({ error: err.message, code: err.code }, 408)
  if (err instanceof StorageUnavailableError) return json({ error: err.message, code: err.code }, 503, { 'retry-after': '60' })
  return null
}

// העלאת קובץ בזרימה (PUT גולמי, לא multipart). הגודל חייב להיות בדיוק הגודל שהוצהר.
// הנתיב מוחרג מה-proxy (src/proxy.js), ולכן שער השבת נבדק כאן.
export async function PUT(request, { params }) {
  const shabbat = await shabbatBlock()
  if (shabbat) return shabbat
  if (!isEnabled()) return disabledResponse()
  const csrf = rejectCrossSite(request)
  if (csrf) return csrf
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session)
  if (denied) return denied
  const { pluginId, reviewId, key } = await params
  if (!isObjectIdString(pluginId) || !isObjectIdString(reviewId) || !ASSET_KEYS.includes(key)) return notFoundResponse()
  if (!checkRateLimit(String(session.user.id), 'service-plugin-asset', 60, 'hour')) return tooManyRequests()
  try {
    await dbConnect()
    const loaded = await loadOwnedReview({ pluginId, reviewId, userId: session.user.id })
    if (!loaded.ok) return failureResponse(loaded)
    const { review } = loaded
    const slot = assetSlot(review, key)
    if (!slot.ok) return failureResponse(slot)

    const lengthHeader = request.headers.get('content-length')
    if (!lengthHeader || !/^\d{1,12}$/.test(lengthHeader)) {
      return json({ error: 'חסרה כותרת Content-Length', code: 'length_required' }, 400)
    }
    const length = Number(lengthHeader)
    if (length > slot.maxBytes) return json({ error: 'הקובץ גדול מהמותר', code: 'too_large' }, 413)
    if (length !== slot.size) return json({ error: 'גודל הקובץ אינו תואם לגודל שהוצהר בהגשה', code: 'size_mismatch' }, 400)

    let written
    try {
      written = await writeReviewAssetStream(review._id, key, request.body, { expectedSize: slot.size, maxBytes: slot.maxBytes })
    } catch (err) {
      const mapped = storageFailure(err)
      if (mapped) return mapped
      throw err
    }
    // קובץ שלא נרשם במסד נמחק: אחרת המפתח חסום לניסיון חוזר (asset_exists) והקובץ יתום
    const recorded = await recordAssetUpload({ review, key, sha256: written.sha256 }).catch(async (err) => {
      await deleteReviewFiles(review._id, { keys: [key] })
      throw err
    })
    if (!recorded.ok) {
      await deleteReviewFiles(review._id, { keys: [key] })
      return failureResponse(recorded)
    }
    return json({ key, sha256: written.sha256, size: written.size })
  } catch (err) {
    return errorResponse(err, 'asset upload')
  }
}
