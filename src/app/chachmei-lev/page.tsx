import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import AidSection from '@/components/chachmei-lev/AidSection'
import ChachmeiLevHero from '@/components/chachmei-lev/ChachmeiLevHero'
import CompaniesSection from '@/components/chachmei-lev/CompaniesSection'
import ContributorsSection from '@/components/chachmei-lev/ContributorsSection'
import DevelopersSection from '@/components/chachmei-lev/DevelopersSection'
import LibrarySection from '@/components/chachmei-lev/LibrarySection'
import MemorialSection from '@/components/chachmei-lev/MemorialSection'
import ZayitCredit from '@/components/chachmei-lev/ZayitCredit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'חכמי לב',
  description: 'לוח ההנצחה של אוצריא, החברות והאנשים שתרמו מהונם ומזמנם, מפתחי התוכנה, מקורות הספרים ומהדירי הספרים.',
  path: '/chachmei-lev',
})

// העתק של מסך "חכמי לב" שבתוכנה, בעיצוב האתר (כמו /about, /offline ו-/donate): כותרת + ציטוט +
// ניווט מהיר, ואזורים בקצב אנכי אחיד (Section spacing="top"). תוכן סטטי — Server Component.
// הנתונים: src/lib/chachmei-lev-data.js.
export default function ChachmeiLevPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <ChachmeiLevHero />
        <AidSection />
        <MemorialSection />
        <CompaniesSection />
        <ContributorsSection />
        <DevelopersSection />
        <LibrarySection />
        <ZayitCredit />
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
