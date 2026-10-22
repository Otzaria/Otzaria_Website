import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import DonateCurrencyNote from '@/components/donate/DonateCurrencyNote'
import DonateDollarOption from '@/components/donate/DonateDollarOption'
import DonateWidget from '@/components/donate/DonateWidget'
import IconTile from '@/components/ui/IconTile'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'תרומה לאוצריא',
  description: 'אוצריא מתוחזקת בהתנדבות. תרומתכם עוזרת לממן את השרתים ולהמשיך לפתח את התוכנה.',
  path: '/donate',
})

// עיצוב כיוון א' (כמו /offline ואזור התרומה בדף הבית): אריח אייקון התרומה, כותרת + קישוט ושורת
// המשנה, הערת המטבע — לפני הטופס, כדי שתיקרא לפני התשלום — ומתחתיה טופס נדרים פלוס בכרטיס.
// אחרי ההערה — אפשרות התרומה בדולרים (נדבות), למי שתורם במטבע חוץ.
// הנוסח כמו שהיה; ה-iframe (כתובת, גובה, CSP) לא השתנה — רק המסגרת שסביבו (components/donate).
export default function DonatePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <Section labelledBy="donate-title" container="narrow" spacing="none" className="pt-10 md:pt-14">
          <div className="mb-4 flex justify-center">
            <IconTile custom="donate" size="lg" />
          </div>
          <PageHeader
            id="donate-title"
            title="תרומה לאוצריא"
            subtitle="הפרויקט מתוחזק בהתנדבות. תרומתך עוזרת לנו לשלם על שרתים ולהמשיך לפתח את התוכנה."
          />
          <DonateCurrencyNote className="mb-4" />
          <DonateDollarOption className="mb-6 md:mb-8" />
          <DonateWidget title="התרומה באמצעות נדרים פלוס" />
        </Section>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
