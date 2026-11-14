// "הצעות עריכה" — כל האינטראקציה ב-SuggestionsScreen (src/components/admin/suggestions), שטוען מאותן נקודות
// קצה כמו קודם. בלי התחברות — לדף ההתחברות וחזרה לכאן (כמו useRequireAuth שהיה כאן); בלי הרשאה — "אין הרשאה".
// Suspense — המסך קורא את הכתובת (useSearchParams); עד שהוא מוכן — השלד.
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import NoAccess from '@/components/admin/list/NoAccess'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import SuggestionsScreen from '@/components/admin/suggestions/SuggestionsScreen'
import { SuggestionsScreenSkeleton } from '@/components/admin/suggestions/SuggestionsSkeleton'
import { SUGGESTIONS_TITLE } from '@/components/admin/suggestions/suggestionsScreenText'
import { canModerateLibrary } from '@/lib/roles'

export default async function ModerationPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect(`/auth/login?callbackUrl=${encodeURIComponent('/library/dicta-edit/moderation')}`)
  if (!canModerateLibrary(session.user)) {
    return (
      <div className="flex flex-col gap-5">
        <AdminScreenHeader title={SUGGESTIONS_TITLE} />
        <NoAccess description="הצעות עריכה פתוחות למנהלי ספרים ולמפקחים. אם אתה אמור לראות את המסך, פנה למנהל האתר." />
      </div>
    )
  }
  return (
    <Suspense fallback={<SuggestionsScreenSkeleton />}>
      <SuggestionsScreen />
    </Suspense>
  )
}
