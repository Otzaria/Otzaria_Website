// "התנגשויות בסנכרון" — כל האינטראקציה ב-ConflictsScreen (src/components/admin/conflicts), שטוען מאותן
// נקודות קצה כמו קודם. בלי התחברות — לדף ההתחברות וחזרה לכאן (כמו useRequireAuth שהיה כאן); בלי הרשאה —
// "אין הרשאה".
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import NoAccess from '@/components/admin/list/NoAccess'
import ConflictsScreen from '@/components/admin/conflicts/ConflictsScreen'
import { CONFLICTS_TITLE } from '@/lib/adminSuggestions/conflictTerms'
import { canManageLibrarySync } from '@/lib/roles'

export default async function ConflictsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect(`/auth/login?callbackUrl=${encodeURIComponent('/library/dicta-edit/conflicts')}`)
  if (!canManageLibrarySync(session.user)) {
    return (
      <div className="flex flex-col gap-5">
        <AdminScreenHeader title={CONFLICTS_TITLE} />
        <NoAccess description="המסך פתוח למנהלי ספרים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
      </div>
    )
  }
  return <ConflictsScreen />
}
