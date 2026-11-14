import dbConnect from '@/lib/db'
import { checkpoint } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerFailure, workerServerError } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// קבלת שלב: {leaseToken, stage, digest, data} — מחליפה קבלה קודמת של אותו שלב.
export async function POST(request, { params }) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  const { reviewId } = await params
  const { leaseToken, stage, digest, data } = parsed.body
  try {
    await dbConnect()
    const result = await checkpoint({ reviewId, token: leaseToken, stage, digest, data })
    if (!result.ok) return workerFailure(result)
    return workerJson({ ok: true })
  } catch (err) {
    return workerServerError(err, 'checkpoint')
  }
}
