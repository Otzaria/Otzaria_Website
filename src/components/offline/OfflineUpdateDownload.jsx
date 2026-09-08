// Server Component: שולף את פרטי הגרסה האחרונה מ-/api/offline-update-releases
// בזמן רינדור הדף, במקום ב-useEffect בדפדפן (כפי שהיה קודם) — כך אין הבהוב
// "טוען..." וכל מבקר לא מבצע קריאת רשת נפרדת ל-API הפנימי בעצמו.
//
// כמו ב-DownloadSection: המידע הוא release חיצוני ב-GitHub שלא משתנה ע"י
// פעולת מנהל באתר הזה, אז אין revalidateTag לקשר אליו — רק חלון revalidate
// מבוסס-זמן (ראו cacheTags.js לרציונל המלא). חלון 600 שניות תואם לחלון
// שה-API route עצמו כבר משתמש בו לקריאת ה-fetch שלו ל-GitHub (ראו route.js).
import OfflineUpdateDownloadClient from './OfflineUpdateDownloadClient'

const RELEASES_REVALIDATE_SECONDS = 600

async function getOfflineUpdateReleases() {
  try {
    // כתובת מוחלטת נחוצה ל-fetch מצד השרת; NEXTAUTH_URL הוא בסיס ה-URL של
    // האתר שכבר מוגדר לסביבה זו (נעשה בו שימוש דומה ב-src/app/api/auth/verify/route.js).
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/offline-update-releases`, {
      next: { revalidate: RELEASES_REVALIDATE_SECONDS }
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Failed to load offline-update releases:', error)
    return null
  }
}

export default async function OfflineUpdateDownload({ repoUrl }) {
  const releases = await getOfflineUpdateReleases()
  return <OfflineUpdateDownloadClient repoUrl={repoUrl} releases={releases} />
}
