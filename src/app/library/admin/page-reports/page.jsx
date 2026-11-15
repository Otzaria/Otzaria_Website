// דף "דיווחים על עמודים" בניהול (/library/admin/page-reports) — טעויות בספר המצולם שמתנדבים דיווחו מעורך העמוד (עם
// תיקון מוצע), והודעות שכתבו על עמודים. כל המסך ב-PageReportsScreen (src/components/admin/pageReports).
//
// הגישה — מנהל כללי ומנהל ספרים (proxy.js: מנהל ספרים חסום רק ממשתמשים ותוספים; מנהל ספרים-בלבד — רק ספרים ולוח),
// וה-API בודק שוב (hasBooksAccess). הבדיקה כאן — הגנת עומק: מי שהגיע בלי הרשאה רואה "אין לך הרשאה" ולא מסך שנכשל.
// Suspense — PageReportsScreen קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasBooksAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import PageReportsScreen from '@/components/admin/pageReports/PageReportsScreen'
import { PageReportsScreenSkeleton } from '@/components/admin/pageReports/PageReportsSkeleton'

export default async function AdminPageReportsPage() {
  const session = await getServerSession(authOptions)
  if (!hasBooksAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי ולמנהל ספרים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return (
    <Suspense fallback={<PageReportsScreenSkeleton />}>
      <PageReportsScreen />
    </Suspense>
  )
}
