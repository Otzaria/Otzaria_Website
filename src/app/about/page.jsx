import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import AboutHero from '@/components/about/AboutHero'
import JoinCallout from '@/components/about/JoinCallout'
import LibraryCollectionSection from '@/components/about/LibraryCollectionSection'
import LicenseTermsSection from '@/components/about/LicenseTermsSection'
import SourceQuote from '@/components/about/SourceQuote'
import SourcesSection from '@/components/about/SourcesSection'

// עיצוב כיוון א' (כמו דף הבית, /offline ו-404): המעטפת הציבורית, כותרת העמוד עם הקישוט, ואזורים
// בקצב אנכי אחיד (Section spacing="top" — כל אזור מביא רק את הרווח שמעליו). Server Component.
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <AboutHero />
        <LibraryCollectionSection />
        <SourcesSection />
        <LicenseTermsSection />
        <SourceQuote quote={'"צדקתו עומדת לעד"'} explanation="זה הכותב או קונה ספרים ומשאילן לאחרים" source="(כתובות נ')" />
        <JoinCallout />
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
