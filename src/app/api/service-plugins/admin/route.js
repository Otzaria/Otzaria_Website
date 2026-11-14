import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import { hasPluginsAccess } from '@/lib/roles'
import { getAdminView } from '@/lib/servicePlugins/views'
import { isEnabled, disabledResponse, sessionGate, json, errorResponse } from '@/lib/servicePlugins/http'

export const dynamic = 'force-dynamic'

// רשימת המנהל: הגשות פעילות ואחריהן 30 האחרונות שהסתיימו.
export async function GET() {
  if (!isEnabled()) return disabledResponse()
  const session = await getServerSession(authOptions)
  const denied = sessionGate(session, hasPluginsAccess)
  if (denied) return denied
  try {
    await dbConnect()
    return json(await getAdminView())
  } catch (err) {
    return errorResponse(err, 'admin list')
  }
}
