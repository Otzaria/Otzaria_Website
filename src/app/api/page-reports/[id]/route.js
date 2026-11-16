import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import connectDB from '@/lib/db'
import { getPageReportForEditor } from '@/lib/pageReports/server'

// GET /api/page-reports/[id] — דיווח "טעות בספר" אחד, לעורך העמוד שנפתח מהניהול (?report=<id>), כדי למצוא
// ולסמן את הסימון בטקסט. קריאה בלבד. ההרשאה (מנהל ספרים / המדווח / מי שתפס את העמוד) — ב-getPageReportForEditor.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE })

export async function GET(_request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return fail(401, 'יש להתחבר')
    const { id } = await params
    await connectDB()
    const result = await getPageReportForEditor(session.user, String(id || ''))
    if (!result.ok) return fail(result.status, result.error)
    return NextResponse.json({ success: true, report: result.report }, { headers: NO_STORE })
  } catch (error) {
    console.error('page-reports/[id] GET failed:', error)
    return fail(500, 'אירעה שגיאה בטעינת הדיווח')
  }
}
