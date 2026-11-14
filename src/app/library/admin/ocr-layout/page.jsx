// דף "תיוג מבנה" בניהול (/library/admin/ocr-layout) — עמודים שמתנדבים סימנו בהם מספר עמוד, כותרת וחלוקה לטורים.
// כל המסך ב-OcrLayoutScreen (src/components/admin/training), שטוען ושולח לאותן נקודות קצה כמו קודם
// (/api/admin/ocr-layout/**). כרטיסי המשימות (LayoutTaskCards) — בתוך חלון הסקירה; הקנבס והגרירה בלי שינוי.
//
// הגישה — מנהל כללי, מנהל OCR ומאמן מודלים (proxy.js), וה-API בודק שוב (hasOcrAccess). הבדיקה כאן — הגנת עומק:
// מי שהגיע בלי הרשאה רואה "אין לך הרשאה" (קודם — הפניה ללוח האישי).
// Suspense — המסך קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasOcrAccess } from '@/lib/roles'
import NoAccess from '@/components/admin/list/NoAccess'
import OcrLayoutScreen from '@/components/admin/training/OcrLayoutScreen'
import { TrainingScreenSkeleton } from '@/components/admin/training/TrainingSkeleton'
import { SCREEN_TEXT, STATUS_LABELS } from '@/lib/adminTrainingScreen/trainingTerms'
import { LAYOUT_TABS } from '@/lib/adminTrainingScreen/ocrLayoutQuery'

export default async function AdminOcrLayoutPage() {
  const session = await getServerSession(authOptions)
  if (!hasOcrAccess(session?.user)) {
    return <NoAccess description="המסך פתוח למנהל כללי, למנהל OCR ולמאמן מודלים. אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  return (
    <Suspense fallback={<TrainingScreenSkeleton title={SCREEN_TEXT.layout.title} description={SCREEN_TEXT.layout.description} action tabs={LAYOUT_TABS.map((id) => STATUS_LABELS[id])} cards />}>
      <OcrLayoutScreen />
    </Suspense>
  )
}
