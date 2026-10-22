// כתובת האתר הרשמית ובונה metadata אחיד לעמודים הציבוריים (canonical, Open Graph, Twitter).
// אין כאן ולא יהיה קריאת רשת/DB — הקובץ נטען בכל עמוד ציבורי.
import type { Metadata } from 'next'

/** הדומיין הרשמי (תואם ל-next.config.ts ול-NEXTAUTH_URL בפרודקשן) — בלי / בסוף. */
export const SITE_URL = 'https://otzaria.org'
export const SITE_NAME = 'אוצריא'
/** תיאור דף הבית והאתר (נוסח master — מקור האמת, ראו גם src/app/page.tsx). */
export const SITE_DESCRIPTION =
  'אוצריא היא תוכנה חינמית לקריאה וללימוד ספרי קודש, למחשב ולנייד: אלפי ספרים, חיפוש מהיר, מפרשים וקישורים. הורדה חינם.'

// תמונה קיימת מ-public/ (256x234) — אין בפרויקט תמונת שיתוף ייעודית גדולה יותר.
export const OG_IMAGE = { url: '/logo.png', width: 256, height: 234, alt: 'לוגו אוצריא' }

/**
 * metadata לעמוד ציבורי: כותרת (מועברת בלי סיומת; הפונקציה מוסיפה " | אוצריא" — ב-layout הראשי אין template, בהתאם למוסכמה ב-master), תיאור,
 * כתובת קנונית יחסית ל-metadataBase, Open Graph ו-Twitter. path — הנתיב עם / בתחילתו ("/" לבית).
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  const url = path
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'he_IL',
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [OG_IMAGE.url],
    },
  }
}
