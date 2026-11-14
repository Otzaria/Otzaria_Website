// דף "הצעות למילון" בניהול (/library/admin/dictionary) — מילים שמשתמשים הוסיפו למילון האישי שלהם, וההחלטה אם להכניס
// אותן למילון הכללי. כל המסך ב-DictionaryScreen (src/components/admin/dictionary), שטוען ושולח לאותה נקודת קצה כמו
// קודם (/api/admin/dictionary).
//
// הגישה — מנהל כללי ומנהל ספרים (proxy.js; מנהל ספרים-בלבד לא, בכוונה), וה-API בודק שוב (hasBooksAccess). הבדיקה
// כאן (אותה פונקציה) — הגנת עומק: מי שהגיע בלי הרשאה רואה "אין לך הרשאה" ולא מסך שנכשל בטעינה.
// Suspense — DictionaryScreen קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasBooksAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import DictionaryScreen from '@/components/admin/dictionary/DictionaryScreen'
import { DictionaryScreenSkeleton } from '@/components/admin/dictionary/DictionarySkeleton'

export default async function AdminDictionaryPage() {
  const session = await getServerSession(authOptions)
  if (!hasBooksAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי ולמנהל ספרים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return (
    <Suspense fallback={<DictionaryScreenSkeleton />}>
      <DictionaryScreen />
    </Suspense>
  )
}
