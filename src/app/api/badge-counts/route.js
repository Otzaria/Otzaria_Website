import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasAnyAdminAccess } from '@/lib/roles'
import { requireAccess, serverError } from '@/lib/apiResponse'
import { getAdminBadgeCounts } from '@/lib/adminBadgeCounts'

export const dynamic = 'force-dynamic'

// GET /api/badge-counts — מוני התג של פאנל הניהול בלבד (שלושה מספרים),
// לרענון התקופתי של ה-layout ב-/library/admin. מחליף הורדה של שלוש רשימות
// מלאות רק לצורך ספירה (ראו src/lib/adminBadgeCounts.js).
// תלוי בתפקיד הצופה — private/no-store, לא משותף בשום מטמון.
//
// למה לא תחת /api/admin: ה-proxy מגביל את admin_plugins ל-allowlist של נתיבי
// /api/admin (כל נתיב שמתחיל במחרוזת "/api/admin"), והמונים נחוצים גם לו.
// ההרשאה נאכפת כאן: כל בעל הרשאת ניהול (hasAnyAdminAccess), ובתוך
// getAdminBadgeCounts כל מונה מוגבל לתפקידים שרואים אותו (adminBadgeScope).
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const denied = requireAccess(session, hasAnyAdminAccess)
    if (denied) return denied

    const counts = await getAdminBadgeCounts(session.user.role)
    return NextResponse.json(
      { success: true, ...counts },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('Error loading admin badge counts:', error)
    return serverError()
  }
}
