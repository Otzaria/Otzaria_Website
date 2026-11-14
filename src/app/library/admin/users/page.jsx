// דף ניהול המשתמשים (/library/admin/users) — Server Component: רשימת כל המשתמשים + סטטיסטיקות נשלפת
// ישירות מה-DB בזמן הרינדור (אותה שאילתה בדיוק כמו GET /api/admin/users, ראו
// src/lib/adminUsers.js:getAdminUsersWithStats, המשותפת לשני המקומות). כל האינטראקציה (סינון, מגירת משתמש,
// חלונות) ב-UsersScreen (src/components/admin/users), שמקבל את הרשימה כ-prop.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת עם תגית USERS_ADMIN_LIST וחלון גיבוי קצר. PUT/DELETE
// ב-/api/admin/users קוראים ל-revalidateNow מיד אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js), כך ששינוי
// תפקיד/מחיקת משתמש משתקפים מיד בטעינת דף הבאה, בלי להמתין לחלון ה-revalidate.
//
// שער הרשאה: הרשימה זהה לכל מנהל-על (role==='admin') — אך רק להם. לכן הבדיקה נעשית כאן, בצד השרת, לפני
// קריאה לפונקציה הממוטמנת (ולא רק ב-API route) — אחרת ה-props של ה-Server Component יזלגו רשימת משתמשים
// מלאה גם למי שאינו מנהל-על שמנווט ישירות לכתובת הזו. (ה-proxy כבר חוסם את שאר התפקידים — זו שכבה שנייה.)
//
// כשל בטעינה — initialError: המסך מציג "לא הצלחנו לטעון" ו"נסה שוב" (קודם — טבלה ריקה, כאילו אין משתמשים).
// Suspense — UsersScreen קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { unstable_cache as nextCache } from 'next/cache'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getAdminUsersWithStats } from '@/lib/adminUsers'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import UsersScreen from '@/components/admin/users/UsersScreen'
import { UsersScreenSkeleton } from '@/components/admin/users/UsersSkeleton'
import { isAdmin } from '@/lib/roles'

// ליטרל מספרי בכוונה (לא REVALIDATE_SECONDS.USERS_ADMIN_LIST) — ה-segment
// config של Next נחלץ ע"י ניתוח AST סטטי שלא תומך ב-property access על אובייקט
// מיובא; לעדכן ידנית יחד עם REVALIDATE_SECONDS.USERS_ADMIN_LIST.
export const revalidate = 45

const loadAdminUsers = nextCache(getAdminUsersWithStats, ['admin-users-list'], {
  tags: [CACHE_TAGS.USERS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.USERS_ADMIN_LIST
})

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)

  let users = []
  let error = false
  if (isAdmin(session?.user)) {
    try {
      users = await loadAdminUsers()
    } catch (e) {
      console.error('Error loading admin users:', e)
      error = true
    }
  }

  return (
    <Suspense fallback={<UsersScreenSkeleton />}>
      <UsersScreen initialUsers={users} initialError={error} viewerId={session?.user?.id} />
    </Suspense>
  )
}
