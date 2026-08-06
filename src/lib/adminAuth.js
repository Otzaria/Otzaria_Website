import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasPluginsAccess } from '@/lib/roles'

// וידוא הרשאת מנהל תוספים — משותף לכל נתיבי הניהול של חנות התוספים.
export async function requirePluginsAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !hasPluginsAccess(session.user?.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) }
  }
  return { ok: true, session }
}
