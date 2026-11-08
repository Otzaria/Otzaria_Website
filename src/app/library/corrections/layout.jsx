// דיווחי טעויות (/library/corrections/**) — Server Component, בתוך מעטפת הניהול (AdminFrame).
//
// הכתובות וההרשאות לא השתנו: ה-proxy דורש רק התחברות, ו-API התיקונים הוא שאוכף
// canHandleCorrections (מנהל כללי, מנהל ספרים, או משתמש עם דגל מתנדב תיקונים).
// הסרגל מסונן לפי אותה בדיקה (adminNav.js, נבדק ב-adminNav.test.mjs):
// - מנהל — הסרגל המלא שלו, ו"דיווחי טעויות" פעיל בו.
// - מתנדב שאינו מנהל — סרגל מצומצם: "דיווחי טעויות" וחזרה לאזור האישי, בלי שום קישור ל-/library/admin.
// - מי שאינו רשאי (משתמש רגיל, מפקח בלי דגל מתנדב) — אין לו אף פריט, ולכן אין סרגל: הכותרת
//   והלשונית בלבד, והעמוד מציג את הודעת "אין הרשאה" שמגיעה מה-API (403), בדיוק כמו קודם.
// הכותרת "דיווחי טעויות" — ה-h1 של העמוד, בתוך התוכן (המעטפת בלי כותרת משלה), והלשוניות מתחתיה.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import AdminFrame from '@/components/admin/shell/AdminFrame'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import CorrectionsTabs from '@/components/corrections/CorrectionsTabs'
import { correctionsTabs } from '@/lib/corrections/tabs'
import { adminScreenTitle } from '@/lib/adminNav'

export default async function CorrectionsLayout({ children }) {
  const session = await getServerSession(authOptions)
  return (
    <AdminFrame session={session}>
      <div className="mb-5">
        <AdminScreenHeader title={adminScreenTitle('corrections')} />
      </div>
      <CorrectionsTabs tabs={correctionsTabs(session?.user)} className="mb-6" />
      {children}
    </AdminFrame>
  )
}
