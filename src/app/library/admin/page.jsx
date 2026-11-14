// דשבורד פאנל הניהול — Server Component.
//
// עונה על "מה ממתין לי עכשיו?" לפי תפקיד הצופה: כרטיס לכל מקום שהתפקיד אחראי עליו (רק מסכים
// שהתפקיד רואה בסרגל — ראו src/lib/adminDashboard.js), בסדר דחיפות, ומתחת "מצב כללי" למי שאחראי
// על ספרים. הספירות נעשות כאן בשרת, ישירות מול ה-DB, בלי נקודת קצה ובלי מטמון משותף (התוצאה
// תלויה בתפקיד). כל אזור ב-Suspense משלו: המקומות לא מחכים למספרים הכלליים ולהפך.
//
// ה-h1 הוא "לוח" — השם של העמוד בסרגל, כמו בכל מסך ניהול (המעטפת בלי כותרת משלה). מתחתיו
// "ממתין לטיפולך" ו"מצב כללי" — h2, אזורים בתוך הלוח.
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { buildGeneralStats, hasGeneralStats, visibleQueues } from '@/lib/adminDashboard'
import { isServicePluginsEnabled } from '@/lib/servicePlugins/config'
import DashboardQueuesSection from '@/components/admin/dashboard/DashboardQueuesSection'
import GeneralStatsSection from '@/components/admin/dashboard/GeneralStatsSection'
import { GeneralStatsSkeleton, QueuesSkeleton } from '@/components/admin/dashboard/DashboardSkeletons'
import { LiveRegion } from '@/components/admin/dashboard/LiveStatus'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import BackupCard from '@/components/admin/dashboard/BackupCard'
import { canDownloadBackup } from '@/lib/adminBackup'
import { adminScreenTitle } from '@/lib/adminNav'
import { getRoles } from '@/lib/roles'

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions)
  // כל התפקידים של הצופה (roles.js) — מנהל עם כמה תפקידים רואה את התורים של כולם
  const role = getRoles(session?.user)
  // תוספי שירות — רק כשהתכונה פעילה בשרת (אחרת ה-API שלהם מחזיר "disabled" והלשונית ריקה)
  const features = { servicePlugins: isServicePluginsEnabled() }
  const queueCount = visibleQueues(role, features).length
  const showStats = hasGeneralStats(role)
  const statItems = buildGeneralStats(role).items.length

  return (
    <div className="flex flex-col gap-10">
      <AdminScreenHeader title={adminScreenTitle('dashboard')} description="מה ממתין לך עכשיו, לפי התפקיד שלך." />
      {/* מחוץ ל-Suspense: קיים לפני שהתוכן מגיע, ולכן ההכרזה "הכול מטופל" / "יש מה לטפל..." נשמעת */}
      <LiveRegion />
      {queueCount > 0 && (
        <Suspense fallback={<QueuesSkeleton count={queueCount} />}>
          <DashboardQueuesSection role={role} features={features} />
        </Suspense>
      )}
      {showStats && (
        <Suspense fallback={<GeneralStatsSkeleton items={statItems} />}>
          {/* מי שאין לו מקומות שממתינים (מנהל ספרים בלבד) — "מצב כללי" הוא כל הדשבורד, ולכן גם קישור לספרים */}
          <GeneralStatsSection role={role} showBooksLink={queueCount === 0} />
        </Suspense>
      )}
      {/* "גיבוי" — רק למי שרואה את "הורד גיבוי" בסרגל (אותו תנאי, lib/adminBackup) */}
      {canDownloadBackup(session?.user) && <BackupCard />}
    </div>
  )
}
