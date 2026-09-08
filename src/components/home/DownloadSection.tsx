// Server Component: שולף את קישורי ההורדה היציבים מ-/api/github-releases בזמן
// רינדור הדף, במקום ב-useEffect בדפדפן (כפי שהיה קודם) — כך אין הבהוב טעינה
// וכל מבקר לא מבצע קריאת רשת נפרדת ל-API הפנימי בעצמו.
//
// המידע (releases של GitHub) לא משתנה ע"י פעולת מנהל באתר הזה — אין route
// מקומי שמעדכן אותו, הוא משתנה רק כשמפרסמים release חדש ב-GitHub. לכן אין
// טעם ל-revalidateTag כאן (אין ממה לבטל), ומספיק חלון revalidate מבוסס-זמן,
// כמו ב-/api/license וב-library/docs/[slug] (ראו cacheTags.js לרציונל המלא
// של דפוס ה-tags, שלא רלוונטי לנתון חיצוני כזה).
//
// יישום: fetch() רגיל של Next (לא unstable_cache) — כי אין כאן קריאת DB
// לעטוף, רק קריאת HTTP למסלול פנימי; ל-fetch יש כבר מנגנון מטמון/revalidate
// מובנה של Next. חלון 600 שניות (10 דק') תואם בדיוק לחלון שה-API route עצמו
// כבר משתמש בו לקריאת ה-fetch שלו ל-GitHub (ראו route.js), כך שאין תועלת
// לרענן כאן בתדירות גבוהה יותר משם.
import DownloadSectionClient from './DownloadSectionClient'

const RELEASES_REVALIDATE_SECONDS = 600

type PlatformLinks = Record<string, string | undefined>
type Downloads = {
  version?: string
  versions?: Record<string, string>
  windows?: PlatformLinks
  linux?: PlatformLinks
  android?: PlatformLinks
  ios?: PlatformLinks
  macos?: PlatformLinks
}

async function getStableDownloads(): Promise<Downloads | null> {
  try {
    // כתובת מוחלטת נחוצה ל-fetch מצד השרת; NEXTAUTH_URL הוא בסיס ה-URL של
    // האתר שכבר מוגדר לסביבה זו (נעשה בו שימוש דומה ב-src/app/api/auth/verify/route.js).
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/github-releases?type=stable`, {
      next: { revalidate: RELEASES_REVALIDATE_SECONDS }
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Failed to load stable downloads:', error)
    return null
  }
}

export default async function DownloadSection() {
  const stableDownloads = await getStableDownloads()
  return <DownloadSectionClient stableDownloads={stableDownloads} />
}
