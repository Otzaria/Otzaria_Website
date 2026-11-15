import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { hasBooksAccess } from '@/lib/roles'
import { listAdminPageReports } from '@/lib/pageReports/server'

// GET /api/admin/page-reports — דיווחים על עמודים למנהלי ספרים (hasBooksAccess: admin + admin_books).
// ה-proxy חוסם את שאר תפקידי הניהול (admin_books_only/admin_plugins/admin_ocr) ממילא; כאן הבדיקה עצמה.
// תלוי בהרשאת הצופה — private/no-store.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE })

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return fail(401, 'יש להתחבר כדי לבצע פעולה זו')
    if (!hasBooksAccess(session.user.role)) return fail(403, 'אין הרשאה לבצע פעולה זו')
    const { searchParams } = new URL(request.url)
    await connectDB()
    const result = await listAdminPageReports(searchParams)
    if (!result.ok) return fail(result.status, result.error)
    const { ok: _ok, ...data } = result
    return NextResponse.json({ success: true, ...data }, { headers: NO_STORE })
  } catch (error) {
    console.error('admin page-reports GET failed:', error)
    return fail(500, 'אירעה שגיאה בטעינת הדיווחים')
  }
}
