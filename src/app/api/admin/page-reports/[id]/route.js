import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { hasBooksAccess } from '@/lib/roles'
import { decidePageReport } from '@/lib/pageReports/server'

// PATCH /api/admin/page-reports/[id] — הכרעת מנהל: approve/reject/reopen/apply (טעות בספר), handled/reopen (הודעה).
// עם applyToText — גם שינוי טקסט העמוד (עדכון מותנה; עמוד בטיפול → 409). באישור אפשר גם original + proposed — הנוסח
// שהמנהל קבע; ב-apply אפשר applyMode: 'marker'. פירוט: src/lib/pageReports/rules.js (normalizeDecision) ו-server.js.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE })

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return fail(401, 'יש להתחבר כדי לבצע פעולה זו')
    if (!hasBooksAccess(session.user.role)) return fail(403, 'אין הרשאה לבצע פעולה זו')
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return fail(400, 'בקשה לא תקינה')
    await connectDB()
    const result = await decidePageReport(session.user, id, body)
    if (!result.ok) return fail(result.status, result.error)
    return NextResponse.json({ success: true, report: result.report, applyResult: result.applyResult }, { headers: NO_STORE })
  } catch (error) {
    console.error('admin page-reports PATCH failed:', error)
    return fail(500, 'אירעה שגיאה בשמירת ההכרעה')
  }
}
