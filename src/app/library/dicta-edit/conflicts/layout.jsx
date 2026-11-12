// התנגשויות בסנכרון (/library/dicta-edit/conflicts) — Server Component, בתוך מעטפת הניהול (AdminFrame).
// הכתובת וההרשאות לא השתנו: ה-proxy מתיר לכל מחובר, וה-API אוכף canManageLibrarySync (מנהל כללי ומנהל
// ספרים). הסרגל מסונן לפי אותה בדיקה (adminNav.js). מפקח רואה את הסרגל המצומצם שלו ("הצעות עריכה"),
// ובעמוד — "אין הרשאה", כמו קודם.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import AdminFrame from '@/components/admin/shell/AdminFrame'

export default async function ConflictsLayout({ children }) {
  const session = await getServerSession(authOptions)
  return <AdminFrame session={session}>{children}</AdminFrame>
}
