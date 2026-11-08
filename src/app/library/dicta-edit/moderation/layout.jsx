// הצעות עריכה (/library/dicta-edit/moderation) — Server Component, בתוך מעטפת הניהול (AdminFrame).
// הכתובת וההרשאות לא השתנו: ה-proxy מתיר לכל מחובר, ו-API ההצעות אוכף canModerateLibrary (מנהל כללי,
// מנהל ספרים, או משתמש עם דגל מפקח). הסרגל מסונן לפי אותה בדיקה (adminNav.js):
// - מנהל — הסרגל המלא שלו, ו"הצעות עריכה" פעיל בו.
// - מפקח שאינו מנהל — סרגל מצומצם: "הצעות עריכה" בלבד, בלי שום קישור ל-/library/admin.
// - מי שאינו רשאי — אין לו אף פריט, ולכן אין סרגל; העמוד אומר "אין לך הרשאה" (כמו קודם, בעיצוב החדש).
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import AdminFrame from '@/components/admin/shell/AdminFrame'

export default async function ModerationLayout({ children }) {
  const session = await getServerSession(authOptions)
  return <AdminFrame session={session}>{children}</AdminFrame>
}
