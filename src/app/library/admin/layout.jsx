// ה-layout של פאנל הניהול — Server Component.
//
// קודם זה היה Client Component שקרא ל-useSession: ב-SSR הסשן עוד לא ידוע,
// ולכן הניווט יצא ריק ב-HTML ונוספו רק אחרי ה-hydration
// ובקשת /api/auth/session — מה שדחף את תוכן העמוד כ-480px למטה (CLS 0.33
// בכל עמודי /library/admin). עכשיו הסשן (JWT בלבד, בלי DB) ומוני התג
// נקראים כאן בשרת (AdminFrame), וסרגל הצד (AdminShell) מגיע מוכן ב-HTML.
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import AdminFrame from '@/components/admin/shell/AdminFrame'

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions)
  return (
    <AdminFrame session={session}>
      {children}
    </AdminFrame>
  )
}
