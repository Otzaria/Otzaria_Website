import dbConnect from '@/lib/db'
import { submitResult } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerFailure, workerServerError } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// {leaseToken, digest, decision:0|1, report} → {status, published}
export async function POST(request, { params }) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  const { reviewId } = await params
  const { leaseToken, digest, decision, report } = parsed.body
  try {
    await dbConnect()
    const result = await submitResult({ reviewId, token: leaseToken, digest, decision, report })
    if (!result.ok) return workerFailure(result)
    return workerJson({ status: result.status, published: result.published })
  } catch (err) {
    return workerServerError(err, 'result')
  }
}
