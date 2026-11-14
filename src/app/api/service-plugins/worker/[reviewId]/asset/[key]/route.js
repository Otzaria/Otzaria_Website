import dbConnect from '@/lib/db'
import { ASSET_KEYS } from '@/lib/servicePlugins/policy'
import { openWorkerAsset } from '@/lib/servicePlugins/reviews'
import { rejectWorker, workerError, workerFailure, workerServerError, NO_STORE } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 900

// קובץ ההגשה למתווך בעל lease (כותרת X-Lease-Token).
export async function GET(request, { params }) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const { reviewId, key } = await params
  if (!ASSET_KEYS.includes(key)) return workerError('unknown_asset', 404)
  try {
    await dbConnect()
    const result = await openWorkerAsset({ reviewId, token: request.headers.get('x-lease-token'), key })
    if (!result.ok) return workerFailure(result)
    return new Response(result.stream, {
      headers: {
        ...NO_STORE,
        'content-type': 'application/octet-stream',
        'content-length': String(result.size),
        'x-content-sha256': result.sha256,
      },
    })
  } catch (err) {
    return workerServerError(err, 'asset')
  }
}
