import dbConnect from '@/lib/db'
import { reportFailure } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerFailure, workerServerError } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// {leaseToken, class:'transient'|'quota'|'operator', code, message, resetAt?}
export async function POST(request, { params }) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  const { reviewId } = await params
  const body = parsed.body
  try {
    await dbConnect()
    const result = await reportFailure({
      reviewId, token: body.leaseToken, failureClass: body.class, code: body.code, message: body.message, resetAt: body.resetAt,
    })
    if (!result.ok) return workerFailure(result)
    return workerJson({ status: result.status, nextAttemptAt: result.nextAttemptAt })
  } catch (err) {
    return workerServerError(err, 'failure')
  }
}
