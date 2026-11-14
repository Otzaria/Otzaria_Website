// עמוד ניהול התוספים (/library/admin/plugins) — ארבע תצוגות לפי ?view= (לאישור, בחנות, סידור החנות,
// תוספי שירות), וכל אחת פריט בסרגל. כל האינטראקציה ב-PluginsScreen (src/components/admin/plugins), שטוען
// את הנתונים מאותן נקודות קצה כמו קודם (בלי שינוי בחוזה). כתובות ישנות (?tab=…) ממשיכות לעבוד.
// Suspense — PluginsScreen קורא את הכתובת (useSearchParams); עד שהוא מוכן — השלד של התצוגה שבכתובת.
import { Suspense } from 'react'
import PluginsScreen from '@/components/admin/plugins/PluginsScreen'
import { PluginsScreenSkeleton } from '@/components/admin/plugins/PluginsSkeleton'
import { viewFromParams } from '@/lib/adminPlugins/pluginsQuery'

export default async function AdminPluginsPage({ searchParams }) {
  const view = viewFromParams(await searchParams)
  return (
    <Suspense fallback={<PluginsScreenSkeleton view={view} />}>
      <PluginsScreen />
    </Suspense>
  )
}
