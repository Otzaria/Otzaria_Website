import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import HeroSection from '@/components/home/HeroSection'
import FeaturesSection from '@/components/home/FeaturesSection'
import DownloadSection from '@/components/home/DownloadSection'
import OfflineToolCard from '@/components/home/OfflineToolCard'
import DonateCallout from '@/components/home/DonateCallout'
import JsonLd from '@/components/seo/JsonLd'
import { pageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo'

// כותרת מלאה (ללא הסיומת " | אוצריא" שאותה מוסיף pageMetadata לשאר הדפים).
export const metadata = {
  ...pageMetadata({
    title: 'אוצריא – תוכנה חינמית ללימוד ספרי קודש',
    description: 'אוצריא היא תוכנה חינמית לקריאה וללימוד ספרי קודש, למחשב ולנייד: אלפי ספרים, חיפוש מהיר, מפרשים וקישורים. הורדה חינם.',
    path: '/',
  }),
  title: 'אוצריא – תוכנה חינמית ללימוד ספרי קודש',
}

// נתונים מובנים לדף הבית: האתר, הארגון והתוכנה. הנתונים נגזרים ממה שהאתר מציע בפועל —
// חינמית (ראו /faq), ותומכת ב-Windows, macOS, Linux, Android ו-iOS. בלי דירוגים/ביקורות.
const HOME_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Windows, macOS, Linux, Android, iOS',
    inLanguage: 'he',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' },
  },
]

// דף סטטי עם ISR: נבנה מחדש ברקע לכל היותר פעם ב-10 דק' (תואם לחלון המטמון של
// DownloadSection ושל שורת המספרים שבגיבור — ראו src/lib/homeStats/sources.js). ליטרל
// מספרי בכוונה — ה-segment config של Next נחלץ בניתוח AST סטטי (ראו plugins/page.tsx).
export const revalidate = 600

// עיצוב "האפליקציה עצמה": Material 3 שטוח של אוצריא — רקע panelBackground אחיד,
// כרטיסי AppCard בלי מסגרת ובלי צל, אריחי אייקון טונליים. הערות הביצועים (LCP של
// תמונת הספר, prefetch בכוונה בלבד, עוגן #download כ-<a>) — ברכיבי הגיבור.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <JsonLd data={HOME_JSON_LD} />
      {/* wordmarkHandoff: בראש הדף שם האתר אינו בכותרת — הוא נכנס כשהמילה "אוצריא" שבגיבור נגללת אל מתחת לכותרת */}
      <OtzariaSoftwareHeader wordmarkHandoff />

      <main id="main-content" className="flex-1">
        <HeroSection />

        <FeaturesSection />

        <DownloadSection />

        {/* שני נושאים נפרדים — שני אזורים זה מתחת לזה, לא כרטיסים זה לצד זה: הכלי הלא-מקוון
            כפס אופקי, והתרומה כאזור הסיום של הדף (קריאה אחת ברורה לפני הפוטר) */}
        <OfflineToolCard />

        <DonateCallout />
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  );
}
