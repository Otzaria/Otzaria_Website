import { authorizeCron } from '@/lib/corrections/runtime'
import { runBookNotifications } from '@/lib/book-notifications/worker'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const NO_STORE = { 'cache-control': 'private, no-store' }

// רשת ביטחון לתור ההודעות על ספרים חדשים (issue #306): ממשיך שליחה שנקטעה בהפעלה מחדש של
// השרת (פריסה), ומחזיר את הטיימר שבתהליך לפעולה. הטיימר עצמו מטפל בשוטף. שורת crontab:
//   */10 * * * * curl -fsS -m 300 -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/book-notifications
async function run(request) {
  const auth = authorizeCron(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  try {
    const batches = await runBookNotifications()
    return Response.json({ success: true, batches }, { headers: NO_STORE })
  } catch (err) {
    console.error('[book-notifications] cron failed:', err?.message)
    return Response.json({ success: false, error: 'Internal Server Error' }, { status: 500, headers: NO_STORE })
  }
}

export const GET = run
export const POST = run
