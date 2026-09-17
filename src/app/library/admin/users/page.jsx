// דף ניהול משתמשים (/library/admin/users) — Server Component: רשימת כל
// המשתמשים + סטטיסטיקות נשלפת ישירות מה-DB בזמן הרינדור (אותה שאילתה בדיוק
// כמו GET /api/admin/users, ראו src/lib/adminUsers.js:getAdminUsersWithStats,
// המשותפת לשני המקומות). האינטראקטיביות (מיון, עריכה, מחיקה) ב-Client
// Component (AdminUsersClient) שמקבל את הרשימה כ-prop.
//
// מטמון (Data Cache של Next, לא HTTP): התוצאה נשמרת עם תגית USERS_ADMIN_LIST
// וחלון גיבוי קצר. PUT/DELETE ב-/api/admin/users קוראים ל-revalidateTag מיד
// אחרי כתיבה מוצלחת (ראו src/lib/cacheTags.js), כך ששינוי תפקיד/מחיקת משתמש
// משתקפים מיד בטעינת דף הבאה, בלי להמתין לחלון ה-revalidate.
//
// שער הרשאה: הרשימה זהה לכל מנהל-על (role==='admin') — אך רק להם. לכן
// הבדיקה נעשית כאן, בצד השרת, לפני קריאה לפונקציה הממוטמנת (ולא רק ב-API
// route כמו קודם) — אחרת ה-props של ה-Server Component יזלגו רשימת משתמשים
// מלאה גם למי שאינו מנהל-על שמנווט ישירות לכתובת הזו.
import { getServerSession } from 'next-auth'
import { unstable_cache as nextCache } from 'next/cache'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getAdminUsersWithStats } from '@/lib/adminUsers'
import { CACHE_TAGS, REVALIDATE_SECONDS } from '@/lib/cacheTags'
import AdminUsersClient from './AdminUsersClient'

export const revalidate = REVALIDATE_SECONDS.USERS_ADMIN_LIST

const loadAdminUsers = nextCache(getAdminUsersWithStats, ['admin-users-list'], {
  tags: [CACHE_TAGS.USERS_ADMIN_LIST],
  revalidate: REVALIDATE_SECONDS.USERS_ADMIN_LIST
})

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)

  let users = []
  if (session?.user?.role === 'admin') {
    try {
      users = await loadAdminUsers()
    } catch (error) {
      console.error('Error loading admin users:', error)
    }
  }

  return <AdminUsersClient initialUsers={users} />
}
