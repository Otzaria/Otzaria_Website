// דף "עמודים" בניהול (/library/admin/pages-management) — כל העמודים בכל הספרים ומי עובד עליהם, כדי למצוא עמודים
// תקועים ולשחרר אותם. כל המסך ב-PagesScreen (src/components/admin/pages), שטוען את הרשימה מאותן נקודות קצה
// כמו קודם (/api/admin/pages/*). הגישה — מנהל כללי ומנהל ספרים (proxy.js; מנהל ספרים-בלבד לא, בכוונה), וה-API
// בודק שוב (hasBooksAccess).
// Suspense — PagesScreen קורא את הכתובת (useSearchParams).
import { Suspense } from 'react'
import PagesScreen from '@/components/admin/pages/PagesScreen'
import { PagesScreenSkeleton } from '@/components/admin/pages/PagesSkeleton'

export default function AdminPagesPage() {
  return (
    <Suspense fallback={<PagesScreenSkeleton />}>
      <PagesScreen />
    </Suspense>
  )
}
