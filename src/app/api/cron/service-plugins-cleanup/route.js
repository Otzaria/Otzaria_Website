import dbConnect from '@/lib/db'
import { authorizeCron } from '@/lib/corrections/runtime'
import { runServicePluginCleanup } from '@/lib/servicePlugins/cleanup'
import { isEnabled } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const NO_STORE = { 'cache-control': 'private, no-store' }

// ניקוי שעתי של תוספי השירות (crontab: ראו .env.example).
async function run(request) {
  const auth = authorizeCron(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  if (!isEnabled()) return Response.json({ success: true, skipped: 'disabled' }, { headers: NO_STORE })
  try {
    await dbConnect()
    const summary = await runServicePluginCleanup(new Date())
    return Response.json({ success: true, ranAt: new Date().toISOString(), ...summary }, { headers: NO_STORE })
  } catch (err) {
    console.error('[service-plugins/cleanup] cron failed:', err?.message)
    return Response.json({ success: false, error: 'Internal Server Error' }, { status: 500, headers: NO_STORE })
  }
}

export const GET = run
export const POST = run
