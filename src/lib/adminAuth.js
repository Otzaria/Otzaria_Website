import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasPluginsAccess } from '@/lib/roles'
import { forbidden } from '@/lib/apiResponse'

// וידוא הרשאת מנהל תוספים — משותף לכל נתיבי הניהול של חנות התוספים.
export async function requirePluginsAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || !hasPluginsAccess(session.user?.role)) {
    return { ok: false, response: forbidden('Unauthorized') }
  }
  return { ok: true, session }
}
