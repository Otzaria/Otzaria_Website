import dbConnect from '@/lib/db'
import { heartbeat } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerFailure, workerServerError } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  const { reviewId } = await params
  try {
    await dbConnect()
    const result = await heartbeat({ reviewId, token: parsed.body.leaseToken })
    if (!result.ok) return workerFailure(result)
    return workerJson({ leaseExpiresAt: result.leaseExpiresAt })
  } catch (err) {
    return workerServerError(err, 'heartbeat')
  }
}
