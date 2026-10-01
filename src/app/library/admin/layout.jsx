// ה-layout של פאנל הניהול — Server Component.
//
// קודם זה היה Client Component שקרא ל-useSession: ב-SSR הסשן עוד לא ידוע,
// ולכן שורת הלשוניות (AdminNav) וכותרת התפקיד יצאו ריקות ב-HTML ונוספו רק
// אחרי ה-hydration ובקשת /api/auth/session — מה שדחף את תוכן העמוד כ-480px
// למטה (CLS 0.33 בכל עמודי /library/admin). עכשיו הסשן (JWT בלבד, בלי DB)
// ומוני התג נקראים כאן בשרת, והלשוניות מגיעות מוכנות ב-HTML.
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import Header from '@/components/layout/Header'
import { ROLE_LABELS } from '@/lib/roles'
import { getAdminBadgeCounts } from '@/lib/adminBadgeCounts'
import { EMPTY_ADMIN_BADGE_COUNTS } from '@/lib/adminBadgeScope'
import AdminNav from './AdminNav'

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role

  // המונים תלויים בתפקיד הצופה — נספרים לכל בקשה, בלי מטמון משותף.
  // כשל בספירה לא מפיל את הפאנל: מציגים אפסים והרענון התקופתי ב-AdminNav יתקן.
  let initialCounts = EMPTY_ADMIN_BADGE_COUNTS
  try {
    initialCounts = await getAdminBadgeCounts(role)
  } catch (e) {
    console.error('Error loading admin counts', e)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="w-full px-6 py-12">
          <div className="w-full max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-bold text-on-surface flex items-center gap-3">
                  <span className="material-symbols-outlined text-5xl text-accent">
                    admin_panel_settings
                  </span>
                  פאנל ניהול
                </h1>
                <p className="text-on-surface/60 mt-2">{ROLE_LABELS[role] || 'ניהול מלא של המערכת'}</p>
              </div>
              <div className="flex gap-3">
                {session?.user?.name === 'admin' && (
                  <a
                    href="/api/admin/export-backup"
                    download
                    className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                  >
                    <span className="material-symbols-outlined">download</span>
                    <span>גיבוי מלא</span>
                  </a>
                )}
                <Link
                  href="/library/dashboard"
                  className="flex items-center gap-2 px-4 py-2 glass rounded-lg hover:bg-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                  <span>חזרה לדשבורד</span>
                </Link>
              </div>
            </div>

            <AdminNav role={role} initialCounts={initialCounts} />

            <div className="min-h-[500px]">
                {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
