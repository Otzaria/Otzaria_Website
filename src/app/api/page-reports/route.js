import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { createPageReport, listMyPageReports } from '@/lib/pageReports/server'

// דיווחים על עמודי ספר מצולם — צד המתנדב (src/lib/pageReports/).
// POST: שליחת דיווח (טעות בספר / הודעה למנהלים). GET: הדיווחים של המשתמש עצמו על עמוד אחד.
// ההרשאה לכל סוג נבדקת ב-createPageReport; כאן רק ה-session. תלוי במשתמש — private/no-store.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE })

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return fail(401, 'יש להתחבר כדי לשלוח דיווח')
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return fail(400, 'דיווח לא תקין')
    await connectDB()
    const result = await createPageReport(session.user, body)
    if (!result.ok) return fail(result.status, result.error)
    return NextResponse.json({ success: true, report: result.report }, { status: 201, headers: NO_STORE })
  } catch (error) {
    console.error('page-reports POST failed:', error)
    return fail(500, 'אירעה שגיאה בשליחת הדיווח, נסו שוב')
  }
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return fail(401, 'יש להתחבר')
    const { searchParams } = new URL(request.url)
    await connectDB()
    const result = await listMyPageReports(session.user, searchParams.get('bookPath'), searchParams.get('pageNumber'))
    if (!result.ok) return fail(result.status, result.error)
    return NextResponse.json({ success: true, reports: result.reports }, { headers: NO_STORE })
  } catch (error) {
    console.error('page-reports GET failed:', error)
    return fail(500, 'אירעה שגיאה בטעינת הדיווחים')
  }
}
