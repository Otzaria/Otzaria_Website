import dbConnect from '@/lib/db'
import { claimNext } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerError, workerServerError, NO_STORE } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// המתווך תופס את ההגשה הבאה. 204 = אין עבודה (Retry-After כשמכסת Claude מושהית).
export async function POST(request) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  const { workerId } = parsed.body
  if (typeof workerId !== 'string' || !/^[\w.:@-]{1,200}$/.test(workerId)) return workerError('invalid_worker_id', 400)
  try {
    await dbConnect()
    const result = await claimNext({ workerId })
    if (!result.job) {
      return new Response(null, { status: 204, headers: { ...NO_STORE, ...(result.retryAfter ? { 'retry-after': String(result.retryAfter) } : {}) } })
    }
    return workerJson({ job: result.job })
  } catch (err) {
    return workerServerError(err, 'claim')
  }
}
