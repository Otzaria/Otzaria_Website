// דף "פרטי ספרים" בניהול (/library/admin/book-info) — בקשות המיזוג ל-book_info.csv שנפתחו משינויים של משתמשים,
// וההצעות הישנות שעוד לא נפתחו כבקשה. כל המסך ב-BookInfoScreen (src/components/admin/bookInfo), שטוען ושולח לאותן
// נקודות קצה כמו קודם (/api/admin/book-info/*).
//
// הגישה — מנהל כללי ומנהל ספרים (proxy.js; מנהל ספרים-בלבד לא, בכוונה), וה-API בודק שוב (hasBooksAccess). הבדיקה
// כאן (אותה פונקציה) — הגנת עומק: מי שהגיע בלי הרשאה רואה "אין לך הרשאה" ולא מסך שנכשל בטעינה.
// Suspense — BookInfoScreen קורא את הכתובת (useSearchParams); עד שהוא מוכן — השלד של התצוגה שבכתובת.
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasBooksAccess } from '@/lib/roles'
import { parseBookInfoQuery } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import NoAccess from '@/components/admin/list/NoAccess'
import BookInfoScreen from '@/components/admin/bookInfo/BookInfoScreen'
import { BookInfoScreenSkeleton } from '@/components/admin/bookInfo/BookInfoSkeleton'

export default async function AdminBookInfoPage({ searchParams }) {
  const session = await getServerSession(authOptions)
  if (!hasBooksAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי ולמנהל ספרים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  const { view } = parseBookInfoQuery(await searchParams)
  return (
    <Suspense fallback={<BookInfoScreenSkeleton view={view} />}>
      <BookInfoScreen />
    </Suspense>
  )
}
