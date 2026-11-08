// דף "עמודים לאימון" בניהול (/library/admin/ocr-training) — העמודים שמתנדבים מסמנים בהם שורות לאימון המודלים.
// כל המסך ב-TrainingPagesScreen (src/components/admin/training), שטוען ושולח לאותן נקודות קצה כמו קודם
// (/api/admin/ocr-training/**).
//
// הגישה — מנהל כללי, מנהל OCR ומאמן מודלים (proxy.js וסרגל הניהול), וה-API בודק שוב (hasOcrAccess). הבדיקה כאן
// (אותה פונקציה) — הגנת עומק: מי שהגיע בלי הרשאה רואה "אין לך הרשאה" ולא מסך שנכשל בטעינה.
// Suspense — המסך קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasOcrAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import TrainingPagesScreen from '@/components/admin/training/TrainingPagesScreen'
import { SCREEN_TEXT } from '@/lib/adminTrainingScreen/trainingTerms'
import { TrainingScreenSkeleton } from '@/components/admin/training/TrainingSkeleton'

export default async function AdminOcrTrainingPage() {
  const session = await getServerSession(authOptions)
  if (!hasOcrAccess(session?.user?.role)) {
    return <NoAccess description="המסך פתוח למנהל כללי, למנהל OCR ולמאמן מודלים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return (
    <Suspense fallback={<TrainingScreenSkeleton title={SCREEN_TEXT.training.title} description={SCREEN_TEXT.training.description} action />}>
      <TrainingPagesScreen />
    </Suspense>
  )
}
