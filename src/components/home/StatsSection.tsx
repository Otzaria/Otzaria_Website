// Server Component: אזור "אוצריא במספרים" בדף הבית — ספרים/קישורים/שורות
// (library_stats.json של SeforimLibrary), הורדות האפליקציה (otzaria-download-tracker)
// ומספר התוספים הגלויים בחנות.
//
// כל מקור נשלף במקביל ועמיד לתקלות בנפרד (ראו src/lib/homeStats/sources.js):
// מקור שנכשל מסתיר רק את העיגול שלו, וכשכולם נכשלים האזור לא מוצג כלל.
// המטמון (~10 דק') מוגדר במקורות עצמם, כך שהאזור אינו הופך את דף הבית לדינמי.
import { getLibraryStats, getAppDownloads, getPublicPluginsCount } from '@/lib/homeStats/sources'
import { buildStatItems } from '@/lib/homeStats/homeStats'
import StatsGrid from './StatsGrid'

export default async function StatsSection() {
  const [library, downloads, plugins] = await Promise.all([
    getLibraryStats(),
    getAppDownloads(),
    getPublicPluginsCount()
  ])

  const items = buildStatItems({ ...library, downloads, plugins })
  return <StatsGrid items={items} />
}
