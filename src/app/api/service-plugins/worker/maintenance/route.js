import dbConnect from '@/lib/db'
import { maintenanceKeepList } from '@/lib/servicePlugins/reviews'
import { rejectWorker, readWorkerJson, workerJson, workerServerError } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// ההגשות שתיקיות העבודה שלהן נשמרות אצל המתווך (שירות נוכחי/קודם, תוסף נוכחי, פעילה); את השאר הוא מוחק.
export async function POST(request) {
  const rejected = rejectWorker(request)
  if (rejected) return rejected
  const parsed = await readWorkerJson(request)
  if (!parsed.ok) return parsed.response
  try {
    await dbConnect()
    return workerJson({ keep: await maintenanceKeepList() })
  } catch (err) {
    return workerServerError(err, 'maintenance')
  }
}
