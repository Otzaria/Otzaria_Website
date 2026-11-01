// Server Component: שליפת הנתונים לשורת המספרים שבמסך הפתיחה — ספרים וקישורים
// (library_stats.json של SeforimLibrary), הורדות האפליקציה (otzaria-download-tracker)
// ומספר התוספים הגלויים בחנות — ובסוף השורה הגרסה האחרונה של האפליקציה, מאותה שליפה
// ומאותו מטמון של אזור ההורדה (getLatestDownloads — React cache, כך שבתוך רינדור אחד
// GitHub נקרא פעם אחת), בלי מספר הבנייה (splitVersion).
//
// כל מקור נשלף במקביל ועמיד לתקלות בנפרד (ראו src/lib/homeStats/sources.js):
// מקור שנכשל מסתיר רק את הנתון שלו, וכשכולם נכשלים השורה לא מוצגת כלל.
// המטמון (~10 דק') מוגדר במקורות עצמם, כך שהשורה אינה הופכת את דף הבית לדינמי.
// HeroSection עוטף את הרכיב ב-Suspense, כך שהשליפה לעולם לא מעכבת את הגיבור עצמו.
// כל מקור מוגבל ל-HOME_STATS_SOURCE_TIMEOUT_MS (~3 שניות): השורה מופיעה בבת אחת — שורה
// שמתמלאת חלקים-חלקים נראית לא יציבה — ולכל המאוחר אחרי הזמן הזה, בלי המקור האיטי.
// הגרסה מוגבלת כאן ולא ב-latestDownloads: אזור ההורדה צריך את אותה שליפה עד סופה, וההגבלה
// רק מפסיקה לחכות לה בשורה הזו (השליפה המשותפת ממשיכה).
import { getLibraryStats, getAppDownloadCount, getPublicPluginsCount, HOME_STATS_SOURCE_TIMEOUT_MS } from '@/lib/homeStats/sources'
import { buildStatItems, withTimeout } from '@/lib/homeStats/homeStats'
import HeroStats from './HeroStats'
import { getLatestDownloads } from './latestDownloads'
import { splitVersion } from './downloadVersion'

export default async function HeroStatsLoader({ className = '' }: { className?: string }) {
  const [library, downloads, plugins, release] = await Promise.all([
    getLibraryStats(),
    getAppDownloadCount(),
    getPublicPluginsCount(),
    withTimeout(getLatestDownloads(), HOME_STATS_SOURCE_TIMEOUT_MS, null)
  ])

  return (
    <HeroStats
      items={buildStatItems({ ...library, downloads, plugins })}
      version={splitVersion(release?.version)?.display ?? null}
      className={className}
    />
  )
}
