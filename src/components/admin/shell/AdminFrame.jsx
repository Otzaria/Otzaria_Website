// המסגרת המלאה של עמודי הניהול — Server Component: AdminShell (שמרנדר גם את כותרת האתר, כי כפתור
// "ניהול" של המגירה יושב בה), כשהסרגל ומוני התג כבר ב-HTML (בלי קפיצת תוכן אחרי ה-hydration; ראו ההערה ב-library/admin/layout.jsx).
// משותפת ל-/library/admin/layout.jsx, ל-/library/corrections/layout.jsx ול-layout של /library/dicta-edit/moderation ו-/library/dicta-edit/conflicts. ה-layout קורא את ה-session
// (JWT בלבד, בלי DB) ומעביר אותו לכאן, כי גם הוא צריך אותו להחלטות משלו.
import { getRequestAdminBadgeCounts } from '@/lib/adminBadgeCounts'
import { EMPTY_ADMIN_BADGE_COUNTS } from '@/lib/adminBadgeScope'
import { toAdminViewer } from '@/lib/adminNav'
import { canDownloadBackup } from '@/lib/adminBackup'
import AdminShell from './AdminShell'
import '@/app/admin-utilities.css'

/**
 * @param {{ session: any, children: import('react').ReactNode }} props
 * בלי כותרת: ה-h1 של כל עמוד הוא שם המסך שלו.
 */
export default async function AdminFrame({ session, children }) {
  const viewer = toAdminViewer(session?.user)

  // המונים תלויים בתפקיד הצופה — נספרים לכל בקשה, בלי מטמון משותף. הדשבורד קורא לאותה
  // פונקציה באותו רינדור (React cache) ומשתמש באותה תוצאה לכרטיסי ההודעות וההעלאות. תפקיד בלי מונים (מתנדב
  // תיקונים, מנהל OCR) — בלי גישה ל-DB כלל. כשל בספירה לא מפיל את העמוד: מציגים אפסים
  // והרענון התקופתי (useAdminBadgeCounts) יתקן.
  let initialCounts = EMPTY_ADMIN_BADGE_COUNTS
  try {
    initialCounts = await getRequestAdminBadgeCounts(viewer.role)
  } catch (e) {
    console.error('Error loading admin counts', e)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdminShell
        viewer={viewer}
        initialCounts={initialCounts}
        canBackup={canDownloadBackup(session?.user)}
      >
        {children}
      </AdminShell>
    </div>
  )
}
