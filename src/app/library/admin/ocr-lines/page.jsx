// דף "תמלול שורות" בניהול (/library/admin/ocr-lines) — שורות שמתנדבים הקלידו, לאישור או להחזרה לתיקון.
// כל המסך ב-OcrLinesScreen (src/components/admin/training), שטוען ושולח לאותן נקודות קצה כמו קודם
// (/api/admin/ocr-lines/**).
//
// הגישה — מנהל כללי, מנהל OCR ומאמן מודלים (proxy.js), וה-API בודק שוב (hasOcrAccess). הבדיקה כאן — הגנת עומק:
// מי שהגיע בלי הרשאה רואה "אין לך הרשאה" (קודם — הפניה ללוח האישי).
// Suspense — המסך קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasOcrAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import OcrLinesScreen from '@/components/admin/training/OcrLinesScreen'
import { TrainingScreenSkeleton } from '@/components/admin/training/TrainingSkeleton'
import { SCREEN_TEXT, STATUS_LABELS } from '@/lib/adminTrainingScreen/trainingTerms'
import { LINE_TABS } from '@/lib/adminTrainingScreen/ocrLinesQuery'

export default async function AdminOcrLinesPage() {
  const session = await getServerSession(authOptions)
  if (!hasOcrAccess(session?.user?.role)) {
    return <NoAccess description="המסך פתוח למנהל כללי, למנהל OCR ולמאמן מודלים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return (
    <Suspense fallback={<TrainingScreenSkeleton title={SCREEN_TEXT.lines.title} description={SCREEN_TEXT.lines.description} tabs={LINE_TABS.map((id) => STATUS_LABELS[id])} cards />}>
      <OcrLinesScreen />
    </Suspense>
  )
}
